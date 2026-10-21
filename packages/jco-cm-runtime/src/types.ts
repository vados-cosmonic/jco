import type { ConversionIntrinsics } from './intrinsics/conversion.js';
import type { JsHelperIntrinsics } from './intrinsics/js-helper.js';
import type { StringIntrinsics } from './intrinsics/string.js';
import type { WebIdlIntrinsics } from './intrinsics/webidl.js';
import type { CoreContext, CoreIntrinsics } from './intrinsics/core-types.js';
import type { ComponentContext, ComponentIntrinsics, ComponentTrapMessages } from './intrinsics/component-types.js';
import type { WaitableContext, WaitableIntrinsics } from './intrinsics/waitable-types.js';
import type { ErrorContextIntrinsics } from './intrinsics/error-context-types.js';

export const CM_RUNTIME_API_VERSION = 1 as const;

export type RuntimeApiVersion = number;
export type AsyncDeterminism = 'random' | 'deterministic';

export type ResourceHandle = number;
export type ResourceRep = number;
export type ResourceScope = number;

export interface RuntimeErrorConstructor {
    new (message?: string): Error;
    readonly prototype: Error;
}

export interface RuntimePlatform {
    readonly WebAssembly: {
        readonly RuntimeError: RuntimeErrorConstructor;
        readonly compile?: typeof WebAssembly.compile;
        readonly compileStreaming?: typeof WebAssembly.compileStreaming;
        readonly instantiate?: typeof WebAssembly.instantiate;
        readonly Instance?: typeof WebAssembly.Instance;
        readonly Suspending?: new (fn: (...args: number[]) => unknown) => WebAssembly.ImportValue;
    };
}

export interface RuntimeOptions {
    readonly requestedApiVersion: RuntimeApiVersion;
    readonly strict: boolean;
    readonly flagsAsBigInt: boolean;
    readonly nodejsCompat: boolean;
    readonly asyncDeterminism: AsyncDeterminism;
    readonly platform?: Partial<RuntimePlatform>;
    /** Lazy access to task intrinsics that are still generated inline. */
    readonly resourceTasks?: ResourceTaskContext;
    /** Compiler-owned FACT trap discriminants and their messages. */
    readonly factTrapMessages?: Readonly<Record<number, string>>;
    /** Lazy access to the generated module's selected component/task operations. */
    readonly coreContext?: CoreContext;
    /** Legacy factory used by older API-v1 bindings with inline waitables. */
    readonly componentContext?: ComponentContext;
    /** Lazy access to task lookup and event storage in generated bindings. */
    readonly waitableContext?: WaitableContext;
    /** Trap messages supplied by the compiler's Wasmtime version. */
    readonly componentTrapMessages?: ComponentTrapMessages;
}

export interface ResourceTableEntry {
    readonly rep: ResourceRep;
    readonly scope: ResourceScope;
    readonly own: boolean;
}

export interface ResourceIntrinsics {
    readonly tableFlag: number;
    readonly state: ResourceState;
    getHandleIndexSpace(key: number | ResourceTable): HandleIndexSpace;
    tableCreateBorrow(table: ResourceTable, rep: ResourceRep, scopeId: ResourceScope): ResourceHandle;
    tableCreateOwn(table: ResourceTable, rep: ResourceRep): ResourceHandle;
    tableGet(table: ArrayLike<number>, handle: ResourceHandle): ResourceTableEntry;
    tableEnsureBorrowDrop(table: ArrayLike<number>, handle: ResourceHandle, scope: ResourceScope): void;
    tableRemove(table: ResourceTable, handle: ResourceHandle): ResourceTableEntry;
    transferBorrow(handle: ResourceHandle, fromTid: number, toTid: number): ResourceHandle | ResourceRep;
    transferBorrowValidLifting(handle: ResourceHandle, fromTid: number, toTid: number): ResourceHandle | ResourceRep;
    transferOwn(handle: ResourceHandle, fromTid: number, toTid: number): ResourceHandle;
    callDestructor<T>(args: { componentIdx: number; dtor(rep: ResourceRep): T; rep: ResourceRep }): T;
}

/** Resizable pair slots, plus the instance owning this table and its known reps. */
export interface ResourceTable extends Array<number> {
    _componentIdx?: number;
    _createdReps: Set<ResourceRep>;
}

export interface HandleIndexSpace {
    next: number;
    free: number[];
    alloc(): number;
    release(index: number): void;
}

export interface ResourceState {
    readonly handleIndexSpaces: Map<number | ResourceTable, HandleIndexSpace>;
    readonly handleTables: ResourceTable[];
    scopeId: ResourceScope;
    scopeCounter: ResourceScope;
    readonly scopeTasks: Map<ResourceScope, ResourceBorrowTask>;
    callBorrows: { rid: number; handle: ResourceHandle }[];
    /** Host resource objects or `{ rsc, drop }` entries consumed by generated cleanup. */
    currentBorrows: object[];
}

/** The part of a task used to account for resource borrows. */
export interface ResourceBorrowTask {
    resourceScopeId(): ResourceScope;
    addResourceLender(table: ResourceTable, handle: ResourceHandle): void;
    addBorrowedHandle(): void;
    removeBorrowedHandle(): void;
}

/** The synchronous task lifecycle used when calling a resource destructor. */
export interface ResourceDestructorTask {
    id(): bigint;
    enterSync(): void;
    resolve(results: unknown[]): void;
    exit(options?: { skipExclusiveLockCheck: boolean }): void;
    isResolvedState(): boolean;
    setErrored(error: unknown): void;
    reject(error: unknown): void;
    isExited(): boolean;
}

/** Transitional bridge to the generated module's task register and task factory. */
export interface ResourceTaskContext {
    getCurrentTask?(componentIdx: number): ResourceBorrowTask | undefined;
    createTask?(args: {
        componentIdx: number;
        isAsync: false;
        callingWasmExport: true;
        entryFnName: '<resource-drop>';
    }): ResourceDestructorTask;
    withTask?<T>(args: { taskID: bigint; componentIdx: number; fn(): T }): T;
}

export interface RuntimeIntrinsics {
    readonly errorContext: ErrorContextIntrinsics;
    readonly waitable: WaitableIntrinsics;
    readonly component: ComponentIntrinsics;
    readonly core: CoreIntrinsics;
    readonly webidl: WebIdlIntrinsics;
    readonly string: StringIntrinsics;
    readonly jsHelper: JsHelperIntrinsics;
    readonly conversion: ConversionIntrinsics;
    readonly resource: ResourceIntrinsics;
}

export interface ComponentModelRuntime {
    readonly apiVersion: RuntimeApiVersion;
    readonly intrinsics: RuntimeIntrinsics;
    dispose?(): void;
}

export interface ComponentModelRuntimeProvider {
    readonly apiVersion: RuntimeApiVersion;
    create(options: RuntimeOptions): ComponentModelRuntime;
}
