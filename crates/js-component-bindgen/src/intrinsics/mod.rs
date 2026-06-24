//! Intrinsics used from JS

use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use crate::TranspileOpts;
use crate::source::Source;

pub(crate) mod conversion;
use conversion::ConversionIntrinsic;

pub(crate) mod js_helper;
use js_helper::JsHelperIntrinsic;

pub(crate) mod webidl;
use webidl::WebIdlIntrinsic;

pub(crate) mod string;
use string::StringIntrinsic;

pub(crate) mod resource;
use resource::ResourceIntrinsic;

pub(crate) mod lift;
use lift::LiftIntrinsic;

pub(crate) mod lower;
use lower::LowerIntrinsic;

pub(crate) mod component;
use component::ComponentIntrinsic;

pub(crate) mod p3;
use p3::async_future::AsyncFutureIntrinsic;
use p3::async_stream::AsyncStreamIntrinsic;
use p3::async_task::AsyncTaskIntrinsic;
use p3::error_context::ErrCtxIntrinsic;
use p3::host::HostIntrinsic;
use p3::waitable::WaitableIntrinsic;

pub(crate) mod builtin;
use builtin::BuiltinIntrinsicRenderer;

pub(crate) mod external_js;
use external_js::ExternalJsRenderer;

/// Profile for determinism to be used by async implementation
#[derive(Debug, Default, PartialEq, Eq)]
pub enum AsyncDeterminismProfile {
    /// Allow random ordering non-determinism
    #[default]
    Random,

    /// Require determinism
    #[allow(unused)]
    Deterministic,
}

impl std::fmt::Display for AsyncDeterminismProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Deterministic => "deterministic",
                Self::Random => "random",
            }
        )
    }
}

/// List of all intrinsics that are used by these
///
/// These intrinsics refer to JS code that is included in order to make
/// transpiled WebAssembly components and their imports/exports functional
/// in the relevant JS context.
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum Intrinsic {
    JsHelper(JsHelperIntrinsic),
    WebIdl(WebIdlIntrinsic),
    Conversion(ConversionIntrinsic),
    String(StringIntrinsic),
    Resource(ResourceIntrinsic),
    ErrCtx(ErrCtxIntrinsic),
    AsyncTask(AsyncTaskIntrinsic),
    Waitable(WaitableIntrinsic),
    Lift(LiftIntrinsic),
    Lower(LowerIntrinsic),
    AsyncStream(AsyncStreamIntrinsic),
    AsyncFuture(AsyncFutureIntrinsic),
    Component(ComponentIntrinsic),
    Host(HostIntrinsic),

    // Polyfills
    PromiseWithResolversPonyfill,

    /// Enable debug logging
    DebugLog,

    /// Global setting for determinism (used in async)
    GlobalAsyncDeterminism,

    /// Randomly produce a boolean true/false
    CoinFlip,

    // Basic type helpers
    ConstantI32Max,
    ConstantI32Min,
    TypeCheckValidI32,
    TypeCheckAsyncFn,
    AsyncFunctionCtor,

    Base64Compile,
    ClampGuest,
    FetchCompile,

    // Globals
    SymbolCabiDispose,
    SymbolCabiLower,
    SymbolResourceHandle,
    SymbolResourceRep,
    SymbolDispose,
    SymbolAsyncIterator,
    SymbolIterator,
    ScopeId,
    HandleTables,

    /// Class that conforms to a `ReadableStreams`-like interface and is usable externally
    ///
    /// This is normally the `ReadableStream` class provided by the platform itself.
    PlatformReadableStreamClass,

    // Global Initializers
    FinalizationRegistryCreate,

    // Global classes
    ComponentError,

    // WASI object helpers
    GetErrorPayload,
    GetErrorPayloadString,

    /// Class that manages (and synchronizes) writes to managed buffers
    ManagedBufferClass,

    /// Buffer manager that is used to synchronize component writes
    BufferManagerClass,

    /// Global for an instantiated buffer manager singleton
    GlobalBufferManager,

    /// Reusable table structure for holding canonical ABI objects by their representation/identifier of (e.g. resources, waitables, etc)
    ///
    /// Representations of objects stored in one of these tables is a u32 (0 is expected to be an invalid index).
    RepTableClass,

    /// Event codes used for async, as a JS enum
    AsyncEventCodeEnum,

    // JS helper functions
    IsLE,
    ThrowInvalidBool,
    ThrowUninitialized,
    HasOwnProperty,
    InstantiateCore,

    /// Tracking of component memories
    GlobalComponentMemoryMap,

    /// Tracking of component memories
    RegisterGlobalMemoryForComponent,

    /// Tracking of component memories
    LookupMemoriesForComponent,

    /// Global that tracks the current task
    GlobalCurrentTaskMeta,

    /// Gets the current global task state
    GetGlobalCurrentTaskMetaFn,

    /// Gets the current global task state
    SetGlobalCurrentTaskMetaFn,

    /// Execute a closure with a certain set current task
    WithGlobalCurrentTaskMetaFn,

    /// Execute an async closure with a certain set current task
    WithGlobalCurrentTaskMetaFnAsync,

    /// Clear the global task meta
    ClearGlobalCurrentTaskMetaFn,
}

/// Sources of intrinsics
#[non_exhaustive]
pub enum IntrinsicRenderer {
    /// Built-in "in-place" intrinsic provider
    Builtin(BuiltinIntrinsicRenderer),
    /// External JS package
    ///
    /// The string should be the JS import (e.g. 'your-package', '@bytecodealliance/other-pkg', './local.js')
    ExternalJs(ExternalJsRenderer),
}

/// Metadata required an intrinsic that was required
#[non_exhaustive]
pub struct RequiredIntrinsicMeta<T> {
    /// The required intrinsic
    intrinsic: T,
    /// Name of the intrinsic
    name: Option<String>,
    /// Other intrinsics required by the given intrinsic (if any)
    deps: Vec<T>,
}

/// Trait that characterizes all intrinsic rendering functionality
pub trait IntrinsicRender {
    type SingleIntrinsic: Eq;

    // PLAN FOR RENDERING TRAMPOLINES?
    // - we call get_intrinsic_for_trampoline for all trampolines that were actually used
    // - we call get_intrinsic_deps() deps for all those trampolines
    // - we render all single intrinsics, with successive passes to clear out intrinsics with no deps

    // Get the appropriate intrinsic for a given trampoline
    //
    // TODO: we need a wrapper around trampoline rather than breaking w/ wastime-environ every time
    //
    // fn get_intrinsic_for_trampoline(&self, trampoline: &wasmtime_environ::component::Trampoline) -> RequiredIntriniscMeta<Self::SingleIntrinsic>;

    // PLAN FOR RENDERING INSTRUCTIONS?
    // - we call get_intrinsic_for_instruction for all instructions that were actually used
    // - we call get_intrinsic_deps() deps for all those trampolines
    // - we render the body of the instruction w/ instructionCtx passed through so people can reuse state
    // - We can show an instruction nesting/trace (?) -- we're inside a CallWasm > LiftResult

    // Get the appropriate intrinsic for a given instruction
    //
    // TODO: we need a wrapper around trampoline rather than breaking w/ wastime-environ every time
    //
    // fn get_intrinsic_for_instruction(&self, trampoline: &wasmtime_environ::component::Trampoline) -> RequiredIntriniscMeta<Self::SingleIntrinsic>;

    /// Render a single intrinsic
    fn render(
        &self,
        intrinsic: &Self::SingleIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs,
    );
}


/// Arguments to `render_intrinsics`
#[derive(bon::Builder)]
#[non_exhaustive]
pub struct RenderIntrinsicsArgs<'a> {
    /// List of intrinsics being built for use
    pub(crate) intrinsics: &'a mut BTreeSet<Intrinsic>,
    /// Whether instantiation has occurred
    #[builder(default)]
    pub(crate) instantiation_occurred: bool,
    /// The kind of determinism to use
    #[builder(default)]
    pub(crate) determinism_profile: AsyncDeterminismProfile,
    /// Options provided when performing transpilation
    pub(crate) transpile_opts: &'a TranspileOpts,
}

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(args: RenderIntrinsicsArgs) -> Source {
    let mut output = Source::default();
    let mut rendered_intrinsics = HashSet::new();

    // TODO: allow for building a dynamic one
    let renderer = BuiltinIntrinsicRenderer;

    // TODO: this hack should go way
    // // Render some early intrinsics
    // for intrinsic in EARLY_INTRINSICS {
    //     renderer.render(&intrinsic, &mut output, &args);
    //     rendered_intrinsics.insert(intrinsic.name());
    // }

    // TODO: last minute dep enhancements should all go away
    // // Add intrinsics to the list we must render
    // if args.intrinsics.contains(&Intrinsic::GetErrorPayload)
    //     || args.intrinsics.contains(&Intrinsic::GetErrorPayloadString)
    // {
    //     args.intrinsics.insert(Intrinsic::HasOwnProperty);
    // }
    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::String(StringIntrinsic::Utf16Encode))
    // {
    //     args.intrinsics.insert(Intrinsic::IsLE);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Conversion(ConversionIntrinsic::F32ToI32))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::Conversion(ConversionIntrinsic::I32ToF32))
    // {
    //     output.push_str(
    //         "
    //         const i32ToF32I = new Int32Array(1);
    //         const i32ToF32F = new Float32Array(i32ToF32I.buffer);
    //     ",
    //     );
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Conversion(ConversionIntrinsic::F64ToI64))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::Conversion(ConversionIntrinsic::I64ToF64))
    // {
    //     output.push_str(
    //         "
    //         const i64ToF64I = new BigInt64Array(1);
    //         const i64ToF64F = new Float64Array(i64ToF64I.buffer);
    //     ",
    //     );
    // }

    // if args.intrinsics.contains(&Intrinsic::Resource(
    //     ResourceIntrinsic::ResourceTransferBorrow,
    // )) || args.intrinsics.contains(&Intrinsic::Resource(
    //     ResourceIntrinsic::ResourceTransferBorrowValidLifting,
    // )) {
    //     args.intrinsics.insert(Intrinsic::Resource(
    //         ResourceIntrinsic::ResourceTableCreateBorrow,
    //     ));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::String(StringIntrinsic::Utf8Encode))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::String(StringIntrinsic::Utf8EncodeAsync))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::IsLE,
    //         &Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::String(StringIntrinsic::Utf16Encode))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::String(StringIntrinsic::Utf16EncodeAsync))
    // {
    //     args.intrinsics.extend([&Intrinsic::IsLE]);
    // }

    // // Attempting to perform a debug message hoist will require string encoding to memory
    // if args.intrinsics.contains(&Intrinsic::ErrCtx(
    //     ErrCtxIntrinsic::ErrorContextDebugMessage,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::String(StringIntrinsic::Utf8Encode),
    //         &Intrinsic::String(StringIntrinsic::Utf16Encode),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextNew))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentGlobalTable),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalRefCountAdd),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::ReserveGlobalRep),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::CreateLocalHandle),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::ErrCtx(
    //     ErrCtxIntrinsic::ErrorContextDebugMessage,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalRefCountAdd),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextDrop),
    //         &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::DriverLoop))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::TypeCheckValidI32,
    //         &Intrinsic::Conversion(ConversionIntrinsic::ToInt32),
    //         &Intrinsic::Component(ComponentIntrinsic::ComponentStateSetAllError),
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::Component(
    //     ComponentIntrinsic::GetOrCreateAsyncState,
    // )) {
    //     args.intrinsics.extend([&Intrinsic::RepTableClass]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
    //         &Intrinsic::Component(ComponentIntrinsic::GlobalAsyncStateMap),
    //         &Intrinsic::RepTableClass,
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncSubtaskClass),
    //         &Intrinsic::Waitable(WaitableIntrinsic::WaitableClass),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetNew))
    // {
    //     args.intrinsics
    //         .extend([&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetClass)]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetPoll))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetWait))
    // {
    //     args.intrinsics
    //         .extend([&Intrinsic::Host(HostIntrinsic::StoreEventInComponentMemory)]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetDrop))
    // {
    //     args.intrinsics
    //         .extend([&Intrinsic::Waitable(WaitableIntrinsic::RemoveWaitableSet)]);
    // }

    // if args.intrinsics.contains(&Intrinsic::Component(
    //     ComponentIntrinsic::GetOrCreateAsyncState,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::Component(ComponentIntrinsic::ComponentAsyncStateClass),
    //         &Intrinsic::Component(ComponentIntrinsic::GlobalAsyncStateMap),
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::Component(
    //     ComponentIntrinsic::ComponentAsyncStateClass,
    // )) {
    //     args.intrinsics.extend([&Intrinsic::AsyncStream(
    //         AsyncStreamIntrinsic::GlobalStreamMap,
    //     )]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatResult))
    //     | args
    //         .intrinsics
    //         .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatOption))
    //     | args
    //         .intrinsics
    //         .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatEnum))
    // {
    //     args.intrinsics
    //         .extend([&Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant)]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatU8),
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatU16),
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatU32),
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatFloat64),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatResult))
    // {
    //     args.intrinsics
    //         .insert(Intrinsic::Lower(LowerIntrinsic::LowerFlatVariant));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatOption))
    // {
    //     args.intrinsics
    //         .insert(Intrinsic::Lower(LowerIntrinsic::LowerFlatVariant));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatVariant))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatU8),
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatU16),
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatU32),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatStream))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::ExternalStreamClass),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::InternalStreamClass),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::IsStreamLowerableObject),
    //         &Intrinsic::SymbolResourceRep,
    //         &Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GenReadFnFromLowerableStream),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GenStreamHostInjectFn),
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatU32),
    //     ])
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncStream(
    //     AsyncStreamIntrinsic::GenStreamHostInjectFn,
    // )) {
    //     args.intrinsics.insert(Intrinsic::AsyncStream(
    //         AsyncStreamIntrinsic::PendingValueQueueClass,
    //     ));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatFuture))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GlobalFutureMap),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::NestedFutureSymbol),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::InternalFutureClass),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::IsFutureLowerableObject),
    //         &Intrinsic::SymbolResourceRep,
    //         &Intrinsic::GetErrorPayload,
    //         &Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GenFutureHostInjectFn),
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatU32),
    //     ])
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStringAny))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf8),
    //         &Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf16),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf8))
    // {
    //     args.intrinsics
    //         .insert(Intrinsic::String(StringIntrinsic::GlobalTextDecoderUtf8));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatStringAny))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatStringUtf8),
    //         &Intrinsic::Lower(LowerIntrinsic::LowerFlatStringUtf16),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatStringUtf8))
    // {
    //     args.intrinsics
    //         .insert(Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf16))
    // {
    //     args.intrinsics
    //         .insert(Intrinsic::String(StringIntrinsic::Utf16Decoder));
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStream))
    // {
    //     args.intrinsics.insert(Intrinsic::AsyncStream(
    //         AsyncStreamIntrinsic::ExternalStreamClass,
    //     ));
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncTask(
    //     AsyncTaskIntrinsic::CreateNewCurrentTask,
    // )) || args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::ClearCurrentTask))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass),
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap),
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamNew))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamTableMap),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWritableEndClass),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamReadableEndClass),
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncStream(
    //     AsyncStreamIntrinsic::StreamWritableEndClass,
    // )) || args.intrinsics.contains(&Intrinsic::AsyncStream(
    //     AsyncStreamIntrinsic::StreamReadableEndClass,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::InternalStreamClass),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamEndClass),
    //         &Intrinsic::AsyncEventCodeEnum,
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncStream(
    //     AsyncStreamIntrinsic::StreamNewFromLift,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamTableMap),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass),
    //         &Intrinsic::AsyncStream(AsyncStreamIntrinsic::ExternalStreamClass),
    //         &Intrinsic::GlobalBufferManager,
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncStream(
    //     AsyncStreamIntrinsic::ExternalStreamClass,
    // )) {
    //     args.intrinsics.insert(Intrinsic::SymbolResourceRep);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWrite))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamRead))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureWrite))
    //     || args
    //         .intrinsics
    //         .contains(&Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureRead))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::GlobalBufferManager,
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant),
    //         &Intrinsic::AsyncEventCodeEnum,
    //     ]);
    // }

    // if args
    //     .intrinsics
    //     .contains(&Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureNew))
    // {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GlobalFutureMap),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::NestedFutureSymbol),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GlobalFutureTableMap),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureWritableEndClass),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureReadableEndClass),
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncFuture(
    //     AsyncFutureIntrinsic::FutureNewFromLift,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::NestedFutureSymbol),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GlobalFutureMap),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::HostFutureClass),
    //         &Intrinsic::GlobalBufferManager,
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncFuture(
    //     AsyncFutureIntrinsic::FutureWritableEndClass,
    // )) || args.intrinsics.contains(&Intrinsic::AsyncFuture(
    //     AsyncFutureIntrinsic::FutureReadableEndClass,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::NestedFutureSymbol),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::InternalFutureClass),
    //         &Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureEndClass),
    //         &Intrinsic::AsyncEventCodeEnum,
    //     ]);
    // }

    // if args.intrinsics.contains(&Intrinsic::GlobalBufferManager) {
    //     args.intrinsics.extend([&Intrinsic::BufferManagerClass]);
    // }

    // if args.intrinsics.contains(&Intrinsic::BufferManagerClass) {
    //     args.intrinsics.extend([&Intrinsic::ManagedBufferClass]);
    // }

    // if args.intrinsics.contains(&Intrinsic::AsyncTask(
    //     AsyncTaskIntrinsic::EnterSymmetricSyncGuestCall,
    // )) || args.intrinsics.contains(&Intrinsic::AsyncTask(
    //     AsyncTaskIntrinsic::ExitSymmetricSyncGuestCall,
    // )) {
    //     args.intrinsics.extend([
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentComponentIdxs),
    //         &Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask),
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskIds),
    //         &Intrinsic::ClearGlobalCurrentTaskMetaFn,
    //         &Intrinsic::AsyncTask(AsyncTaskIntrinsic::SymmetricSyncGuestCallStack),
    //     ]);
    // }

    // TODO: for every intrinsic that will get used, add to the list of intrinsics that we must output
    // w/ number of deps that it takes
    //
    // TODO: use indextree here? Just want to build the tree

    // TODO: walk the tree and render all intrinsics


    // for current_intrinsic in args.intrinsics.iter() {
    //     // Skip already rendered intrinsics (i.e. the early intrinsics)
    //     if rendered_intrinsics.contains(current_intrinsic.name()) {
    //         continue;
    //     }

    //     renderer.render(current_intrinsic, &mut output, &args);
    // }

    output
}

impl Intrinsic {
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        JsHelperIntrinsic::get_global_names()
            .into_iter()
            .chain(vec![
                // Intrinsic list exactly as below
                "base64Compile",
                "clampGuest",
                "ComponentError",
                "fetchCompile",
                "finalizationRegistryCreate",
                "getErrorPayload",
                "HANDLE_TABLES",
                "hasOwnProperty",
                "imports",
                "instantiateCore",
                "isLE",
                "scopeId",
                "symbolCabiDispose",
                "symbolCabiLower",
                "symbolDispose",
                "symbolAsyncIterator",
                "symbolIterator",
                "symbolRscHandle",
                "symbolRscRep",
                "T_FLAG",
                "throwInvalidBool",
                "throwUninitialized",
                // JS Globals / non intrinsic names
                "ArrayBuffer",
                "BigInt",
                "BigInt64Array",
                "DataView",
                "dv",
                "emptyFunc",
                "Error",
                "fetch",
                "Float32Array",
                "Float64Array",
                "Int32Array",
                "Object",
                "process",
                "String",
                "TextDecoder",
                "TextEncoder",
                "TypeError",
                "Uint16Array",
                "Uint8Array",
                "URL",
                "WebAssembly",
                "GlobalComponentMemories",
            ])
    }

    pub fn name(&self) -> &'static str {
        match self {
            Intrinsic::JsHelper(i) => i.name(),
            Intrinsic::Conversion(i) => i.name(),
            Intrinsic::WebIdl(i) => i.name(),
            Intrinsic::String(i) => i.name(),
            Intrinsic::ErrCtx(i) => i.name(),
            Intrinsic::AsyncTask(i) => i.name(),
            Intrinsic::Waitable(i) => i.name(),
            Intrinsic::Resource(i) => i.name(),
            Intrinsic::Lift(i) => i.name(),
            Intrinsic::Lower(i) => i.name(),
            Intrinsic::AsyncStream(i) => i.name(),
            Intrinsic::AsyncFuture(i) => i.name(),
            Intrinsic::Component(i) => i.name(),
            Intrinsic::Host(i) => i.name(),

            Intrinsic::Base64Compile => "base64Compile",
            Intrinsic::ClampGuest => "clampGuest",
            Intrinsic::ComponentError => "ComponentError",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::HandleTables => "HANDLE_TABLES",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::ScopeId => "SCOPE_ID",

            Intrinsic::SymbolCabiDispose => "symbolCabiDispose",
            Intrinsic::SymbolCabiLower => "symbolCabiLower",
            Intrinsic::SymbolDispose => "symbolDispose",
            Intrinsic::SymbolAsyncIterator => "symbolAsyncIterator",
            Intrinsic::SymbolIterator => "symbolIterator",
            Intrinsic::SymbolResourceHandle => "symbolRscHandle",
            Intrinsic::SymbolResourceRep => "symbolRscRep",

            Intrinsic::ThrowInvalidBool => "throwInvalidBool",
            Intrinsic::ThrowUninitialized => "throwUninitialized",

            // Debugging
            Intrinsic::DebugLog => "_debugLog",
            Intrinsic::PromiseWithResolversPonyfill => "promiseWithResolvers",

            // Types
            Intrinsic::ConstantI32Min => "I32_MIN",
            Intrinsic::ConstantI32Max => "I32_MAX",
            Intrinsic::TypeCheckValidI32 => "_typeCheckValidI32",
            Intrinsic::TypeCheckAsyncFn => "_typeCheckAsyncFn",
            Intrinsic::AsyncFunctionCtor => "ASYNC_FN_CTOR",

            // Streams
            Intrinsic::PlatformReadableStreamClass => "_PlatformReadableStream",

            // Async
            Intrinsic::GlobalAsyncDeterminism => "ASYNC_DETERMINISM",
            Intrinsic::CoinFlip => "_coinFlip",

            // Global current task tracking machinery
            Self::GlobalCurrentTaskMeta => "CURRENT_TASK_META",
            Self::GetGlobalCurrentTaskMetaFn => "_getGlobalCurrentTaskMeta",
            Self::SetGlobalCurrentTaskMetaFn => "_setGlobalCurrentTaskMeta",
            Self::WithGlobalCurrentTaskMetaFn => "_withGlobalCurrentTaskMeta",
            Self::WithGlobalCurrentTaskMetaFnAsync => "_withGlobalCurrentTaskMetaAsync",
            Self::ClearGlobalCurrentTaskMetaFn => "_clearCurrentTask",

            // Iteratively saved metadata
            Intrinsic::GlobalComponentMemoryMap => "GLOBAL_COMPONENT_MEMORY_MAP",
            Intrinsic::RegisterGlobalMemoryForComponent => "registerGlobalMemoryForComponent",
            Intrinsic::LookupMemoriesForComponent => "lookupMemoriesForComponent",

            // Data structures
            Intrinsic::RepTableClass => "RepTable",

            // Buffers for managed/synchronized writing to/from component memory
            Intrinsic::ManagedBufferClass => "ManagedBuffer",
            Intrinsic::BufferManagerClass => "BufferManager",
            Intrinsic::GlobalBufferManager => "BUFFER_MGR",

            // Helpers for working with async state
            Intrinsic::AsyncEventCodeEnum => "ASYNC_EVENT_CODE",
        }
    }
}
