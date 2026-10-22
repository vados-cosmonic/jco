//! Named external runtime imports. Keep public suffix selection and base resolution here.

use anyhow::{Result, bail, ensure};

use super::{Intrinsic, IntrinsicBinding};
use crate::{names::js_string_literal, source::Source, uwriteln};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;

mod async_task;
mod component;
mod core;
mod error_context;
mod future;
mod host;
mod lift;
mod lower;
mod waitable;
pub(crate) use self::async_task::{TaskContext, import as task_import};
pub(crate) use self::component::{ComponentContext, import as component_import};
pub(crate) use self::core::CoreContext;
pub(crate) use self::core::import as core_import;
pub(crate) use self::error_context::{ErrCtxContext, import as err_ctx_import};
pub(crate) use self::future::{FutureContext, import as future_import};
pub(crate) use self::host::{HostContext, import as host_import};
pub(crate) use self::lift::{LiftContext, import as lift_import};
pub(crate) use self::lower::{LowerContext, import as lower_import};
pub(crate) use self::waitable::{WaitableContext, import as waitable_import};

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 2;
pub(crate) const VERSION_LOCAL: &str = "_jcoRuntimeApiVersion";
pub(crate) const TABLE_GET_CONTEXT: &str = "_jcoResourceTableGetContext";

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeContext {
    Core(CoreContext),
    Component(ComponentContext),
    Waitable(WaitableContext),
    ErrCtx(ErrCtxContext),
    Task(TaskContext),
    Host(HostContext),
    Lift(LiftContext),
    Lower(LowerContext),
    Future(FutureContext),
    ResourceTableGet,
    HandleIndexSpaces,
    HandleTables,
    CallBorrows,
    CurrentBorrows,
    ResourceScopeCounter,
    ResourceScopeTasks,
    ScopeId,
    ResourceRemove,
    ResourceTransferOwn,
    ResourceTransferBorrow,
    ResourceDestructor,
    StrictNumeric,
    Bitcast32,
    Bitcast64,
    DataViewCache,
    Utf8Decoder,
    Utf16Decoder,
    Utf8Encoder,
    Utf16Encoding,
    WebIdlProxyCache,
}

impl RuntimeContext {
    pub(crate) fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            TABLE_GET_CONTEXT,
            "HANDLE_INDEX_SPACES",
            "_jcoInitializeHandleIndexSpaces",
            "HANDLE_TABLES",
            "_jcoInitializeHandleTables",
            "_jcoCallBorrowContext",
            "_jcoInitializeCallBorrows",
            "_jcoCurrentBorrowContext",
            "_jcoInitializeCurrentBorrows",
            "_jcoResourceScopeCounterContext",
            "_jcoInitializeResourceScopeCounter",
            "RESOURCE_SCOPE_TASKS",
            "_jcoInitializeResourceScopeTasks",
            "_jcoScopeIdContext",
            "_jcoInitializeScopeId",
            "_jcoResourceRemoveContext",
            "_jcoResourceTransferOwnContext",
            "_jcoResourceTransferBorrowContext",
            "_jcoResourceDestructorContext",
            "_jcoStrictNumericContext",
            "_jcoBitcast32Context",
            "_jcoBitcast64Context",
            "_jcoInitializeBitcast32",
            "_jcoInitializeBitcast64",
            "_jcoDataViewCacheContext",
            "_jcoInitializeDataViewCache",
            "_jcoInitializeUtf8Decoder",
            "_jcoInitializeUtf16Decoder",
            "_jcoInitializeUtf8Encoder",
            "_jcoInitializeUtf16Encoding",
            "_jcoUtf16EncodingContext",
            "_jcoWebIdlProxyCacheContext",
            "_jcoInitializeWebIdlProxyCache",
        ]
        .into_iter()
        .chain(CoreContext::get_global_names())
        .chain(ComponentContext::get_global_names())
        .chain(WaitableContext::get_global_names())
        .chain(ErrCtxContext::get_global_names())
        .chain(TaskContext::get_global_names())
        .chain(HostContext::get_global_names())
        .chain(LiftContext::get_global_names())
        .chain(LowerContext::get_global_names())
        .chain(FutureContext::get_global_names())
    }

    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Core(context) => context.local_name(),
            Self::Component(context) => context.local_name(),
            Self::Waitable(context) => context.local_name(),
            Self::ErrCtx(context) => context.local_name(),
            Self::Task(context) => context.local_name(),
            Self::Host(context) => context.local_name(),
            Self::Lift(context) => context.local_name(),
            Self::Lower(context) => context.local_name(),
            Self::Future(context) => context.local_name(),
            Self::ResourceTableGet => TABLE_GET_CONTEXT,
            Self::HandleIndexSpaces => "HANDLE_INDEX_SPACES",
            Self::HandleTables => "HANDLE_TABLES",
            Self::CallBorrows => "_jcoCallBorrowContext",
            Self::CurrentBorrows => "_jcoCurrentBorrowContext",
            Self::ResourceScopeCounter => "_jcoResourceScopeCounterContext",
            Self::ResourceScopeTasks => "RESOURCE_SCOPE_TASKS",
            Self::ScopeId => "_jcoScopeIdContext",
            Self::ResourceRemove => "_jcoResourceRemoveContext",
            Self::ResourceTransferOwn => "_jcoResourceTransferOwnContext",
            Self::ResourceTransferBorrow => "_jcoResourceTransferBorrowContext",
            Self::ResourceDestructor => "_jcoResourceDestructorContext",
            Self::StrictNumeric => "_jcoStrictNumericContext",
            Self::Bitcast32 => "_jcoBitcast32Context",
            Self::Bitcast64 => "_jcoBitcast64Context",
            Self::DataViewCache => "_jcoDataViewCacheContext",
            Self::Utf8Decoder => "TEXT_DECODER_UTF8",
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf8Encoder => "TEXT_ENCODER_UTF8",
            Self::Utf16Encoding => "_jcoUtf16EncodingContext",
            Self::WebIdlProxyCache => "_jcoWebIdlProxyCacheContext",
        }
    }

    /// Initializers return narrow state, never operation tables.
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (suffix, export, local_name) = match self {
            Self::Core(context) => return context.initializer(),
            Self::Component(context) => return context.initializer(),
            Self::Waitable(context) => return context.initializer(),
            Self::ErrCtx(context) => return context.initializer(),
            Self::Task(context) => return context.initializer(),
            Self::Host(context) => return context.initializer(),
            Self::Lift(context) => return context.initializer(),
            Self::Lower(context) => return context.initializer(),
            Self::Future(context) => return context.initializer(),
            Self::HandleIndexSpaces => (
                "intrinsics/resource",
                "initializeHandleIndexSpaces",
                "_jcoInitializeHandleIndexSpaces",
            ),
            Self::HandleTables => (
                "intrinsics/resource",
                "initializeHandleTables",
                "_jcoInitializeHandleTables",
            ),
            Self::CallBorrows => (
                "intrinsics/resource",
                "initializeCallBorrows",
                "_jcoInitializeCallBorrows",
            ),
            Self::CurrentBorrows => (
                "intrinsics/resource",
                "initializeCurrentBorrows",
                "_jcoInitializeCurrentBorrows",
            ),
            Self::ResourceScopeCounter => (
                "intrinsics/resource",
                "initializeResourceScopeCounter",
                "_jcoInitializeResourceScopeCounter",
            ),
            Self::ResourceScopeTasks => (
                "intrinsics/resource",
                "initializeResourceScopeTasks",
                "_jcoInitializeResourceScopeTasks",
            ),
            Self::ScopeId => (
                "intrinsics/resource",
                "initializeScopeId",
                "_jcoInitializeScopeId",
            ),
            Self::Bitcast32 => (
                "intrinsics/conversion",
                "initializeBitcast32",
                "_jcoInitializeBitcast32",
            ),
            Self::Bitcast64 => (
                "intrinsics/conversion",
                "initializeBitcast64",
                "_jcoInitializeBitcast64",
            ),
            Self::DataViewCache => (
                "intrinsics/js-helper",
                "initializeDataViewCache",
                "_jcoInitializeDataViewCache",
            ),
            Self::Utf8Decoder => (
                "intrinsics/string",
                "initializeUtf8Decoder",
                "_jcoInitializeUtf8Decoder",
            ),
            Self::Utf16Decoder => (
                "intrinsics/string",
                "initializeUtf16Decoder",
                "_jcoInitializeUtf16Decoder",
            ),
            Self::Utf8Encoder => (
                "intrinsics/string",
                "initializeUtf8Encoder",
                "_jcoInitializeUtf8Encoder",
            ),
            Self::Utf16Encoding => (
                "intrinsics/string",
                "initializeUtf16Encoding",
                "_jcoInitializeUtf16Encoding",
            ),
            Self::WebIdlProxyCache => (
                "intrinsics/webidl",
                "initializeWebIdlProxyCache",
                "_jcoInitializeWebIdlProxyCache",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix,
            export,
            local_name,
        })
    }

    pub(crate) fn dependencies(self) -> &'static [Self] {
        match self {
            Self::Core(context) => context.dependencies(),
            Self::Component(context) => context.dependencies(),
            Self::Waitable(context) => context.dependencies(),
            Self::ErrCtx(context) => context.dependencies(),
            Self::Task(context) => context.dependencies(),
            Self::Host(context) => context.dependencies(),
            Self::Lift(context) => context.dependencies(),
            Self::Lower(context) => context.dependencies(),
            Self::Future(context) => context.dependencies(),
            Self::ResourceRemove => &[Self::HandleIndexSpaces, Self::ResourceScopeTasks],
            Self::ResourceTransferOwn => &[
                Self::HandleIndexSpaces,
                Self::ResourceScopeTasks,
                Self::HandleTables,
            ],
            Self::ResourceTransferBorrow => &[
                Self::HandleIndexSpaces,
                Self::HandleTables,
                Self::ScopeId,
                Self::CallBorrows,
                Self::Task(TaskContext::Lookup),
            ],
            Self::ResourceDestructor => &[
                Self::Core(CoreContext::GlobalCurrentTaskMeta),
                Self::Task(TaskContext::Creation),
            ],
            _ => &[],
        }
    }

    pub(crate) fn collect(self, contexts: &mut Vec<Self>) {
        if contexts.contains(&self) {
            return;
        }
        for dep in self.dependencies() {
            dep.collect(contexts);
        }
        contexts.push(self);
    }

    pub(crate) fn render(self, output: &mut Source, args: &super::RenderIntrinsicsArgs<'_>) {
        let strict = args.transpile_opts.strict;
        let local = self.local_name();
        match self {
            Self::Core(context) => context.render(output, args),
            Self::Component(context) => context.render(output, args),
            Self::Waitable(context) => context.render(output, args),
            Self::ErrCtx(context) => context.render(output, args),
            Self::Task(context) => context.render(output, args),
            Self::Host(context) => context.render(output, args),
            Self::Lift(context) => context.render(output, args),
            Self::Lower(context) => context.render(output, args),
            Self::Future(context) => context.render(output, args),
            Self::ResourceRemove => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS }};"
            ),
            Self::ResourceTransferOwn => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS, tables: HANDLE_TABLES }};"
            ),
            Self::ResourceTransferBorrow => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, tables: HANDLE_TABLES, scope: _jcoScopeIdContext, callBorrows: _jcoCallBorrowContext, taskLookup: _jcoTaskLookupContext }};"
            ),
            Self::ResourceDestructor => uwriteln!(
                output,
                "const {local} = {{ registers: CURRENT_TASK_META, creation: _jcoTaskCreateContext }};"
            ),
            Self::ResourceTableGet => uwriteln!(
                output,
                "const {TABLE_GET_CONTEXT} = {{ RuntimeError: WebAssembly.RuntimeError }};"
            ),
            Self::StrictNumeric => {
                uwriteln!(output, "const {local} = {{ strict: {strict} }};")
            }
            Self::HandleIndexSpaces
            | Self::HandleTables
            | Self::CallBorrows
            | Self::CurrentBorrows
            | Self::ResourceScopeCounter
            | Self::ResourceScopeTasks
            | Self::ScopeId
            | Self::Bitcast32
            | Self::Bitcast64
            | Self::DataViewCache
            | Self::Utf8Decoder
            | Self::Utf16Decoder
            | Self::Utf8Encoder
            | Self::Utf16Encoding
            | Self::WebIdlProxyCache => {
                let initialize = self.initializer().unwrap().local_name;
                uwriteln!(output, "const {local} = {initialize}();")
            }
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeInitializer {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) local_name: &'static str,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeImportKind {
    Call,
    Value,
    LiveReference {
        expression: &'static str,
    },
    /// The binding refers to the selected context initializer's returned value.
    InitializedValue,
    /// Selected class or native constructor; preserve new/instanceof/statics.
    InitializedConstructor,
}

/// A named operation or initialized value, with separately selected capabilities.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeImport {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) context: Option<RuntimeContext>,
    pub(crate) kind: RuntimeImportKind,
}

/// Resolve an informal runtime package/directory contract without consulting the filesystem.
pub(crate) fn module_specifier(base: &str, suffix: &str) -> Result<String> {
    ensure!(
        !base.trim().is_empty() && !base.chars().any(char::is_control),
        "cmRuntimeEsModule must be a non-empty base specifier without control characters"
    );
    let directory_path = base == "."
        || base == ".."
        || base.starts_with("./")
        || base.starts_with("../")
        || base.starts_with('/');
    let url = if !directory_path
        && let Some((scheme, _)) = base
            .split_once(':')
            .filter(|(prefix, _)| !prefix.contains('/'))
    {
        ensure!(
            ["file", "http", "https"]
                .iter()
                .any(|supported| scheme.eq_ignore_ascii_case(supported))
                && base.starts_with(&format!("{scheme}://")),
            "cmRuntimeEsModule has an unsupported URL scheme; use a package, directory, or file/HTTP(S) URL (including file URLs on Windows)"
        );
        true
    } else {
        false
    };
    let directory = url || directory_path;
    let base = base.strip_suffix('/').unwrap_or(base);
    if directory {
        ensure!(
            !base.contains(['?', '#']),
            "cmRuntimeEsModule directory bases must not contain a query or fragment"
        );
        if [".js", ".mjs", ".cjs"]
            .iter()
            .any(|ext| base.ends_with(ext))
        {
            bail!(
                "cmRuntimeEsModule now identifies an API-v2 runtime directory base, not a provider file; replace the file specifier with a directory containing runtime.js and intrinsics/*.js"
            );
        }
    }
    Ok(format!(
        "{base}/{suffix}{}",
        if directory { ".js" } else { "" }
    ))
}

/// Query the same descriptor dependency graph used to select state and constructors.
pub(crate) fn uses_context(intrinsics: &BTreeSet<Intrinsic>, requested: RuntimeContext) -> bool {
    let mut contexts = Vec::new();
    for intrinsic in intrinsics {
        if let IntrinsicBinding::Runtime {
            import:
                RuntimeImport {
                    context: Some(context),
                    ..
                },
            ..
        } = intrinsic.binding(true)
        {
            context.collect(&mut contexts);
        }
    }
    contexts.contains(&requested)
}

/// Called after dependency discovery, so transitive inline calls also get their imports.
pub(crate) fn render_imports(output: &mut Source, intrinsics: &BTreeSet<Intrinsic>, base: &str) {
    let mut modules = BTreeMap::<&str, BTreeSet<(&str, &str)>>::new();
    for intrinsic in intrinsics {
        if let IntrinsicBinding::Runtime { local_name, import } = intrinsic.binding(true) {
            if matches!(
                import.kind,
                RuntimeImportKind::Call | RuntimeImportKind::Value
            ) {
                modules
                    .entry(import.suffix)
                    .or_default()
                    .insert((import.export, local_name));
            }
            let mut contexts = Vec::new();
            if let Some(context) = import.context {
                context.collect(&mut contexts);
            }
            for initializer in contexts.into_iter().filter_map(RuntimeContext::initializer) {
                modules
                    .entry(initializer.suffix)
                    .or_default()
                    .insert((initializer.export, initializer.local_name));
            }
        }
    }
    if modules.is_empty() {
        return;
    }
    modules
        .entry("runtime")
        .or_default()
        .insert(("CM_RUNTIME_API_VERSION", VERSION_LOCAL));
    for (suffix, names) in modules {
        let names = names
            .into_iter()
            .map(|(export, local)| format!("{export} as {local}"))
            .collect::<Vec<_>>()
            .join(", ");
        let specifier =
            module_specifier(base, suffix).expect("runtime base was validated before codegen");
        uwriteln!(
            output,
            "import {{ {names} }} from {};",
            js_string_literal(&specifier)
        );
    }
}

pub(crate) fn resource_import(intrinsic: super::resource::ResourceIntrinsic) -> RuntimeImport {
    use super::resource::ResourceIntrinsic::*;
    use RuntimeContext as C;
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        ResourceTableFlag => ("tableFlag", None, K::Value),
        HandleIndexSpaces => (
            "initializeHandleIndexSpaces",
            Some(C::HandleIndexSpaces),
            K::InitializedValue,
        ),
        GetHandleIndexSpace => ("getHandleIndexSpace", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableCreateBorrow => ("tableCreateBorrow", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableCreateOwn => ("tableCreateOwn", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableGet => ("tableGet", Some(C::ResourceTableGet), K::Call),
        ResourceTableEnsureBorrowDrop => ("tableEnsureBorrowDrop", None, K::Call),
        ResourceTableRemove => ("tableRemove", Some(C::ResourceRemove), K::Call),
        ResourceCallBorrows => (
            "initializeCallBorrows",
            Some(C::CallBorrows),
            K::LiveReference {
                expression: "_jcoCallBorrowContext.borrows",
            },
        ),
        ResourceScopeCounter => (
            "initializeResourceScopeCounter",
            Some(C::ResourceScopeCounter),
            K::LiveReference {
                expression: "_jcoResourceScopeCounterContext.value",
            },
        ),
        ResourceScopeTasks => (
            "initializeResourceScopeTasks",
            Some(C::ResourceScopeTasks),
            K::InitializedValue,
        ),
        ResourceTransferBorrow => ("transferBorrow", Some(C::ResourceTransferBorrow), K::Call),
        ResourceTransferBorrowValidLifting => (
            "transferBorrowValidLifting",
            Some(C::ResourceTransferBorrow),
            K::Call,
        ),
        ResourceTransferOwn => ("transferOwn", Some(C::ResourceTransferOwn), K::Call),
        CurResourceBorrows => (
            "initializeCurrentBorrows",
            Some(C::CurrentBorrows),
            K::LiveReference {
                expression: "_jcoCurrentBorrowContext.borrows",
            },
        ),
        ResourceDestructorCall => ("callDestructor", Some(C::ResourceDestructor), K::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/resource",
        export,
        context,
        kind,
    }
}

pub(crate) fn resource_owner_import(intrinsic: Intrinsic) -> RuntimeImport {
    let (export, context, kind) = match intrinsic {
        Intrinsic::HandleTables => (
            "initializeHandleTables",
            RuntimeContext::HandleTables,
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::ScopeId => (
            "initializeScopeId",
            RuntimeContext::ScopeId,
            RuntimeImportKind::LiveReference {
                expression: "_jcoScopeIdContext.value",
            },
        ),
        _ => unreachable!(),
    };
    RuntimeImport {
        suffix: "intrinsics/resource",
        export,
        context: Some(context),
        kind,
    }
}

/// Capabilities which still live in generated code are looked up only when used.
pub(crate) fn discover_inline_dependencies(
    intrinsic: Intrinsic,
    args: &super::RenderIntrinsicsArgs<'_>,
) {
    core::discover(intrinsic, args);
    lift::discover(intrinsic, args);
    lower::discover(intrinsic, args);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{RenderIntrinsicsArgs, render_intrinsics, resource::ResourceIntrinsic};

    #[test]
    fn transitive_named_calls_share_task_owners_and_deduplicate_imports() {
        let mut intrinsics = BTreeSet::from([Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrow,
        )]);
        let opts = TranspileOpts::builder()
            .name("mixed".into())
            .cm_runtime_es_module("custom-runtime".into())
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        assert!(source.contains("taskLookup: _jcoTaskLookupContext"));
        assert!(source.contains("const CURRENT_TASK_META = _jcoInitializeTaskRegisters();"));
        assert!(!source.contains("function getCurrentTask("));
        assert!(!source.contains("getTask: (componentIdx, taskID) =>"));
        assert!(!source.contains("class FutureValue"));
        assert_eq!(
            source
                .matches("const ASYNC_TASKS_BY_COMPONENT_IDX =")
                .count(),
            1
        );
        assert!(!source.contains("function rscTableCreateBorrow("));
        assert!(source.contains("const HANDLE_TABLES"));
        assert!(!source.contains("function rscTableGet("));
        assert!(!source.contains("_jcoRuntimeProvider"));
        let mut imports = Source::default();
        render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert_eq!(
            imports
                .matches("transferBorrow as resourceTransferBorrow")
                .count(),
            1
        );
        assert_eq!(imports.matches("initializeHandleIndexSpaces as").count(), 1);
        assert_eq!(source.matches("const HANDLE_INDEX_SPACES =").count(), 1);
        assert_eq!(imports.matches("CM_RUNTIME_API_VERSION as").count(), 1);
    }

    #[test]
    fn resource_context_needs_no_unrelated_initializers() {
        let mut intrinsics =
            BTreeSet::from([Intrinsic::Resource(ResourceIntrinsic::ResourceTableGet)]);
        let opts = TranspileOpts::builder()
            .name("resource".into())
            .cm_runtime_es_module("custom-runtime".into())
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        assert_eq!(intrinsics.len(), 1);
        assert!(source.contains("RuntimeError: WebAssembly.RuntimeError"));
        for unrelated in [
            "T_FLAG",
            "HANDLE_TABLES",
            "TextEncoder",
            "TextDecoder",
            "WebAssembly.Global",
            "Suspending",
            "new Map",
            "new Int32Array",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
    }

    #[test]
    fn resolves_runtime_bases() {
        for (base, expected) in [
            ("@scope/runtime", "@scope/runtime/intrinsics/resource"),
            ("custom-runtime/", "custom-runtime/intrinsics/resource"),
            ("something.js", "something.js/intrinsics/resource"),
            ("custom/nested", "custom/nested/intrinsics/resource"),
            ("./runtime", "./runtime/intrinsics/resource.js"),
            ("../runtime/", "../runtime/intrinsics/resource.js"),
            ("/runtime/", "/runtime/intrinsics/resource.js"),
            ("/", "/intrinsics/resource.js"),
            (
                "./runtime:version",
                "./runtime:version/intrinsics/resource.js",
            ),
            (".", "./intrinsics/resource.js"),
            (
                "file:///C:/runtime/",
                "file:///C:/runtime/intrinsics/resource.js",
            ),
            ("file:///a%20b/", "file:///a%20b/intrinsics/resource.js"),
            (
                "https://example.test/runtime/",
                "https://example.test/runtime/intrinsics/resource.js",
            ),
            (
                "HTTPS://example.test/runtime/",
                "HTTPS://example.test/runtime/intrinsics/resource.js",
            ),
            (
                "http://example.test/a//b",
                "http://example.test/a//b/intrinsics/resource.js",
            ),
            ("./a b'\"", "./a b'\"/intrinsics/resource.js"),
        ] {
            assert_eq!(
                module_specifier(base, "intrinsics/resource").unwrap(),
                expected
            );
        }
    }

    #[test]
    fn rejects_unsupported_bases() {
        for base in [
            "",
            " ",
            "a\nb",
            "a\0b",
            "data:text/javascript,",
            "ftp://example.test/a",
            "C:\\runtime",
            "./a?b",
            "file:///a#b",
            "https://example.test/a?q",
        ] {
            assert!(module_specifier(base, "runtime").is_err(), "{base}");
        }
        for base in [
            "./provider.js",
            "../provider.mjs/",
            "file:///provider.cjs",
            "https://example.test/provider.js",
        ] {
            assert!(
                module_specifier(base, "runtime")
                    .unwrap_err()
                    .to_string()
                    .contains("directory base")
            );
        }
    }
}
