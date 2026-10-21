//! Named error-context operations and their actual per-store owners.
use super::{
    ComponentContext, CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::error_context::ErrCtxIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum ErrCtxContext {
    GlobalClass,
    Registrations,
    LocalTables,
    LocalTable,
    Handle,
    New,
    Transfer,
}
impl ErrCtxContext {
    const ALL: [Self; 7] = [
        Self::GlobalClass,
        Self::Registrations,
        Self::LocalTables,
        Self::LocalTable,
        Self::Handle,
        Self::New,
        Self::Transfer,
    ];
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        Self::ALL
            .iter()
            .flat_map(|context| {
                [
                    Some(context.local_name()),
                    context.initializer().map(|init| init.local_name),
                ]
            })
            .flatten()
    }
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::GlobalClass => "GlobalErrorContextTable",
            Self::Registrations => "ERR_CTX_TABLES",
            Self::LocalTables => "errCtxLocal",
            Self::LocalTable => "_jcoErrorContextLocalTableContext",
            Self::Handle => "_jcoErrorContextHandleContext",
            Self::New => "_jcoErrorContextNewContext",
            Self::Transfer => "_jcoErrorContextTransferContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::GlobalClass => (
                "initializeGlobalErrorContextTableClass",
                "_jcoInitializeGlobalErrorContextTableClass",
            ),
            Self::Registrations => (
                "initializeErrorContextTableRegistrations",
                "_jcoInitializeErrorContextTableRegistrations",
            ),
            Self::LocalTables => (
                "initializeLocalErrorContextTables",
                "_jcoInitializeLocalErrorContextTables",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/error-context",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component as C, Core, ErrCtx as E};
        match self {
            Self::GlobalClass => &[Core(CoreContext::RepTableClass)],
            Self::LocalTable => &[E(Self::LocalTables), Core(CoreContext::RepTableClass)],
            Self::Handle => &[E(Self::GlobalClass), C(ComponentContext::StateLookup)],
            Self::New => &[E(Self::Handle), E(Self::LocalTable)],
            Self::Transfer => &[E(Self::New), E(Self::Registrations)],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments = if self == Self::GlobalClass {
                "RepTable"
            } else {
                ""
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::LocalTable => "localTables: errCtxLocal, RepTable",
            Self::Handle => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext"
            }
            Self::New => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext"
            }
            Self::Transfer => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext, tables: ERR_CTX_TABLES"
            }
            _ => unreachable!("state initializers handled above"),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}

pub(crate) fn import(intrinsic: ErrCtxIntrinsic) -> RuntimeImport {
    use ErrCtxContext as C;
    use ErrCtxIntrinsic::*;
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        ComponentGlobalTable => (
            "initializeGlobalErrorContextTableClass",
            C::GlobalClass,
            K::InitializedConstructor,
        ),
        GlobalErrCtxTableMap => (
            "initializeErrorContextTableRegistrations",
            C::Registrations,
            K::InitializedValue,
        ),
        ComponentLocalTable => (
            "initializeLocalErrorContextTables",
            C::LocalTables,
            K::InitializedValue,
        ),
        ErrorContextNew => ("errCtxNew", C::New, K::Call),
        ErrorContextDrop => ("errCtxDrop", C::New, K::Call),
        ErrorContextTransfer => ("errCtxTransfer", C::Transfer, K::Call),
        ErrorContextDebugMessage => ("errCtxDebugMessage", C::Handle, K::Call),
        GetLocalTable => ("errCtxGetLocalTable", C::LocalTable, K::Call),
        GlobalRefCountAdd => ("errCtxGlobalRefCountAdd", C::GlobalClass, K::Call),
        CreateLocalHandle => ("errCtxCreateLocalHandle", C::Handle, K::Call),
        ReserveGlobalRep => ("errCtxReserveGlobalRep", C::GlobalClass, K::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/error-context",
        export,
        context: Some(RuntimeContext::ErrCtx(context)),
        kind,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic, IntrinsicBinding, lift::LiftIntrinsic, lower::LowerIntrinsic,
            render_intrinsics,
        },
    };

    fn generated(selected: impl IntoIterator<Item = Intrinsic>) -> String {
        let mut intrinsics = selected.into_iter().collect();
        let opts = TranspileOpts::builder()
            .name("error-context".into())
            .cm_runtime_es_module("custom-runtime".into())
            .build();
        render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        )
        .to_string()
    }

    #[test]
    fn error_context_variants_use_typed_named_exports_and_deduplicated_owners() {
        use ErrCtxIntrinsic::*;
        let variants = [
            ComponentGlobalTable,
            GlobalErrCtxTableMap,
            ComponentLocalTable,
            ErrorContextNew,
            ErrorContextDrop,
            ErrorContextTransfer,
            ErrorContextDebugMessage,
            GetLocalTable,
            GlobalRefCountAdd,
            CreateLocalHandle,
            ReserveGlobalRep,
        ];
        let source = generated(variants.map(Intrinsic::ErrCtx));
        for variant in variants {
            let intrinsic = Intrinsic::ErrCtx(variant);
            let IntrinsicBinding::Runtime { import, .. } = intrinsic.binding(true) else {
                panic!("missing named export");
            };
            assert_eq!(import.suffix, "intrinsics/error-context");
            assert_eq!(import, super::import(variant));
            assert!(matches!(
                intrinsic.binding(false),
                IntrinsicBinding::Inline { .. }
            ));
        }
        for once in [
            "const GlobalErrorContextTable = _jcoInitializeGlobalErrorContextTableClass(RepTable);",
            "const ERR_CTX_TABLES = _jcoInitializeErrorContextTableRegistrations();",
            "const errCtxLocal = _jcoInitializeLocalErrorContextTables();",
        ] {
            assert_eq!(source.matches(once).count(), 1, "{once}");
        }
        for omitted in [
            "class GlobalErrorContextTable",
            "function errCtxNew(",
            "function errCtxGetLocalTable(",
            "class RepTable",
            "function getCurrentTask(",
        ] {
            assert!(!source.contains(omitted), "{omitted}");
        }
        // This replaces the former inline error-context body assertion in the
        // component suite: selected named helpers now consume the shared view.
        assert!(source.contains(
            "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext"
        ));
        assert_eq!(
            Intrinsic::ErrCtx(ErrorContextDebugMessage)
                .binding(true)
                .call("options, handle, ptr"),
            "errCtxDebugMessage(_jcoErrorContextHandleContext, options, handle, ptr)"
        );
    }

    #[test]
    fn global_reservation_does_not_select_component_or_local_state() {
        let source = generated([Intrinsic::ErrCtx(ErrCtxIntrinsic::ReserveGlobalRep)]);
        assert!(source.contains("_jcoInitializeGlobalErrorContextTableClass(RepTable)"));
        for unrelated in [
            "ASYNC_STATE",
            "errCtxLocal",
            "ERR_CTX_TABLES",
            "Waitable",
            "CURRENT_TASK_META",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
        let source = generated([
            Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentLocalTable),
            Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalErrCtxTableMap),
        ]);
        assert!(!source.contains("RepTable"));
        assert!(!source.contains("ComponentAsyncState"));
    }

    #[test]
    fn lift_and_lower_shorthand_calls_receive_actual_error_context_owners() {
        for intrinsic in [
            Intrinsic::Lift(LiftIntrinsic::LiftFlatErrorContext),
            Intrinsic::Lower(LowerIntrinsic::LowerFlatErrorContext),
        ] {
            let source = generated([intrinsic]);
            assert!(source.contains("errCtxGetLocalTable(_jcoErrorContextLocalTableContext, "));
            assert!(source.contains("errCtxGlobalRefCountAdd(GlobalErrorContextTable, "));
            assert!(!source.contains("errCtxGetLocalTable(componentIdx"));
            assert!(!source.contains("errCtxGetLocalTable(ctx.componentIdx"));
            assert!(!source.contains("errCtxGlobalRefCountAdd(errCtx"));
        }
        let source = generated([Intrinsic::Lower(LowerIntrinsic::LowerFlatErrorContext)]);
        assert!(source.contains("errCtxCreateLocalHandle(_jcoErrorContextHandleContext, "));
        assert!(source.contains("GlobalErrorContextTable.get()"));
    }

    #[test]
    fn callback_references_preserve_identity_inline_and_undefined_receiver_named() {
        let transfer = Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextTransfer);
        assert_eq!(
            transfer.binding(false).callback_reference(),
            "errCtxTransfer"
        );
        assert_eq!(
            transfer.binding(true).callback_reference(),
            "errCtxTransfer.bind(void 0, _jcoErrorContextTransferContext)"
        );
        let new = Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextNew);
        assert_eq!(
            new.binding(false).bind_callback("metadata"),
            "errCtxNew.bind(null, metadata)"
        );
        assert_eq!(
            new.binding(true).bind_callback("metadata"),
            "errCtxNew.bind(null, _jcoErrorContextNewContext, metadata)"
        );
    }
}
