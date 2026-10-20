import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));

function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const instances = [];
export const calls = [];
export const runtime = {
  apiVersion: 1,
  create(options) {
    const instance = defaults.create(options);
    instances.push(instance);
    const original = instance.intrinsics.resource;
    const resource = { ...original, marker: 42 };
    for (const key of Object.keys(original)) {
      if (typeof original[key] !== 'function') continue;
      resource[key] = function (...args) {
        if (this.marker !== 42) throw new Error('lost resource namespace receiver');
        calls.push(key);
        return original[key](...args);
      };
    }
    ${mutate}
    return { ...instance, intrinsics: { ...instance.intrinsics, resource } };
  }
};`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `resource provider shares task state (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                await writeFile(join(dir, 'provider.js'), providerSource());
                const { files } = await transpile(fixture, {
                    name: 'resources',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider.js',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['resources.js']);
                    assert.notInclude(source, 'function rscTableRemove(');
                    assert.notInclude(source, 'function callResourceDestructor(');
                    assert.notInclude(source, 'const HANDLE_TABLES =');
                    assert.notInclude(source, 'let RESOURCE_SCOPE_ID =');
                    assert.include(source, '++_jcoIntrinsics.resource.state.scopeCounter');
                }
                const bindings = await import(pathToFileURL(join(dir, 'resources.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                assert.lengthOf(provider.instances, instances.length);
                for (const [index, instance] of instances.entries()) {
                    const state = provider.instances[index].intrinsics.resource.state;
                    const initialScopes = [...state.scopeTasks.keys()];
                    state.scopeCounter = 100;
                    for (let round = 1; round <= 3; round++) {
                        // The guest traps if its destructor inherits the caller's context
                        // or fails to restore that context after it returns.
                        instance.run();
                        assert.strictEqual(instance.drops(), round * 2 - 1);
                        const resource: Disposable = instance.api.make();
                        resource[Symbol.dispose]();
                        resource[Symbol.dispose]();
                        assert.strictEqual(instance.drops(), round * 2);
                    }
                    assert.isAbove(state.scopeCounter, 100);
                    assert.deepEqual([...state.scopeTasks.keys()], initialScopes);
                }
                assert.include(provider.calls, 'callDestructor');
                assert.include(provider.calls, 'tableRemove');
                if (instances.length === 2) {
                    assert.notStrictEqual(
                        provider.instances[0].intrinsics.resource.state,
                        provider.instances[1].intrinsics.resource.state,
                    );
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    { mutate: 'resource.tableFlag = null;', path: 'resource.tableFlag', type: 'number' },
    { mutate: 'resource.state.handleTables = null;', path: 'resource.state.handleTables', type: 'object' },
    { mutate: 'delete resource.state;', path: 'resource.state.scopeCounter', type: 'number' },
    { mutate: 'resource.state.scopeCounter = "0";', path: 'resource.state.scopeCounter', type: 'number' },
])('rejects invalid $path before guest initialization', async ({ mutate, path, type }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutate));
        const { files } = await transpile(fixture, {
            name: 'invalid',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'invalid.js')).href);
        assert.throws(
            () => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}),
            `runtime intrinsic ${path} must be ${type === 'object' ? 'an' : 'a'} ${type}`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
