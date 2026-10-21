//! Intrinsics that represent helpers that manipulate strings
use std::fmt::Write;

use crate::intrinsics::RenderIntrinsicsArgs;
use crate::uwriteln;
use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics for manipulating strings
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum StringIntrinsic {
    /// UTF16 Decoder (a JS `TextDecoder`)
    ///
    /// Decoding throws on unpaired surrogates, and keeps a leading U+FEFF.
    Utf16Decoder,

    Utf16Encode,

    Utf16EncodeAsync,

    /// Copy UTF-16 code units between two equal-length `Uint16Array`s,
    /// throwing on unpaired surrogates
    ///
    /// Returns whether every code unit copied fits in latin1.
    Utf16ValidatingCopy,

    /// UTF8 Decoder (a JS `TextDecoder`)
    ///
    /// Decoding throws on invalid UTF-8, and keeps a leading U+FEFF.
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
    pub(crate) fn runtime_import(&self) -> super::runtime::RuntimeImport {
        use super::runtime::{RuntimeContext, RuntimeImport, RuntimeImportKind};
        let (export, context, kind) = match self {
            Self::Utf16Decoder => (
                "initializeUtf16Decoder",
                Some(RuntimeContext::Utf16Decoder),
                RuntimeImportKind::InitializedValue,
            ),
            Self::GlobalTextDecoderUtf8 => (
                "initializeUtf8Decoder",
                Some(RuntimeContext::Utf8Decoder),
                RuntimeImportKind::InitializedValue,
            ),
            Self::GlobalTextEncoderUtf8 => (
                "initializeUtf8Encoder",
                Some(RuntimeContext::Utf8Encoder),
                RuntimeImportKind::InitializedValue,
            ),
            Self::Utf16Encode => (
                "utf16Encode",
                Some(RuntimeContext::Utf16Encoding),
                RuntimeImportKind::Call,
            ),
            Self::Utf16EncodeAsync => (
                "utf16EncodeAsync",
                Some(RuntimeContext::Utf16Encoding),
                RuntimeImportKind::Call,
            ),
            Self::Utf8Encode => (
                "utf8Encode",
                Some(RuntimeContext::Utf8Encoder),
                RuntimeImportKind::Call,
            ),
            Self::Utf8EncodeAsync => (
                "utf8EncodeAsync",
                Some(RuntimeContext::Utf8Encoder),
                RuntimeImportKind::Call,
            ),
            Self::Utf16ValidatingCopy => ("utf16ValidatingCopy", None, RuntimeImportKind::Call),
            Self::ValidateGuestChar => ("validateGuestChar", None, RuntimeImportKind::Call),
            Self::ValidateHostChar => ("validateHostChar", None, RuntimeImportKind::Call),
        };
        RuntimeImport {
            suffix: "intrinsics/string",
            export,
            context,
            kind,
        }
    }

    /// Retrieve all global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::Utf16Decoder.name(),
            Self::Utf16Encode.name(),
            Self::Utf16EncodeAsync.name(),
            Self::Utf16ValidatingCopy.name(),
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
            Self::Utf16ValidatingCopy => "_utf16ValidatingCopy",
            Self::GlobalTextDecoderUtf8 => "TEXT_DECODER_UTF8",
            Self::GlobalTextEncoderUtf8 => "TEXT_ENCODER_UTF8",
            Self::Utf8Encode => "_utf8AllocateAndEncode",
            Self::Utf8EncodeAsync => "_utf8AllocateAndEncodeAsync",
            Self::ValidateGuestChar => "validateGuestChar",
            Self::ValidateHostChar => "validateHostChar",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs<'_>) {
        let name = self.name();
        match self {
            // NOTE: strings that are lifted must be passed on exactly as they were provided,
            // so the decoders neither replace invalid sequences nor drop a leading U+FEFF
            Self::Utf16Decoder => uwriteln!(
                output,
                "const {name} = new TextDecoder('utf-16', {{ fatal: true, ignoreBOM: true }});"
            ),

            Self::Utf16Encode | Self::Utf16EncodeAsync => {
                let is_le = render_args.require_intrinsic(Intrinsic::IsLE);

                let (fn_preamble, realloc_call) = match self {
                    Self::Utf16Encode => ("", "realloc"),
                    Self::Utf16EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(str, realloc, memory) {{
                          if (typeof str !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof str + ']');
                          }}
                          const len = str.length;
                          const ptr = {realloc_call}(0, 0, 2, len * 2);
                          const out = new Uint16Array(memory.buffer, ptr, len);
                          const put = {is_le}
                              ? (i, ch) => {{ out[i] = ch; }}
                              : (i, ch) => {{ out[i] = (ch & 0xff) << 8 | ch >>> 8; }};
                          for (let i = 0; i < len; i++) {{
                              let ch = str.charCodeAt(i);
                              if ((ch & 0xf800) === 0xd800) {{
                                  if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {{
                                      put(i++, ch);
                                      ch = str.charCodeAt(i);
                                  }} else {{
                                      // Unpaired surrogates are replaced, as when converting to a `USVString`
                                      ch = 0xfffd;
                                  }}
                              }}
                              put(i, ch);
                          }}
                          return {{ ptr, len, codepoints: [...str].length }};
                      }}
                    "#
                );
            }

            Self::Utf16ValidatingCopy => uwriteln!(
                output,
                r#"
                  function {name}(from, to) {{
                      let allLatin1 = true;
                      let highSurrogate = false;
                      for (let i = 0; i < from.length; i++) {{
                          const unit = from[i];
                          if (highSurrogate !== ((unit & 0xfc00) === 0xdc00)) {{ throw new Error('invalid utf16 encoding'); }}
                          highSurrogate = (unit & 0xfc00) === 0xd800;
                          if (unit > 0xff) {{ allLatin1 = false; }}
                          to[i] = unit;
                      }}
                      if (highSurrogate) {{ throw new Error('invalid utf16 encoding'); }}
                      return allLatin1;
                  }}
                "#
            ),

            Self::GlobalTextDecoderUtf8 => uwriteln!(
                output,
                "const {name} = new TextDecoder('utf-8', {{ fatal: true, ignoreBOM: true }});"
            ),
            Self::GlobalTextEncoderUtf8 => uwriteln!(output, "const {name} = new TextEncoder();"),

            Self::Utf8Encode | Self::Utf8EncodeAsync => {
                let encoder = render_args.require_intrinsic(Self::GlobalTextEncoderUtf8);
                let (fn_preamble, realloc_call) = match self {
                    Self::Utf8Encode => ("", "realloc"),
                    Self::Utf8EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(s, realloc, memory) {{
                          if (typeof s !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof s + ']');
                          }}
                          if (s.length === 0) {{ return {{ ptr: 1, len: 0 }}; }}
                          // Compute the exact allocation size up front. Some older preview1
                          // adapters only support an initial allocation, not a subsequent shrink.
                          let len = 0;
                          let codepoints = 0;
                          for (let i = 0; i < s.length; i++) {{
                              const ch = s.charCodeAt(i);
                              codepoints++;
                              if (ch < 0x80) {{ len += 1; }}
                              else if (ch < 0x800) {{ len += 2; }}
                              else if (ch >= 0xd800 && ch <= 0xdbff &&
                                       i + 1 < s.length &&
                                       (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {{
                                  len += 4;
                                  i++;
                              }} else {{ len += 3; }}
                          }}
                          const ptr = {realloc_call}(0, 0, 1, len);
                          const {{ read, written }} = {encoder}.encodeInto(
                              s,
                              new Uint8Array(memory.buffer, ptr, len),
                          );
                          if (read !== s.length || written !== len) {{
                              throw new Error('failed to encode whole string');
                          }}
                          const res = {{ ptr, len, codepoints }};
                          return res;
                      }}
                    "#
                );
            }

            Self::ValidateGuestChar => uwriteln!(
                output,
                r#"
                  function {name}(i) {{
                      if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) {{ throw new TypeError(`not a valid char`); }}
                      return String.fromCodePoint(i);
                  }}
                "#,
            ),

            Self::ValidateHostChar => uwriteln!(
                output,
                r#"
                  function {name}(s) {{
                      if (typeof s !== 'string') {{ throw new TypeError(`must be a string`); }}
                      return s.codePointAt(0);
                  }}
                "#
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{render_intrinsics, runtime};
    use std::collections::BTreeSet;

    #[test]
    fn inline_string_lowerers_use_contextual_calls_in_external_mode() {
        use crate::intrinsics::lower::LowerIntrinsic;
        for external in [false, true] {
            let mut intrinsics =
                BTreeSet::from([Intrinsic::Lower(LowerIntrinsic::LowerFlatStringAny)]);
            let opts = TranspileOpts {
                cm_runtime_es_module: external.then(|| "custom-runtime".into()),
                ..TranspileOpts::default()
            };
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .build(),
            );
            let utf8_context = if external { "TEXT_ENCODER_UTF8, " } else { "" };
            let utf16_context = if external {
                "_jcoUtf16EncodingContext, "
            } else {
                ""
            };
            assert!(source.contains(&format!(
                "_utf8AllocateAndEncode({utf8_context}ctx.vals[0], ctx.realloc, ctx.memory)"
            )));
            assert!(source.contains(&format!(
                "_utf16AllocateAndEncode({utf16_context}ctx.vals[0], ctx.realloc, ctx.memory)"
            )));
        }
    }

    #[test]
    fn codec_values_and_encoding_calls_share_only_selected_state() {
        let mut intrinsics = BTreeSet::from([
            Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8),
            Intrinsic::String(StringIntrinsic::Utf8Encode),
            Intrinsic::String(StringIntrinsic::Utf8EncodeAsync),
        ]);
        let opts = TranspileOpts {
            cm_runtime_es_module: Some("custom-runtime".into()),
            ..TranspileOpts::default()
        };
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        let mut imports = Source::default();
        runtime::render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert_eq!(
            source
                .matches("const TEXT_ENCODER_UTF8 = _jcoInitializeUtf8Encoder();")
                .count(),
            1
        );
        assert_eq!(
            imports
                .matches("initializeUtf8Encoder as _jcoInitializeUtf8Encoder")
                .count(),
            1
        );
        assert!(!imports.contains("initializeUtf8Encoder as TEXT_ENCODER_UTF8"));
        for unused in [
            "Utf8Decoder",
            "Utf16Decoder",
            "Utf16Encoding",
            "new Text",
            "new Map",
            "new Uint",
        ] {
            assert!(!source.contains(unused), "{unused}");
        }
        let call = Intrinsic::String(StringIntrinsic::Utf8Encode)
            .binding(true)
            .call("value, realloc, memory");
        assert_eq!(
            call,
            "_utf8AllocateAndEncode(TEXT_ENCODER_UTF8, value, realloc, memory)"
        );
    }

    #[test]
    fn context_free_copy_does_not_initialize_codecs_or_endianness() {
        let mut intrinsics = BTreeSet::from([
            Intrinsic::String(StringIntrinsic::Utf16ValidatingCopy),
            Intrinsic::String(StringIntrinsic::ValidateGuestChar),
            Intrinsic::String(StringIntrinsic::ValidateHostChar),
        ]);
        let opts = TranspileOpts {
            cm_runtime_es_module: Some("custom-runtime".into()),
            ..TranspileOpts::default()
        };
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        let mut imports = Source::default();
        runtime::render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert!(!source.contains("Initialize"));
        assert!(!source.contains("new Text"));
        assert!(!source.contains("new Uint"));
        assert!(!imports.contains("initialize"));
        assert!(imports.contains("utf16ValidatingCopy as _utf16ValidatingCopy"));
    }
}
