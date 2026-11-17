import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { suite, test, expect } from 'vitest';

import { getTmpDir, setupAsyncTest } from '../helpers.js';
import { transpile, writeFiles } from '../transpilation.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/components', import.meta.url));

const P3_COMPONENT_FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'p3');

suite('Context (WASI P3)', () => {
    test.concurrent.each([
        { minify: false, suspend: false },
        { minify: true, suspend: false },
        { minify: false, suspend: true },
        { minify: true, suspend: true },
    ])('realloc isolates both context slots (minify=$minify, suspend=$suspend)', async ({ minify, suspend }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: suspend ? 'jspi' : undefined,
            component: {
                name: 'context-realloc',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'context-realloc.wat'),
                imports: {
                    echo: { default: (value: string) => (suspend ? Promise.resolve(value) : value) },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify,
                        asyncImports: suspend ? ['echo'] : [],
                        asyncExports: suspend ? ['run'] : [],
                    },
                },
            },
        });
        try {
            for (let call = 0; call < 2; call++) {
                expect(await instance.run('hello')).toBe(5);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('context.get/set (sync export, sync call)', async () => {
        const name = 'context-sync';

        // NOTE: Despite not specifying the export as async (via jco transpile options in setupAsyncTest),
        // the export is async -- since the component lifted the function in an async manner.
        //
        // This test performs a sync call of an async lifted export.
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(P3_COMPONENT_FIXTURES_DIR, name, 'component.wasm'),
            },
        });

        expect(instance.pullContext).toBeTruthy();
        expect(instance.pushContext).toBeTruthy();
        expect(instance.pushContext(33)).toEqual(33);
        // NOTE: context is wiped from task to task, and sync call tasks end as soon as they return
        expect(instance.pullContext()).toEqual(0);

        await cleanup();
    });

    test.concurrent.each([false, true])(
        'resource destructors isolate the caller context (minify=%s)',
        async (minify: boolean) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: 'context-resource-drop',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-resource-drop.wat'),
                },
                jco: { transpile: { extraArgs: { minify } } },
            });
            try {
                for (let round = 1; round <= 3; round++) {
                    // The guest asserts that a nested destructor starts with an empty context
                    // and leaves its caller's context value intact.
                    instance.run();
                    expect(instance.drops()).toBe(round * 2 - 1);
                    const resource: Disposable = instance.api.make();
                    resource[Symbol.dispose]();
                    resource[Symbol.dispose]();
                    expect(instance.drops()).toBe(round * 2);
                }
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent.each([
        { minify: false, suspend: false },
        { minify: true, suspend: false },
        { minify: false, suspend: true },
        { minify: true, suspend: true },
    ])('fused adapters preserve context (minify=$minify, suspend=$suspend)', async ({ minify, suspend }) => {
        let pauses = 0;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: suspend ? 'jspi' : undefined,
            component: {
                name: 'context-fused',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'context-fused.wat'),
                imports: {
                    pause: {
                        default: () => {
                            pauses++;
                            return suspend ? new Promise<void>((resolve) => setTimeout(resolve, 0)) : undefined;
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify,
                        asyncImports: suspend ? ['pause'] : [],
                        asyncExports: suspend ? ['run'] : [],
                    },
                },
            },
        });
        try {
            // Guest assertions check context during initialization, realloc,
            // the composed call (including suspension), and post-return. A
            // second call proves context resets and cleanup cannot leak.
            for (let call = 1; call <= 2; call++) {
                const result = instance.run();
                expect(suspend ? await result : result).toBe(42);
                expect(instance.postCount()).toBe(call);
                expect(pauses).toBe(call);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([{ minify: false }, { minify: true }])(
        'suspended calls keep their own context (minify=$minify)',
        async ({ minify }) => {
            // Each pause suspends the calling guest stack until the test releases it.
            const paused = new Map<number, () => void>();
            let mostPaused = 0;
            const resumed: number[] = [];
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    name: 'context-interleaved',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'context-interleaved.wat'),
                    imports: {
                        pause: {
                            default: (id: number) =>
                                new Promise<void>((resolve) => {
                                    paused.set(id, resolve);
                                    mostPaused = Math.max(mostPaused, paused.size);
                                }),
                        },
                        mark: { default: (id: number) => void resumed.push(id) },
                    },
                },
                jco: {
                    transpile: {
                        extraArgs: { minify, asyncImports: ['pause'], asyncExports: ['run', 'spin'] },
                    },
                },
            });

            /** Resume the call which `id` names, once it is suspended. */
            const release = async (id: number) => {
                while (!paused.has(id)) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                const resume = paused.get(id)!;
                paused.delete(id);
                resume();
            };

            try {
                for (let round = 0; round < 2; round++) {
                    const calls = [1, 2, 3].map((id) => instance.run(id));

                    // Resume the calls in an order which differs from the order
                    // they suspended in, for both of their suspensions. The
                    // guest traps if a call resumes with another's context.
                    for (const id of [2, 3, 1, 3, 1, 2]) {
                        await release(id);
                    }
                    expect(await Promise.all(calls)).toEqual([1001, 1002, 1003]);
                }
                expect(mostPaused).toBe(3);

                // Calls which yield to each other also resume with their own
                // context, and here they do take turns.
                const spins = [1, 2, 3].map((id) => instance.spin(id, 4));
                expect(await Promise.all(spins)).toEqual([1, 2, 3]);
                expect(resumed).toHaveLength(12);
                expect(new Set(resumed.slice(0, 3)).size).toBe(3);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('instances of one component keep separate context', async () => {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(join(P3_COMPONENT_FIXTURES_DIR, 'context-interleaved.wat'), {
                name: 'context-interleaved',
                instantiation: 'async',
                asyncMode: 'jspi',
                asyncImports: ['pause'],
                asyncExports: ['run', 'spin'],
            });
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'context-interleaved.js')).href);

            /** Instantiate the component with pauses which the test releases. */
            const instantiate = async () => {
                const paused: (() => void)[] = [];
                const instance = await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {
                    pause: { default: () => new Promise<void>((resolve) => void paused.push(resolve)) },
                    mark: { default: () => {} },
                });
                return { instance, paused };
            };
            const first = await instantiate();
            const second = await instantiate();

            // Both instances suspend a call with the same id, so they hold
            // the same values in their slots until the second pause, where
            // each call has written a value of its own. The guest traps if
            // either instance observes the other's slots.
            const calls = [first.instance.run(7), second.instance.run(7), second.instance.run(8)];
            for (let pause = 0; pause < 2; pause++) {
                while (first.paused.length < 1 || second.paused.length < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                for (const resume of [...second.paused.splice(0).reverse(), ...first.paused.splice(0)]) {
                    resume();
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
            expect(await Promise.all(calls)).toEqual([1007, 1007, 1008]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
