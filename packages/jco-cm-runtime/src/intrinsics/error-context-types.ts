import type { RepTable } from './core-types.js';

/** Store-wide metadata; origin fields are populated by errCtxNew. */
export interface GlobalErrorContext {
    refCount: number;
    debugMessage: string;
    localIdx?: number;
    waitableIdx?: number;
    componentIdx?: number;
    localTableIdx?: number;
}
/** Metadata stored in a component's shared handle table. */
export interface LocalErrorContext {
    globalRep: number;
    refCount: number;
    localIdx: number;
}
export interface GlobalErrorContextTableConstructor {
    new (): object;
    data: RepTable<GlobalErrorContext> | null;
    get(): RepTable<GlobalErrorContext>;
}
/** Component -> local table index -> table of shared component handles. */
export type LocalErrorContextTables = Map<number, Map<number, RepTable<number>>>;
export interface ErrorContextTableRegistration {
    componentIdx: number;
    table: RepTable;
}
export interface ErrorContextLocation {
    componentIdx: number;
    localTableIdx: number;
}
export interface ErrorContextNewContext extends ErrorContextLocation {
    readStrFn(ptr: number, len: number): string;
}
export interface ErrorContextDebugContext {
    componentIdx: number;
    writeStrFn(message: string, outputPtr: number): unknown;
}
export interface ErrorContextIntrinsics {
    readonly GlobalErrorContextTable: GlobalErrorContextTableConstructor;
    readonly tables: Record<number, ErrorContextTableRegistration>;
    readonly localTables: LocalErrorContextTables;
    errCtxNew(ctx: ErrorContextNewContext, msgPtr: number, msgLen: number): number;
    errCtxDrop(ctx: ErrorContextLocation, handle: number): void;
    errCtxTransfer(handle: number, srcTableIdx: number, destTableIdx: number): number;
    errCtxDebugMessage(ctx: ErrorContextDebugContext, handle: number, outputPtr: number): void;
    errCtxGetLocalTable(componentIdx: number, tableIdx: number, options?: { upsert?: boolean }): RepTable<number>;
    errCtxGlobalRefCountAdd(globalRep: number, amount?: number | null): number;
    errCtxCreateLocalHandle(
        componentIdx: number,
        localTable: RepTable<number>,
        globalRep: number,
    ): {
        waitableIdx: number;
        localIdx: number;
    };
    errCtxReserveGlobalRep(debugMessage: string, refCount: number): { globalRep: number; errCtx: GlobalErrorContext };
}
