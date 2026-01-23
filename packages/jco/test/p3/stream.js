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
                        asyncExports: ['local:local/run#run'],
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

        assert.notInstanceOf(instance['jco:test-components/get-stream'].getStreamU32, AsyncFunction);
        assert.notInstanceOf(instance['jco:test-components/get-stream'].getStreamU32, AsyncFunction);
        assert.instanceOf(instance['jco:test-components/get-stream-async'].getStreamU32, AsyncFunction);
        assert.instanceOf(instance['jco:test-components/get-stream-async'].getStreamU32, AsyncFunction);

        let u32Vals;
        let u32Stream;
        let s32Vals;
        let s32Stream;

        u32Vals = [1,2,3];
        u32Stream = instance['jco:test-components/get-stream'].getStreamU32(u32Vals);
        assert.equal(u32Vals[0], u32Stream.next());
        assert.equal(u32Vals[1], u32Stream.next());
        assert.equal(u32Vals[2], u32Stream.next());

        s32Vals = [-1,-2,-3];
        s32Stream = instance['jco:test-components/get-stream-async'].getStreamS32(s32Vals);
        assert.equal(s32Vals[0], s32Stream.next());
        assert.equal(s32Vals[1], s32Stream.next());
        assert.equal(s32Vals[2], s32Stream.next());

        u32Vals = [11,22,33];
        u32Stream = await instance['jco:test-components/get-stream-async'].getStreamU32(u32Vals);
        assert.equal(u32Vals[0], await u32Stream.next());
        assert.equal(u32Vals[1], await u32Stream.next());
        assert.equal(u32Vals[2], await u32Stream.next());

        s32Vals = [-11,-22,-33];
        s32Stream = await instance['jco:test-components/get-stream-async'].getStreamS32(s32Vals);
        assert.equal(s32Vals[0], await s32Stream.next());
        assert.equal(s32Vals[1], await s32Stream.next());
        assert.equal(s32Vals[2], await s32Stream.next());


        await cleanup();
    });
});
