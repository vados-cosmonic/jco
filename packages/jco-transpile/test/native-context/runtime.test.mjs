import assert from 'node:assert/strict';
import { test } from 'node:test';
import { core } from './helpers.mjs';
import { createNativeContextManager } from '../../bench/native-context/runtime.mjs';
import { nativeContext } from '../../bench/native-context/transform.mjs';

/** Construct distinct per-thread slot pairs using the same lookup contract as the runtime. */
function store() {
    const manager = createNativeContextManager();
    const context = { registers: manager.registers(), lookup: { asyncState: new Map() } };
    const get = (slot = 0, componentIdx) => manager.bind(context, { slot, componentIdx }, 'get');
    const set = (slot = 0, componentIdx) => manager.bind(context, { slot, componentIdx }, 'set');
    /** Add a thread with independently owned context storage. */
    function thread(componentIdx, taskID, threadID) {
        let state = context.lookup.asyncState.get(componentIdx);
        if (!state) context.lookup.asyncState.set(componentIdx, (state = { threads: new Map() }));
        const value = { taskID: () => taskID, storage: [0, 0] };
        manager.invalidate();
        state.threads.set(threadID, value);
        return { meta: { componentIdx, taskID, threadID }, value };
    }
    /** Select a live thread in its component and in the executing-thread register. */
    function select(thread) {
        context.registers.current = context.registers[thread.meta.componentIdx] = thread.meta;
    }
    return { manager, context, get, set, thread, select };
}

test('native accessors retain separate slots through thread and component switches', () => {
    const state = store();
    const outer = state.thread(0, 1n, 1);
    const inner = state.thread(0, 1n, 2);
    const callee = state.thread(1, 2n, 1);
    state.select(outer);
    const table = new WebAssembly.Table({ element: 'anyfunc', initial: 1 });
    table.set(0, state.get());
    state.set()(17);
    state.set(1)(-2147483648);
    assert.equal(state.get()(), 17);
    state.select(inner);
    assert.equal(state.get()(), 0);
    state.set()(42);
    state.select(outer);
    assert.equal(state.get()(), 17);
    assert.equal(state.get(1)(), -2147483648);
    state.select(callee);
    state.set()(2147483647);
    assert.equal(state.get(0, 0)(), 17);
    state.set(1, 0)(-1);
    assert.equal(state.get()(), 2147483647);
    assert.equal(state.get(1, 0)(), -1);
    state.manager.invalidate();
    assert.deepEqual(outer.value.storage, [17, -1]);
    assert.deepEqual(inner.value.storage, [42, 0]);
    assert.deepEqual(callee.value.storage, [2147483647, 0]);
});

test('recycled handles reject stale metadata and fall back only to a live current thread', () => {
    const state = store();
    const dead = state.thread(0, 1n, 1);
    const live = state.thread(1, 2n, 1);
    state.select(dead);
    state.set(0, 0)(99);
    state.select(live);
    state.set()(77);
    const replacement = state.thread(0, 3n, 1);
    assert.equal(state.get(0, 0)(), 77);
    state.context.registers.current = null;
    assert.throws(() => state.get(0, 0)(), /missing current thread/);
    state.select(replacement);
    assert.equal(state.get(0, 0)(), 0);
    assert.equal(dead.value.storage[0], 99);
});

test('temporary storage overrides and independent instances do not share slots', () => {
    const state = store();
    const other = store();
    const thread = state.thread(0, 1n, 1);
    state.select(thread);
    other.select(other.thread(0, 1n, 1));
    state.set()(100);
    other.set()(-100);
    state.manager.invalidate();
    const saved = thread.value.storage;
    thread.value.storage = [0, 0];
    assert.equal(state.get()(), 0);
    state.set()(50);
    state.manager.invalidate();
    thread.value.storage = saved;
    assert.equal(state.get()(), 100);
    assert.equal(other.get()(), -100);
});

test('guards preserve multi-value results, reference identity and thrown exceptions', () => {
    const { manager } = store();
    const object = {};
    const wrapped = manager.guard((integer, reference) => [integer + 1n, reference], {
        params: ['i64', 'externref'],
        results: ['i64', 'externref'],
    });
    assert.equal(manager.guard(wrapped, { params: ['i64', 'externref'], results: ['i64', 'externref'] }), wrapped);
    assert.deepEqual(wrapped(4n, object), [5n, object]);
    const error = new Error('sentinel');
    const throwing = manager.guard(
        () => {
            throw error;
        },
        { params: [], results: [] },
    );
    assert.throws(throwing, (caught) => caught === error);
});

test('unsupported generated runtimes and wrapper types fail closed', () => {
    assert.throws(() => nativeContext('export function instantiate() {}', {}), /Unsupported embedded runtime/);
    const { manager } = store();
    assert.throws(
        () => manager.guard(() => {}, { params: ['v128'], results: [] }),
        /Unsupported native-context value type/,
    );
    assert.throws(() => manager.bind({}, { slot: 2 }, 'get'), /Invalid native context binding/);
});

test('post-call guard invalidates on the actual JSPI resume', async (test) => {
    const state = store();
    const first = state.thread(0, 1n, 1);
    const second = state.thread(0, 2n, 2);
    const resumes = [];
    const wait = new WebAssembly.Suspending(() => new Promise((resolve) => resumes.push(resolve)));
    const guarded = state.manager.guard(wait, { params: [], results: [] });
    const module = await core(
        test,
        `(module
        (import "" "get" (func $get (result i32)))
        (import "" "wait" (func $wait))
        (func (export "run") (result i32) (call $wait) (call $get)))`,
    );
    const run = WebAssembly.promising(
        new WebAssembly.Instance(module, { '': { get: state.get(), wait: guarded } }).exports.run,
    );
    state.select(first);
    state.set()(11);
    const firstResult = run();
    state.select(second);
    state.set()(22);
    const secondResult = run();
    // Warm the selected thread's cache before resolving its pending import. The
    // first native get on the resumed Wasm stack must refresh it again.
    state.select(second);
    state.get()();
    const beforeSecondResume = state.manager.stats.refreshes;
    resumes[1]();
    assert.equal(await secondResult, 22);
    assert.equal(state.manager.stats.refreshes, beforeSecondResume + 1);
    state.select(first);
    state.get()();
    const beforeFirstResume = state.manager.stats.refreshes;
    resumes[0]();
    assert.equal(await firstResult, 11);
    assert.equal(state.manager.stats.refreshes, beforeFirstResume + 1);
});
