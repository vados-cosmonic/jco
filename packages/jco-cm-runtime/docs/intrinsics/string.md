# String contract

`intrinsics/string` satisfies `StringModule`. Codec values are created by separate
`initializeUtf8Decoder()`, `initializeUtf16Decoder()` and `initializeUtf8Encoder()`
exports. Generated bindings initialize only selected codecs, once per relevant
instantiation, and preserve the returned object for all method callers. The
structural `StringDecoder`, `StringEncoder` and `StringEncodeInto` interfaces
require only their public methods. Calls preserve the codec's method receiver;
codecs from separate instantiations have independent identity and streaming state.
Decoders use fatal decoding and preserve a leading BOM.

`utf8Encode(encoder, value, realloc, memory)` and its async counterpart receive
the actual selected encoder, shared with direct transcoding method calls. This
explicit capability lets a custom encoder intercept default allocation operations.
Re-exporting a default operation does not intercept its internal static helpers.
`utf16Encode(context, value, realloc, memory)` and its async counterpart receive
only `{ littleEndian: boolean }` from `initializeUtf16Encoding()`, with no codecs.
All encoders use exact allocations, replace unpaired host surrogates and obtain
the memory buffer after realloc returns or resolves. Empty UTF-8 input keeps its
`{ ptr: 1, len: 0 }` sentinel without allocating.

`utf16ValidatingCopy`, `validateGuestChar` and `validateHostChar` are context-free.
Importing this subpath creates no codecs or scratch state. Custom API-v1 runtimes
must publish the new named string subpath when adopting this compiler; they may
re-export defaults or implement the self-contained structural contracts.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
