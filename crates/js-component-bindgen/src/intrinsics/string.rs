//! Intrinsics that represent helpers that manipulate strings

use crate::intrinsics::Intrinsic;

/// This enum contains intrinsics for manipulating strings
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum StringIntrinsic {
    Utf16Decoder,

    Utf16Encode,

    Utf16EncodeAsync,

    /// UTF8 Decoder (a JS `TextDecoder`)
    GlobalTextDecoderUtf8,

    /// UTF8 Encoder (a JS `TextEncoder`)
    GlobalTextEncoderUtf8,

    /// Encode a single string to memory
    Utf8Encode,

    Utf8EncodeAsync,

    ValidateGuestChar,

    ValidateHostChar,
}

impl StringIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve all global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::Utf16Decoder.name(),
            Self::Utf16Encode.name(),
            Self::Utf16EncodeAsync.name(),
            Self::GlobalTextDecoderUtf8.name(),
            Self::GlobalTextEncoderUtf8.name(),
            Self::Utf8Encode.name(),
            Self::Utf8EncodeAsync.name(),
            Self::ValidateGuestChar.name(),
            Self::ValidateHostChar.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf16Encode => "_utf16AllocateAndEncode",
            Self::Utf16EncodeAsync => "_utf16AllocateAndEncodeAsync",
            Self::GlobalTextDecoderUtf8 => "TEXT_DECODER_UTF8",
            Self::GlobalTextEncoderUtf8 => "TEXT_ENCODER_UTF8",
            Self::Utf8Encode => "_utf8AllocateAndEncode",
            Self::Utf8EncodeAsync => "_utf8AllocateAndEncodeAsync",
            Self::ValidateGuestChar => "validateGuestChar",
            Self::ValidateHostChar => "validateHostChar",
        }
    }
}
