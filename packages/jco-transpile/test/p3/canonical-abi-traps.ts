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

});
