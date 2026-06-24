use std::fmt::Write;

use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs, StringIntrinsic};
use crate::source::Source;
use crate::uwriteln;

impl super::BuiltinIntrinsicRenderer {
    pub(crate) fn render_string(
        &self,
        intrinsic: &StringIntrinsic,
        output: &mut Source,
        _render_args: &RenderIntrinsicsArgs<'_>,
    ) {
        match intrinsic {
            StringIntrinsic::Utf16Decoder => {
                let name = intrinsic.name();
                uwriteln!(output, "const {name} = new TextDecoder('utf-16');")
            }

            StringIntrinsic::Utf16Encode | StringIntrinsic::Utf16EncodeAsync => {
                // TODO: express this dependency
                let is_le = Intrinsic::IsLE.name();

                let (fn_preamble, realloc_call) = match intrinsic {
                    StringIntrinsic::Utf16Encode => ("", "realloc"),
                    StringIntrinsic::Utf16EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                let name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(str, realloc, memory) {{
                          const len = str.length;
                          const ptr = {realloc_call}(0, 0, 2, len * 2);
                          const out = new Uint16Array(memory.buffer, ptr, len);
                          let i = 0;
                          if ({is_le}) {{
                              while (i < len) {{ out[i] = str.charCodeAt(i++); }}
                          }} else {{
                              while (i < len) {{
                                  const ch = str.charCodeAt(i);
                                  out[i++] = (ch & 0xff) << 8 | ch >>> 8;
                              }}
                          }}
                          return {{ ptr, len, codepoints: [...str].length }};
                      }}
                    "#
                );
            }

            StringIntrinsic::GlobalTextDecoderUtf8 => {
                let name = intrinsic.name();
                uwriteln!(output, "const {name} = new TextDecoder();")
            }
            StringIntrinsic::GlobalTextEncoderUtf8 => {
                let name = intrinsic.name();
                uwriteln!(output, "const {name} = new TextEncoder();")
            }

            StringIntrinsic::Utf8Encode | StringIntrinsic::Utf8EncodeAsync => {
                let encoder = StringIntrinsic::GlobalTextEncoderUtf8.name();
                let (fn_preamble, realloc_call) = match intrinsic {
                    StringIntrinsic::Utf8Encode => ("", "realloc"),
                    StringIntrinsic::Utf8EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                let name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(s, realloc, memory) {{
                          if (typeof s !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof s + ']');
                          }}
                          if (s.length === 0) {{ return {{ ptr: 1, len: 0 }}; }}
                          let buf = {encoder}.encode(s);
                          let ptr = {realloc_call}(0, 0, 1, buf.length);
                          new Uint8Array(memory.buffer).set(buf, ptr);
                          const res = {{ ptr, len: buf.length, codepoints: [...s].length }};
                          return res;
                      }}
                    "#
                );
            }

            StringIntrinsic::ValidateGuestChar => {
                let name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                  function {name}(i) {{
                      if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) {{ throw new TypeError(`not a valid char`); }}
                      return String.fromCodePoint(i);
                  }}
                "#,
                );
            }

            StringIntrinsic::ValidateHostChar => {
                let name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                  function {name}(s) {{
                      if (typeof s !== 'string') {{ throw new TypeError(`must be a string`); }}
                      return s.codePointAt(0);
                  }}
                "#
                );
            }
        }
    }
}
