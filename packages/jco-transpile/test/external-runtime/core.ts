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
  const original = instance.intrinsics.core;
  const core = { ...original, marker: 42 };
  const raw = new Set(['ComponentError', 'RuntimeError', 'RepTable', 'ManagedBuffer', 'BufferManager', 'ReadableStream', 'asyncFunctionConstructor', 'hasOwnProperty']);
  for (const key of Object.keys(original)) {
   if (typeof original[key] !== 'function' || raw.has(key)) continue;
   core[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost core namespace receiver');
    calls.push(key);
    return original[key](...args);
   };
  }
  ${mutate}
  stores.push(core);
  return { ...instance, intrinsics: { ...instance.intrinsics, core } };
 }
};`;
}
for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(`core provider (${instantiation ?? 'direct'}, minify=%s)`, async (minify) => {
        const dir = await getTmpDir();
        try {
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFile(join(dir, 'provider.js'), providerSource());
            const { files } = await transpile(fixture, {
                name: 'core',
                instantiation,
                minify,
                cmRuntimeEsModule: './provider.js',
            });
            await writeFiles(files, { baseDir: dir });
            if (!minify) {
                const source = new TextDecoder().decode(files['core.js']);
                assert.notInclude(source, 'class RepTable');
                assert.notInclude(source, 'function _withGlobalCurrentTaskMeta(');
                assert.notInclude(source, 'const CURRENT_TASK_META = {}');
                if (instantiation) {
                    assert.notInclude(source, 'const instantiateCore =');
                }
            }
            const bindings = await import(pathToFileURL(join(dir, 'core.js')).href);
            let customInstantiations = 0;
            const instantiateCore = (module: WebAssembly.Module, imports: WebAssembly.Imports) => {
                customInstantiations++;
                return new WebAssembly.Instance(module, imports);
            };
            const instance = instantiation
                ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}, instantiateCore)
                : bindings;
            instance.run();
            const resource: Disposable = instance.api.make();
            resource[Symbol.dispose]();
            assert.strictEqual(instance.drops(), 2);
            const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
            assert.include(provider.calls, 'withCurrentTaskMeta');
            const core = provider.stores[0];
            assert.strictEqual(core.currentTaskMeta.current, null);
            if (instantiation) {
                assert.isAbove(customInstantiations, 0);
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}

test.concurrent.each([
    { mutation: 'core.RepTable = {};', error: 'core.RepTable must be a function' },
    { mutation: 'core.symbolDispose = "dispose";', error: 'core.symbolDispose must be a symbol' },
    { mutation: 'core.withCurrentTaskMeta = undefined;', error: 'core.withCurrentTaskMeta must be a function' },
])('rejects invalid core providers: $error', async ({ mutation, error }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutation));
        const { files } = await transpile(fixture, {
            name: 'core',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'core.js')).href);
        assert.throws(() => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}), error);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
