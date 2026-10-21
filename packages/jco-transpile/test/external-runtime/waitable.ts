import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assert, expect, test } from 'vitest';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/waitable-set-poll-non-set.wat', import.meta.url));
function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const stores = [];
export const runtime = {
 apiVersion: 1,
 create(options) {
  const instance = defaults.create(options);
  const original = instance.intrinsics.waitable;
  const waitable = { ...original, marker: 42 };
  for (const key of Object.keys(original)) {
   if (key === 'Waitable' || key === 'WaitableSet') continue;
   waitable[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost waitable namespace receiver');
    calls.push(key);
    return original[key](...args);
   };
  }
  ${mutate}
  stores.push(instance.intrinsics);
  return { ...instance, intrinsics: { ...instance.intrinsics, waitable } };
 }
};`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `waitable provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                await writeFile(join(dir, 'provider.js'), providerSource());
                const { files } = await transpile(fixture, {
                    name: 'waitable',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider.js',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['waitable.js']);
                    assert.notInclude(source, 'class Waitable');
                    assert.notInclude(source, 'function waitableSet');
                    assert.notInclude(source, 'componentContext:');
                    assert.include(source, 'waitableContext:');
                    assert.include(source, 'storeEventInComponentMemory: args =>');
                }
                const bindings = await import(pathToFileURL(join(dir, 'waitable.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instance = instantiation ? await instantiate() : bindings;
                assert.strictEqual(await instance.pollEmptySet(), 0);
                const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                assert.includeMembers(provider.calls, ['waitableSetNew', 'waitableSetPoll', 'waitableSetDrop']);
                const store = provider.stores[0];
                const state = store.component.getOrCreateAsyncState(0);
                assert.instanceOf(state.createWaitable(), store.waitable.Waitable);
                await expect(instance.pollFutureEnd()).rejects.toThrow('unknown handle index');
                if (instantiation) {
                    const second = await instantiate();
                    assert.strictEqual(await second.pollEmptySet(), 0);
                    assert.notStrictEqual(provider.stores[0].waitable.Waitable, provider.stores[1].waitable.Waitable);
                    assert.notStrictEqual(
                        provider.stores[0].waitable.WaitableSet,
                        provider.stores[1].waitable.WaitableSet,
                    );
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    { mutation: 'waitable.WaitableSet = undefined;', error: 'waitable.WaitableSet must be a function' },
    { mutation: 'waitable.waitableSetPoll = null;', error: 'waitable.waitableSetPoll must be a function' },
])('rejects invalid waitable providers: $error', async ({ mutation, error }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutation));
        const { files } = await transpile(fixture, {
            name: 'waitable',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'waitable.js')).href);
        assert.throws(() => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}), error);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([false, true])(
    'generated waitable guards preserve state after failure (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(fixture, {
                name: 'waitable',
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            files['waitable.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['waitable.js']) +
                    `
export { Waitable, WaitableSet };
export function testPollMismatch() {
 const previous = getCurrentTask;
 getCurrentTask = () => ({ componentIdx: 77 });
 try { return waitableSetPoll({ componentIdx: 0 }, 1, 0); }
 finally { getCurrentTask = previous; }
}
`,
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFiles(files, { baseDir: dir });
            const { Waitable, WaitableSet, testPollMismatch } = await import(
                pathToFileURL(join(dir, 'waitable.js')).href
            );
            assert.throws(testPollMismatch, 'task component idx [77] != component instance ID [0]');
            const w = new Waitable({});
            const set = new WaitableSet(0);
            w.join(set);
            assert.throws(() => w.join(undefined), TypeError);
            assert.strictEqual(set.numWaitables(), 1);
            w.drop();
            await expect(
                w.waitForPendingEvent({
                    cstate: {
                        waitUntil() {
                            throw new Error('scheduler failed');
                        },
                    },
                }),
            ).rejects.toThrow('scheduler failed');
            await w.waitForPendingEvent({ cstate: { waitUntil() {} } });
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
