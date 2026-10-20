//! External bindings for the shared intrinsics defined in mod.rs.
use super::*;
impl Intrinsic {
    pub(crate) fn core_binding(&self) -> Option<IntrinsicBinding> {
        let (path, kind) = match self {
            Self::PromiseWithResolversPonyfill => {
                ("core.promiseWithResolvers", RuntimeIntrinsicKind::Method)
            }
            Self::DebugLog => ("core.debugLog", RuntimeIntrinsicKind::Method),
            Self::CoinFlip => ("core.coinFlip", RuntimeIntrinsicKind::Method),
            Self::TypeCheckValidI32 => ("core.typeCheckValidI32", RuntimeIntrinsicKind::Method),
            Self::TypeCheckAsyncFn => ("core.typeCheckAsyncFn", RuntimeIntrinsicKind::Method),
            Self::Base64Compile => ("core.base64Compile", RuntimeIntrinsicKind::Method),
            Self::ClampGuest => ("core.clampGuest", RuntimeIntrinsicKind::Method),
            Self::FetchCompile => ("core.fetchCompile", RuntimeIntrinsicKind::Method),
            Self::DisposeHostValue => ("core.disposeHostValue", RuntimeIntrinsicKind::Method),
            Self::FinalizationRegistryCreate => (
                "core.finalizationRegistryCreate",
                RuntimeIntrinsicKind::Method,
            ),
            Self::GetErrorPayload => ("core.getErrorPayload", RuntimeIntrinsicKind::Method),
            Self::GetErrorPayloadString => {
                ("core.getErrorPayloadString", RuntimeIntrinsicKind::Method)
            }
            Self::ThrowInvalidBool => ("core.throwInvalidBool", RuntimeIntrinsicKind::Method),
            Self::ThrowUninitialized => ("core.throwUninitialized", RuntimeIntrinsicKind::Method),
            Self::InstantiateCore => ("core.instantiateCore", RuntimeIntrinsicKind::Method),
            Self::RegisterGlobalMemoryForComponent => {
                ("core.registerMemory", RuntimeIntrinsicKind::Method)
            }
            Self::LookupMemoriesForComponent => {
                ("core.lookupMemories", RuntimeIntrinsicKind::Method)
            }
            Self::GetGlobalCurrentTaskMetaFn => {
                ("core.getCurrentTaskMeta", RuntimeIntrinsicKind::Method)
            }
            Self::SetGlobalCurrentTaskMetaFn => {
                ("core.setCurrentTaskMeta", RuntimeIntrinsicKind::Method)
            }
            Self::WithGlobalCurrentTaskMetaFn => {
                ("core.withCurrentTaskMeta", RuntimeIntrinsicKind::Method)
            }
            Self::WithGlobalCurrentTaskMetaFnAsync => (
                "core.withCurrentTaskMetaAsync",
                RuntimeIntrinsicKind::Method,
            ),
            Self::ClearGlobalCurrentTaskMetaFn => {
                ("core.clearCurrentTaskMeta", RuntimeIntrinsicKind::Method)
            }
            Self::SuspendingImportWrapperFn => {
                ("core.suspendingImport", RuntimeIntrinsicKind::Method)
            }
            Self::ConditionalSuspending1I32ToI32Fn => (
                "core.conditionalSuspending1I32ToI32",
                RuntimeIntrinsicKind::Method,
            ),
            Self::ConditionalSuspending2I32ToI32Fn => (
                "core.conditionalSuspending2I32ToI32",
                RuntimeIntrinsicKind::Method,
            ),
            Self::ConditionalSuspending3I32ToI32Fn => (
                "core.conditionalSuspending3I32ToI32",
                RuntimeIntrinsicKind::Method,
            ),
            Self::ConditionalSuspending3I32ToVoidFn => (
                "core.conditionalSuspending3I32ToVoid",
                RuntimeIntrinsicKind::Method,
            ),
            Self::GlobalAsyncDeterminism => (
                "core.asyncDeterminism",
                RuntimeIntrinsicKind::Value {
                    value_type: "string",
                },
            ),
            Self::ConstantI32Max => (
                "core.i32Max",
                RuntimeIntrinsicKind::Value {
                    value_type: "number",
                },
            ),
            Self::ConstantI32Min => (
                "core.i32Min",
                RuntimeIntrinsicKind::Value {
                    value_type: "number",
                },
            ),
            Self::SymbolCabiDispose => (
                "core.symbolCabiDispose",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolCabiLower => (
                "core.symbolCabiLower",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolResourceHandle => (
                "core.symbolResourceHandle",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolResourceRep => (
                "core.symbolResourceRep",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolDispose => (
                "core.symbolDispose",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolAsyncIterator => (
                "core.symbolAsyncIterator",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::SymbolIterator => (
                "core.symbolIterator",
                RuntimeIntrinsicKind::Value {
                    value_type: "symbol",
                },
            ),
            Self::AsyncFunctionCtor => (
                "core.asyncFunctionConstructor",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::PlatformReadableStreamClass => (
                "core.ReadableStream",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::ComponentError => (
                "core.ComponentError",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::WebAssemblyRuntimeError => (
                "core.RuntimeError",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::ManagedBufferClass => (
                "core.ManagedBuffer",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::BufferManagerClass => (
                "core.BufferManager",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::RepTableClass => (
                "core.RepTable",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::HasOwnProperty => (
                "core.hasOwnProperty",
                RuntimeIntrinsicKind::Value {
                    value_type: "function",
                },
            ),
            Self::FactTrapMessages => (
                "core.factTrapMessages",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::GlobalBufferManager => (
                "core.bufferManager",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::AsyncEventCodeEnum => (
                "core.asyncEventCode",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::GlobalComponentMemoryMap => (
                "core.componentMemoryMap",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::GlobalCurrentTaskMeta => (
                "core.currentTaskMeta",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::ConditionalSuspendingWasm => (
                "core.conditionalSuspendingWasm",
                RuntimeIntrinsicKind::Value {
                    value_type: "object",
                },
            ),
            Self::IsLE => (
                "core.isLE",
                RuntimeIntrinsicKind::Value {
                    value_type: "boolean",
                },
            ),
            _ => return None,
        };
        Some(IntrinsicBinding::Runtime {
            local_name: self.name(),
            path,
            kind,
        })
    }

    pub(crate) fn require_core_runtime_dependencies(&self, args: &RenderIntrinsicsArgs<'_>) {
        if self.conditional_suspending_wasm().is_some() {
            args.require_intrinsic(Self::ConditionalSuspendingWasm);
        }
        if *self == Self::SuspendingImportWrapperFn {
            for intrinsic in [
                Self::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                Self::Component(ComponentIntrinsic::RecordTrap),
                Self::Component(ComponentIntrinsic::CheckMayLeave),
                Self::AsyncTask(AsyncTaskIntrinsic::CurrentTaskMayBlock),
                Self::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask),
            ] {
                args.require_intrinsic(intrinsic);
            }
        }
    }
}

pub(super) fn runtime_options(args: &RenderIntrinsicsArgs<'_>) -> String {
    let mut options = String::new();
    if args.intrinsics.contains(&Intrinsic::FactTrapMessages) {
        writeln!(options, "factTrapMessages: {},", fact_trap_messages_js()).unwrap();
    }
    if args
        .intrinsics
        .contains(&Intrinsic::SuspendingImportWrapperFn)
    {
        let check = ComponentIntrinsic::CheckMayLeave.name();
        let record = ComponentIntrinsic::RecordTrap.name();
        let state = ComponentIntrinsic::GetOrCreateAsyncState.name();
        let task = AsyncTaskIntrinsic::GetCurrentTask.name();
        let block = AsyncTaskIntrinsic::CurrentTaskMayBlock.name();
        write!(options, r#"coreContext: {{
    checkMayLeave: componentIdx => {check}(componentIdx),
    recordTrap: (componentIdx, error, convertsRangeErrors) => {record}(componentIdx, error, convertsRangeErrors),
    throwIfInterrupted: componentIdx => {state}(componentIdx).throwIfInterrupted(),
    getCurrentTask: (componentIdx, taskID) => {task}(componentIdx, taskID)?.task,
    currentTaskMayBlock: () => {block}.value,
  }},"#).unwrap();
    }
    options
}
