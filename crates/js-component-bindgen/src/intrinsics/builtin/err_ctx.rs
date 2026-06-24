use crate::intrinsics::{ComponentIntrinsic, ErrCtxIntrinsic, Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;

impl super::BuiltinIntrinsicRenderer {
    /// Render a [`ErrCtxIntrinsic`]
    pub(crate) fn render_err_ctx(
        &self,
        intrinsic: &ErrCtxIntrinsic,
        output: &mut Source,
        _render_args: &RenderIntrinsicsArgs,
    ) {
        match intrinsic {
            ErrCtxIntrinsic::ComponentGlobalTable => {
                let name = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(r#"
                class {name} {{
                     static data = null;
                     static get() {{
                         if ({name}.data === null) {{
                             {name}.data = new {rep_table_class}({{ target: "global error context table" }});
                         }}
                         return {name}.data;
                     }}
                }}
                "#));
            }

            ErrCtxIntrinsic::GlobalErrCtxTableMap => {
                let global_err_ctx_table_map = ErrCtxIntrinsic::GlobalErrCtxTableMap.name();
                output.push_str(&format!(
                    r#"
                    const {global_err_ctx_table_map} = {{}};
                    "#
                ));
            }

            // NOTE: the top and middle level of the component local table are regular maps, with
            // leaves being actual `RepTable`s
            ErrCtxIntrinsic::ComponentLocalTable => {
                let name = ErrCtxIntrinsic::ComponentLocalTable.name();
                output.push_str(&format!(r#"let {name} = new Map();"#));
            }

            ErrCtxIntrinsic::ErrorContextNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let reserve_global_err_ctx_fn = ErrCtxIntrinsic::ReserveGlobalRep.name();
                let err_ctx_new_fn = ErrCtxIntrinsic::ErrorContextNew.name();
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();

                output.push_str(&format!(
                    r#"
                    function {err_ctx_new_fn}(args, msgPtr, msgLen) {{
                        {debug_log_fn}('[{err_ctx_new_fn}()] args', {{ args, msgPtr, msgLen }});
                        const {{ componentIdx, localTableIdx, readStrFn }} = args;

                        const localTable = {get_local_tbl_fn}(componentIdx, localTableIdx);
                        const debugMessage = readStrFn(msgPtr, msgLen);

                        const {{ globalRep, errCtx: globalErrCtx }} = {reserve_global_err_ctx_fn}(debugMessage, 0);

                        const {{ waitableIdx, localIdx }} = {create_local_handle_fn}(componentIdx, localTable, globalRep);

                        globalErrCtx.localIdx = localIdx;
                        globalErrCtx.waitableIdx = waitableIdx;
                        globalErrCtx.componentIdx = componentIdx;
                        globalErrCtx.localTableIdx = localTableIdx;

                        return waitableIdx;
                    }}
                "#
                ));
            }

            ErrCtxIntrinsic::ErrorContextDebugMessage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let err_ctx_debug_msg_fn = ErrCtxIntrinsic::ErrorContextDebugMessage.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();

                output.push_str(&format!(r#"
                    function {err_ctx_debug_msg_fn}(ctx, handle, outputStrPtr) {{
                        {debug_log_fn}('[{err_ctx_debug_msg_fn}()] ctx', {{ ctx, handle, outputStrPtr }});
                        const {{ componentIdx, writeStrFn }} = ctx;
                        const globalTable = {global_tbl}.get();

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        const errCtx = cstate.handles.get(handle);
                        if (!errCtx || errCtx.globalRep === undefined) {{
                            throw new Error(`missing error context (handle [${{handle}}]) in component idx [${{componentIdx}}] during debug msg`);
                        }}

                        const msg = globalTable.get(errCtx.globalRep).debugMessage;
                        writeStrFn(msg, outputStrPtr);
                    }}
                "#));
            }

            ErrCtxIntrinsic::ErrorContextDrop => {
                let global_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let err_ctx_drop_fn = ErrCtxIntrinsic::ErrorContextDrop.name();
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();

                output.push_str(&format!(r#"
                    function {err_ctx_drop_fn}(ctx, handle) {{
                        {debug_log_fn}('[{err_ctx_drop_fn}()] ctx', {{ ctx, handle }});
                        const {{ componentIdx, localTableIdx }} = ctx;
                        const globalTable = {global_tbl}.get();

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        const errCtx = cstate.handles.get(handle);
                        if (!errCtx || errCtx.globalRep === undefined) {{
                            throw new Error(`missing error context (handle [${{handle}}]) in component idx [${{componentIdx}}] during drop`);
                        }}

                        const localErrCtxTable = {get_local_tbl_fn}(componentIdx, localTableIdx);
                        if (!localErrCtxTable.get(errCtx.localIdx)) {{
                            throw new Error(`missing error-context with handle [${{handle}}] in component [${{componentIdx}}] during drop`);
                        }}

                        errCtx.refCount -= 1;
                        if (errCtx.refCount <= 0) {{
                            localErrCtxTable.remove(errCtx.localIdx);
                            cstate.handles.remove(handle);
                        }}

                        const globalRefCount = {global_ref_count_add_fn}(errCtx.globalRep, -1);
                        if (globalRefCount === 0) {{
                            if (errCtx.refCount !== 0) {{ throw new Error('local refCount exceeds global during removal'); }}
                            globalTable.remove(errCtx.globalRep);
                        }}
                    }}
                "#));
            }

            ErrCtxIntrinsic::ErrorContextTransfer => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();
                let err_ctx_transfer_fn = ErrCtxIntrinsic::ErrorContextTransfer.name();
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let global_err_ctx_table_map = ErrCtxIntrinsic::GlobalErrCtxTableMap.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();

                // TODO: error contexts should be stored in handles like streams are

                // NOTE: the handle described below is *not* the error-context rep, but rather the
                // component-local handle for the canonical rep of a certain global error-context.
                //
                // handles are component instance local, reps are component (model) global
                //
                // When an error transfer context is called, we expect to be in a task that performed
                // the transfer, and we get the result of where the transfer should go.
                output.push_str(&format!(r#"
                    function {err_ctx_transfer_fn}(waitableIdx, srcTableIdx, destTableIdx) {{
                        {debug_log_fn}('[{err_ctx_transfer_fn}()] args', {{ waitableIdx, srcTableIdx, destTableIdx }});

                        const {{ componentIdx: srcComponentIdx }} = {global_err_ctx_table_map}[srcTableIdx];
                        const {{ componentIdx: destComponentIdx }} = {global_err_ctx_table_map}[destTableIdx];

                        const fromTbl = {get_local_tbl_fn}(srcComponentIdx, srcTableIdx);
                        const toTbl = {get_local_tbl_fn}(destComponentIdx, destTableIdx, {{ upsert: true }});

                        const srcComponentState = {get_or_create_async_state_fn}(srcComponentIdx);

                        const errCtx = srcComponentState.handles.get(waitableIdx);
                        if (!errCtx) {{
                            throw new Error(`missing error context (waitable idx [${{waitableIdx}}])`);
                        }}
                        if (!errCtx.localIdx) {{
                            throw new Error(`unexpectedly missing local idx from error context object`);
                        }}
                        if (!errCtx.globalRep) {{
                            throw new Error(`unexpectedly missing globalRep from error context object`);
                        }}

                        errCtx.refCount -= 1;
                        // NOTE: we avoid automatic removal here because return functions (e.g. in composed components)
                        // may attempt to drop *after* the transfer. This change is really only about ownership,
                        // even though we update the refcount

                        const {{ waitableIdx: newWaitableIdx, localIdx }} = {create_local_handle_fn}(
                            destComponentIdx,
                            toTbl,
                            errCtx.globalRep,
                        );

                        {debug_log_fn}('[{err_ctx_transfer_fn}()] successfully transferred', {{
                            dest: {{
                                errCtxHandle: localIdx,
                                errCtxWaitableIdx: newWaitableIdx,
                                tableIdx: destTableIdx,
                                componentIdx: destComponentIdx,
                            }},
                            src: {{
                                errCtxWaitableIdx: waitableIdx,
                                tableIdx: srcTableIdx,
                                componentIdx: srcComponentIdx,
                            }},
                        }});

                        return newWaitableIdx;
                    }}
                "#));
            }

            ErrCtxIntrinsic::GlobalRefCountAdd => {
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let err_ctx_global_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                output.push_str(&format!("
                    function {err_ctx_global_ref_count_add_fn}(globalRep, amount) {{
                        const globalTable = {global_tbl}.get();
                        const errCtx = globalTable.get(globalRep);
                        if (!errCtx) {{
                            throw new Error(`missing global error-context [${{globalRep}}] while incrementing refcount`);
                        }}
                        return errCtx.refCount += amount ?? 1;
                    }}
                "));
            }

            ErrCtxIntrinsic::GetLocalTable => {
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();
                let local_tbl_var = ErrCtxIntrinsic::ComponentLocalTable.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                // let local_tbl_var = ErrCtxIntrinsic::GlobalErrCtxTableMap.name()

                output.push_str(&format!(r#"
                    function {get_local_tbl_fn}(componentIdx, tableIdx, opts) {{
                        const localTables = {local_tbl_var};
                        let tables = localTables.get(componentIdx);
                        if (!tables) {{
                            if (opts?.upsert) {{
                                tables = new Map();
                                localTables.set(componentIdx, tables);
                            }} else {{
                                throw new Error(`missing local error context table for component [${{componentIdx}}] while getting local table`);
                            }}
                        }}

                        let errCtxTable = tables.get(tableIdx);
                        if (!errCtxTable) {{
                            if (opts?.upsert) {{
                                errCtxTable = new {rep_table_class}({{ target: `component [${{componentIdx}}] error contexts` }});
                                tables.set(tableIdx, errCtxTable);
                            }} else {{
                                throw new Error(`missing table [${{tableIdx}}] in tables for component [${{componentIdx}}] while getting local table`);
                            }}
                        }}

                        return errCtxTable;
                    }}
                "#));
            }

            ErrCtxIntrinsic::CreateLocalHandle => {
                // NOTE: `rep`s are global component model representations, `handle`s are component-local table indices
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();

                output.push_str(&format!(r#"
                    function {create_local_handle_fn}(componentIdx, componentLocalTable, globalRep) {{
                        const globalTable = {global_tbl}.get();
                        if (!globalTable.contains(globalRep)) {{
                            throw new Error(`missing global error-context [${{globalRep}}] during local handle create`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        const newErrCtx = {{ globalRep, refCount: 1 }};
                        const waitableIdx = cstate.handles.insert(newErrCtx);

                        const localIdx = componentLocalTable.insert(waitableIdx);
                        newErrCtx.localIdx = localIdx;

                        globalTable.get(globalRep).refCount += 1;

                        return {{ waitableIdx, localIdx }};
                    }}
                "#));
            }

            ErrCtxIntrinsic::ReserveGlobalRep => {
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let reserve_global_rep_fn = ErrCtxIntrinsic::ReserveGlobalRep.name();
                output.push_str(&format!(
                    r#"
                    function {reserve_global_rep_fn}(debugMessage, refCount) {{
                        const globalTable = {global_tbl}.get();
                        const errCtx = {{ refCount, debugMessage }};
                        const globalRep = globalTable.insert(errCtx);
                        return {{ globalRep, errCtx }};
                    }}
                "#
                ));
            }
        }
    }
}
