import type { TaskCallback, TaskPostReturn } from './async-task-types.js';
import type { WaitableEvent } from './component-types.js';
import type { RuntimeMemory } from './core-types.js';

export interface HostSyncStartOptions {
    callbackIdx?: number | null;
    getCallbackFn(): (TaskCallback & { fnName?: string }) | null | undefined;
}
export interface HostStartOptions extends HostSyncStartOptions {
    postReturnIdx?: number | null;
    getPostReturnFn(): TaskPostReturn | null | undefined;
}
export type HostCallee = ((...params: unknown[]) => unknown) & {
    _jcoMaySuspend?: boolean;
    _cachedPromising?: (...params: unknown[]) => Promise<unknown>;
};
export interface StoreEventOptions {
    memory: RuntimeMemory;
    ptr: number;
    event: WaitableEvent | null;
}
export interface HostIntrinsics {
    prepareCall(
        memoryIdx: number | null,
        getMemoryFn: () => RuntimeMemory | null | undefined,
        startFn: (...params: unknown[]) => unknown,
        returnFn: (...params: unknown[]) => unknown,
        callerComponentIdx: number,
        calleeComponentIdx: number,
        taskReturnTypeIdx: number,
        calleeIsAsyncInt: number,
        stringEncoding: number,
        resultCountOrAsync: number,
        ...params: unknown[]
    ): void;
    asyncStartCall(
        args: HostStartOptions,
        callee: HostCallee,
        paramCount: number,
        resultCount: number,
        flags: number,
    ): number;
    syncStartCall(args: HostSyncStartOptions, callee: HostCallee, paramCount: number): Promise<unknown>;
    storeEventInComponentMemory(args: StoreEventOptions): number;
}
