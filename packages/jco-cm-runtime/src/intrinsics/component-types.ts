import type { RepTable } from './core-types.js';

/** Task operations shared by runtime scheduling and older bindings' inline tasks. */
export interface ComponentTask {
    id(): bigint;
    componentIdx(): number;
    taskState(): unknown;
    entryFnName(): string | undefined;
    getParentSubtask(): unknown;
    getRootTask(): ComponentTask;
    isResolvedState(): boolean;
    isRejected(): boolean;
    isCancelled(): boolean;
    needsExclusiveLock(): boolean;
    endFirstSlice(): void;
    notifyProgress(): void;
    setErrored(error: unknown): void;
    reject(error: unknown): void;
}
export interface SuspendTaskOptions {
    task: ComponentTask;
    readyFn(): boolean;
    cancellable: boolean;
    onResume?(keepGoing: boolean): void;
}
export interface SuspendedTask {
    task: ComponentTask;
    taskID: bigint;
    readyFn(): boolean;
    cancellable: boolean;
    resume(): void;
}
export interface AdmissionTicket {
    taskID: bigint;
    promise: Promise<void>;
    resolve(): void;
    reject(reason?: unknown): void;
}
export interface WaitableEvent {
    code: number;
    payload0: number;
    payload1: number;
}
/** Shared waitable contract, also accepted from older bindings' inline factories. */
export interface ComponentWaitable {
    target: unknown;
    componentIdx(): number | undefined;
    isInSet(): boolean;
    idx(): number | null;
    setIdx(idx: number): void;
    setTarget(target: unknown): void;
    resolve(): void;
    reject(error: unknown): void;
    promise(): Promise<void>;
    hasPendingEvent(): boolean;
    setPendingEvent(fn: () => WaitableEvent): void;
    getPendingEvent(): WaitableEvent | null;
    join(set: ComponentWaitableSet | null): void;
    drop(): void;
}
export interface ComponentWaitableSet {
    addWaitable(waitable: ComponentWaitable): void;
    removeWaitable(waitable: ComponentWaitable): void;
}
export interface ComponentContext {
    createWaitable(args: { target?: unknown }): ComponentWaitable;
}
/** Messages supplied by the compiler's Wasmtime version. */
export interface ComponentTrapMessages {
    core?: Readonly<Record<string, string>>;
    cannotEnter?: string;
}
export type ComponentTickResult = 'done' | 'resumed' | 'idle';
export interface ComponentAsyncState {
    readonly handles: RepTable;
    readonly subtasks: RepTable;
    mayLeave: boolean;
    componentIdx(): number;
    errored(): boolean;
    setErrored(error?: unknown): void;
    markTrapped(error: unknown): boolean;
    isTrapped(): boolean;
    throwIfInterrupted(): void;
    throwIfTrapped(): void;
    callingSyncImport(): boolean;
    callingSyncImport(value: boolean): void;
    waitForSyncImportCallEnd(): Promise<void>;
    setBackpressure(value: number): number;
    getBackpressure(): number;
    incrementBackpressure(): number;
    decrementBackpressure(): number;
    hasBackpressure(): boolean;
    waitForBackpressure(): Promise<null>;
    registerHandler(args: { event: string; fn(value: number): void }): bigint;
    removeHandler(args: { event: string; handlerID: bigint }): void;
    getBackpressureWaiters(): bigint;
    addBackpressureWaiter(): void;
    removeBackpressureWaiter(): void;
    isExclusivelyLocked(): boolean;
    exclusivelyLockedBy(taskID: bigint): boolean;
    exclusiveLock(taskID: bigint): void;
    acquireExclusiveLock(taskID: bigint): Promise<void> | undefined;
    takeAdmissionTicket(taskID: bigint): AdmissionTicket;
    hasPendingAdmissions(): boolean;
    waitForAdmissionTurn(ticket: AdmissionTicket): Promise<void> | undefined;
    releaseAdmissionTicket(ticket: AdmissionTicket): void;
    abandonAdmissionWaiters(): void;
    abandonLockWaiters(): void;
    cancelExclusiveLockWaiter(taskID: bigint): boolean;
    exclusiveRelease(taskID: bigint): boolean;
    onNextExclusiveRelease(fn: () => void): void;
    waitForExclusiveRelease(): Promise<void>;
    suspendTask(args: SuspendTaskOptions): Promise<boolean> | undefined;
    resumeTaskByID(taskID: bigint): boolean;
    suspendedTaskReady(taskID: bigint): boolean;
    suspendedTaskCancellable(taskID: bigint): boolean;
    isTaskSuspended(taskID: bigint): boolean;
    suspendedTaskMetas(): IterableIterator<SuspendedTask>;
    addPendingTaskStart(): void;
    removePendingTaskStart(): void;
    hasPendingSchedulerWork(): boolean;
    runTickLoop(): Promise<void>;
    tick(): ComponentTickResult;
    createWaitable(args?: { target?: unknown }): ComponentWaitable;
}
export interface ComponentAsyncStateConstructor {
    new (args: { componentIdx: number }): ComponentAsyncState;
    readonly EVENT_HANDLER_EVENTS: string[];
    readonly TickResult: { DONE: 'done'; RESUMED: 'resumed'; IDLE: 'idle' };
}
export interface ComponentStoreAsyncState {
    // Opaque host timer handle, kept portable between Node and browsers.
    deadlockCheck: unknown | null;
    pendingHostOperations: number;
}
export interface ComponentDeadlockDetail {
    pendingHostOperations: number;
    suspendedTasks: { taskID: bigint; componentIdx: number; state: unknown; rootTaskID: bigint }[];
    unresolvedRootTaskIDs: bigint[];
}
export interface ComponentIntrinsics {
    readonly instanceFlags: Map<number, { value: number }>;
    readonly storeTrap: { error: Error | null };
    readonly storeAsyncState: ComponentStoreAsyncState;
    readonly asyncState: Map<number, ComponentAsyncState>;
    readonly ComponentAsyncState: ComponentAsyncStateConstructor;
    checkForDeadlock(): void;
    trackHostOperation<T>(operation: () => T): T | Promise<Awaited<T>>;
    normalizeCoreTrap<T>(error: T): T;
    checkMayLeave(componentIdx: number): void;
    guardMayLeave<A extends unknown[], T, R>(
        componentIdx: number,
        fn: (this: R, ...args: A) => T,
    ): (this: R, ...args: A) => T;
    recordTrap(componentIdx: number | null | undefined, error: unknown, convertsRangeErrors?: boolean): unknown;
    guardTrap<A extends unknown[], T, R>(
        componentIdx: number | null | undefined,
        fn: (this: R, ...args: A) => T,
        convertsRangeErrors?: boolean,
    ): (this: R, ...args: A) => T;
    getOrCreateAsyncState(componentIdx: number, init?: unknown): ComponentAsyncState;
    backpressureInc(componentIdx: number): void;
    backpressureDec(componentIdx: number): void;
    setAllError(): void;
}
