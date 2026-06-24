//! Intrinsics that represent helpers that implement error contexts

use crate::intrinsics::Intrinsic;

/// This enum contains intrinsics that implement error contexts
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ErrCtxIntrinsic {
    /// Storage of component-wide "global" `error-context` metadata
    ///
    /// Contexts are reference counted at both the global level, and locally for a single
    /// component.
    ///
    /// Component-global counts are used along with component-local counts in order
    /// to determine when an error context can *actually* be reclaimed/removed (i.e. no longer
    /// in use in either a local component or by the host in some fashion).
    ///
    /// You can consider the type of the value referenced by this intrinsic to be:
    ///
    /// ```ts
    /// // (in-binary component-global) ~i32, stable index for a component-model-wide error-context
    /// type ErrorContextRep = number;
    /// // (in-binary component-global) u32, number of references to the given handle
    /// type GlobalRefCount = number;
    /// // ('single', component-local) debug message represented by the given error-context
    /// type DebugMessage = string;
    /// // (in-binary component-global) metadata representative of an error-context
    /// type GlobalErrorContextMeta = { refCount: number, debugMessage: string };
    ///
    /// Map<ErrorContextRep, GlobalErrorContextMeta>
    /// ```
    ComponentGlobalTable,

    /// Map of error context table to component indices
    GlobalErrCtxTableMap,

    /// Storage of per-component "local" `error-context` metadata
    ///
    /// Contexts are reference counted at the component-local level, with counts here used
    /// in addition to global counts to determine when an error context can be removed.
    ///
    /// This structure is a multi-level lookup based on sparse arrays, indexed by:
    ///   - component
    ///   - local context-error table index (i.e. the component-local id for a context-error)
    ///   - error-context handle
    ///
    /// You can consider the type of the value referenced by this intrinsic to be:
    ///
    /// ```ts
    /// // (in-binary component-global) i32, stable index for a given subcomponent inside the current component
    /// type ComponentIndex = number;
    /// // ('single' component-local) i32, stable index for a given error-context table (effectively identifies a component)
    /// type TableIndex = number;
    /// // ('single', component-local) i32, stable index for a given component's error-context
    /// type ErrorContextHandle = number;
    /// // (in-binary component-global) i32, stable index for a component-model-wide error-context
    /// type ErrorContextRep = number;
    /// // ('single', component-local) u32, number of references to the given handle
    /// type LocalRefCount = number;
    /// // ('single', component-local) information related to the local representation of this error-context
    /// type LocalErrorContextMeta = { rep: number, refCount: number };
    ///
    /// type ErrorContextComponentLocalTable = Map<
    ///   ComponentIndex,
    ///   Map<
    ///     ComponentErrorContextTableIndex,
    ///     Map<
    ///       ErrorContextHandle,
    ///       LocalErrorContextMeta
    ///     >
    ///   >
    /// >
    /// ```
    ///
    /// Note that garbage collection of an error context cannot be done unless *all* references are dropped
    /// (locally and globally)
    ComponentLocalTable,

    /// Create a new error context
    ErrorContextNew,

    /// Drop an existing error context
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u64 = bigint;
    /// function errCtxDrop(tbl: ErrorContextComponentLocalTable, errContextHandle: u32): bool;
    /// ```
    ///
    /// see also: [`Intrinsic::ErrorContextComponentLocalTable`]
    ErrorContextDrop,

    /// Transfer a remote error context to a local one, from one component to another
    ///
    /// Error contexts are stored and managed via the ErrorContexts intrinsic,
    /// and this intrinsic builds on that by implementing a function that will
    /// move an error context with a handle from one component that owns it to another.
    ///
    /// This intrinsic is normally invoked when an error-context is passed across a component
    /// boundary (ex. function output, closing a stream/future with an error, etc.)
    ///
    /// NOTE that error contexts unlike streams/futures/resources are reference counted --
    /// transferring one does not not drop an error context.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u64 = bigint;
    /// function errCtxTransfer(tbl: ErrorContextComponentLocalTable, errContextHandle: u32): bool;
    /// ```
    ///
    ErrorContextTransfer,

    /// Retrieve the debug message for an existing error context
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type OuputStringWriteFn = (s: string, outputPtr: u32) => void;
    /// type Options = {
    ///   callbackFnIdx?: u32,
    ///   postReturnFnIdx?: u32,
    ///   async?: bool,
    /// }
    ///
    /// function errCtxDebugMessage(
    ///   opts: Options,
    ///   writeOutput: OuputStringWriteFn,
    ///   tbl: ErrorContextComponentLocalTable,
    ///   errContextHandle: u32, // provided by CABI
    ///   outputStrPtr: u32, // provided by CABI
    /// );
    /// ```
    ///
    ErrorContextDebugMessage,

    /// Retrieve the per component sparse array lookup of error contexts
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the lookup.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    GetLocalTable,

    /// Increment the ref count for a component-global error-context
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    GlobalRefCountAdd,

    /// Create a local handle in a given component table
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// Note that this function is expected to receive a table *already* indexed by component.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    CreateLocalHandle,

    /// Reserve a new error context at the global scope, given a debug message to use
    ReserveGlobalRep,
}

impl ErrCtxIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "errCtxGlobal",
            "errCtxLocal",
            "errCtxNew",
            "errCtxDrop",
            "errCtxTransfer",
            "errCtxDebugMessage",
            "errCtxGlobalRefCountAdd",
            "errCtxGetLocalTable",
            "errCtxCreateLocalHandle",
            "errCtxReserveGlobalRep",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ComponentGlobalTable => "GlobalErrorContextTable",
            Self::GlobalErrCtxTableMap => "ERR_CTX_TABLES",
            Self::ComponentLocalTable => "errCtxLocal",
            Self::ErrorContextNew => "errCtxNew",
            Self::ErrorContextDrop => "errCtxDrop",
            Self::ErrorContextTransfer => "errCtxTransfer",
            Self::ErrorContextDebugMessage => "errCtxDebugMessage",
            Self::GlobalRefCountAdd => "errCtxGlobalRefCountAdd",
            Self::GetLocalTable => "errCtxGetLocalTable",
            Self::CreateLocalHandle => "errCtxCreateLocalHandle",
            Self::ReserveGlobalRep => "errCtxReserveGlobalRep",
        }
    }
}
