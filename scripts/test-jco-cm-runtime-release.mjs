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

const {
    initializeUtf8Encoder,
    initializeUtf8Decoder,
    initializeUtf16Decoder,
    initializeUtf16Encoding,
    utf8Encode,
    utf16Encode,
} = await import('@bytecodealliance/jco-cm-runtime/intrinsics/string');
const stringMemory = { buffer: new ArrayBuffer(16) };
assert.deepEqual(
    utf8Encode(initializeUtf8Encoder(), 'é', () => 0, stringMemory),
    { ptr: 0, len: 2, codepoints: 1 },
);
assert.equal(initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)), 'é');
assert.deepEqual(
    utf16Encode(initializeUtf16Encoding(), '🚀', () => 0, stringMemory),
    { ptr: 0, len: 2, codepoints: 1 },
);
assert.equal(initializeUtf16Decoder().decode(new Uint16Array(stringMemory.buffer, 0, 2)), '🚀');

const { initializeWebIdlProxyCache, globalThisIdlProxy } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/webidl');
const webIdlCache = initializeWebIdlProxyCache();
const proxy = globalThisIdlProxy(webIdlCache);
assert.equal(globalThisIdlProxy(webIdlCache), proxy);
assert.equal(Reflect.get(proxy, 'URL'), URL);

const { initializeTaskRegisters, withCurrentTaskMeta, getCurrentTaskMeta, initializeRepTableClass } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/core');
const registers = initializeTaskRegisters();
assert.equal(
    withCurrentTaskMeta(registers, { componentIdx: 0, taskID: 1n, fn: () => getCurrentTaskMeta(registers).taskID }),
    1n,
);
assert.equal(getCurrentTaskMeta(registers), undefined);
const RepTable = initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError });
const reps = new RepTable();
assert.equal(reps.get(reps.insert(42)), 42);
assert.notEqual(RepTable.FREE, initializeRepTableClass({ RuntimeError: Error }).FREE);

const { initializeWaitableClass, initializeWaitableSetClass } =
    await import('@bytecodealliance/jco-cm-runtime/intrinsics/waitable');
const Waitable = initializeWaitableClass();
const WaitableSet = initializeWaitableSetClass({ TASK_CANCELLED: 3 });
const waitable = new Waitable({ target: 42 });
const set = new WaitableSet(0);
waitable.join(set);
assert.deepEqual(set.targets(), [42]);
waitable.setPendingEvent(() => ({ code: 1, payload0: 17, payload1: 23 }));
assert.deepEqual(set.getPendingEvent(), { code: 1, payload0: 17, payload1: 23 });
assert.equal(waitable.getPendingEvent(), null);
waitable.drop();
assert.equal(set.numWaitables(), 0);
assert.notEqual(Waitable, initializeWaitableClass());

const {
    initializeGlobalErrorContextTableClass,
    initializeLocalErrorContextTables,
    initializeErrorContextTableRegistrations,
    errCtxReserveGlobalRep,
    errCtxGlobalRefCountAdd,
} = await import('@bytecodealliance/jco-cm-runtime/intrinsics/error-context');
const GlobalTable = initializeGlobalErrorContextTableClass(RepTable);
assert.equal(GlobalTable.data, null);
assert.equal(initializeLocalErrorContextTables().size, 0);
assert.deepEqual(initializeErrorContextTableRegistrations(), {});
const reserved = errCtxReserveGlobalRep(GlobalTable, 'release', 0);
assert.equal(errCtxGlobalRefCountAdd(GlobalTable, reserved.globalRep), 1);
assert.equal(GlobalTable.get().get(reserved.globalRep).debugMessage, 'release');

const {
    asyncBlockedCode,
    initializeTasksByComponent,
    initializeCurrentTaskIds,
    initializeCurrentComponentIdxs,
    initializeSymmetricSyncGuestCallStack,
    initializeCurrentTaskMayBlock,
    initializeAsyncBlockingCallDepth,
    getCurrentTask,
} = await import('@bytecodealliance/jco-cm-runtime/intrinsics/async-task');
assert.equal(asyncBlockedCode, 0xffff_ffff);
assert.equal(getCurrentTask({ tasks: initializeTasksByComponent(), registers: {} }, 0), undefined);
assert.deepEqual(initializeCurrentTaskIds(), []);
assert.deepEqual(initializeCurrentComponentIdxs(), []);
assert.deepEqual(initializeSymmetricSyncGuestCallStack(), []);
assert.equal(initializeCurrentTaskMayBlock(false), false);
assert.deepEqual(initializeAsyncBlockingCallDepth(false), { value: 0 });

const host = await import('@bytecodealliance/jco-cm-runtime/intrinsics/host');
assert.deepEqual(Object.keys(host).sort(), [
    'asyncStartCall',
    'prepareCall',
    'storeEventInComponentMemory',
    'syncStartCall',
]);
const eventMemory = { buffer: new ArrayBuffer(8) };
assert.equal(
    host.storeEventInComponentMemory({ memory: eventMemory, ptr: 0, event: { code: 1, payload0: 17, payload1: 23 } }),
    1,
);
assert.equal(new DataView(eventMemory.buffer).getUint32(4, true), 23);
