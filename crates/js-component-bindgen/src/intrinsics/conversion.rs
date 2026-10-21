//! Intrinsics that represent helpers perform conversions

use std::fmt::Write;

use crate::intrinsics::RenderIntrinsicsArgs;
use crate::source::Source;
use crate::uwriteln;

/// This enum contains intrinsics that help perform type conversions
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ConversionIntrinsic {
    I32ToF32,
    I64ToF64,
    F32ToI32,
    F64ToI64,

    /// Convert a i32 to a char
    I32ToChar,

    /// Implementation of <https://tc39.es/ecma262/#sec-tobigint64>
    ToBigInt64,
    /// Implementation of <https://tc39.es/ecma262/#sec-tobiguint64>
    ToBigUint64,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint16>
    ToInt16,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint32>
    ToInt32,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint8>
    ToInt8,

    /// Implementation of <https://tc39.es/ecma262/#sec-tostring>
    ToString,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint16>
    ToUint16,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint32>
    ToUint32,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint8>
    ToUint8,

    ToResultString,

    /// Function that requires validity of various numeric primitive types (or throws a `TypeError`)
    RequireValidNumericPrimitive,

    /// Function that checks validity of various numeric primitive types
    IsValidNumericPrimitive,

    MergeBigInt64,
    SplitBigInt64,
}

impl ConversionIntrinsic {
    pub(crate) fn runtime_import(&self) -> super::runtime::RuntimeImport {
        use super::runtime::{RuntimeContext, RuntimeImport};
        let (export, context) = match self {
            Self::I32ToF32 => ("i32ToF32", Some(RuntimeContext::Bitcast32)),
            Self::F32ToI32 => ("f32ToI32", Some(RuntimeContext::Bitcast32)),
            Self::I64ToF64 => ("i64ToF64", Some(RuntimeContext::Bitcast64)),
            Self::F64ToI64 => ("f64ToI64", Some(RuntimeContext::Bitcast64)),
            Self::ToInt8 => ("toInt8", Some(RuntimeContext::StrictNumeric)),
            Self::ToUint8 => ("toUint8", Some(RuntimeContext::StrictNumeric)),
            Self::ToInt16 => ("toInt16", Some(RuntimeContext::StrictNumeric)),
            Self::ToUint16 => ("toUint16", Some(RuntimeContext::StrictNumeric)),
            Self::ToInt32 => ("toInt32", Some(RuntimeContext::StrictNumeric)),
            Self::ToUint32 => ("toUint32", Some(RuntimeContext::StrictNumeric)),
            Self::ToBigInt64 => ("toInt64", Some(RuntimeContext::StrictNumeric)),
            Self::ToBigUint64 => ("toUint64", Some(RuntimeContext::StrictNumeric)),
            Self::I32ToChar => ("i32ToChar", None),
            Self::ToString => ("toString", None),
            Self::ToResultString => ("toResultString", None),
            Self::IsValidNumericPrimitive => ("isValidNumericPrimitive", None),
            Self::RequireValidNumericPrimitive => ("requireValidNumericPrimitive", None),
            Self::MergeBigInt64 => ("mergeInt64", None),
            Self::SplitBigInt64 => ("splitInt64", None),
        };
        RuntimeImport {
            suffix: "intrinsics/conversion",
            export,
            context,
        }
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "f32ToI32",
            "f64ToI64",
            "i32ToChar",
            "i32ToF32",
            "i64ToF64",
            "toInt16",
            "toInt32",
            "toInt64",
            "toInt8",
            "toResultString",
            "toString",
            "toUint16",
            "toUint32",
            "toUint64",
            "toUint64",
            "toUint8",
            Self::SplitBigInt64.name(),
            Self::MergeBigInt64.name(),
            Self::RequireValidNumericPrimitive.name(),
            Self::IsValidNumericPrimitive.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ToBigInt64 => "toInt64",
            Self::I32ToChar => "i32ToChar",
            Self::ToBigUint64 => "toUint64",
            Self::ToInt16 => "toInt16",
            Self::ToInt32 => "toInt32",
            Self::ToInt8 => "toInt8",
            Self::ToResultString => "toResultString",
            Self::ToString => "toString",
            Self::ToUint16 => "toUint16",
            Self::ToUint32 => "toUint32",
            Self::ToUint8 => "toUint8",
            Self::I32ToF32 => "i32ToF32",
            Self::I64ToF64 => "i64ToF64",
            Self::F32ToI32 => "f32ToI32",
            Self::F64ToI64 => "f64ToI64",
            Self::MergeBigInt64 => "mergeInt64",
            Self::SplitBigInt64 => "splitInt64",
            Self::RequireValidNumericPrimitive => "_requireValidNumericPrimitive",
            Self::IsValidNumericPrimitive => "_isValidNumericPrimitive",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs) {
        match self {
            Self::I32ToF32 => output.push_str(
                "
                const i32ToF32 = i => (i32ToF32I[0] = i, i32ToF32F[0]);
            ",
            ),

            Self::F32ToI32 => output.push_str(
                "
                const f32ToI32 = f => (i32ToF32F[0] = f, i32ToF32I[0]);
            ",
            ),

            Self::I64ToF64 => output.push_str(
                "
                const i64ToF64 = i => (i64ToF64I[0] = i, i64ToF64F[0]);
            ",
            ),

            Self::F64ToI64 => output.push_str("
                const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
            "),

            Self::ToBigInt64 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('s64', converted);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toInt64(val) {{
                          const converted = BigInt(val)
                          {strict_checks}
                          return BigInt.asIntN(64, converted);
                      }}
                    "#
                )
            },

            Self::ToBigUint64 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('u64', converted);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toUint64(val) {{
                          const converted = BigInt(val)
                          {strict_checks}
                          return BigInt.asUintN(64, converted);
                      }}
                    "#
                );
            },

            Self::ToInt16 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('s16', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toInt16(val) {{
                          {strict_checks}
                          val >>>= 0;
                          val %= 2 ** 16;
                          if (val >= 2 ** 15) {{
                              val -= 2 ** 16;
                          }}
                          return val;
                      }}
                    "#
                );
            },

            Self::ToUint16 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('u16', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toUint16(val) {{
                          {strict_checks}
                          val >>>= 0;
                          val %= 2 ** 16;
                          return val;
                      }}
                    "#
                )
            },

            Self::ToInt32 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('s32', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toInt32(val) {{
                          {strict_checks}
                          return val >> 0;
                      }}
                    "#
                );
            },

            Self::ToInt8 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('s8', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toInt8(val) {{
                          {strict_checks}
                          val >>>= 0;
                          val %= 2 ** 8;
                          if (val >= 2 ** 7) {{
                              val -= 2 ** 8;
                          }}
                          return val;
                      }}
                   "#
                );
            },

            Self::ToResultString => output.push_str("
                function toResultString(obj) {
                    return JSON.stringify(obj, (_, v) => {
                        if (v && Object.getPrototypeOf(v) === Uint8Array.prototype) {
                            return `[${v[Symbol.toStringTag]} (${v.byteLength})]`;
                        } else if (typeof v === 'bigint') {
                            return v.toString();
                        }
                        return v;
                    });
                }
            "),

            Self::ToString => output.push_str("
                function toString(val) {
                    if (typeof val === 'symbol') throw new TypeError('symbols cannot be converted to strings');
                    return String(val);
                }
            "),


            Self::ToUint32 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('u32', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toUint32(val) {{
                          {strict_checks}
                          return val >>> 0;
                      }}
                    "#
                )
            },

            Self::ToUint8 => {
                let strict_checks = if render_args.transpile_opts.strict {
                    let require_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::RequireValidNumericPrimitive);
                    format!("{require_valid_numeric_primitive_fn}('u8', val);")
                } else {
                    "".into()
                };

                uwriteln!(
                    output,
                    r#"
                      function toUint8(val) {{
                          {strict_checks}
                          val >>>= 0;
                          val %= 2 ** 8;
                          return val;
                      }}
                    "#
                );
            },

            Self::I32ToChar => {
                output.push_str("
                    function i32ToChar(n) {
                        if (!n || typeof n !== 'number') { throw new Error('invalid i32'); }
                        if (n < 0) { throw new Error('i32 must be greater than zero'); }
                        if (n >= 0x110000) { throw new Error('invalid i32, out of range'); }
                        if (0xD800 <= n && n <= 0xDFFF) { throw new Error('invalid i32 out of range'); }
                        return String.fromCharCode(n);
                    }
                ");
            }

            Self::RequireValidNumericPrimitive => {
                let name = self.name();
                let is_valid_numeric_primitive_fn = render_args.require_intrinsic(Self::IsValidNumericPrimitive);

                output.push_str(&format!(r#"
                    function {name}(ty, v) {{
                        if (v === undefined  || v === null || !{is_valid_numeric_primitive_fn}(ty, v)) {{
                            throw new TypeError(`invalid ${{ty}} value [${{v}}]`);
                        }}
                        return true;
                    }}
                "#))
            }

            Self::IsValidNumericPrimitive => {
                let name = self.name();
                output.push_str(&format!(r#"
                    function {name}(ty, v) {{
                        if (v === undefined || v === null) {{ return false; }}
                        switch (ty) {{
                            case 'bool':
                                return v === 0 || v === 1;
                                break;
                            case 'u8':
                                return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255;
                                break;
                            case 's8':
                                return typeof v === 'number' && Number.isInteger(v) && v >= -128 && v <= 127;
                                break;
                            case 'u16':
                                return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535;
                                break;
                            case 's16':
                                return typeof v === 'number' && Number.isInteger(v) && v >= -32768 && v <= 32767;
                            case 'u32':
                                return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4_294_967_295;
                            case 's32':
                                return typeof v === 'number' && Number.isInteger(v) && v >= -2_147_483_648 && v <= 2_147_483_647;
                            case 'u64':
                                return typeof v === 'bigint' && v >= 0 && v <= 18_446_744_073_709_551_615n;
                            case 's64':
                                return typeof v === 'bigint' && v >= -9223372036854775808n && v <= 9223372036854775807n;
                                break;
                            case 'f32':
                            case 'f64': return typeof v === 'number';
                            default:
                                return false;
                        }}
                        return true;
                    }}
               "#
                ));
            }

            Self::SplitBigInt64 => {
                let name = self.name();
                uwriteln!(output, "
                const {name} = i => [Number(i & 0xFFFFFFFFn)|0, Number((i >> 32n) & 0xFFFFFFFFn)|0];
                ")
            },

            Self::MergeBigInt64 => {
                let name = self.name();
                uwriteln!(output, "
                const {name} = (l, h) => (BigInt(l|0) | (BigInt(h|0) << 32n));
                ");
            },
        }
    }
}

#[cfg(test)]
mod runtime_tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{Intrinsic, render_intrinsics, runtime::render_imports};
    use std::collections::BTreeSet;

    fn render(selected: &[ConversionIntrinsic], strict: bool, external: bool) -> (String, String) {
        let mut intrinsics: BTreeSet<_> = selected
            .iter()
            .copied()
            .map(Intrinsic::Conversion)
            .collect();
        let opts = TranspileOpts::builder()
            .name("conversion".into())
            .strict(strict)
            .maybe_cm_runtime_es_module(external.then(|| "runtime-package".into()))
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        let mut imports = Source::default();
        if external {
            render_imports(&mut imports, &intrinsics, "runtime-package");
        }
        (source.to_string(), imports.to_string())
    }

    #[test]
    fn selected_scalar_context_does_not_allocate_unrelated_storage() {
        for strict in [false, true] {
            let (source, imports) = render(&[ConversionIntrinsic::ToUint32], strict, true);
            assert!(source.contains(&format!(
                "const _jcoStrictNumericContext = {{ strict: {strict} }};"
            )));
            assert!(imports.contains("toUint32 as toUint32"));
            for unrelated in [
                "Bitcast",
                "new Map",
                "new Int32Array",
                "new BigInt64Array",
                "TextEncoder",
                "TextDecoder",
                "function toUint32",
            ] {
                assert!(!source.contains(unrelated), "{unrelated}");
            }
            assert!(!imports.contains("initialize"));
        }
        let (source, imports) = render(&[ConversionIntrinsic::ToString], false, true);
        assert!(!source.contains("Context"));
        assert!(!imports.contains("initialize"));
    }

    #[test]
    fn selected_bitcast_family_initializes_once_and_keeps_inline_fallback() {
        for (variants, context, initialize, other) in [
            (
                [ConversionIntrinsic::I32ToF32, ConversionIntrinsic::F32ToI32],
                "_jcoBitcast32Context",
                "_jcoInitializeBitcast32",
                "Bitcast64",
            ),
            (
                [ConversionIntrinsic::I64ToF64, ConversionIntrinsic::F64ToI64],
                "_jcoBitcast64Context",
                "_jcoInitializeBitcast64",
                "Bitcast32",
            ),
        ] {
            let (source, imports) = render(&variants, false, true);
            assert_eq!(
                source
                    .matches(&format!("const {context} = {initialize}();"))
                    .count(),
                1
            );
            assert_eq!(imports.matches(&format!("as {initialize}")).count(), 1);
            assert!(!source.contains("new Int32Array"));
            assert!(!source.contains("new Float32Array"));
            assert!(!source.contains("new BigInt64Array"));
            assert!(!source.contains("new Float64Array"));
            assert!(!source.contains(other));
            assert!(!imports.contains(other));
            let (inline, _) = render(&variants, false, false);
            assert!(inline.contains("new "));
            assert!(!inline.contains("_jco"));
        }
    }

    #[test]
    fn all_nineteen_variants_have_unique_named_calls_and_narrow_contexts() {
        let variants = [
            ConversionIntrinsic::I32ToF32,
            ConversionIntrinsic::F32ToI32,
            ConversionIntrinsic::I64ToF64,
            ConversionIntrinsic::F64ToI64,
            ConversionIntrinsic::I32ToChar,
            ConversionIntrinsic::ToInt8,
            ConversionIntrinsic::ToUint8,
            ConversionIntrinsic::ToInt16,
            ConversionIntrinsic::ToUint16,
            ConversionIntrinsic::ToInt32,
            ConversionIntrinsic::ToUint32,
            ConversionIntrinsic::ToBigInt64,
            ConversionIntrinsic::ToBigUint64,
            ConversionIntrinsic::ToString,
            ConversionIntrinsic::ToResultString,
            ConversionIntrinsic::IsValidNumericPrimitive,
            ConversionIntrinsic::RequireValidNumericPrimitive,
            ConversionIntrinsic::MergeBigInt64,
            ConversionIntrinsic::SplitBigInt64,
        ];
        assert_eq!(variants.len(), 19);
        let mut exports = BTreeSet::new();
        for variant in variants {
            let import = variant.runtime_import();
            assert_eq!(import.suffix, "intrinsics/conversion");
            assert!(exports.insert(import.export));
            let call = Intrinsic::Conversion(variant).binding(true).call("operand");
            match import.context {
                Some(context) => assert!(call.contains(&format!(
                    "{}({}, operand)",
                    variant.name(),
                    context.local_name()
                ))),
                None => assert_eq!(call, format!("{}(operand)", variant.name())),
            }
        }
    }
}
