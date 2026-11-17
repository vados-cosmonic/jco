import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './helpers.mjs';

for (const variant of ['baseline', 'checked', 'native']) {
    for (const minify of [false, true]) {
        for (const suspend of [false, true]) {
            test(`${variant}: realloc preserves both slots (minify=${minify}, suspend=${suspend})`, async (test) => {
                const instance = await component(test, 'context-realloc.wat', {
                    variant,
                    minify,
                    imports: { echo: { default: (value) => (suspend ? Promise.resolve(value) : value) } },
                    asyncImports: suspend ? ['echo'] : [],
                    asyncExports: suspend ? ['run'] : [],
                });
                for (let round = 0; round < 3; round++) assert.equal(await instance.run('hello'), 5);
            });
            test(`${variant}: FACT, start and post-return (minify=${minify}, suspend=${suspend})`, async (test) => {
                let pauses = 0;
                const instance = await component(test, 'context-fused.wat', {
                    variant,
                    minify,
                    imports: {
                        pause: {
                            default: () => {
                                pauses++;
                                return suspend ? new Promise((resolve) => setImmediate(resolve)) : undefined;
                            },
                        },
                    },
                    asyncImports: suspend ? ['pause'] : [],
                    asyncExports: suspend ? ['run'] : [],
                });
                for (let round = 1; round <= 3; round++) {
                    assert.equal(await instance.run(), 42);
                    assert.equal(instance.postCount(), round);
                    assert.equal(pauses, round);
                }
            });
        }
        test(`${variant}: nested resource destruction (minify=${minify})`, async (test) => {
            const instance = await component(test, 'context-resource-drop.wat', { variant, minify });
            for (let round = 1; round <= 3; round++) {
                instance.run();
                assert.equal(instance.drops(), round * 2 - 1);
                const resource = instance.api.make();
                resource[Symbol.dispose]();
                resource[Symbol.dispose]();
                assert.equal(instance.drops(), round * 2);
            }
        });
    }
    test(`${variant}: fresh tasks start with zero context`, async (test) => {
        const instance = await component(test, 'context-sync/component.wat', { variant });
        for (const value of [33, -2147483648, 2147483647, -1, 0]) {
            assert.equal(instance.pushContext(value), value >>> 0);
            assert.equal(instance.pullContext(), 0);
        }
    });
}

/** Wait for a known suspension point, failing instead of leaving a hanging test. */
async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Expected suspension point was not reached');
        await new Promise((resolve) => setImmediate(resolve));
    }
}

for (const variant of ['baseline', 'checked', 'native']) {
    test(`${variant}: cooperative threads of the same task have separate slots`, async (test) => {
        const instance = await component(test, 'context-threads.wat', { variant });
        for (let round = 0; round < 10; round++) assert.equal(await instance.run(), 42);
    });

    for (const independent of [false, true]) {
        test(
            `${variant}: interleaved tasks (independent instances=${independent})`,
            { timeout: 15000 },
            async (test) => {
                const pending = [];
                const imports = {
                    pause: {
                        default: (token) => new Promise((resolve, reject) => pending.push({ token, resolve, reject })),
                    },
                };
                const first = await component(test, independent ? 'context-interleave.wat' : 'context-callbacks.wat', {
                    variant,
                    imports,
                    asyncImports: ['pause'],
                });
                const second = independent
                    ? await component(test, 'context-interleave.wat', { variant, imports, asyncImports: ['pause'] })
                    : first;
                for (const [left, right] of [
                    [11, 22],
                    [-2147483648, 2147483647],
                    [-1, 0],
                ]) {
                    const results = Promise.all([first.run(left), second.run(right)]);
                    await until(() => pending.length === 2);
                    // Resolve both imports in the same microtask turn, in reverse order.
                    pending
                        .splice(0)
                        .reverse()
                        .forEach((entry) => entry.resolve());
                    if (independent) {
                        await until(() => pending.length === 2);
                        pending.splice(0).forEach((entry) => entry.resolve());
                    }
                    assert.deepEqual(await results, [left, right]);
                }
            },
        );
    }

    test(`${variant}: rejection and a trapped instance cannot contaminate another instance`, async (test) => {
        const error = new Error('host rejection sentinel');
        const failing = await component(test, 'context-interleave.wat', {
            variant,
            imports: { pause: { default: () => Promise.reject(error) } },
            asyncImports: ['pause'],
        });
        await assert.rejects(failing.run(77));
        const trapped = await component(test, 'context-interleave.wat', {
            variant,
            imports: { pause: { default: () => undefined } },
        });
        assert.throws(() => trapped.trap(), WebAssembly.RuntimeError);
        const healthy = await component(test, 'context-interleave.wat', {
            variant,
            imports: { pause: { default: () => Promise.resolve() } },
            asyncImports: ['pause'],
        });
        assert.equal(await healthy.run(99), 99);
        assert.equal(await healthy.run(0), 0);
    });
}

for (const variant of ['baseline', 'checked', 'native']) {
    test(`${variant}: cancellation before entry preserves caller slots and retires tasks`, async (test) => {
        const instance = await component(test, 'context-cancel.wat', { variant });
        for (let round = 0; round < 8; round++) assert.equal(await instance.runRelease(), 42);
        assert.equal(await instance.runPersistent(), 42);
    });
    for (const suspend of [false, true]) {
        test(`${variant}: context across repeated ordinary host calls (suspend=${suspend})`, async (test) => {
            const instance = await component(test, 'context-boundary.wat', {
                variant,
                imports: { pause: { default: () => (suspend ? Promise.resolve() : undefined) } },
                asyncImports: suspend ? ['pause'] : [],
                asyncExports: suspend ? ['run'] : [],
            });
            assert.equal(await instance.run(30), 30);
            assert.equal(await instance.run(10), 10);
        });
    }
}

for (const variant of ['baseline', 'checked', 'native']) {
    test(`${variant}: cancellation resumes the callee with its own context`, async (test) => {
        const instance = await component(test, 'context-cancel-started.wat', { variant });
        for (let round = 0; round < 8; round++) assert.equal(await instance.runRelease(), 42);
    });
}

test('isolation fixture detects an intentionally shared thread store', async (test) => {
    const instance = await component(test, 'context-threads.wat', {
        mutate(source) {
            assert.ok(source.includes('#nativeContextStorage = [0, 0]'));
            return source
                .replace('const __nativeContext =', 'const __sharedSlots = [0, 0];\nconst __nativeContext =')
                .replace('#nativeContextStorage = [0, 0]', '#nativeContextStorage = __sharedSlots');
        },
    });
    await assert.rejects(
        Promise.resolve().then(() => instance.run()),
        WebAssembly.RuntimeError,
    );
});
