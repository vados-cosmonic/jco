import type { ComponentAsyncState, ComponentWaitable, ComponentWaitableSet, WaitableEvent } from './component-types.js';
import type { RuntimeMemory } from './core-types.js';

export interface WaitableSuspendOptions {
    readyFn(): boolean;
    cancellable: boolean;
}
/** Task operations used by waitable sets, including older bindings' inline tasks. */
export interface WaitableTask {
    componentIdx(): number;
    deliverPendingCancel(options: { cancellable: boolean }): boolean;
    isErrored(): unknown;
    suspendUntil(options: WaitableSuspendOptions): Promise<boolean>;
    suspendUntilCallback(options: WaitableSuspendOptions, onResume: (keepGoing: boolean) => void): void;
}
export interface WaitableWaitOptions extends WaitableSuspendOptions {
    task: WaitableTask;
}
export interface Waitable extends ComponentWaitable {
    /** Legacy standalone wait hook. The supplied scheduler must implement waitUntil. */
    waitForPendingEvent(args: { cstate: { waitUntil(options: WaitableSuspendOptions): unknown } }): Promise<void>;
}
export interface WaitableConstructor {
    new (args: { componentIdx?: number; target?: unknown }): Waitable;
}
export interface WaitableSet extends ComponentWaitableSet {
    target: unknown;
    componentIdx(): number;
    numWaitables(): number;
    numWaiting(): number;
    incrementNumWaiting(n?: number): void;
    decrementNumWaiting(n?: number): void;
    targets(): unknown[];
    setTarget(target: unknown): void;
    shuffleWaitables(): void;
    removeWaitable(waitable: ComponentWaitable): ComponentWaitable | undefined;
    hasPendingEvent(): boolean;
    getPendingEvent(): WaitableEvent | null;
    tryWait(options: WaitableWaitOptions): WaitableEvent | null;
    waitUntil(options: WaitableWaitOptions): WaitableEvent | null | Promise<WaitableEvent | null>;
    waitUntilCallback(options: WaitableWaitOptions, onEvent: (event: WaitableEvent | null) => void): void;
}
export interface WaitableSetConstructor {
    new (componentIdx: number): WaitableSet;
}
export interface WaitableMemoryContext {
    componentIdx: number;
    isAsync: boolean;
    memoryIdx?: number;
    getMemoryFn(): RuntimeMemory;
}
export interface WaitableStoreEventOptions {
    memory: RuntimeMemory;
    ptr: number;
    event: WaitableEvent | null;
    componentIdx: number;
    task: WaitableTask;
    memoryIdx?: number;
}
/** Lazy access to task lookup and the host event writer in generated bindings. */
export interface WaitableContext {
    getCurrentTask?(componentIdx: number): { componentIdx: number; task?: WaitableTask } | undefined;
    storeEventInComponentMemory?(args: WaitableStoreEventOptions): number;
}
export interface WaitableIntrinsics {
    readonly Waitable: WaitableConstructor;
    readonly WaitableSet: WaitableSetConstructor;
    waitableSetNew(componentIdx: number): number;
    waitableSetWait(
        ctx: WaitableMemoryContext,
        setRep: number,
        resultPtr: number,
        syncOnly?: boolean,
    ): number | Promise<number>;
    waitableSetPoll(ctx: WaitableMemoryContext, setRep: number, resultPtr: number): number;
    waitableSetDrop(componentIdx: number, setRep: number): void;
    removeWaitableSet(args: { state: ComponentAsyncState; waitableSetRep: number }): void;
    waitableJoin(componentIdx: number, waitableRep: number, waitableSetRep: number): void;
}
