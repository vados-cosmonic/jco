import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

function fixture(name: string) {
    return fileURLToPath(new URL(`../fixtures/components/p3/${name}.wat`, import.meta.url));
}
function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const prepared = [];
export const runtime = {
 apiVersion: 1,
 create(options) {
  const instance = defaults.create(options);
  const original = instance.intrinsics.host;
  const host = { ...original, marker: 42 };
  for (const key of Object.keys(original)) {
   host[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost host namespace receiver');
    calls.push(key);
    const result = original[key](...args);
    if (key === 'prepareCall') {
     const task = instance.intrinsics.asyncTask.getCurrentTask(args[5]).task;
     if (task.getReturnMemory() !== args[1]()) throw new Error('prepared memory was not captured');
     prepared.push(task.subtaskMeta.stringEncoding);
    }
    return result;
   };
  }
  ${mutate}
  return { ...instance, intrinsics: { ...instance.intrinsics, host } };
 }
};`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(`host provider (${instantiation ?? 'direct'}, minify=%s)`, async (minify) => {
        const dir = await getTmpDir();
        try {
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFile(join(dir, 'provider.js'), providerSource());
            const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
            for (const [name, method] of [
                ['sync-lowered-async-callee', 'syncStartCall'],
                ['deferred-subtask-start', 'asyncStartCall'],
                ['waitable-set-poll-non-set', 'storeEventInComponentMemory'],
            ]) {
                const { files } = await transpile(fixture(name), {
                    name,
                    instantiation,
                    minify,
                    asyncMode: 'jspi',
                    cmRuntimeEsModule: './provider.js',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files[`${name}.js`]);
                    for (const helper of [
                        '_prepareCall',
                        '_asyncStartCall',
                        '_syncStartCall',
                        '_storeEventInComponentMemory',
                    ]) {
                        assert.notInclude(source, `function ${helper}(`);
                    }
                    assert.include(source, `host.${method} must be a function`);
                }
                const bindings = await import(pathToFileURL(join(dir, `${name}.js`)).href);
                const instance = instantiation
                    ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                    : bindings;
                if (method === 'asyncStartCall') {
                    const packed = await instance.run();
                    assert.deepEqual([(packed >>> 8) & 15, packed & 15], [1, 0]);
                    for (let i = 0; i < 50 && instance.completed() !== 2; i++) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    }
                    assert.strictEqual(instance.completed(), 2);
                } else {
                    assert.strictEqual(
                        await (method === 'storeEventInComponentMemory' ? instance.pollEmptySet() : instance.run()),
                        method === 'storeEventInComponentMemory' ? 0 : 42,
                    );
                }
                assert.include(provider.calls, method);
            }
            assert.include(provider.calls, 'prepareCall');
            assert.isNotEmpty(provider.prepared);
            assert.isTrue(
                provider.prepared.every((encoding: string) => ['utf8', 'utf16', 'compact-utf16'].includes(encoding)),
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}

test.concurrent.each([
    ['prepareCall', 'sync-lowered-async-callee'],
    ['syncStartCall', 'sync-lowered-async-callee'],
    ['asyncStartCall', 'deferred-subtask-start'],
    ['storeEventInComponentMemory', 'waitable-set-poll-non-set'],
])('rejects invalid host.%s', async (method, name) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(`host.${method} = null;`));
        const { files } = await transpile(fixture(name), {
            name,
            instantiation: 'sync',
            asyncMode: 'jspi',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, `${name}.js`)).href);
        assert.throws(
            () => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}),
            `host.${method} must be a function`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
