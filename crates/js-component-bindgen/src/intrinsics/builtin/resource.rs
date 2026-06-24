use std::fmt::Write;

use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs, ResourceIntrinsic};
use crate::source::Source;
use crate::uwriteln;

impl super::BuiltinIntrinsicRenderer {
    /// Render a [`ResourceIntrinsic`]
    pub(crate) fn render_resource(
        &self,
        intrinsic: &ResourceIntrinsic,
        output: &mut Source,
        _args: &RenderIntrinsicsArgs,
    ) {
        match intrinsic {
            ResourceIntrinsic::CurResourceBorrows => output.push_str(
                "
                let curResourceBorrows = [];
            ",
            ),

            ResourceIntrinsic::ResourceTableFlag => output.push_str(
                "
                const T_FLAG = 1 << 30;
            ",
            ),

            ResourceIntrinsic::ResourceTableCreateBorrow => {
                uwriteln!(
                    output,
                    r#"
                      function rscTableCreateBorrow(table, rep, scopeId) {{
                          if (scopeId === undefined) {{ throw new Error("missing scopeId"); }}
                          const free = table[0] & ~T_FLAG;
                          if (free === 0) {{
                              table.push(scopeId);
                              table.push(rep);
                              return (table.length >> 1) - 1;
                          }}
                          table[0] = table[free << 1];
                          table[free << 1] = scopeId;
                          table[(free << 1) + 1] = rep;
                          return free;
                      }}
                    "#,
                );
            }

            ResourceIntrinsic::ResourceTableCreateOwn => output.push_str(
                "
                function rscTableCreateOwn(table, rep) {
                    const free = table[0] & ~T_FLAG;
                    table._createdReps.add(rep);
                    if (free === 0) {
                        table.push(0);
                        table.push(rep | T_FLAG);
                        return (table.length >> 1) - 1;
                    }
                    table[0] = table[free << 1];
                    table[free << 1] = 0;
                    table[(free << 1) + 1] = rep | T_FLAG;
                    return free;
                }
            ",
            ),

            ResourceIntrinsic::ResourceTableGet => output.push_str(
                "
                function rscTableGet(table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (rep === 0 || (scope & T_FLAG) !== 0) {
                        throw new TypeError('Invalid handle');
                    }
                    return { rep, scope, own };
                }
            ",
            ),

            ResourceIntrinsic::ResourceTableEnsureBorrowDrop => output.push_str(
                "
                function rscTableEnsureBorrowDrop(table, handle, scope) {
                    if (table[handle << 1] === scope) {
                        throw new TypeError('Resource borrow was not dropped at end of call');
                    }
                }
            ",
            ),

            ResourceIntrinsic::ResourceTableRemove => output.push_str(
                r#"
                function rscTableRemove(table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (val === 0 || (scope & T_FLAG) !== 0) {
                        throw new TypeError("Invalid handle");
                    }
                    table[handle << 1] = table[0] | T_FLAG;
                    table[0] = handle | T_FLAG;
                    return { rep, scope, own };
                }
            "#,
            ),

            ResourceIntrinsic::ResourceTransferBorrow => {
                let resource_transfer_borrow_fn = intrinsic.name();
                let handle_tables = Intrinsic::HandleTables.name();
                let resource_borrows = ResourceIntrinsic::ResourceCallBorrows.name();
                let rsc_table_remove = ResourceIntrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = ResourceIntrinsic::ResourceTableCreateBorrow.name();
                let scope_id = Intrinsic::ScopeId.name();

                uwriteln!(
                    output,
                    r#"
                    function {resource_transfer_borrow_fn}(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const fromHandle = fromTable[(handle << 1) + 1];
                        const isOwn = (fromHandle & T_FLAG) !== 0;
                        const rep = isOwn ? fromHandle & ~T_FLAG : {rsc_table_remove}(fromTable, fromHandle).rep;

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [T_FLAG, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        if (toTable._createdReps.has(rep)) {{
                            return rep;
                        }}

                        const newHandle = {rsc_table_create_borrow}(toTable, rep, {scope_id});
                        {resource_borrows}.push({{ rid: toTid, handle: newHandle }});
                        return newHandle;
                    }}
                "#
                );
            }

            ResourceIntrinsic::ResourceTransferBorrowValidLifting => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = ResourceIntrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = ResourceIntrinsic::ResourceTableCreateBorrow.name();
                let scope_id = Intrinsic::ScopeId.name();
                output.push_str(&format!(r#"
                    function resourceTransferBorrowValidLifting(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const isOwn = (fromTable[(handle << 1) + 1] & T_FLAG) !== 0;
                        const rep = isOwn ? fromTable[(handle << 1) + 1] & ~T_FLAG : {rsc_table_remove}(fromTable, handle).rep;

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [T_FLAG, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        if (toTable._createdReps.has(rep)) {{
                            return rep;
                        }}

                        return {rsc_table_create_borrow}(toTable, rep, {scope_id});
                    }}
                "#));
            }

            ResourceIntrinsic::ResourceTransferOwn => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = ResourceIntrinsic::ResourceTableRemove.name();
                let rsc_table_create_own = ResourceIntrinsic::ResourceTableCreateOwn.name();
                output.push_str(&format!(
                    r#"
                    function resourceTransferOwn(handle, fromTid, toTid) {{
                        const {{ rep }} = {rsc_table_remove}({handle_tables}[fromTid], handle);

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [T_FLAG, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        const newHandle = {rsc_table_create_own}(toTable, rep);
                        return newHandle;
                    }}
                "#
                ));
            }

            ResourceIntrinsic::ResourceCallBorrows => {
                let name = intrinsic.name();
                output.push_str(&format!("let {name} = [];"));
            }
        }
    }
}
