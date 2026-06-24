//! Intrinsics that represent helpers that manage per-component state

use std::fmt::Write as _;

use crate::intrinsics::Intrinsic;

/// This enum contains intrinsics that manage per-component state
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ComponentIntrinsic {
    /// Global that stores async state by component instance
    ///
    /// ```ts
    /// type ComponentAsyncState = {
    ///     mayLeave: boolean,
    /// };
    /// type GlobalAsyncStateMap = Map<number, ComponentAsyncState>;
    /// ```
    GlobalAsyncStateMap,

    /// Function that retrieves or creates async state for a given component instance
    GetOrCreateAsyncState,

    /// Increment the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureInc(componentIdx: number);
    /// ```
    BackpressureInc,

    /// Decrement the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureDec(componentIdx: number);
    /// ```
    BackpressureDec,

    /// A class that encapsulates component-level async state
    ComponentAsyncStateClass,

    /// Intrinsic used to set all component async states to error.
    ///
    /// Practically, this stops all individual component event loops (`AsyncComponentState#tick()`)
    /// and will usually allow the JS event loop which would otherwise be running `tick()` intervals
    /// forever.
    ///
    ComponentStateSetAllError,
}

impl ComponentIntrinsic {
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
            Self::GlobalAsyncStateMap => "ASYNC_STATE",
            Self::GetOrCreateAsyncState => "getOrCreateAsyncState",
            Self::BackpressureInc => "backpressureInc",
            Self::BackpressureDec => "backpressureDec",
            Self::ComponentAsyncStateClass => "ComponentAsyncState",
            Self::ComponentStateSetAllError => "_ComponentStateSetAllError",
        }
    }
}
