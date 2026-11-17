import type {
    AsyncTaskModule,
    AsyncThread,
    ContextSlotGlobals,
    TaskMeta,
    TaskRegisters,
    ThreadLookupContext,
} from '../../runtime.js';
import { getOrCreateAsyncState } from '../component.js';
import { debugLog } from '../core/debug.js';
import { typeCheckValidI32 } from './helpers.js';

/**
 * A core module that keeps the context slots of one component instance's
 * current thread in mutable globals, and exports a getter and a setter function
 * for each slot. While no thread's slots are loaded into the globals, the
 * functions call the imported JS implementations instead:
 *
 * ```wat
 * (module
 *   (import "context" "get0" (func $get0 (result i32)))
 *   (import "context" "set0" (func $set0 (param i32)))
 *   (import "context" "get1" (func $get1 (result i32)))
 *   (import "context" "set1" (func $set1 (param i32)))
 *   (global $loaded (export "loaded") (mut i32) (i32.const 0))
 *   (global $slot0 (export "slot0") (mut i32) (i32.const 0))
 *   (global $slot1 (export "slot1") (mut i32) (i32.const 0))
 *   (func (export "get0") (result i32)
 *     (if (result i32) (global.get $loaded)
 *       (then (global.get $slot0))
 *       (else (call $get0))))
 *   (func (export "set0") (param i32)
 *     (if (global.get $loaded)
 *       (then (global.set $slot0 (local.get 0)))
 *       (else (call $set0 (local.get 0)))))
 *   ;; ... and likewise "get1" and "set1" for $slot1
 * )
 * ```
 *
 * A guest that imports these functions reads and writes its context slots
 * without leaving WebAssembly. Toolchains keep the shadow stack pointer in a
 * context slot, so a guest may do so in every function prologue.
 */
// prettier-ignore
const CONTEXT_SLOTS_MODULE = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x09, 0x02, 0x60, 0x00, 0x01, 0x7f, 0x60,
    0x01, 0x7f, 0x00, 0x02, 0x3d, 0x04, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x67,
    0x65, 0x74, 0x30, 0x00, 0x00, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x73, 0x65,
    0x74, 0x30, 0x00, 0x01, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x67, 0x65, 0x74,
    0x31, 0x00, 0x00, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x73, 0x65, 0x74, 0x31,
    0x00, 0x01, 0x03, 0x05, 0x04, 0x00, 0x01, 0x00, 0x01, 0x06, 0x10, 0x03, 0x7f, 0x01, 0x41, 0x00,
    0x0b, 0x7f, 0x01, 0x41, 0x00, 0x0b, 0x7f, 0x01, 0x41, 0x00, 0x0b, 0x07, 0x36, 0x07, 0x06, 0x6c,
    0x6f, 0x61, 0x64, 0x65, 0x64, 0x03, 0x00, 0x05, 0x73, 0x6c, 0x6f, 0x74, 0x30, 0x03, 0x01, 0x05,
    0x73, 0x6c, 0x6f, 0x74, 0x31, 0x03, 0x02, 0x04, 0x67, 0x65, 0x74, 0x30, 0x00, 0x04, 0x04, 0x73,
    0x65, 0x74, 0x30, 0x00, 0x05, 0x04, 0x67, 0x65, 0x74, 0x31, 0x00, 0x06, 0x04, 0x73, 0x65, 0x74,
    0x31, 0x00, 0x07, 0x0a, 0x3d, 0x04, 0x0c, 0x00, 0x23, 0x00, 0x04, 0x7f, 0x23, 0x01, 0x05, 0x10,
    0x00, 0x0b, 0x0b, 0x10, 0x00, 0x23, 0x00, 0x04, 0x40, 0x20, 0x00, 0x24, 0x01, 0x05, 0x20, 0x00,
    0x10, 0x01, 0x0b, 0x0b, 0x0c, 0x00, 0x23, 0x00, 0x04, 0x7f, 0x23, 0x02, 0x05, 0x10, 0x02, 0x0b,
    0x0b, 0x10, 0x00, 0x23, 0x00, 0x04, 0x40, 0x20, 0x00, 0x24, 0x02, 0x05, 0x20, 0x00, 0x10, 0x03,
    0x0b, 0x0b,
]);

/** The number of context slots each thread has. */
const SLOT_COUNT = 2;

/**
 * Find the live thread that a task register entry names.
 *
 * @param context Capabilities for looking up component state.
 * @param meta A task register entry.
 * @returns The thread, unless the entry is empty or names a thread which has exited.
 */
function resolveThread(context: ThreadLookupContext, meta: TaskMeta | null | undefined): AsyncThread | undefined {
    if (meta === undefined || meta === null) {
        return undefined;
    }
    const { componentIdx, threadID } = meta;
    if (componentIdx === -1 || threadID === undefined || threadID === null || threadID === 0) {
        return undefined;
    }
    const thread = getOrCreateAsyncState(context.lookup, componentIdx).threads.get(threadID) as AsyncThread | undefined;
    return thread && thread.taskID() === meta.taskID ? thread : undefined;
}

/**
 * Find the thread whose context slots a component instance's code accesses.
 *
 * Guest callbacks use their component's task register. FACT adapters have no
 * component index; post-return also runs after the callee register is cleared,
 * or while it still names a task which has exited. Both use the executing task,
 * whose context FACT temporarily saves and restores.
 *
 * @param context Capabilities for looking up the current thread.
 * @param componentIdx The component instance, if the code belongs to one.
 * @returns The thread, if there is one.
 */
function currentContextThread(context: ThreadLookupContext, componentIdx?: number): AsyncThread | undefined {
    const { registers } = context;
    const own = componentIdx === undefined ? undefined : resolveThread(context, registers[componentIdx]);
    return own ?? resolveThread(context, registers.current);
}

/**
 * Keep the context slot globals of one component instance loaded with the
 * slots of the thread that the instance's code accesses, selected as
 * `currentContextThread` does.
 *
 * @param context Capabilities for looking up the current thread.
 * @param globals The globals of the instance.
 */
function syncInstance(context: ThreadLookupContext, globals: ContextSlotGlobals): void {
    const { registers } = context;
    const own = resolveThread(context, registers[globals.componentIdx]);
    globals.followsExecutingTask = own === undefined;
    const thread = own ?? resolveThread(context, registers.current);

    // Only a thread of the instance itself moves into the instance's globals.
    // A thread of another instance is the executing task that code running
    // after its own task has exited falls back to; its slots may live in that
    // other instance's globals, so they stay where they are and the accessors
    // call into JS to reach them.
    const next = thread !== undefined && thread.componentIdx() === globals.componentIdx ? thread : undefined;
    const previous = globals.thread;
    if (previous === next) {
        return;
    }

    if (previous !== undefined) {
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            previous.storage[slot] = globals.slots[slot]!.value;
        }
        previous.contextGlobals = undefined;
    }
    if (next !== undefined) {
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            globals.slots[slot]!.value = next.storage[slot]!;
        }
        next.contextGlobals = globals;
    }
    globals.thread = next;
    globals.loaded.value = next === undefined ? 0 : 1;
}

/**
 * Keep the context slot globals of every component instance loaded with the
 * slots of the thread that the instance's code accesses.
 *
 * That selection depends only on the task registers and on which threads are
 * live. Registers are watched for writes (see `watchRegister`); code which
 * changes a component's thread table must call this.
 *
 * @param registers The task registers of the store.
 */
export function syncContextSlots(registers: TaskRegisters): void {
    const state = registers.contextSlots;
    if (state === undefined) {
        return;
    }
    for (const globals of state.components) {
        syncInstance(state.context, globals);
    }
}

/**
 * Run `onWrite` after every write to one task register.
 *
 * Registers are written from many places (entering and leaving tasks, and
 * restoring a task when a suspended stack resumes), including by runtime
 * providers which replace those operations. Watching the register itself keeps
 * the globals correct whichever code performs the write.
 *
 * @param registers The task registers of the store.
 * @param key The register: a component instance's, or that of the executing task.
 * @param onWrite Brings the globals which depend on the register up to date.
 */
function watchRegister(registers: TaskRegisters, key: number | 'current', onWrite: () => void): void {
    let value = registers[key];
    Object.defineProperty(registers, key, {
        enumerable: true,
        configurable: true,
        get: () => value,
        set(next: TaskMeta | null | undefined) {
            value = next;
            onWrite();
        },
    });
}

/**
 * Get the context slot globals of a component instance, creating them when the
 * host can instantiate WebAssembly modules synchronously.
 *
 * @param context Capabilities for looking up the current thread.
 * @param componentIdx The component instance.
 * @returns The globals, or `undefined` if they cannot be created.
 */
function contextSlotGlobals(context: ThreadLookupContext, componentIdx: number): ContextSlotGlobals | undefined {
    const { registers } = context;
    const existing = registers.contextSlots?.components.find((globals) => globals.componentIdx === componentIdx);
    if (existing) {
        return existing;
    }

    // Use the host's implementation rather than a selected one, which may
    // not instantiate synchronously (or at all).
    const wasm = (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;
    if (typeof wasm?.Module !== 'function' || typeof wasm.Instance !== 'function') {
        return undefined;
    }
    let exports: WebAssembly.Exports;
    try {
        exports = new wasm.Instance(new wasm.Module(CONTEXT_SLOTS_MODULE), {
            context: {
                get0: contextGet.bind(null, context, { componentIdx, slot: 0 }),
                set0: contextSet.bind(null, context, { componentIdx, slot: 0 }),
                get1: contextGet.bind(null, context, { componentIdx, slot: 1 }),
                set1: contextSet.bind(null, context, { componentIdx, slot: 1 }),
            },
        }).exports;
    } catch {
        // E.g. a content security policy which forbids compilation here.
        return undefined;
    }

    const globals: ContextSlotGlobals = {
        componentIdx,
        loaded: exports.loaded as WebAssembly.Global<'i32'>,
        slots: [exports.slot0 as WebAssembly.Global<'i32'>, exports.slot1 as WebAssembly.Global<'i32'>],
        getters: [exports.get0 as () => number, exports.get1 as () => number],
        setters: [exports.set0 as (value: number) => void, exports.set1 as (value: number) => void],
        followsExecutingTask: true,
        thread: undefined,
    };

    // The thread an instance's code accesses is selected by the instance's own
    // register, then by that of the executing task.
    if (registers.contextSlots === undefined) {
        const components: ContextSlotGlobals[] = [];
        registers.contextSlots = { context, components };

        // The executing task only selects the thread of an instance whose own
        // register names no live thread.
        watchRegister(registers, 'current', () => {
            for (const other of components) {
                if (other.followsExecutingTask) {
                    syncInstance(context, other);
                }
            }
        });
    }
    registers.contextSlots.components.push(globals);
    watchRegister(registers, componentIdx, () => syncInstance(context, globals));
    syncInstance(context, globals);
    return globals;
}

/**
 * Create the function a core module imports for `canon context.get` or
 * `canon context.set` on one slot.
 *
 * Code that belongs to a component instance gets a WebAssembly function over
 * that instance's context slot globals where possible, and a JS function
 * otherwise. Debug logging also selects JS functions, which log each access.
 *
 * @param _context Capabilities for looking up the current thread.
 * @param ctx The slot, and the component instance of the importing code, if any.
 * @param operation Whether the function reads or writes the slot.
 * @returns The function to import.
 */
export const contextSlotAccessor: AsyncTaskModule['contextSlotAccessor'] = (_context, ctx, operation) => {
    const { componentIdx, slot } = ctx;
    if (slot === undefined || slot < 0 || slot >= SLOT_COUNT) {
        throw new TypeError('invalid slot');
    }
    const globals =
        componentIdx === undefined || debugLog.enabled ? undefined : contextSlotGlobals(_context, componentIdx);
    if (globals === undefined) {
        return operation === 'get' ? contextGet.bind(null, _context, ctx) : contextSet.bind(null, _context, ctx);
    }
    return operation === 'get' ? globals.getters[slot]! : globals.setters[slot]!;
};

/** Implements `canon context.set`. */
export function contextSet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
    value: number,
): ReturnType<AsyncTaskModule['contextSet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    if (!typeCheckValidI32(value)) {
        throw new Error('invalid value for context set (not valid i32)');
    }
    const thread = currentContextThread(_context, ctx.componentIdx);
    if (!thread) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context set`,
        );
    }
    if (debugLog.enabled) {
        debugLog('[contextSet()] args', {
            slot,
            value,
            threadID: thread.id(),
            taskID: thread.taskID(),
            componentIdx: thread.componentIdx(),
        });
    }
    if (slot < 0 || slot >= thread.storage.length) {
        throw new Error('invalid slot for current thread');
    }

    // The slots of an instance's current thread live in the instance's globals.
    const globals = thread.contextGlobals;
    if (globals === undefined) {
        thread.storage[slot] = value;
    } else {
        globals.slots[slot]!.value = value;
    }
}

/** Implements `canon context.get`. */
export function contextGet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
): ReturnType<AsyncTaskModule['contextGet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    const thread = currentContextThread(_context, ctx.componentIdx);
    if (!thread) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context get`,
        );
    }
    if (debugLog.enabled) {
        debugLog('[contextGet()] args', {
            slot,
            threadID: thread.id(),
            taskID: thread.taskID(),
            componentIdx: thread.componentIdx(),
        });
    }
    if (slot < 0 || slot >= thread.storage.length) {
        throw new Error('invalid slot for current thread');
    }

    // The slots of an instance's current thread live in the instance's globals.
    const globals = thread.contextGlobals;
    return globals === undefined ? thread.storage[slot]! : globals.slots[slot]!.value;
}
