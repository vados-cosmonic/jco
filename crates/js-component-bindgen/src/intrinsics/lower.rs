//! Intrinsics that represent helpers that enable Lower integration
use std::fmt::Write;

use crate::intrinsics::Intrinsic;


/// This enum contains intrinsics that enable Lower
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum LowerIntrinsic {
    /// Lower a boolean into provided storage, given a core type
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value.
    LowerFlatBool,

    /// Lower a s8 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -128 to 127.
    LowerFlatS8,

    /// Lower a u8 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 255.
    LowerFlatU8,

    /// Lower a s16 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -32,768 to 32,767.
    LowerFlatS16,

    /// Lower a u16 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 65,535.
    LowerFlatU16,

    /// Lower a s32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -2,147,483,648 to 2,147,483,647.
    LowerFlatS32,

    /// Lower a u32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 4,294,967,295.
    LowerFlatU32,

    /// Lower a s64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
    LowerFlatS64,

    /// Lower a u64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 18,446,744,073,709,551,615.
    LowerFlatU64,

    /// Lower a f32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LowerFlatFloat32,

    /// Lower a f64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LowerFlatFloat64,

    /// Lower a char into provided storage given core type(s)
    LowerFlatChar,

    /// Lower a string into provided storage given core type(s), using encoding in lower ctx
    LowerFlatStringAny,

    /// Lower a UTF8 string into provided storage given core type(s)
    LowerFlatStringUtf8,

    /// Lower a UTF16 string into provided storage given core type(s)
    LowerFlatStringUtf16,

    /// Lower a record into provided storage given core type(s)
    LowerFlatRecord,

    /// Lower a variant into provided storage given core type(s)
    LowerFlatVariant,

    /// Lower a list into provided storage given core type(s)
    LowerFlatList,

    /// Lower a tuple into provided storage given core type(s)
    LowerFlatTuple,

    /// Lower flags into provided storage given core type(s)
    LowerFlatFlags,

    /// Lower flags into provided storage given core type(s)
    LowerFlatEnum,

    /// Lower an option into provided storage given core type(s)
    LowerFlatOption,

    /// Lower a result into provided storage given core type(s)
    LowerFlatResult,

    /// Lower a owned resource into provided storage given core type(s)
    LowerFlatOwn,

    /// Lower a borrowed resource into provided storage given core type(s)
    LowerFlatBorrow,

    /// Lower a future into provided storage given core type(s)
    LowerFlatFuture,

    /// Lower a stream into provided storage given core type(s)
    LowerFlatStream,

    /// Lower an error-context into provided storage given core type(s)
    LowerFlatErrorContext,
}

impl LowerIntrinsic {
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
            Self::LowerFlatBool => "_lowerFlatBool",
            Self::LowerFlatS8 => "_lowerFlatS8",
            Self::LowerFlatU8 => "_lowerFlatU8",
            Self::LowerFlatS16 => "_lowerFlatS16",
            Self::LowerFlatU16 => "_lowerFlatU16",
            Self::LowerFlatS32 => "_lowerFlatS32",
            Self::LowerFlatU32 => "_lowerFlatU32",
            Self::LowerFlatS64 => "_lowerFlatS64",
            Self::LowerFlatU64 => "_lowerFlatU64",
            Self::LowerFlatFloat32 => "_lowerFlatFloat32",
            Self::LowerFlatFloat64 => "_lowerFlatFloat64",
            Self::LowerFlatChar => "_lowerFlatChar",
            Self::LowerFlatStringAny => "_lowerFlatStringAny",
            Self::LowerFlatStringUtf8 => "_lowerFlatStringUTF8",
            Self::LowerFlatStringUtf16 => "_lowerFlatStringUTF16",
            Self::LowerFlatRecord => "_lowerFlatRecord",
            Self::LowerFlatVariant => "_lowerFlatVariant",
            Self::LowerFlatList => "_lowerFlatList",
            Self::LowerFlatTuple => "_lowerFlatTuple",
            Self::LowerFlatFlags => "_lowerFlatFlags",
            Self::LowerFlatEnum => "_lowerFlatEnum",
            Self::LowerFlatOption => "_lowerFlatOption",
            Self::LowerFlatResult => "_lowerFlatResult",
            Self::LowerFlatOwn => "_lowerFlatOwn",
            Self::LowerFlatBorrow => "_lowerFlatBorrow",
            Self::LowerFlatFuture => "_lowerFlatFuture",
            Self::LowerFlatStream => "_lowerFlatStream",
            Self::LowerFlatErrorContext => "_lowerFlatErrorContext",
        }
    }
}
