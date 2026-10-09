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

});
