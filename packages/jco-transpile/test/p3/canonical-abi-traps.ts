import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/** Returns the rejection of `promise`, failing if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (err) {
        return err;
    }
    assert.fail('expected the call to reject');
}

// Regression tests for Canonical ABI built-ins that must trap (or must not) in
// specific situations. Each fixture is a hand-written component that calls the
// built-in from an async (callback) or sync lifted export.
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('Canonical ABI traps', () => {
    test.concurrent('backpressure.dec below zero traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-dec-underflow',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-dec-underflow.wat'),
            },
        });
        try {
            const err = await rejection(instance.decWithoutInc());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /backpressure/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure.dec after backpressure.inc succeeds', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-dec-balanced',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-dec-underflow.wat'),
            },
        });
        try {
            assert.isUndefined(await instance.incThenDec());
        } finally {
            await cleanup();
        }
    });

    // A trap poisons the instance, so each trapping call gets its own.
    test.concurrent.each([
        { name: 'resource.drop', fn: 'dropMissing', roundtrip: false },
        { name: 'resource.rep', fn: 'repMissing', roundtrip: false },
        { name: 'resource.drop', fn: 'dropMissing', roundtrip: true },
    ])('$name of an out-of-range handle traps (after a roundtrip: $roundtrip)', async ({ fn, roundtrip }) => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: `resource-handle-out-of-range-${fn}-${roundtrip}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'resource-handle-out-of-range.wat'),
            },
        });
        try {
            if (roundtrip) {
                // Handle 1 is allocated and freed again: the slot exists but is empty.
                assert.strictEqual(instance.roundtrip(), 7);
            }
            assert.throws(() => instance[fn](), WebAssembly.RuntimeError, /unknown handle index/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('waitable-set.poll of a waitable that is not a set traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'waitable-set-poll-non-set',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'waitable-set-poll-non-set.wat'),
            },
        });
        try {
            const err = await rejection(instance.pollFutureEnd());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /unknown handle index/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('waitable-set.poll of an empty set returns EVENT_NONE', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'waitable-set-poll-empty-set',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'waitable-set-poll-non-set.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.pollEmptySet(), 0);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a stackful lift delivers its result through task.return', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stackful-lift-task-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stackful-lift.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.withTaskReturn(), 42);
            assert.strictEqual(await instance.withTaskReturn(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a stackful lift that returns without task.return traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stackful-lift-no-task-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stackful-lift.wat'),
            },
        });
        try {
            const err = await rejection(instance.withoutTaskReturn());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /without resolution/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('an async-lifted callee of a sync-lowered call may yield', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-lowered-async-callee',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-lowered-async-callee.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure keeps a second call out until it is cleared', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-admission',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-admission.wat'),
            },
        });
        try {
            // Back to back, before either is awaited.
            const first = instance.run();
            const second = instance.run();
            assert.strictEqual(await first, 100);
            // The second call only entered once the first task's callback
            // had cleared the backpressure.
            assert.strictEqual(await second, 1);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure left set by an exited task keeps later calls out', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-admission-blocked',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-admission.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.block(), 0);
            const err = await rejection(instance.run());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /deadlock/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each(['waitUnknown', 'waitZero'])(
        'a callback that returns WAIT on an invalid waitable set traps (%s)',
        async (fn: string) => {
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    name: `callback-wait-invalid-set-${fn}`,
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'callback-wait-invalid-set.wat'),
                },
            });
            try {
                const err = await rejection(instance[fn]());
                assert.instanceOf(err, WebAssembly.RuntimeError);
                assert.match((err as Error).message, /unknown handle index/);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('a deferred async-lowered callee start is attributed to its own task', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'deferred-subtask-start',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'deferred-subtask-start.wat'),
            },
        });
        try {
            // Each call returns its subtask's state (low nibble) before the
            // callee has returned: STARTING (0) or STARTED (1).
            const states = (packed: number) => [(packed >>> 8) & 0xf, packed & 0xf];
            for (const state of states(await instance.run())) {
                assert.include([0, 1], state);
            }
            // Neither the first callee's `task.return` nor the second callee's
            // deferred entry failed outside the call: the instance is still usable.
            for (const state of states(await instance.run())) {
                assert.include([0, 1], state);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a zero-length same-component copy of non-numeric elements does not trap', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'zero-length-same-component-stream',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'zero-length-same-component-stream.wat'),
            },
        });
        try {
            // The read blocks (0xffffffff); the zero-length write completes with 0 elements.
            const packed = await instance.zeroLengthWrite();
            assert.strictEqual(packed >>> 16, 0xffff, 'the read is BLOCKED');
            assert.strictEqual(packed & 0xffff, 0, 'the write completed with 0 elements');
        } finally {
            await cleanup();
        }
    });
});
