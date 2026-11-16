import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../packages/jco-transpile/package.json', import.meta.url));
const ts = require('typescript-compiler-api');
const prefix = '__jcoEmbeddedRuntime$';

/** Extract the actual generated operations and thread table for isolated semantic checks. */
export function operations(source) {
    const tree = ts.createSourceFile('component.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const instantiate = tree.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'instantiate',
    );
    const selected = new Set([
        ...[
            'initializeRepTableClass',
            'getOrCreateAsyncState',
            'getCurrentTaskMeta',
            'getCurrentThread',
            'typeCheckValidI32',
            'contextGet',
            'contextSet',
        ].map((name) => prefix + name),
        '__benchmarkThread',
        '__benchmarkStorage',
        '__benchmarkBridge',
    ]);
    const declarations = [];
    for (const statement of instantiate.body.statements) {
        if (ts.isFunctionDeclaration(statement) && selected.has(statement.name?.text)) {
            declarations.push(statement.getText(tree));
        }
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (selected.has(declaration.name.getText(tree))) {
                    declarations.push(`let ${declaration.getText(tree)};`);
                }
            }
        }
    }
    return new Function(`
        const ${prefix}debugLog = () => {};
        ${declarations.join('\n')}
        return {
            get: ${prefix}contextGet, set: ${prefix}contextSet,
            Table: ${prefix}initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError }),
        };
    `)();
}

/** Create two components backed by the actual generated RepTable implementation. */
function store(ops) {
    const context = { registers: {}, lookup: { asyncState: new Map() } };

    /** Add a thread and return its register metadata and observable storage. */
    function thread(componentIdx, taskID) {
        let state = context.lookup.asyncState.get(componentIdx);
        if (!state) {
            state = { threads: new ops.Table() };
            context.lookup.asyncState.set(componentIdx, state);
        }
        const value = {
            storage: [0, 0],
            taskID: () => taskID,
            componentIdx: () => componentIdx,
            task: () => ({ id: () => taskID }),
            id: () => meta.threadID,
        };
        const meta = { componentIdx, taskID, threadID: state.threads.insert(value) };
        return { meta, value, threads: state.threads };
    }

    /** Select the thread as both its component's current thread and the executing thread. */
    function select(thread) {
        context.registers.current = context.registers[thread.meta.componentIdx] = thread.meta;
    }
    return { context, thread, select };
}

/** Check context isolation, restored register identity, and liveness after thread-ID recycling. */
export function check(ops, validate = true) {
    const state = store(ops);
    const outer = state.thread(0, 1n);
    const inner = state.thread(0, 1n);
    const callee = state.thread(1, 2n);
    const ctx = { componentIdx: 0, slot: 0 };
    const get = (options = ctx) => ops.get(state.context, options);
    const set = (value, options = ctx) => ops.set(state.context, options, value);
    state.select(outer);
    assert.equal(get(), 0);
    set(17);
    set(-2147483648, { slot: 1 });
    assert.equal(get({ slot: 1 }), -2147483648);
    set(2147483647, { slot: 1 });
    assert.equal(get({ slot: 1 }), 2147483647);
    state.select(inner);
    assert.equal(get(), 0, 'a nested thread must start with empty context');
    set(42);
    state.select(outer);
    assert.equal(get(), 17, 'restoring the original register object must restore its thread');
    state.select(callee);
    set(99, { slot: 0 });
    assert.equal(get(), 17, 'component-specific lookup must precede executing-thread lookup');
    assert.equal(get({ slot: 0 }), 99);

    // A dead per-component register must fall back to the executing task,
    // even when its numeric thread ID has been reused for another task.
    outer.threads.remove(outer.meta.threadID);
    const replacement = state.thread(0, 3n);
    assert.equal(replacement.meta.threadID, outer.meta.threadID);
    assert.equal(get(), 99, 'a recycled ID must not revive stale task metadata');
    set(101);
    assert.equal(callee.value.storage[0], 101);
    assert.equal(replacement.value.storage[0], 0);
    state.context.registers.current = null;
    assert.throws(() => get(), /missing/);
    state.select(replacement);
    assert.equal(get(), 0);

    // A suspended callback resumes by selecting its own thread again.
    state.select(inner);
    assert.equal(get(), 42);
    state.select(replacement);
    assert.equal(get(), 0);

    const independent = store(ops);
    const independentThread = independent.thread(0, 1n);
    independent.select(independentThread);
    ops.set(independent.context, ctx, 123);
    assert.equal(get(), 0, 'instances must not share context');

    if (validate) {
        assert.throws(() => get({ componentIdx: 0 }), /missing slot/);
        assert.throws(() => get({ slot: 2 }), /invalid slot/);
        assert.throws(() => set(0, { slot: -1 }), /invalid slot/);
        assert.throws(() => set(2147483648), /invalid value/);
        assert.throws(() => set(NaN), /invalid value/);
    }

    replacement.threads.clear();
    assert.throws(() => get(), /missing/, 'clearing the thread table must invalidate cached storage');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const output = resolve(process.argv[2]);
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    for (const variant of manifest.variants.filter((name) => name !== 'wasip2')) {
        const source = await readFile(join(output, 'variants', variant, 'stack-loop.js'), 'utf8');
        const ops = operations(source);
        if (manifest.diagnosticOnly.includes(variant)) {
            assert.throws(() => check(ops), undefined, `${variant} should demonstrate its isolation limitation`);
            console.log(`${variant}: expected isolation failure (diagnostic only)`);
        } else {
            check(ops);
            console.log(`${variant}: context semantics passed`);
        }
    }
}
