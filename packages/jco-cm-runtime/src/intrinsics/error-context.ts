import type { CoreIntrinsics, RepTable as RepTableType } from './core-types.js';
import type { ComponentIntrinsics } from './component-types.js';
import type {
    ErrorContextIntrinsics,
    ErrorContextLocation,
    ErrorContextNewContext,
    ErrorContextDebugContext,
    ErrorContextTableRegistration,
    GlobalErrorContext,
    LocalErrorContext,
    LocalErrorContextTables,
} from './error-context-types.js';

export function createErrorContextIntrinsics(
    core: CoreIntrinsics,
    component: ComponentIntrinsics,
): ErrorContextIntrinsics {
    const { RepTable, debugLog } = core;
    const getOrCreateAsyncState = component.getOrCreateAsyncState.bind(component);

    class GlobalErrorContextTable {
        static data: RepTableType<GlobalErrorContext> | null = null;
        static get() {
            if (GlobalErrorContextTable.data === null) {
                GlobalErrorContextTable.data = new RepTable<GlobalErrorContext>({
                    target: 'global error context table',
                });
            }
            return GlobalErrorContextTable.data;
        }
    }
    const tables: Record<number, ErrorContextTableRegistration> = {};
    const localTables: LocalErrorContextTables = new Map();

    function errCtxNew(args: ErrorContextNewContext, msgPtr: number, msgLen: number) {
        debugLog('[errCtxNew()] args', { args, msgPtr, msgLen });
        const { componentIdx, localTableIdx, readStrFn } = args;
        const localTable = errCtxGetLocalTable(componentIdx, localTableIdx);
        const debugMessage = readStrFn(msgPtr, msgLen);
        const { globalRep, errCtx: globalErrCtx } = errCtxReserveGlobalRep(debugMessage, 0);
        const { waitableIdx, localIdx } = errCtxCreateLocalHandle(componentIdx, localTable, globalRep);
        globalErrCtx.localIdx = localIdx;
        globalErrCtx.waitableIdx = waitableIdx;
        globalErrCtx.componentIdx = componentIdx;
        globalErrCtx.localTableIdx = localTableIdx;
        return waitableIdx;
    }

    function errCtxDebugMessage(ctx: ErrorContextDebugContext, handle: number, outputStrPtr: number) {
        debugLog('[errCtxDebugMessage()] ctx', { ctx, handle, outputStrPtr });
        const { componentIdx, writeStrFn } = ctx;
        const globalTable = GlobalErrorContextTable.get();
        const cstate = getOrCreateAsyncState(componentIdx);
        const errCtx = cstate.handles.get(handle) as LocalErrorContext | undefined;
        if (!errCtx || errCtx.globalRep === undefined) {
            throw new Error(
                `missing error context (handle [${handle}]) in component idx [${componentIdx}] during debug msg`,
            );
        }
        const msg = globalTable.get(errCtx.globalRep)!.debugMessage;
        writeStrFn(msg, outputStrPtr);
    }

    function errCtxDrop(ctx: ErrorContextLocation, handle: number) {
        debugLog('[errCtxDrop()] ctx', { ctx, handle });
        const { componentIdx, localTableIdx } = ctx;
        const globalTable = GlobalErrorContextTable.get();
        const cstate = getOrCreateAsyncState(componentIdx);
        const errCtx = cstate.handles.get(handle) as LocalErrorContext | undefined;
        if (!errCtx || errCtx.globalRep === undefined) {
            throw new Error(
                `missing error context (handle [${handle}]) in component idx [${componentIdx}] during drop`,
            );
        }
        const localErrCtxTable = errCtxGetLocalTable(componentIdx, localTableIdx);
        if (!localErrCtxTable.get(errCtx.localIdx)) {
            throw new Error(`missing error-context with handle [${handle}] in component [${componentIdx}] during drop`);
        }
        errCtx.refCount -= 1;
        if (errCtx.refCount <= 0) {
            localErrCtxTable.remove(errCtx.localIdx);
            cstate.handles.remove(handle);
        }
        const globalRefCount = errCtxGlobalRefCountAdd(errCtx.globalRep, -1);
        if (globalRefCount === 0) {
            if (errCtx.refCount !== 0) {
                throw new Error('local refCount exceeds global during removal');
            }
            globalTable.remove(errCtx.globalRep);
        }
    }

    function errCtxTransfer(waitableIdx: number, srcTableIdx: number, destTableIdx: number) {
        debugLog('[errCtxTransfer()] args', { waitableIdx, srcTableIdx, destTableIdx });
        const { componentIdx: srcComponentIdx } = tables[srcTableIdx];
        const { componentIdx: destComponentIdx } = tables[destTableIdx];
        // Validate the source table even though its entries remain for generated cleanup.
        errCtxGetLocalTable(srcComponentIdx, srcTableIdx);
        const toTbl = errCtxGetLocalTable(destComponentIdx, destTableIdx, { upsert: true });
        const srcComponentState = getOrCreateAsyncState(srcComponentIdx);
        const errCtx = srcComponentState.handles.get(waitableIdx) as LocalErrorContext | undefined;
        if (!errCtx) {
            throw new Error(`missing error context (waitable idx [${waitableIdx}])`);
        }
        if (!errCtx.localIdx) {
            throw new Error('unexpectedly missing local idx from error context object');
        }
        if (!errCtx.globalRep) {
            throw new Error('unexpectedly missing globalRep from error context object');
        }
        errCtx.refCount -= 1;
        // Generated return functions can drop the source after transfer, so retain
        // its entries here, matching the inline ownership/refcount convention.
        const { waitableIdx: newWaitableIdx, localIdx } = errCtxCreateLocalHandle(
            destComponentIdx,
            toTbl,
            errCtx.globalRep,
        );
        debugLog('[errCtxTransfer()] successfully transferred', {
            dest: {
                errCtxHandle: localIdx,
                errCtxWaitableIdx: newWaitableIdx,
                tableIdx: destTableIdx,
                componentIdx: destComponentIdx,
            },
            src: { errCtxWaitableIdx: waitableIdx, tableIdx: srcTableIdx, componentIdx: srcComponentIdx },
        });
        return newWaitableIdx;
    }

    function errCtxGlobalRefCountAdd(globalRep: number, amount?: number | null) {
        const globalTable = GlobalErrorContextTable.get();
        const errCtx = globalTable.get(globalRep);
        if (!errCtx) {
            throw new Error(`missing global error-context [${globalRep}] while incrementing refcount`);
        }
        return (errCtx.refCount += amount ?? 1);
    }

    function errCtxGetLocalTable(componentIdx: number, tableIdx: number, opts?: { upsert?: boolean }) {
        let tables = localTables.get(componentIdx);
        if (!tables) {
            if (opts?.upsert) {
                tables = new Map();
                localTables.set(componentIdx, tables);
            } else {
                throw new Error(
                    `missing local error context table for component [${componentIdx}] while getting local table`,
                );
            }
        }
        let errCtxTable = tables.get(tableIdx);
        if (!errCtxTable) {
            if (opts?.upsert) {
                errCtxTable = new RepTable<number>({ target: `component [${componentIdx}] error contexts` });
                tables.set(tableIdx, errCtxTable);
            } else {
                throw new Error(
                    `missing table [${tableIdx}] in tables for component [${componentIdx}] while getting local table`,
                );
            }
        }
        return errCtxTable;
    }

    function errCtxCreateLocalHandle(
        componentIdx: number,
        componentLocalTable: RepTableType<number>,
        globalRep: number,
    ) {
        const globalTable = GlobalErrorContextTable.get();
        if (!globalTable.contains(globalRep)) {
            throw new Error(`missing global error-context [${globalRep}] during local handle create`);
        }
        const cstate = getOrCreateAsyncState(componentIdx);
        // Insert first, then finalize the local index once both tables allocate it.
        const newErrCtx = { globalRep, refCount: 1 } as LocalErrorContext;
        const waitableIdx = cstate.handles.insert(newErrCtx);
        const localIdx = componentLocalTable.insert(waitableIdx);
        newErrCtx.localIdx = localIdx;
        globalTable.get(globalRep)!.refCount += 1;
        return { waitableIdx, localIdx };
    }

    function errCtxReserveGlobalRep(debugMessage: string, refCount: number) {
        const globalTable = GlobalErrorContextTable.get();
        const errCtx: GlobalErrorContext = { refCount, debugMessage };
        const globalRep = globalTable.insert(errCtx);
        return { globalRep, errCtx };
    }

    return {
        GlobalErrorContextTable,
        tables,
        localTables,
        errCtxNew,
        errCtxDrop,
        errCtxTransfer,
        errCtxDebugMessage,
        errCtxGetLocalTable,
        errCtxGlobalRefCountAdd,
        errCtxCreateLocalHandle,
        errCtxReserveGlobalRep,
    };
}
