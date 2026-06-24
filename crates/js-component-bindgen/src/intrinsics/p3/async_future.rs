//! Intrinsics that represent helpers that enable Future integration

use std::fmt::Write;

use crate::intrinsics::Intrinsic;


/// This enum contains intrinsics that enable Futures
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncFutureIntrinsic {
    /// Global that stores futures
    ///
    /// ```ts
    /// type i32 = number;
    /// type FutureEnd = FutureWritableEndClass | FutureReadableEndClass;
    /// type GlobalFutureMap<T> = Map<i32, FutureEnd>;
    /// ```
    GlobalFutureMap,

    /// Symbol that is used to delineate futures that are nested
    NestedFutureSymbol,

    /// Map of future tables to component indices
    GlobalFutureTableMap,

    /// The definition of the `FutureWritableEnd` JS class
    ///
    /// This class serves as a shared implementation used by writable and readable ends
    FutureEndClass,

    /// The definition of the `HostFuture` JS class
    ///
    /// This class serves as an implementation for top level host-managed futures,
    /// internal to the bindgen generated logic.
    ///
    /// External code is no expected to work in terms of `HostFuture`, but rather deal with `Future`s
    ///
    HostFutureClass,

    /// An internal future class that coordinates boht writable and readable ends
    InternalFutureClass,

    /// The definition of the `FutureWritableEnd` JS class
    FutureWritableEndClass,

    /// The definition of the `FutureReadableEnd` JS class
    FutureReadableEndClass,

    /// Create a new future
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
    /// function futureNew(typeRep: u32): u64;
    /// ```
    FutureNew,

    /// Create a new future during a lift (`Instruction::FutureLift`).
    ///
    /// This is distinct from plain future creation, because we are provided more information,
    /// particularly the relevant types to teh future and lift/lower fns for the future.
    ///
    /// ```ts
    /// type Ctx = {
    ///     componentIdx: number,
    ///     futureTableIdx: number,
    ///     elemMeta: object,
    /// }
    /// function futureNewFromLift(ctx: Ctx);
    /// ```
    ///
    FutureNewFromLift,

    /// Read from a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-futurefuturereadwrite
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
    /// function futureRead(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureRead,

    /// Write to a future
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
    /// function futureWrite(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureWrite,

    /// Cancel a read to a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >=0
    ///
    /// function futureCancelRead(futureRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    FutureCancelRead,

    /// Cancel a write to a future
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
    /// function futureCancelWrite(futureRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    FutureCancelWrite,

    /// Drop a the readable end of a Future
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
    /// function futureDropReadable(futureRep: u32, readerRep: u32): bool;
    /// ```
    FutureDropReadable,

    /// Drop a the writable end of a Future
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
    /// function futureDropWritable(futureRep: u32, writerRep: u32): bool;
    /// ```
    FutureDropWritable,

    /// Instruction emitted by FACT modules that enables the transfer of a future
    ///
    /// See [`Trampoline::FutureTransfer`]
    FutureTransfer,

    /// Function that generates a host injection function for external futures
    ///
    /// This is usually used when lowering external `Promise<T>`s into components, creating
    /// readable ends as necessary.
    ///
    /// The generated host injection function is generally called right when a component
    /// attempts to read (in doing so, "injecting" a write before the component read).
    GenFutureHostInjectFn,

    /// Function to check whether a JS object can be used as a stream
    IsFutureLowerableObject,
}

impl AsyncFutureIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::FutureCancelRead.name(),
            Self::FutureCancelWrite.name(),
            Self::FutureDropReadable.name(),
            Self::FutureDropWritable.name(),
            Self::FutureEndClass.name(),
            Self::FutureNew.name(),
            Self::FutureNewFromLift.name(),
            Self::FutureRead.name(),
            Self::FutureReadableEndClass.name(),
            Self::FutureTransfer.name(),
            Self::FutureWritableEndClass.name(),
            Self::FutureWrite.name(),
            Self::GlobalFutureMap.name(),
            Self::GlobalFutureTableMap.name(),
            Self::InternalFutureClass.name(),
            Self::GenFutureHostInjectFn.name(),
            Self::IsFutureLowerableObject.name(),
            Self::NestedFutureSymbol.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::FutureCancelRead => "futureCancelRead",
            Self::FutureCancelWrite => "futureCancelWrite",
            Self::FutureDropReadable => "futureDropReadable",
            Self::FutureDropWritable => "futureDropWritable",
            Self::FutureEndClass => "FutureEnd",
            Self::FutureNew => "futureNew",
            Self::FutureNewFromLift => "futureNewFromLift",
            Self::FutureRead => "futureRead",
            Self::FutureReadableEndClass => "FutureReadableEnd",
            Self::FutureTransfer => "futureTransfer",
            Self::FutureWritableEndClass => "FutureWritableEnd",
            Self::FutureWrite => "futureWrite",
            Self::GlobalFutureMap => "FUTURES",
            Self::NestedFutureSymbol => "NESTED_FUTURE_SYMBOL",
            Self::GlobalFutureTableMap => "FUTURE_TABLES",
            Self::HostFutureClass => "HostFuture",
            Self::InternalFutureClass => "InternalFuture",
            Self::GenFutureHostInjectFn => "_genFutureHostInjectFn",
            Self::IsFutureLowerableObject => "_isFutureLowerableObject",
        }
    }
}
