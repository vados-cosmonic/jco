import type { ResourceTable } from '../types.js';
import type {
    ComponentTask,
    ComponentAsyncState,
    ComponentWaitable,
    ComponentWaitableSet,
    WaitableEvent,
} from './component-types.js';
import type { RuntimeMemory } from './core-types.js';
import type { StringRealloc } from './string.js';
import type { WaitableTask } from './waitable-types.js';

export type TaskState = 'initial' | 'cancelled' | 'cancel-pending' | 'cancel-delivered' | 'resolved';
export interface TaskSuspendOptions {
    readyFn(): boolean;
    cancellable?: boolean;
}
export type TaskCallback = ((...args: number[]) => number | Promise<number>) & { _jcoMaySuspend?: boolean };
export type TaskPostReturn = (value: unknown) => unknown;
export interface TaskLiftContext {
    componentIdx: number;
    params: unknown[];
    memory?: RuntimeMemory | null;
    useDirectParams?: boolean;
    stringEncoding?: string | null;
    storagePtr?: number;
    storageLen?: number;
    [key: string]: unknown;
}
export type TaskLiftFn = (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
export interface TaskLowerContext {
    componentIdx: number;
    vals: unknown[];
    memory?: RuntimeMemory | null;
    realloc?: StringRealloc | null;
    storagePtr?: number;
    stringEncoding?: string | null;
    [key: string]: unknown;
}
export type TaskLowerFn = (ctx: TaskLowerContext) => unknown;
export interface TaskCallMetadata {
    startFn?: (...args: unknown[]) => unknown;
    returnFn?: (...args: unknown[]) => unknown;
    returnFnCalled?: boolean;
    returnFnResult?: unknown;
    resultPtr?: number;
    memoryIdx?: number | null;
    memory?: RuntimeMemory | null;
    realloc?: StringRealloc | null;
    getReallocFn?: () => StringRealloc;
    lowers?: TaskLowerFn[];
    funcTypeIsAsync?: boolean;
    stringEncoding?: string | null;
}
export interface AsyncTaskOptions {
    componentIdx: number;
    isAsync?: boolean;
    isManualAsync?: boolean;
    preserveFutureResult?: boolean;
    entryFnName?: string;
    callingWasmExport?: boolean;
    callbackFn?: TaskCallback | null;
    callbackFnName?: string | null;
    getCalleeParamsFn?: () => unknown[];
    stringEncoding?: string | null;
    parentSubtask?: AsyncSubtask;
    errHandling?: unknown;
    resultPtr?: number;
}
export interface CreateTaskOptions extends AsyncTaskOptions {
    parentSubtaskID?: bigint;
    getCallbackFn?: () => TaskCallback;
    getParamsFn?: () => unknown[];
}
export interface CreateSubtaskOptions {
    componentIdx: number;
    childTask?: AsyncTask | null;
    parentTask?: AsyncTask;
    callMetadata?: TaskCallMetadata;
    fnName?: string;
    isAsync?: boolean;
    isManualAsync?: boolean;
}
export interface AsyncSubtaskOptions extends CreateSubtaskOptions {
    parentTask: AsyncTask;
    waitable: ComponentWaitable;
    memoryIdx?: number;
    target?: unknown;
}
export interface SubtaskLender {
    lends: number;
}
export interface AsyncTask extends ComponentTask, WaitableTask {
    cancelled: boolean;
    cancelRequested: boolean;
    alwaysTaskReturn: boolean;
    returnCalls: number;
    storage: number[];
    tmpRetI64HighBits: number;
    callbackFnIdx?: number;
    taskState(): TaskState;
    resourceScopeId(): number;
    addBorrowedHandle(): void;
    removeBorrowedHandle(): void;
    addResourceLender(table: ResourceTable, handle: number): void;
    validateResourceBorrowScope(): void;
    completionPromise(): Promise<unknown>;
    settleCompletion(): void;
    exitPromise(): Promise<void>;
    waitForProgress(): Promise<void>;
    isAsync(): boolean;
    isManualAsync(): boolean;
    isSync(): boolean;
    getErrHandling(): unknown;
    hasCallback(): boolean;
    getReturnMemoryIdx(): number | null | undefined;
    setReturnMemoryIdx(idx: number | null | undefined): void;
    getReturnMemory(): RuntimeMemory | null | undefined;
    setReturnMemory(memory: RuntimeMemory | null | undefined): void;
    setReturnLowerFns(fns: TaskLowerFn[]): void;
    getReturnLowerFns(): TaskLowerFn[] | null;
    setCalleeIsAsync(value: boolean): void;
    setParentSubtask(subtask: AsyncSubtask | null): void;
    getParentSubtask(): AsyncSubtask | null;
    getRootTask(): AsyncTask;
    setPostReturnFn(fn?: TaskPostReturn | null): void;
    setCallbackFn(fn?: TaskCallback | null, name?: string | null): void;
    getCallbackFnName(): string | undefined;
    runCallbackFn(...args: number[]): number | Promise<number>;
    getCalleeParams(): unknown[];
    mayBlock(): boolean;
    setFuncTypeIsAsync(value: boolean): void;
    setReturnResultTypeIdx(value: number | null): void;
    returnResultTypeIdx(): number | null;
    mayEnter(task: AsyncTask): boolean;
    enterSync(): boolean;
    tryEnter(): boolean | null;
    enter(options?: { isHost?: boolean }): Promise<boolean>;
    isRunningState(): boolean;
    isResolved(): boolean;
    isExited(): boolean;
    waitUntil(options: TaskSuspendOptions): Promise<boolean>;
    yieldUntil(options: TaskSuspendOptions): Promise<WaitableEvent>;
    suspendUntil(options: TaskSuspendOptions): Promise<boolean>;
    suspendUntilCallback(options: TaskSuspendOptions, onResume: (keepGoing: boolean) => void): void;
    immediateSuspendUntil(options: TaskSuspendOptions): Promise<boolean>;
    immediateSuspend(options: TaskSuspendOptions): Promise<boolean>;
    deliverPendingCancel(options: { cancellable?: boolean }): boolean;
    cancellationRequested(): boolean;
    requestCancellation(): void;
    cancel(args?: { error?: unknown }): void;
    onResolve(value: unknown): void;
    registerOnResolveHandler(fn: (value: unknown) => void): void;
    isErrored(): unknown;
    resolve(results: unknown[]): void;
    exit(args?: { skipExclusiveLockCheck?: boolean }): void;
    createSubtask(args: CreateSubtaskOptions): AsyncSubtask;
    getLatestSubtask(): AsyncSubtask | undefined;
    getSubtaskByWaitableRep(rep: number): AsyncSubtask | undefined;
    currentSubtask(): AsyncSubtask | undefined;
    removeSubtask(subtask: AsyncSubtask): AsyncSubtask;
}
export interface AsyncTaskConstructor {
    new (options: AsyncTaskOptions): AsyncTask;
    _ID: bigint;
    readonly State: {
        INITIAL: 'initial';
        CANCELLED: 'cancelled';
        CANCEL_PENDING: 'cancel-pending';
        CANCEL_DELIVERED: 'cancel-delivered';
        RESOLVED: 'resolved';
    };
    readonly BlockResult: { CANCELLED: 'block.cancelled'; NOT_CANCELLED: 'block.not-cancelled' };
}
export interface AsyncSubtask {
    fnName: string | undefined;
    target: unknown;
    isAsync: boolean | undefined;
    isManualAsync: boolean | undefined;
    cancelProgress: Promise<unknown> | null;
    id(): bigint;
    parentTaskID(): bigint;
    childTaskID(): bigint | undefined;
    state(): number;
    waitable(): ComponentWaitable;
    waitableRep(): number | null;
    ensureHandle(): number;
    join(set: ComponentWaitableSet | null): void;
    getPendingEvent(): WaitableEvent | null;
    hasPendingEvent(): boolean;
    setPendingEvent(fn: () => WaitableEvent): void;
    setTarget(value: unknown): void;
    getResult(): unknown;
    setResult(value: unknown): void;
    componentIdx(): number;
    setChildTask(task: AsyncTask): void;
    getChildTask(): AsyncTask | null;
    getParentTask(): AsyncTask;
    setCallbackFn(fn?: TaskCallback | null, name?: string | null): void;
    getCallbackFnName(): string | undefined;
    setPostReturnFn(fn?: TaskPostReturn | null): void;
    setOnProgressFn(fn: () => void): void;
    isNotStarted(): boolean;
    cancellationRequested(): boolean;
    requestCancellation(): void;
    setHostPendingResult(value: unknown): void;
    registerOnStartHandler(fn: () => void): void;
    onStart(args?: { startFnParams?: unknown[] }): unknown;
    registerOnResolveHandler(fn: (value: unknown) => void): void;
    reject(error: unknown): void;
    onResolve(value: unknown): void;
    getStateNumber(): number;
    isReturned(): boolean;
    getCallMetadata(): TaskCallMetadata;
    isResolved(): boolean;
    addLender(lender: SubtaskLender): void;
    deliverResolve(): void;
    resolveDelivered(): boolean;
    drop(): void;
    getWaitableHandleIdx(): number | null;
}
export interface AsyncSubtaskConstructor {
    new (options: AsyncSubtaskOptions): AsyncSubtask;
    _ID: bigint;
    readonly State: { STARTING: 0; STARTED: 1; RETURNED: 2; CANCELLED_BEFORE_STARTED: 3; CANCELLED_BEFORE_RETURNED: 4 };
}
export interface AsyncTaskMeta {
    id: bigint;
    componentIdx: number;
    task: AsyncTask;
}
export interface TaskReturnContext {
    componentIdx: number;
    getMemoryFn(): RuntimeMemory | undefined;
    memoryIdx?: number | null;
    callbackFnIdx?: number;
    liftFns: TaskLiftFn[];
    lowerFns?: TaskLowerFn[];
    stringEncoding?: string;
    useDirectParams?: boolean;
    resultTypeIdx?: number;
}
export interface LowerImportContext {
    componentIdx: number;
    functionIdx?: number;
    isAsync: boolean;
    isManualAsync?: boolean;
    paramLiftFns?: TaskLiftFn[];
    resultLowerFns?: TaskLowerFn[];
    hasResultPointer?: boolean;
    funcTypeIsAsync?: boolean;
    metadata?: unknown;
    memoryIdx?: number | null;
    getMemoryFn(): RuntimeMemory | undefined;
    getReallocFn?: () => StringRealloc;
    stringEncoding?: string;
    importFn: ((...params: unknown[]) => unknown) & { fnName?: string };
}
export interface TaskFutureValue {
    resolveAsValue(resolve: (value: unknown) => void): void;
}
/** Lazy predicate for the Future class that remains in generated bindings. */
export interface AsyncTaskContext {
    isFutureValue(value: unknown): value is TaskFutureValue;
}
export interface SymmetricSyncGuestCall {
    componentIdx: number;
    previousTaskMayBlock: number;
}
export interface AsyncTaskIntrinsics {
    readonly AsyncTask: AsyncTaskConstructor;
    readonly AsyncSubtask: AsyncSubtaskConstructor;
    readonly currentTaskMayBlock: { value: number };
    readonly asyncBlockingCallDepth: { value: number };
    readonly asyncBlockedCode: number;
    readonly tasksByComponent: Map<number, AsyncTaskMeta[]>;
    readonly currentTaskIds: bigint[];
    readonly currentComponentIdxs: number[];
    readonly symmetricSyncGuestCallStack: SymmetricSyncGuestCall[];
    contextSet(ctx: { componentIdx?: number; slot: number }, value: number): void;
    contextGet(ctx: { componentIdx?: number; slot: number }): number;
    taskReturn(ctx: TaskReturnContext, ...params: unknown[]): void;
    subtaskDrop(componentIdx: number, rep: number): void;
    asyncYield(ctx: { componentIdx: number }): Promise<number>;
    subtaskCancel(componentIdx: number, isAsync: boolean, rep: number, slowOnly?: boolean): number | Promise<number>;
    taskCancel(componentIdx: number): void;
    createNewCurrentTask(args: CreateTaskOptions): [AsyncTask, bigint];
    getCurrentTask(componentIdx: number, taskID?: bigint): AsyncTaskMeta | undefined;
    clearCurrentTask(componentIdx: number, taskID?: bigint): AsyncTask | undefined;
    unpackCallbackResult(result: number): [number, number];
    driverLoop(args: {
        componentState: ComponentAsyncState;
        task: AsyncTask;
        fnName?: string;
        isAsync?: boolean;
        callbackResult: unknown;
    }): unknown;
    lowerImport(args: LowerImportContext, ...params: unknown[]): Promise<unknown>;
    lowerImportBackwardsCompat(args: LowerImportContext, ...params: unknown[]): unknown;
    symmetricSyncGuestCallEnter(
        callerComponentIdx: number,
        calleeIsAsync: boolean,
        calleeComponentIdx: number,
        syncOnly?: boolean,
    ): number | Promise<number>;
    symmetricSyncGuestCallExit(): void;
}
