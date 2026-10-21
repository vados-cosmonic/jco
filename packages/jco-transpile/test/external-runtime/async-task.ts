import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { getTmpDir } from '../helpers.js';
import { parse } from '../../src/wasm-tools.js';
import { defaultRuntimeUrl, transpile, transpileBytes, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));
test.concurrent.each([false, true])(
    'synchronous initialization imports retire their temporary task (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const component = `(component
 (import "host" (instance $host (export "echo" (func (param "value" u32) (result u32)))))
 (core func $echo (canon lower (func $host "echo")))
 (core module $m
  (import "" "echo" (func $echo (param i32) (result i32)))
  (func (export "echo") (param i32) (result i32) (call $echo (local.get 0))))
 (core instance $m (instantiate $m (with "" (instance (export "echo" (func $echo))))))
 (func (export "echo") (param "value" u32) (result u32) (canon lift (core func $m "echo")))
)`;
            const { files } = await transpileBytes(await parse(component), {
                name: 'init',
                map: { host: './host.js' },
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            const getTask = external ? '_jcoIntrinsics.asyncTask.getCurrentTask' : 'getCurrentTask';
            const flags = external ? '_jcoIntrinsics.component.instanceFlags' : 'INSTANCE_FLAGS';
            files['init.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['init.js']) +
                    `
export function testInitialization() {
 ${flags}.set(99, { value: 1 });
 const result = _lowerImportBackwardsCompat({
  componentIdx: 99, isAsync: false, funcTypeIsAsync: false, getMemoryFn: () => undefined,
  importFn(value) {
   ${getTask}(99).task.currentSubtask().onResolve(value);
   return value;
  }
 }, 23);
 if (${getTask}(99) !== undefined) throw new Error('initialization task was not retired');
 return result;
}
`,
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFile(join(dir, 'host.js'), 'export const echo = value => value;\n');
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'init.js')).href);
            assert.strictEqual(bindings.testInitialization(), 23);
            assert.strictEqual(bindings.echo(42), 42);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const stores = [];
export const tasks = [];
export const runtime = {
 apiVersion: 1,
 create(options) {
  const instance = defaults.create(options);
  const original = instance.intrinsics.asyncTask;
  const asyncTask = Object.defineProperties({ marker: 42 }, Object.getOwnPropertyDescriptors(original));
  const raw = new Set(['AsyncTask', 'AsyncSubtask', 'currentTaskMayBlock', 'asyncBlockingCallDepth', 'asyncBlockedCode', 'tasksByComponent', 'currentTaskIds', 'currentComponentIdxs', 'symmetricSyncGuestCallStack']);
  for (const key of Object.keys(original)) {
   if (raw.has(key) || typeof original[key] !== 'function') continue;
   asyncTask[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost async-task namespace receiver');
    calls.push(key);
    const result = original[key](...args);
    if (key === 'createNewCurrentTask') tasks.push(result[0]);
    return result;
   };
  }
  ${mutate}
  stores.push(instance.intrinsics);
  return { ...instance, intrinsics: { ...instance.intrinsics, asyncTask } };
 }
};`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `async-task provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                await writeFile(join(dir, 'provider.js'), providerSource());
                const { files } = await transpile(fixture, {
                    name: 'tasks',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider.js',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['tasks.js']);
                    assert.notInclude(source, 'class AsyncTask');
                    assert.notInclude(source, 'class AsyncSubtask');
                    assert.notInclude(source, 'function createNewCurrentTask(');
                    assert.notInclude(source, 'const ASYNC_TASKS_BY_COMPONENT_IDX = new Map()');
                    assert.include(source, 'asyncTaskContext:');
                    assert.include(source, 'isFutureValue: value => value instanceof FutureValue');
                }
                const bindings = await import(pathToFileURL(join(dir, 'tasks.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instance = instantiation ? await instantiate() : bindings;
                const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                const store = provider.stores[0];
                // This fixture retains its synthetic <initialize> resource scope.
                // Calls must return to that baseline rather than leak new scopes.
                const initialScopes = [...store.resource.state.scopeTasks.keys()];
                instance.run();
                const resource: Disposable = instance.api.make();
                resource[Symbol.dispose]();
                assert.strictEqual(instance.drops(), 2);
                assert.includeMembers(provider.calls, ['createNewCurrentTask', 'contextGet', 'contextSet']);
                for (const task of provider.tasks) {
                    assert.instanceOf(task, store.asyncTask.AsyncTask);
                }
                assert.isEmpty(store.asyncTask.currentTaskIds);
                assert.isEmpty(store.asyncTask.currentComponentIdxs);
                assert.deepEqual([...store.resource.state.scopeTasks.keys()], initialScopes);
                assert.isNull(store.core.currentTaskMeta.current);
                if (instantiation) {
                    const second = await instantiate();
                    second.run();
                    assert.notStrictEqual(store.asyncTask.AsyncTask, provider.stores[1].asyncTask.AsyncTask);
                    assert.notStrictEqual(
                        store.asyncTask.tasksByComponent,
                        provider.stores[1].asyncTask.tasksByComponent,
                    );
                    assert.notStrictEqual(
                        store.asyncTask.currentTaskMayBlock,
                        provider.stores[1].asyncTask.currentTaskMayBlock,
                    );
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    {
        mutation: 'Object.defineProperty(asyncTask, "currentTaskMayBlock", { value: null });',
        error: 'asyncTask.currentTaskMayBlock must be a object',
    },
    {
        mutation: 'asyncTask.createNewCurrentTask = undefined;',
        error: 'asyncTask.createNewCurrentTask must be a function',
    },
    { mutation: 'asyncTask.contextGet = null;', error: 'asyncTask.contextGet must be a function' },
])('rejects invalid async-task providers: $error', async ({ mutation, error }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutation));
        const { files } = await transpile(fixture, {
            name: 'tasks',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        assert.include(new TextDecoder().decode(files['tasks.js']), error);
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'tasks.js')).href);
        assert.throws(() => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}), error);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([false, true])(
    'generated subtasks account for their first lender (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(fixture, {
                name: 'tasks',
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            files['tasks.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['tasks.js']) + '\nexport { createNewCurrentTask as testCreateTask };\n',
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'tasks.js')).href);
            const [parent] = bindings.testCreateTask({ componentIdx: 99 });
            try {
                const sub = parent.createSubtask({ componentIdx: 99, isAsync: true });
                const lender = { lends: 0 };
                sub.addLender(lender);
                assert.strictEqual(lender.lends, 1);
                sub.onStart();
                sub.onResolve(42);
                assert.throws(() => sub.addLender(lender), 'already been resolved');
                sub.deliverResolve();
                assert.strictEqual(lender.lends, 0);
                assert.throws(() => sub.deliverResolve(), 'cannot deliver resolution twice');
                sub.drop();
            } finally {
                parent.resolve([]);
                parent.exit({ skipExclusiveLockCheck: true });
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
