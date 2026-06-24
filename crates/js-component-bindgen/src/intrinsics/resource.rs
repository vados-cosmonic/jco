//! Intrinsics that represent helpers that deal with Component Model resources

use std::fmt::Write;

use crate::intrinsics::Intrinsic;

/// This enum contains intrinsics for supporting Component Model resources
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ResourceIntrinsic {
    /// # Resource table slab implementation
    ///
    /// Resource table slab implementation on top of a fixed "SMI" array in JS engines,
    /// a fixed contiguous array of u32s, for performance. We don't use a typed array because
    /// we need resizability without reserving a large buffer.
    ///
    /// The flag bit for all data values is 1 << 30. We avoid the use of the highest bit
    /// entirely to not trigger SMI deoptimization.
    ///
    /// Each entry consists of a pair of u32s, either a free list entry, or a data entry.
    ///
    /// ## Free List Entries:
    ///
    ///  |    index (x, u30)   |       ~unused~      |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 01xxxxxxxxxxxxxxxxx | ################### |
    ///
    /// Free list entries use only the first value in the pair, with the high bit always set
    /// to indicate that the pair is part of the free list. The first pair of entries at
    /// indices 0 and 1 is the free list head, with the initial values of 1 << 30 and 0
    /// respectively. Removing the 1 << 30 flag gives 0, which indicates the end of the free
    /// list.
    ///
    /// ## Data Entries:
    ///
    ///  |    scope (x, u30)   | own(o), rep(x, u30) |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 00xxxxxxxxxxxxxxxxx | 0oxxxxxxxxxxxxxxxxx |
    ///
    /// Data entry pairs consist of a first u30 scope entry and a second rep entry. The field
    /// is only called the scope for interface shape consistency, but is actually used for the
    /// ref count for own handles and the scope id for borrow handles. The high bit is never
    /// set for this first entry to distinguish the pair from the free list. The second item
    /// in the pair is the rep for  the resource, with the high bit in this entry indicating
    /// if it is an own handle.
    ///
    /// The free list numbering and the handle numbering are the same, indexing by pair, so to
    /// get from a handle or free list numbering to an index, we multiply by two.
    ///
    /// For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
    /// the array to get the context and rep respectively. If the high bit is set on the
    /// context, we throw for an invalid handle. The rep value is masked out from the
    /// ownership high bit, also throwing for an invalid zero rep.
    ///
    ResourceTableFlag,
    ResourceTableCreateBorrow,
    ResourceTableCreateOwn,
    ResourceTableGet,
    ResourceTableEnsureBorrowDrop,
    ResourceTableRemove,
    ResourceCallBorrows,
    ResourceTransferBorrow,
    ResourceTransferBorrowValidLifting,
    ResourceTransferOwn,
    CurResourceBorrows,
}

impl ResourceIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::ResourceCallBorrows.name(),
            Self::ResourceTableFlag.name(),
            Self::ResourceTableCreateBorrow.name(),
            Self::ResourceTableCreateOwn.name(),
            Self::ResourceTableGet.name(),
            Self::ResourceTableEnsureBorrowDrop.name(),
            Self::ResourceTableRemove.name(),
            Self::ResourceTransferBorrow.name(),
            Self::ResourceTransferBorrowValidLifting.name(),
            Self::ResourceTransferOwn.name(),
            Self::CurResourceBorrows.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ResourceCallBorrows => "RESOURCE_CALL_BORROWS",
            Self::ResourceTableFlag => "T_FLAG",
            Self::ResourceTableCreateBorrow => "rscTableCreateBorrow",
            Self::ResourceTableCreateOwn => "rscTableCreateOwn",
            Self::ResourceTableGet => "rscTableGet",
            Self::ResourceTableEnsureBorrowDrop => "rscTableTryGet",
            Self::ResourceTableRemove => "rscTableRemove",
            Self::ResourceTransferBorrow => "resourceTransferBorrow",
            Self::ResourceTransferBorrowValidLifting => "resourceTransferBorrowValidLifting",
            Self::ResourceTransferOwn => "resourceTransferOwn",
            Self::CurResourceBorrows => "curResourceBorrows",
        }
    }
}
