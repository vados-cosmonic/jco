//! Intrinsics that represent helpers that implement waitable sets

use crate::intrinsics::Intrinsic;

/// This enum contains intrinsics that enable waitable sets
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum WaitableIntrinsic {
    /// The definition of the `WaitableSet` JS class
    WaitableSetClass,

    /// The definition of the `Waitable` JS class
    WaitableClass,

    /// Create a new waitable set
    ///
    /// Guest code uses this to create new waitable/pollable groups of events that can be waited on.
    /// The waitable set is tied to the implicit current task
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetNew(componentInstanceId: number): i32;
    /// ```
    ///
    /// The function returns the index of the waitable set that was created, so it can be used later (e.g. waitableSetWait)
    WaitableSetNew,

    /// Wait on a given waitable
    ///
    /// Guest code uses this to wait on a waitable that has been already created
    /// The waitable set index is relevant to the implicit current task.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setwait
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function waitableSetWait(
    ///     componentIdx: i32,
    ///     isAsync: boolean,
    ///     memory: i32,
    ///     waitableSetRep: i32,
    ///     resultPtr: i32
    /// );
    /// ```
    ///
    /// The results of the poll should be set in the provided pointer
    WaitableSetWait,

    /// Poll a given waitable set
    ///
    /// Guest code uses this builtin to poll whether a waitable set is finished or not,
    /// yielding to other tasks while doing so.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setpoll
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetPoll(
    ///     componentIdx: i32,
    ///     isAsync: boolean,
    ///     memory: i32,
    ///     waitableSetRep: i32,
    ///     resultPtr: i32
    /// );
    /// ```
    ///
    /// The results of the poll should be set in the provided pointer
    WaitableSetPoll,

    /// Drop a given waitable set
    ///
    /// Guest code uses this builtin to remove the waitable set in it's entirety from a component instance's tables.
    /// The component instance is known via the current task.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setdrop
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetDrop(componentIdx: i32, waitableSetRep: i32);
    /// ```
    WaitableSetDrop,

    /// JS helper function for removing a waitable set
    RemoveWaitableSet,

    /// Join a given waitable set
    ///
    /// Guest code uses this builtin to add a provided waitable to an existing waitable set.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitablejoin
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function waitableJoin(componentIdx: i32, waitableSetRep: i32, waitableRep: i32);
    /// ```
    ///
    /// If the waitable set index is zero (an otherwise invalid table index), join should *remove* the given waitable from any sets
    /// that it may be a part of (of which there should only be one).
    WaitableJoin,
}

impl WaitableIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::RemoveWaitableSet => "_removeWaitableSet",
            Self::WaitableSetNew => "waitableSetNew",
            Self::WaitableSetWait => "waitableSetWait",
            Self::WaitableSetPoll => "waitableSetPoll",
            Self::WaitableSetDrop => "waitableSetDrop",
            Self::WaitableJoin => "waitableJoin",
            Self::WaitableSetClass => "WaitableSet",
            Self::WaitableClass => "Waitable",
        }
    }
}
