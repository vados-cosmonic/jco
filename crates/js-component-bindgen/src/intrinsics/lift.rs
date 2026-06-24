//! Intrinsics that represent helpers that enable Lift integration
use std::fmt::Write;

use crate::intrinsics::Intrinsic;


/// This enum contains intrinsics that enable Lift
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum LiftIntrinsic {
    /// Lift a boolean into provided storage, given a core type
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value.
    LiftFlatBool,

    /// Lift a s8 into provided storage given core type(s)
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
    LiftFlatS8,

    /// Lift a u8 into provided storage given core type(s)
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
    LiftFlatU8,

    /// Lift a s16 into provided storage given core type(s)
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
    LiftFlatS16,

    /// Lift a u16 into provided storage given core type(s)
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
    LiftFlatU16,

    /// Lift a s32 into provided storage given core type(s)
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
    LiftFlatS32,

    /// Lift a u32 into provided storage given core type(s)
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
    LiftFlatU32,

    /// Lift a s64 into provided storage given core type(s)
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
    LiftFlatS64,

    /// Lift a u64 into provided storage given core type(s)
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
    LiftFlatU64,

    /// Lift a f32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat32,

    /// Lift a f64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat64,

    /// Lift a char into provided storage given core type(s) that represent utf8
    LiftFlatChar,

    /// Lift a string from provided storage given core type(s), using encoding in lfit ctx
    LiftFlatStringAny,

    /// Lift a UTF8 string into provided storage given core type(s)
    LiftFlatStringUtf8,

    /// Lift a UTF16 string into provided storage given core type(s)
    LiftFlatStringUtf16,

    /// Lift a record into provided storage given core type(s)
    LiftFlatRecord,

    /// Lift a variant into provided storage given core type(s)
    LiftFlatVariant,

    /// Lift a list into provided storage given core type(s)
    LiftFlatList,

    /// Lift a tuple into provided storage given core type(s)
    LiftFlatTuple,

    /// Lift flags into provided storage given core type(s)
    LiftFlatFlags,

    /// Lift flags into provided storage given core type(s)
    LiftFlatEnum,

    /// Lift an option into provided storage given core type(s)
    LiftFlatOption,

    /// Lift a result into provided storage given core type(s)
    LiftFlatResult,

    /// Lift a owned resource into provided storage given core type(s)
    LiftFlatOwn,

    /// Lift a borrowed resource into provided storage given core type(s)
    LiftFlatBorrow,

    /// Lift a future into provided storage given core type(s)
    LiftFlatFuture,

    /// Lift a stream into provided storage given core type(s)
    LiftFlatStream,

    /// Lift an error-context into provided storage given core type(s)
    LiftFlatErrorContext,
}

impl LiftIntrinsic {
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
            Self::LiftFlatBool => "_liftFlatBool",
            Self::LiftFlatS8 => "_liftFlatS8",
            Self::LiftFlatU8 => "_liftFlatU8",
            Self::LiftFlatS16 => "_liftFlatS16",
            Self::LiftFlatU16 => "_liftFlatU16",
            Self::LiftFlatS32 => "_liftFlatS32",
            Self::LiftFlatU32 => "_liftFlatU32",
            Self::LiftFlatS64 => "_liftFlatS64",
            Self::LiftFlatU64 => "_liftFlatU64",
            Self::LiftFlatFloat32 => "_liftFlatFloat32",
            Self::LiftFlatFloat64 => "_liftFlatFloat64",
            Self::LiftFlatChar => "_liftFlatChar",
            Self::LiftFlatStringAny => "_liftFlatStringAny",
            Self::LiftFlatStringUtf8 => "_liftFlatStringUTF8",
            Self::LiftFlatStringUtf16 => "_liftFlatStringUTF16",
            Self::LiftFlatRecord => "_liftFlatRecord",
            Self::LiftFlatVariant => "_liftFlatVariant",
            Self::LiftFlatList => "_liftFlatList",
            Self::LiftFlatTuple => "_liftFlatTuple",
            Self::LiftFlatFlags => "_liftFlatFlags",
            Self::LiftFlatEnum => "_liftFlatEnum",
            Self::LiftFlatOption => "_liftFlatOption",
            Self::LiftFlatResult => "_liftFlatResult",
            Self::LiftFlatOwn => "_liftFlatOwn",
            Self::LiftFlatBorrow => "_liftFlatBorrow",
            Self::LiftFlatFuture => "_liftFlatFuture",
            Self::LiftFlatStream => "_liftFlatStream",
            Self::LiftFlatErrorContext => "_liftFlatErrorContext",
        }
    }
}
