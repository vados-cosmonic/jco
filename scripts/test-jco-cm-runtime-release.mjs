import assert from 'node:assert/strict';

import * as root from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import { tableGet } from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import {
    initializeBitcast32,
    initializeBitcast64,
    i32ToF32,
    f64ToI64,
    toUint32,
} from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';

assert.equal(CM_RUNTIME_API_VERSION, 2);
assert.deepEqual(Object.keys(root), ['CM_RUNTIME_API_VERSION']);
assert.equal(root.CM_RUNTIME_API_VERSION, CM_RUNTIME_API_VERSION);
const context = { RuntimeError: WebAssembly.RuntimeError };
assert.deepEqual(tableGet(context, [1 << 30, 0, 7, 42 | (1 << 30)], 1), { rep: 42, scope: 7, own: true });
assert.throws(() => tableGet(context, [1 << 30, 0], 0), WebAssembly.RuntimeError);
assert.equal(toUint32({ strict: false }, -1), 0xffffffff);
assert.throws(() => toUint32({ strict: true }, -1), TypeError);
assert.equal(i32ToF32(initializeBitcast32(), 0x3f800000), 1);
assert.equal(f64ToI64(initializeBitcast64(), 1), 0x3ff0000000000000n);

const { initializeDataViewCache, dataView, emptyFunc } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/js-helper');
const cache = initializeDataViewCache();
const memory = { buffer: new ArrayBuffer(8) };
const view = dataView(cache, memory);
view.setUint32(0, 42, true);
assert.equal(dataView(cache, memory), view);
assert.equal(view.getUint32(0, true), 42);
assert.equal(emptyFunc(42), undefined);
