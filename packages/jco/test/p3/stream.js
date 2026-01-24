import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

suite('Stream (WASI P3)', () => {
    test('stream<u32> (tx)', async () => {
        const name = 'async-stream-tx';
        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        const { WASIShim } = await import(
            '@bytecodealliance/preview2-shim/instantiation'
        );
        const instance = await esModule.instantiate(
            undefined,
            new WASIShim().getImportObject()
        );

        assert.instanceOf(instance['jco:test-components/get-stream-async'].getStreamU32, AsyncFunction);
        assert.instanceOf(instance['jco:test-components/get-stream-async'].getStreamU32, AsyncFunction);

        let vals;
        let stream;

        vals = [1,2,3];
        stream = await instance['jco:test-components/get-stream-async'].getStreamU32(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());
        // TODO: we should check that reading with no values remaining blocks?
        // TODO: we should check that reading when writer is closed throws error?

        // vals = [-1,-2,-3];
        // stream = await instance['jco:test-components/get-stream-async'].getStreamS32(vals);
        // assert.equal(vals[0], stream.next());
        // assert.equal(vals[1], stream.next());
        // assert.equal(vals[2], stream.next());

        await cleanup();
    });
});
