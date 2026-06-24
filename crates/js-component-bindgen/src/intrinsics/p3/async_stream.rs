//! Intrinsics that represent helpers that enable Stream integration

use crate::intrinsics::Intrinsic;


/// This enum contains intrinsics that enable Stream
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncStreamIntrinsic {
    /// Global that stores streams
    ///
    /// ```ts
    /// type i32 = number;
    /// type StreamEnd = StreamWritableEndClass | StreamReadableEndClass;
    /// type GlobalStreamMap<T> = Map<i32, StreamEnd>;
    /// ```
    GlobalStreamMap,

    /// Map of stream tables to component indices
    GlobalStreamTableMap,

    /// The definition of the `StreamEnd` JS superclass
    StreamEndClass,

    /// The definition of the `InternalStream` JS class (which inherits from the `StreamEnd` superclass)
    ///
    /// This class serves as a shared implementation used by writable and readable ends,
    /// that is meant to be used internally to generated code.
    InternalStreamClass,

    /// The definition of the `StreamReadableEnd` JS class
    StreamReadableEndClass,

    /// The definition of the `StreamWritableEnd` JS class
    StreamWritableEndClass,

    /// The definition of the `HostStream` JS class
    ///
    /// This class serves as an implementation for top level host-managed streams,
    /// internal to the bindgen generated logic.
    ///
    /// External code is no expected to work in terms of `HostStream`, but rather deal with `Stream`s
    ///
    HostStreamClass,

    /// The definition of the `Stream` JS class for use with external clients/SDKs
    ///
    /// This class serves as an user-facing implementation of a Preview3 `stream`.
    /// Usually this class is created via `HostStream#createStream()`.
    ///
    ExternalStreamClass,

    /// The definition of the pending value queue used by host stream injection
    PendingValueQueueClass,

    /// Create a new stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturenew
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >= 0
    /// type u64 = bigint; // >= 0
    /// function streamNew(typeRep: u32): u64;
    /// ```
    StreamNew,

    /// Create a new stream during a lift (`Instruction::StreamLift`).
    ///
    /// This is distinct from plain stream creation, because we are provided more information,
    /// particularly the relevant types to teh stream and lift/lower fns for the stream.
    ///
    /// ```ts
    /// type Ctx = {
    ///     componentIdx: number,
    ///     elemMeta: object,
    /// }
    /// function streamNewFromLift(ctx: Ctx);
    /// ```
    ///
    StreamNewFromLift,

    /// Read from a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamRead(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamRead,

    /// Write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamWrite(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamWrite,

    /// Cancel a read to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelRead(streamRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    StreamCancelRead,

    /// Cancel a write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-writewrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelWrite(streamRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    StreamCancelWrite,

    /// Drop a the readable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropReadable(streamRep: u32, readerRep: u32): bool;
    /// ```
    StreamDropReadable,

    /// Drop a the writable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropWritable(streamRep: u32, writerRep: u32): bool;
    /// ```
    StreamDropWritable,

    /// Transfer a given stream from one component to another
    ///
    /// Note that all arguments for a stream transfer are provided via arguments at runtime,
    /// and is generally called from the *guest* component (or at least the guest component idx is
    /// discernable via the current task).
    ///
    /// ```ts
    /// type u32 = number;
    ///
    /// function streamTransfer(srcComponentIdx: u32, srcTableIdx: u32, destTableIdx: u32): bool;
    /// ```
    StreamTransfer,

    /// Function to check whether a JS object can be used as a stream
    IsStreamLowerableObject,

    /// Function that generates a host injection function for external streams
    ///
    /// This is usually used when lowering external streams' readable ends into a component,
    /// and the generated function is generally called right when a component attempts to read
    /// (in doing so, "injecting" a write before the component read).
    GenStreamHostInjectFn,

    /// Function that generates a function (the "read function") lowerable stream object
    GenReadFnFromLowerableStream,
}

impl AsyncStreamIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalStreamMap => "STREAMS",
            Self::GlobalStreamTableMap => "STREAM_TABLES",
            Self::StreamEndClass => "StreamEnd",
            Self::InternalStreamClass => "InternalStream",
            Self::StreamWritableEndClass => "StreamWritableEnd",
            Self::StreamReadableEndClass => "StreamReadableEnd",
            Self::HostStreamClass => "HostStream",
            Self::ExternalStreamClass => "Stream",
            Self::PendingValueQueueClass => "PendingValueQueue",
            Self::StreamNew => "streamNew",
            Self::StreamNewFromLift => "streamNewFromLift",
            Self::StreamRead => "streamRead",
            Self::StreamWrite => "streamWrite",
            Self::StreamDropReadable => "streamDropReadable",
            Self::StreamDropWritable => "streamDropWritable",
            Self::StreamTransfer => "streamTransfer",
            Self::StreamCancelRead => "streamCancelRead",
            Self::StreamCancelWrite => "streamCancelWrite",
            Self::IsStreamLowerableObject => "_isStreamLowerableObject",
            Self::GenStreamHostInjectFn => "_genStreamHostInjectFn",
            Self::GenReadFnFromLowerableStream => "_genReadFnFromLowerableStream",
        }
    }
}
