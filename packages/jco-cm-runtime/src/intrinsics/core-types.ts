import type { AsyncDeterminism, HandleIndexSpace, RuntimeErrorConstructor } from '../types.js';
import type { StringRealloc } from './string.js';

export type RuntimeMemory = { readonly buffer: ArrayBufferLike };
export interface TaskMeta {
    taskID: bigint;
    componentIdx: number;
}
export interface TaskRegisters {
    [componentIdx: number]: TaskMeta | null | undefined;
    current?: TaskMeta | null;
}
export interface MemoryMeta {
    componentIdx: number;
    memoryIdx?: number;
    memory?: RuntimeMemory;
}
/** Lazy access to a generated module's selected component/task operations. */
export interface CoreContext {
    checkMayLeave(componentIdx: number): void;
    getCurrentTask(componentIdx: number, taskID: bigint): { mayBlock(): boolean | undefined } | undefined;
    currentTaskMayBlock(): number;
    recordTrap(componentIdx: number, error: unknown, convertsRangeErrors: boolean): unknown;
    throwIfInterrupted(componentIdx: number): void;
}
export interface ComponentError extends Error {
    readonly payload: unknown;
}
export interface ComponentErrorConstructor {
    new (value: unknown): ComponentError;
}
export interface RepTable<T = unknown> {
    target: unknown;
    data(): (T | number | symbol | null)[];
    insert(value: T): number;
    get(rep: number): T | undefined;
    contains(rep: number): boolean;
    remove(rep: number): T;
    size(): number;
    clear(): void;
}
export interface RepTableConstructor {
    new <T = unknown>(args?: { target?: unknown; space?: HandleIndexSpace }): RepTable<T>;
    readonly FREE: symbol;
}
/** Context passed to the generated element lift/lower functions. */
export interface BufferElementContext {
    storagePtr: number;
    memory: RuntimeMemory;
    componentIdx: number;
    stringEncoding: string;
    realloc?: StringRealloc;
    getReallocFn?: () => StringRealloc;
    vals?: unknown[];
    liftResource?(handle: number, tableIdx: number): { rep: number };
    lowerResource?(resource: { rep: number }, tableIdx: number): number;
}
export interface BufferElementMetadata {
    align32: number;
    isNone?: boolean;
    payloadTypeName?: string;
    stringEncoding?: string;
    liftFn?(ctx: BufferElementContext): [unknown, unknown];
    lowerFn?(ctx: BufferElementContext): unknown;
    getReallocFn?: () => StringRealloc;
}
export interface ManagedBufferOptions {
    componentIdx: number;
    capacity: number;
    elemMeta: BufferElementMetadata;
    memory?: RuntimeMemory;
    start?: number;
    data?: unknown[];
    target?: unknown;
}
export interface ManagedBuffer {
    capacity: number;
    processed: number;
    target: unknown;
    setTarget(target: unknown): void;
    remaining(): number;
    componentIdx(): number;
    getElemMeta(): BufferElementMetadata;
    isHostOwned(): boolean;
    read(count: number, options?: { transferResources?: boolean }): unknown[];
    write(values: unknown[], options?: { transferResources?: boolean }): void;
}
export interface ManagedBufferConstructor {
    new (args: ManagedBufferOptions): ManagedBuffer;
    readonly MAX_LENGTH: number;
}
export type CreateBufferOptions = Omit<ManagedBufferOptions, 'capacity'> & { count: number; stringEncoding?: string };
export interface BufferManager {
    getNextBufferID(componentIdx: number): bigint;
    getBuffer(componentIdx: number, bufferID: bigint): ManagedBuffer | undefined;
    createBuffer(args: CreateBufferOptions): { id: bigint; buffer: ManagedBuffer };
    deleteBuffer(componentIdx: number, bufferID: bigint): boolean | undefined;
}
export interface BufferManagerConstructor {
    new (): BufferManager;
}
export interface RuntimeFinalizationRegistry<T> {
    unregister(token: object): boolean | void;
    /** Absent on the inline implementation's fallback when the host has no registry. */
    register?(target: object, heldValue: T, unregisterToken?: object): void;
}
export type ConditionalTrampoline = (...args: number[]) => number | void;
export interface CoreIntrinsics {
    readonly asyncDeterminism: AsyncDeterminism;
    readonly i32Min: number;
    readonly i32Max: number;
    readonly asyncFunctionConstructor: Function;
    readonly ComponentError: ComponentErrorConstructor;
    readonly RuntimeError: RuntimeErrorConstructor;
    readonly ReadableStream: typeof ReadableStream;
    readonly RepTable: RepTableConstructor;
    readonly ManagedBuffer: ManagedBufferConstructor;
    readonly BufferManager: BufferManagerConstructor;
    readonly bufferManager: BufferManager;
    readonly factTrapMessages: Readonly<Record<number, string>>;
    readonly symbolCabiDispose: symbol;
    readonly symbolCabiLower: symbol;
    readonly symbolResourceHandle: symbol;
    readonly symbolResourceRep: symbol;
    readonly symbolDispose: symbol;
    readonly symbolAsyncIterator: symbol;
    readonly symbolIterator: symbol;
    readonly isLE: boolean;
    readonly hasOwnProperty: (this: unknown, key: PropertyKey) => boolean;
    readonly asyncEventCode: {
        NONE: 0;
        SUBTASK: 1;
        STREAM_READ: 2;
        STREAM_WRITE: 3;
        FUTURE_READ: 4;
        FUTURE_WRITE: 5;
        TASK_CANCELLED: 6;
    };
    readonly componentMemoryMap: Map<number, Record<string, MemoryMeta>>;
    readonly currentTaskMeta: TaskRegisters;
    readonly conditionalSuspendingWasm: Record<string, WebAssembly.Module>;
    debugLog(...args: unknown[]): void;
    coinFlip(): boolean;
    typeCheckValidI32(value: unknown): boolean;
    typeCheckAsyncFn(value: unknown): boolean;
    base64Compile(encoded: string): Promise<WebAssembly.Module>;
    fetchCompile(url: URL): Promise<WebAssembly.Module>;
    instantiateCore(module: WebAssembly.Module, imports?: WebAssembly.Imports): Promise<WebAssembly.Instance>;
    clampGuest(value: number, min: number, max: number): number;
    getErrorPayload(error: unknown): unknown;
    getErrorPayloadString(error: unknown): unknown;
    finalizationRegistryCreate<T>(cleanup: (value: T) => void): RuntimeFinalizationRegistry<T>;
    disposeHostValue(value: unknown, disposeFn?: (this: unknown) => unknown): void;
    throwInvalidBool(): never;
    throwUninitialized(): never;
    promiseWithResolvers<T>(): {
        promise: Promise<T>;
        resolve(value: T | PromiseLike<T>): void;
        reject(reason?: unknown): void;
    };
    registerMemory(args: MemoryMeta): void;
    lookupMemories(args: { componentIdx: number }): MemoryMeta[];
    lookupMemories(args: { componentIdx: number; memoryIdx: number }): RuntimeMemory | undefined | [];
    getCurrentTaskMeta(componentIdx?: number | null): TaskMeta | undefined;
    setCurrentTaskMeta(args: TaskMeta): TaskMeta;
    withCurrentTaskMeta<T>(args: TaskMeta & { fn(): T }): T;
    withCurrentTaskMetaAsync<T>(args: TaskMeta & { fn(): T | PromiseLike<T> }): Promise<T>;
    clearCurrentTaskMeta(args: TaskMeta): Promise<void>;
    suspendingImport<A extends unknown[], T>(
        componentIdx: number,
        fn: (...args: A) => T,
        syncOnly?: boolean,
        switchesTask?: boolean,
        convertsRangeErrors?: boolean,
    ): (...args: A) => T | Promise<T>;
    conditionalSuspending1I32ToI32(
        fast: ConditionalTrampoline,
        slow: (...args: number[]) => number | void | PromiseLike<number | void>,
    ): ConditionalTrampoline;
    conditionalSuspending2I32ToI32(
        fast: ConditionalTrampoline,
        slow: (...args: number[]) => number | void | PromiseLike<number | void>,
    ): ConditionalTrampoline;
    conditionalSuspending3I32ToI32(
        fast: ConditionalTrampoline,
        slow: (...args: number[]) => number | void | PromiseLike<number | void>,
    ): ConditionalTrampoline;
    conditionalSuspending3I32ToVoid(
        fast: ConditionalTrampoline,
        slow: (...args: number[]) => number | void | PromiseLike<number | void>,
    ): ConditionalTrampoline;
}
