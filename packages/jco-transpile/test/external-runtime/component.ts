import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));
function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const stores = [];
export const runtime = {
 apiVersion: 1,
 create(options) {
  const instance = defaults.create(options);
  const original = instance.intrinsics.component;
  const component = { ...original, marker: 42 };
  for (const key of Object.keys(original)) {
   if (typeof original[key] !== 'function' || key === 'ComponentAsyncState') continue;
   component[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost component namespace receiver');
    calls.push(key);
    return original[key](...args);
   };
  }
  ${mutate}
  stores.push(component);
  return { ...instance, intrinsics: { ...instance.intrinsics, component } };
 }
};`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `component provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                await writeFile(join(dir, 'provider.js'), providerSource());
                const { files } = await transpile(fixture, {
                    name: 'component',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider.js',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['component.js']);
                    assert.notInclude(source, 'class ComponentAsyncState');
                    assert.notInclude(source, 'const INSTANCE_FLAGS = new Map()');
                    assert.notInclude(source, 'const ASYNC_STATE = new Map()');
                    assert.notInclude(source, 'function _recordTrap(');
                    assert.include(source, 'componentTrapMessages:');
                    assert.include(source, 'createWaitable: args => new Waitable(args)');
                }
                const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instance = instantiation ? await instantiate() : bindings;
                instance.run();
                const resource: Disposable = instance.api.make();
                resource[Symbol.dispose]();
                assert.strictEqual(instance.drops(), 2);
                const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                assert.include(provider.calls, 'getOrCreateAsyncState');
                assert.isAbove(provider.stores[0].instanceFlags.size, 0);
                assert.isAbove(provider.stores[0].asyncState.size, 0);
                assert.isNull(provider.stores[0].storeTrap.error);
                for (const state of provider.stores[0].asyncState.values()) {
                    assert.instanceOf(state, provider.stores[0].ComponentAsyncState);
                }
                if (instantiation) {
                    const second = await instantiate();
                    assert.strictEqual(second.drops(), 0);
                    assert.notStrictEqual(provider.stores[0].instanceFlags, provider.stores[1].instanceFlags);
                    assert.notStrictEqual(provider.stores[0].asyncState, provider.stores[1].asyncState);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    { mutation: 'component.instanceFlags = null;', error: 'component.instanceFlags must be a object' },
    {
        mutation: 'component.getOrCreateAsyncState = undefined;',
        error: 'component.getOrCreateAsyncState must be a function',
    },
])('rejects invalid component providers: $error', async ({ mutation, error }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutation));
        const { files } = await transpile(fixture, {
            name: 'component',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
        assert.throws(() => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}), error);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([false, true])(
    'generated backpressure waiters wake only at zero (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(fixture, {
                name: 'component',
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            // Expose the generated helper to exercise the same class in both modes.
            files['component.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['component.js']) +
                    '\nexport { getOrCreateAsyncState as testGetState };\n',
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
            const state = bindings.testGetState(99);
            state.setBackpressure(2);
            let reentered = false;
            state.registerHandler({
                event: 'backpressure-change',
                fn: (bp: number) => {
                    if (bp === 0 && !reentered) {
                        reentered = true;
                        state.setBackpressure(0);
                    }
                },
            });
            let completed = 0;
            const waits = [state.waitForBackpressure(), state.waitForBackpressure()].map((p) =>
                p.then(() => {
                    completed++;
                }),
            );
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.strictEqual(completed, 0);
            state.decrementBackpressure();
            await Promise.resolve();
            assert.strictEqual(completed, 0);
            state.decrementBackpressure();
            await Promise.all(waits);
            assert.strictEqual(completed, 2);
            assert.strictEqual(state.getBackpressureWaiters(), 0n);
            state.setBackpressure(0);
            assert.strictEqual(state.getBackpressureWaiters(), 0n);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
