import type { ResourceIntrinsics, RuntimeOptions, RuntimePlatform } from '../types.js';
import type { CoreIntrinsics, MemoryMeta, RuntimeMemory } from './core-types.js';
import { createRepTable } from './rep-table.js';
import { createBufferClasses } from './buffers.js';
import { createTaskContext } from './task-context.js';

export function createCoreIntrinsics(
    options: RuntimeOptions,
    platform: RuntimePlatform,
    resource: ResourceIntrinsics,
): CoreIntrinsics {
    const wasm = platform.WebAssembly;
    const RuntimeError = wasm.RuntimeError;
    const symbolDispose = Symbol.dispose || Symbol.for('dispose');
    const asyncFunctionConstructor = (async () => {}).constructor;
    const debugLog = (...args: unknown[]) => {
        if (!globalThis?.process?.env?.JCO_DEBUG) {
            return;
        }
        console.debug(...args);
    };
    const taskContext = createTaskContext(debugLog);
    const { currentTaskMeta } = taskContext;
    const { ManagedBuffer, BufferManager } = createBufferClasses(resource, debugLog);
    const componentMemoryMap = new Map<number, Record<string, MemoryMeta>>();
    const conditionalSuspendingWasm: Record<string, WebAssembly.Module> = {};
    const isNode = options.nodejsCompat && typeof process !== 'undefined' && process.versions && process.versions.node;
    let fs: typeof import('node:fs/promises') | undefined;
    class ComponentError extends Error {
        declare readonly payload: unknown;
        constructor(value: unknown) {
            const enumerable = typeof value !== 'string';
            super(enumerable ? `${String(value)} (see error.payload)` : value);
            Object.defineProperty(this, 'payload', { value, enumerable });
        }
    }
    function lookupMemories(args: { componentIdx: number }): MemoryMeta[];
    function lookupMemories(args: { componentIdx: number; memoryIdx: number }): RuntimeMemory | undefined | [];
    function lookupMemories(args: {
        componentIdx: number;
        memoryIdx?: number;
    }): MemoryMeta[] | RuntimeMemory | undefined {
        const { componentIdx } = args ?? {};
        if (args.componentIdx === undefined) {
            throw new TypeError('missing component idx');
        }
        const metas = componentMemoryMap.get(componentIdx);
        if (!metas) {
            return [];
        }
        return args.memoryIdx === undefined ? Object.values(metas) : metas[args.memoryIdx]?.memory;
    }
    const trampoline =
        (name: string): CoreIntrinsics['conditionalSuspending1I32ToI32'] =>
        (fast, slow) => {
            return new wasm.Instance!(conditionalSuspendingWasm[name], {
                '': { fast, slow: new wasm.Suspending!(slow) },
            }).exports.run as ReturnType<CoreIntrinsics['conditionalSuspending1I32ToI32']>;
        };
    return {
        ...taskContext,
        asyncDeterminism: options.asyncDeterminism,
        i32Min: -2_147_483_648,
        i32Max: 2_147_483_647,
        asyncFunctionConstructor,
        ComponentError,
        RuntimeError,
        get ReadableStream() {
            if (!globalThis.ReadableStream) {
                throw new Error('builtin stream class [ReadableStream] is not available');
            }
            return globalThis.ReadableStream;
        },
        RepTable: createRepTable(RuntimeError, debugLog),
        ManagedBuffer,
        BufferManager,
        bufferManager: new BufferManager(),
        factTrapMessages: options.factTrapMessages ?? {},
        symbolCabiDispose: Symbol.for('cabiDispose'),
        symbolCabiLower: Symbol.for('cabiLower'),
        symbolResourceHandle: Symbol('handle'),
        symbolResourceRep: Symbol.for('cabiRep'),
        symbolDispose,
        symbolAsyncIterator: Symbol.asyncIterator,
        symbolIterator: Symbol.iterator,
        isLE: new Uint8Array(new Uint16Array([1]).buffer)[0] === 1,
        hasOwnProperty: Object.prototype.hasOwnProperty,
        asyncEventCode: {
            NONE: 0,
            SUBTASK: 1,
            STREAM_READ: 2,
            STREAM_WRITE: 3,
            FUTURE_READ: 4,
            FUTURE_WRITE: 5,
            TASK_CANCELLED: 6,
        },
        componentMemoryMap,
        conditionalSuspendingWasm,
        debugLog,
        coinFlip: () => Math.random() > 0.5,
        // Preserve the inline range check, including its acceptance of fractions.
        typeCheckValidI32: (n) => typeof n === 'number' && n >= -2_147_483_648 && n <= 2_147_483_647,
        typeCheckAsyncFn: (fn) => fn instanceof asyncFunctionConstructor,
        base64Compile: (encoded) =>
            wasm.compile!(
                options.nodejsCompat && typeof Buffer !== 'undefined'
                    ? Buffer.from(encoded, 'base64')
                    : Uint8Array.from(atob(encoded), (b) => b.charCodeAt(0)),
            ),
        async fetchCompile(url) {
            if (isNode) {
                fs = fs || (await import('node:fs/promises'));
                return wasm.compile!(await fs.readFile(url));
            }
            return fetch(url).then(wasm.compileStreaming!);
        },
        instantiateCore: (module, imports) => wasm.instantiate!(module, imports),
        clampGuest(value, min, max) {
            if (value < min || value > max) {
                throw new TypeError(`must be between ${min} and ${max}`);
            }
            return value;
        },
        getErrorPayload(error) {
            if (error && Object.prototype.hasOwnProperty.call(error, 'payload')) {
                return (error as { payload: unknown }).payload;
            }
            if (error instanceof Error) {
                throw error;
            }
            return error;
        },
        getErrorPayloadString(error) {
            if (error && Object.prototype.hasOwnProperty.call(error, 'payload')) {
                return (error as { payload: unknown }).payload;
            }
            if (error instanceof Error) {
                return error.message;
            }
            return error;
        },
        finalizationRegistryCreate(cleanup) {
            if (typeof FinalizationRegistry === 'undefined') {
                return { unregister() {} };
            }
            return new FinalizationRegistry(cleanup);
        },
        disposeHostValue(value, disposeFn) {
            if (!disposeFn) {
                if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
                    return;
                }
                const disposable = value as { [key: symbol]: unknown };
                if (typeof Symbol.asyncDispose === 'symbol' && typeof disposable[Symbol.asyncDispose] === 'function') {
                    disposeFn = disposable[Symbol.asyncDispose] as (this: unknown) => unknown;
                } else if (typeof disposable[symbolDispose] === 'function') {
                    disposeFn = disposable[symbolDispose] as (this: unknown) => unknown;
                } else {
                    return;
                }
            }
            const dispose = disposeFn!;
            const reportErr = (err: unknown) => console.error('[jco] error while disposing discarded host value', err);
            queueMicrotask(() => {
                try {
                    const res = dispose.call(value) as
                        | { then?: (ok: undefined, err: typeof reportErr) => unknown }
                        | undefined;
                    if (res && typeof res.then === 'function') {
                        res.then(undefined, reportErr);
                    }
                } catch (err) {
                    reportErr(err);
                }
            });
        },
        throwInvalidBool() {
            throw new TypeError('invalid variant discriminant for bool');
        },
        throwUninitialized() {
            throw new TypeError('Wasm uninitialized use `await $init` first');
        },
        promiseWithResolvers<T>() {
            if (Promise.withResolvers) {
                return Promise.withResolvers<T>();
            }
            let resolve!: (value: T | PromiseLike<T>) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        },
        registerMemory(args) {
            const { componentIdx, memory, memoryIdx } = args ?? {};
            if (componentIdx === undefined) {
                throw new TypeError('missing component idx');
            }
            if (memory === undefined && memoryIdx === undefined) {
                throw new TypeError('missing both memory & memory idx');
            }
            let inner = componentMemoryMap.get(componentIdx);
            if (!inner) {
                inner = {};
                componentMemoryMap.set(componentIdx, inner);
            }
            inner[String(memoryIdx)] = { memory, memoryIdx, componentIdx };
        },
        lookupMemories,
        suspendingImport(componentIdx, fn, syncOnly = false, switchesTask = false, convertsRangeErrors = true) {
            const context = options.coreContext;
            if (!context) {
                throw new TypeError('suspending imports require coreContext');
            }
            return function (...args) {
                context.checkMayLeave(componentIdx);
                const saved = currentTaskMeta[componentIdx] ?? null;
                const savedTask = saved ? context.getCurrentTask(saved.componentIdx, saved.taskID) : null;
                const mayBlock = savedTask ? (savedTask.mayBlock() ?? context.currentTaskMayBlock() !== 0) : false;
                if (!saved && !mayBlock) {
                    throw new RuntimeError('cannot block a synchronous task before returning');
                }
                if (syncOnly || !mayBlock) {
                    let result;
                    try {
                        result = fn.apply(null, args);
                    } catch (err) {
                        currentTaskMeta[componentIdx] = saved;
                        if (!switchesTask) {
                            currentTaskMeta.current = saved;
                        }
                        throw context.recordTrap(componentIdx, err, convertsRangeErrors);
                    }
                    currentTaskMeta[componentIdx] = saved;
                    if (!switchesTask) {
                        currentTaskMeta.current = saved;
                    }
                    if (
                        result !== null &&
                        (typeof result === 'object' || typeof result === 'function') &&
                        typeof (result as { then?: unknown }).then === 'function'
                    ) {
                        Promise.resolve(result).catch(() => {});
                        throw new RuntimeError('cannot block a synchronous task before returning');
                    }
                    return result;
                }
                // Keep invocation inside the async function: moving it out changes
                // JSPI continuation scheduling and can strand stream operations.
                return (async () => {
                    try {
                        const result = await fn.apply(null, args);
                        context.throwIfInterrupted(componentIdx);
                        return result;
                    } catch (err) {
                        throw context.recordTrap(componentIdx, err, convertsRangeErrors);
                    } finally {
                        currentTaskMeta[componentIdx] = saved;
                        if (!switchesTask) {
                            currentTaskMeta.current = saved;
                        }
                    }
                })();
            };
        },
        conditionalSuspending1I32ToI32: trampoline('_conditionalSuspending1I32ToI32'),
        conditionalSuspending2I32ToI32: trampoline('_conditionalSuspending2I32ToI32'),
        conditionalSuspending3I32ToI32: trampoline('_conditionalSuspending3I32ToI32'),
        conditionalSuspending3I32ToVoid: trampoline('_conditionalSuspending3I32ToVoid'),
    };
}
