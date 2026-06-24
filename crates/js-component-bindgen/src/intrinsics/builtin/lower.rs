use std::fmt::Write as _;

use crate::intrinsics::{
    AsyncFutureIntrinsic, AsyncStreamIntrinsic, ComponentIntrinsic, ConversionIntrinsic,
    ErrCtxIntrinsic, Intrinsic, LowerIntrinsic, RenderIntrinsicsArgs, StringIntrinsic,
};
use crate::source::Source;
use crate::uwriteln;

impl super::BuiltinIntrinsicRenderer {
    /// Render a [`LowerIntrinsic`]
    pub(crate) fn render_lower(
        &self,
        intrinsic: &LowerIntrinsic,
        output: &mut Source,
        _args: &RenderIntrinsicsArgs,
    ) {
        match intrinsic {
            LowerIntrinsic::LowerFlatBool => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();
                output.push_str(&format!(r#"
                    function _lowerFlatBool(ctx) {{
                        {debug_log_fn}('[_lowerFlatBool()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('bool', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatS8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();
                output.push_str(&format!(r#"
                    function _lowerFlatS8(ctx) {{
                        {debug_log_fn}('[_lowerFlatS8()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}
                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}

                        {require_valid_numeric_primitive_fn}.bind('s8', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatU8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u8_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u8_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u8_fn}()] args', ctx);

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('u8', ctx.vals[0]);

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatS16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s16_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_s16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s16_fn}()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}

                        const rem = ctx.storagePtr % 2;
                        if (rem !== 0) {{ ctx.storagePtr += (2 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('s16', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setInt16(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 2;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatU16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u16_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u16_fn}()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}

                        const rem = ctx.storagePtr % 2;
                        if (rem !== 0) {{ ctx.storagePtr += (2 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('u16', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 2;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatS32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s32_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_s32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of vals (expected 1)`);
                        }}

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('s32', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;
                    }}
                "#));
            }

            // TODO(fix) can u32s be lowered indirectly? maybe never?
            // discrepancy of indirect values and indirect params (where to get storagePtr/len)
            // to the function versus params that actually indicate where to write!
            LowerIntrinsic::LowerFlatU32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u32_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`expected single value to lower, got [${{ctx.vals.length}}]`);
                        }}

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('u32', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatS64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s64_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_s64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s64_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('s64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);


                        ctx.storagePtr += 8;
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatU64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u64_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_u64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u64_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('u64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatFloat32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_f32_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_f32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_f32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('f32', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setFloat32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatFloat64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_f64_fn = intrinsic.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_f64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_f64_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}

                        {require_valid_numeric_primitive_fn}.bind('f64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatChar => {
                let i32_to_char_fn = Intrinsic::Conversion(ConversionIntrinsic::I32ToChar).name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatChar(ctx) {{
                        {debug_log_fn}('[_lowerFlatChar()] args', {{ ctx }});

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, {i32_to_char_fn}(ctx.vals[0]), true);

                        ctx.storagePtr += 4;
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatStringAny => {
                let lower_flat_string_any_fn = intrinsic.name();
                let lower_flat_string_utf8_fn = LowerIntrinsic::LowerFlatStringUtf8.name();
                let lower_flat_string_utf16_fn = LowerIntrinsic::LowerFlatStringUtf16.name();
                output.push_str(&format!("
                    function {lower_flat_string_any_fn}(ctx) {{
                        switch (ctx.stringEncoding) {{
                            case 'utf8':
                                return {lower_flat_string_utf8_fn}(ctx);
                            case 'utf16':
                                return {lower_flat_string_utf16_fn}(ctx);
                            default:
                                throw new Error(`missing/unrecognized/unsupported string encoding [${{ctx.stringEncoding}}]`);
                        }}
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatStringUtf16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_string_utf16_fn = intrinsic.name();
                let utf16_encode_fn = Intrinsic::String(StringIntrinsic::Utf16Encode).name();

                output.push_str(&format!("
                    function {lower_flat_string_utf16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_string_utf16_fn}()] args', {{ ctx }});
                        if (!ctx.realloc) {{ throw new Error('missing realloc during flat string lower'); }}

                        const s = ctx.vals[0];
                        const {{ ptr, len, codepoints }} = {utf16_encode_fn}(ctx.vals[0], ctx.realloc, ctx.memory);

                        const view = new DataView(ctx.memory.buffer);
                        view.setUint32(ctx.storagePtr, ptr, true);
                        view.setUint32(ctx.storagePtr + 4, codepoints, true);

                        const bytes = new Uint16Array(ctx.memory.buffer, start, codeUnits);
                        if (ctx.memory.buffer.byteLength < start + bytes.byteLength) {{
                            throw new Error('memory out of bounds');
                        }}
                        if (ctx.storageLen !== undefined && ctx.storageLen !== bytes.byteLength) {{
                            throw new Error(`storage length [${{ctx.storageLen}}] != [${{bytes.byteLength}}])`);
                        }}
                        new Uint16Array(ctx.memory.buffer, ctx.storagePtr).set(bytes);

                        ctx.storagePtr += len;
                    }}
                "));
            }

            LowerIntrinsic::LowerFlatStringUtf8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_string_utf8_fn = intrinsic.name();
                let utf8_encode_fn = Intrinsic::String(StringIntrinsic::Utf8Encode).name();

                output.push_str(&format!(r#"
                    function {lower_flat_string_utf8_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_string_utf8_fn}()] args', ctx);
                        if (!ctx.realloc) {{ throw new Error('missing realloc during flat string lower'); }}

                        const s = ctx.vals[0];
                        const {{ ptr, codepoints }} = {utf8_encode_fn}(ctx.vals[0], ctx.realloc, ctx.memory);

                        const view = new DataView(ctx.memory.buffer);
                        view.setUint32(ctx.storagePtr, ptr, true);
                        view.setUint32(ctx.storagePtr + 4, codepoints, true);

                        ctx.storagePtr += 8;
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatRecord => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_record_fn = intrinsic.name();

                output.push_str(&format!(
                    r#"
                    function {lower_flat_record_fn}(meta) {{
                        const {{ fieldMetas, size32: recordSize32, align32: recordAlign32 }} = meta;
                        return function {lower_flat_record_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_record_fn}()] args', {{ ctx }});

                            const originalPtr = ctx.storagePtr;
                            const r = ctx.vals[0];
                            for (const [tag, lowerFn, size32, align32 ] of fieldMetas) {{
                                const rem = ctx.storagePtr % align32;
                                if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}

                                const fieldPtr = ctx.storagePtr;
                                ctx.vals = [r[tag]];
                                lowerFn(ctx);

                                ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
                            }}

                            ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);

                            const rem = ctx.storagePtr % recordAlign32;
                            if (rem !== 0) {{
                                ctx.storagePtr += recordAlign32 - rem;
                            }}
                        }}
                    }}
                "#
                ));
            }

            LowerIntrinsic::LowerFlatVariant => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_variant_fn = intrinsic.name();
                let lower_u8_fn = LowerIntrinsic::LowerFlatU8.name();
                let lower_u16_fn = LowerIntrinsic::LowerFlatU16.name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();

                output.push_str(&format!(r#"
                    function {lower_flat_variant_fn}(meta) {{
                        const {{ variantSize32, variantAlign32, variantPayloadOffset32, caseMetas }} = meta;

                        let caseLookup = {{}};
                        for (const [idx, meta] of caseMetas.entries()) {{
                            let tag = meta[0];
                            caseLookup[tag] = {{ discriminant: idx, meta }};
                        }}

                        return function {lower_flat_variant_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_variant_fn}()] args', {{ ctx }});

                            const {{ tag, val }} = ctx.vals[0];
                            const variantCase = caseLookup[tag];
                            if (!variantCase) {{
                                throw new Error(`missing tag [${{tag}}] (valid tags: ${{Object.keys(caseLookup)}})`);
                            }}

                            const [ _tag, lowerFn, caseSize32, caseAlign32, caseFlatCount ] = variantCase.meta;

                            const originalPtr = ctx.storagePtr;
                            ctx.vals = [variantCase.discriminant];
                            let discLowerRes;
                            if (caseMetas.length < 256) {{
                                discLowerRes = {lower_u8_fn}(ctx);
                            }} else if (caseMetas.length >= 256 && caseMetas.length < 65536) {{
                                discLowerRes = {lower_u16_fn}(ctx);
                            }} else if (caseMetas.length >= 65536 && caseMetas.length < 4_294_967_296) {{
                                discLowerRes = {lower_u32_fn}(ctx);
                            }} else {{
                                throw new Error(`unsupported number of cases [${{caseMetas.length}}]`);
                            }}

                            const payloadOffsetPtr = originalPtr + variantPayloadOffset32;
                            ctx.storagePtr = payloadOffsetPtr;
                            ctx.vals = [val];
                            if (lowerFn) {{ lowerFn(ctx); }}

                            ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);

                            const rem = ctx.storagePtr % variantAlign32;
                            if (rem !== 0) {{ ctx.storagePtr += varianttAlign32 - rem; }}
                        }}
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatList => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_list_fn = intrinsic.name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();

                output.push_str(&format!(r#"
                    function {lower_flat_list_fn}(meta) {{
                        const {{
                            elemLowerFn,
                            knownLen,
                            size32,
                            align32,
                            elemSize32,
                            elemAlign32,
                        }} = meta;

                        if (!elemLowerFn) {{ throw new TypeError("missing/invalid element lower fn for list"); }}

                        return function {lower_flat_list_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_list_fn}()] args', {{ ctx }});

                            if (ctx.useDirectParams) {{
                                if (ctx.params.length < 2) {{ throw new Error('insufficient params left to lower list'); }}
                                const storagePtr = ctx.params[0];
                                const elemCount = ctx.params[1];
                                ctx.params = ctx.params.slice(2);

                                const list = ctx.vals[0];
                                if (!list) {{ throw new Error("missing direct param value"); }}

                                const lowerCtx = {{
                                    storagePtr,
                                    memory: ctx.memory,
                                    stringEncoding: ctx.stringEncoding,
                                }};
                                for (let idx = 0; idx < list.length; idx++) {{
                                    const elemPtr = storagePtr + idx * elemSize32;
                                    lowerCtx.storagePtr = elemPtr;
                                    lowerCtx.vals = list.slice(idx, idx+1);
                                    elemLowerFn(lowerCtx);
                                    lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
                                }}
                                ctx.storagePtr = lowerCtx.storagePtr;

                                // TODO: implement parma-only known-length processing

                                return;
                            }}

                            // TODO(fix): is it possible to get a vals that are a addr and length here from
                            // a component lower?

                            const elems = ctx.vals[0];
                            if (knownLen === undefined) {{
                                // unknown length
                                if (!ctx.realloc) {{ throw new Error('missing realloc during flat string lower'); }}
                                const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);

                                ctx.vals[0] = dataPtr;
                                {lower_u32_fn}(ctx);

                                ctx.vals[0] = elems.length;
                                {lower_u32_fn}(ctx);

                                const origPtr = ctx.storagePtr;
                                ctx.storagePtr = dataPtr;

                                for (const [idx, elem] of elems.entries()) {{
                                    const elemPtr = dataPtr + idx * elemSize32;
                                    ctx.storagePtr = elemPtr;
                                    ctx.vals = [elem];
                                    elemLowerFn(ctx);
                                    ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
                                }}

                                ctx.storagePtr = origPtr;

                            }} else {{
                                // known length

                                if (elems.length !== knownLen) {{
                                    throw new TypeError(`invalid list input of length [${{elems.length}}], must be length [${{knownLen}}]`);
                                }}

                                const originalPtr = ctx.storagePtr;
                                for (const [idx, elem] of elems.entries()) {{
                                    const elemPtr = originalPtr + idx * elemSize32;
                                    ctx.storagePtr = elemPtr;
                                    ctx.vals = [elem];
                                    elemLowerFn(ctx);
                                    ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
                                }}
                            }}

                            // TODO(fix): special case for u8/u16/etc, we can do a direct copy

                            const totalSizeBytes = elems.length * size32;
                            if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {{
                                throw new Error('not enough storage remaining for list flat lower');
                            }}
                        }}
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatTuple => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_tuple_fn = intrinsic.name();

                output.push_str(&format!(
                    r#"
                    function {lower_flat_tuple_fn}(meta) {{
                        const {{ elemLowerMetas, size32: tupleSize32, align32: tupleAlign32 }} = meta;
                        return function {lower_flat_tuple_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_tuple_fn}()] args', {{ ctx }});
                            const originalPtr = ctx.storagePtr;
                            const tuple = ctx.vals[0];
                            for (const [idx, [ lowerFn, size32, align32 ]]  of elemLowerMetas.entries()) {{
                                const rem = ctx.storagePtr % align32;
                                if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}

                                const elemPtr = ctx.storagePtr;
                                ctx.vals = [tuple[idx]];
                                lowerFn(ctx);
                                ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
                            }}

                            ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);

                            const rem = ctx.storagePtr % tupleAlign32;
                            if (rem !== 0) {{
                                ctx.storagePtr += tupleAlign32 - rem;
                            }}
                        }}
                    }}
                "#
                ));
            }

            LowerIntrinsic::LowerFlatFlags => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_flags_fn = intrinsic.name();

                output.push_str(&format!(r#"
                    function {lower_flat_flags_fn}(meta) {{
                        const {{ names, size32, align32, intSizeBytes }} = meta;

                        return function {lower_flat_flags_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_flags_fn}()] args', {{ ctx }});
                            if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of vals'); }}

                            let flagObj = ctx.vals[0];
                            let flagValue = 0;
                            if (typeof flagObj === 'object' && flagObj !== null) {{
                                for (const [idx, name] of names.entries()) {{
                                    if (flagObj[name] === true) {{
                                        flagValue |= 1 << idx;
                                    }}
                                }}
                            }} else if (flagObj !== null && flagObj !== undefined) {{
                                throw new TypeError('only an object, undefined or null can be converted to flags');
                            }}

                            const rem = ctx.storagePtr % align32;
                            if (rem !== 0) {{ ctx.storagePtr += (align32 - rem); }}

                            const dv = new DataView(ctx.memory.buffer);
                            if (intSizeBytes === 1) {{
                                dv.setUint8(ctx.storagePtr, flagValue);
                            }} else if (intSizeBytes === 2) {{
                                dv.setUint16(ctx.storagePtr, flagValue);
                            }} else if (intSizeBytes === 4) {{
                                dv.setUint32(ctx.storagePtr, flagValue);
                            }} else {{
                                throw new Error(`unrecognized flag size [${{intSizeBytes}} bytes]`);
                            }}

                            ctx.storagePtr += intSizeBytes;
                        }}
                    }}
                "#));
            }

            LowerIntrinsic::LowerFlatEnum => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_enum_fn = intrinsic.name();
                let lower_variant_fn = LowerIntrinsic::LowerFlatVariant.name();

                output.push_str(&format!(
                    r#"
                    function {lower_flat_enum_fn}(meta) {{
                        const f = {lower_variant_fn}(meta);
                        return function {lower_flat_enum_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_enum_fn}()] args', {{ ctx }});

                            const v = ctx.vals[0];
                            const isNotEnumObject = typeof v !== 'object'
                                                      || Object.keys(v).length !== 2
                                                      || !('tag' in v);
                            if (isNotEnumObject) {{
                                ctx.vals[0] = {{ tag: v }};
                            }}

                            f(ctx);
                        }}
                    }}
                "#
                ));
            }

            LowerIntrinsic::LowerFlatOption => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_option_fn = intrinsic.name();
                let lower_variant_fn = LowerIntrinsic::LowerFlatVariant.name();

                output.push_str(&format!(
                    "
                    function {lower_flat_option_fn}(meta) {{
                        const f = {lower_variant_fn}(meta);
                        return function {lower_flat_option_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_option_fn}()] args', {{ ctx }});

                            const v = ctx.vals[0];
                            if (v === null) {{
                                ctx.vals[0] = {{ tag: 'none' }};
                            }} else {{
                                const isNotOptionObject = typeof v !== 'object'
                                                          || Object.keys(v).length !== 2
                                                          || !('tag' in v)
                                                          || !(v.tag === 'some' || v.tag === 'none')
                                                          || !('val' in v);
                                if (isNotOptionObject) {{
                                    ctx.vals[0] = {{ tag: 'some', val: v }};
                                }}
                            }}

                            f(ctx);
                        }}
                    }}
                "
                ));
            }

            LowerIntrinsic::LowerFlatResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_result_fn = intrinsic.name();
                let lower_variant_fn = LowerIntrinsic::LowerFlatVariant.name();

                output.push_str(&format!(
                    r#"
                    function {lower_flat_result_fn}(meta) {{
                       const f = {lower_variant_fn}(meta);
                       return function {lower_flat_result_fn}Inner(ctx) {{
                           {debug_log_fn}('[{lower_flat_result_fn}()] args', {{ ctx }});

                           const v = ctx.vals[0];
                           const isNotResultObject = typeof v !== 'object'
                                                     || Object.keys(v).length !== 2
                                                     || !('tag' in v)
                                                     || !('ok' === v.tag || 'err' === v.tag)
                                                     || !('val' in v);
                           if (isNotResultObject) {{
                               ctx.vals[0] = {{ tag: 'ok', val: v }};
                           }}

                           f(ctx);
                       }};
                    }}
                    "#
                ));
            }

            LowerIntrinsic::LowerFlatOwn => {
                let lower_flat_own_fn = intrinsic.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();

                output.push_str(&format!(
                    r#"
                      function {lower_flat_own_fn}(meta) {{
                          const {{ lowerFn, componentIdx }} = meta;

                          return function {lower_flat_own_fn}Inner(ctx) {{
                              {debug_log_fn}('[{lower_flat_own_fn}()] args', {{ ctx }});
                              const {{ createFn }} = ctx;

                              if (ctx.componentIdx !== componentIdx) {{
                                  throw new Error(`component index mismatch (expected [${{componentIdx}}], lift called from [${{ctx.componentIdx}}])`);
                              }}

                              const obj = ctx.vals[0];
                              if (obj === undefined || obj === null) {{ throw new Error('missing resource'); }}
                              const handle = lowerFn(obj);

                              ctx.vals[0] = handle;
                              {lower_u32_fn}(ctx);
                          }};
                      }}
                    "#
                ));
            }

            LowerIntrinsic::LowerFlatBorrow => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_borrow_fn = intrinsic.name();
                output.push_str(&format!(
                    "
                    function {lower_flat_borrow_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_borrow_fn}()] args', {{ ctx }});
                        throw new Error('flat lower for borrowed resources is not supported!');
                    }}
                "
                ));
            }

            // NOTE: Promise<Promise<T>> is collapsed to Promise<T> by JS runtimes automagically
            LowerIntrinsic::LowerFlatFuture => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_future_fn = intrinsic.name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();
                let is_future_lowerable_object =
                    AsyncFutureIntrinsic::IsFutureLowerableObject.name();
                let symbol_cabi_rep = Intrinsic::SymbolResourceRep.name();
                let global_future_map = AsyncFutureIntrinsic::GlobalFutureMap.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();
                let gen_future_host_inject_fn =
                    Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GenFutureHostInjectFn).name();
                let nested_future_symbol =
                    Intrinsic::AsyncFuture(AsyncFutureIntrinsic::NestedFutureSymbol).name();

                uwriteln!(
                    output,
                    r#"
                    function {lower_flat_future_fn}(meta) {{
                        const {{
                            componentIdx,
                            futureTableIdx,
                            elemMeta,
                            futureNestingLevel,
                        }} = meta;

                        return function {lower_flat_future_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_future_fn}()] args', {{ ctx }});

                            const future = ctx.vals[0];
                            if (!future) {{ throw new Error("missing external future value"); }}

                            // As NodeJS will collapse `Promise<Promise<T>>` to `Promise<T>`, enable handling of ordinary values
                            // by converting them NodeJS will collapse futures, enable handling of `future<future<t>>`
                            let wasRawValue = false;
                            if (!{is_future_lowerable_object}(future)) {{
                                wasRawValue = true;
                                future = Promise.resolve(future);
                            }}

                            let globalRep = future[{symbol_cabi_rep}];
                            let waitableIdx;
                            if (globalRep) {{
                                const hostFuture = {global_future_map}.get(globalRep);
                                if (!hostFuture) {{
                                    throw new Error(`missing host future with global rep [${{globalRep}}]`);
                                }}
                                waitableIdx = hostFuture.getFutureEndWaitableIdx();
                            }} else {{
                                const cstate = {get_or_create_async_state_fn}(componentIdx);
                                if (!cstate) {{
                                    throw new Error(`missing async state for component [${{componentIdx}}]`);
                                }}

                                elemMeta.stringEncoding = 'utf8';

                                let outermostReadEnd;
                                let futuresList;
                                while (futureNestingLevel > 0) {{
                                    futuresList.push(future);

                                    const {{ writeEnd, writeEndWaitableIdx, readEnd, readEndWaitableIdx }} = cstate.createFuture({{
                                        tableIdx: futureTableIdx,
                                        elemMeta,
                                    }});

                                    const hostInjectFn = {gen_future_host_inject_fn}({{
                                        promise: future,
                                        stringEncoding,
                                        hostWriteEnd: writeEnd,
                                    }});
                                    readEnd.setHostInjectFn(hostInjectFn);

                                    outermostReadEnd = readEnd;
                                    future = {{
                                        [{nested_future_symbol}]: true,
                                        readEndWaitableIdx,
                                        writeEndWaitableIdx,
                                        futureTableIdx,
                                        componentIdx,
                                    }};

                                    futureNestingLevel--;
                                }}

                                waitableIdx = outermostReadEnd.waitableIdx();
                            }}

                            // Write the idx of the waitable to memory (a waiting async task or caller)
                            if (ctx.storagePtr) {{
                                ctx.vals[0] = waitableIdx;
                                {lower_u32_fn}(ctx);
                            }}

                            return waitableIdx;
                        }}
                    }}
                "#
                );
            }

            LowerIntrinsic::LowerFlatStream => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_stream_fn = intrinsic.name();
                let global_stream_map = AsyncStreamIntrinsic::GlobalStreamMap.name();
                let external_stream_class = AsyncStreamIntrinsic::ExternalStreamClass.name();
                let internal_stream_class = AsyncStreamIntrinsic::InternalStreamClass.name();
                let is_stream_lowerable_object =
                    AsyncStreamIntrinsic::IsStreamLowerableObject.name();
                let symbol_cabi_rep = Intrinsic::SymbolResourceRep.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();
                let gen_read_fn_from_lowerable_stream_fn =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::GenReadFnFromLowerableStream)
                        .name();
                let gen_stream_host_inject_fn =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::GenStreamHostInjectFn).name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();

                output.push_str(&format!(
                    r#"
                    function {lower_flat_stream_fn}(meta) {{
                        const {{
                            componentIdx,
                            streamTableIdx,
                            elemMeta,
                        }} = meta;

                        return function {lower_flat_stream_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_stream_fn}()] args', {{ ctx }});

                            const stream = ctx.vals[0];
                            if (!stream) {{ throw new Error("missing external stream value"); }}

                            let globalRep;
                            let waitableIdx;
                            if (stream instanceof {external_stream_class}) {{
                                globalRep = stream[{symbol_cabi_rep}];
                                const internalStream = {global_stream_map}.get(globalRep);
                                if (!internalStream || !(internalStream instanceof {internal_stream_class})) {{
                                    throw new Error(`failed to find internal stream with rep [${{globalRep}}]`);
                                }}
                                waitableIdx = internalStream.readEnd().waitableIdx();
                            }} else if ({is_stream_lowerable_object}(stream)) {{
                                globalRep = stream[{symbol_cabi_rep}];

                                if (globalRep) {{
                                    const hostStream = {global_stream_map}.get(globalRep);
                                    if (!hostStream) {{
                                        throw new Error(`missing host stream with global rep [${{globalRep}}]`);
                                    }}
                                    waitableIdx = hostStream.getStreamEndWaitableIdx();
                                }} else {{
                                    const cstate = {get_or_create_async_state_fn}(componentIdx);
                                    if (!cstate) {{
                                        throw new Error(`missing async state for component [${{componentIdx}}]`);
                                    }}

                                    const {{ writeEnd, readEnd }} = cstate.createStream({{
                                        tableIdx: streamTableIdx,
                                        elemMeta,
                                    }});

                                    const readFn = {gen_read_fn_from_lowerable_stream_fn}(stream);
                                    const hostInjectFn = {gen_stream_host_inject_fn}({{
                                        readFn,
                                        hostWriteEnd: writeEnd,
                                        readEnd,
                                    }});
                                    readEnd.setHostInjectFn(hostInjectFn);
                                    readEnd.setHostDropFn(readFn.drop);

                                    waitableIdx = readEnd.waitableIdx();
                                }}
                            }} else {{
                                throw new Error('object does not conform to supported stream interfaces');
                            }}

                            // Write the idx of the waitable to memory (a waiting async task or caller)
                            if (ctx.storagePtr) {{
                                ctx.vals[0] = waitableIdx;
                                {lower_u32_fn}(ctx);
                            }}

                            return waitableIdx;
                        }}
                    }}
                "#
                ));
            }

            // When a component-model level error context is lowered, it contains the global error-context
            // and not a component-local handle value (as it did pre-lift).
            //
            // By lowering the error context into a given component (w/ a given error context table)
            // we translate the global component model level rep into a local handle.
            //
            // see: `LiftIntrinsic::LiftFlatErrorContext`
            LowerIntrinsic::LowerFlatErrorContext => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_error_context_fn = intrinsic.name();
                let lower_u32_fn = LowerIntrinsic::LowerFlatU32.name();
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let err_ctx_global_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();

                // NOTE: at this point the error context has already been lowered into the appropriate
                // place for us via error context transfer.
                output.push_str(&format!(r#"
                    function {lower_flat_error_context_fn}(errCtxTableIdx, ctx) {{
                        {debug_log_fn}('[{lower_flat_error_context_fn}()] args', {{ errCtxTableIdx, ctx }});
                        const {{ memory, realloc, vals, storagePtr, storageLen, componentIdx }} = ctx;

                        const errCtxGlobalRep = vals[0];

                        const globalTable = {global_tbl}.get();
                        const globalErrCtx = globalTable.get(errCtxGlobalRep);

                        // Clean up the previous error context, if necessary
                        const prevComponentState = {get_or_create_async_state_fn}(globalErrCtx.componentIdx);
                        const prevLocalErrCtx = prevComponentState.handles.get(globalErrCtx.waitableIdx);
                        if (prevLocalErrCtx.refCount === 0) {{
                            const removed = prevComponentState.remove(globalErrCtx.waitableIdx);
                            if (!removed) {{
                                throw new Error(`failed to remove err ctx [${{globalErrCtx.waitableIdx}}], component [${{globalErrCtx.componentIdx}}]`);
                            }}
                            const prevLocalErrCtxTable = {get_local_tbl_fn}(globalErrCtx.componentIdx, globalErrCtx.localTableIdx);
                            prevLocalErrCtxTable.remove(globalErrCtx.localIdx)
                        }}

                        // Insert the error context into the destination tables
                        const localErrCtxTable = {get_local_tbl_fn}(componentIdx, errCtxTableIdx, {{ upsert: true }});

                        let handle = localErrCtxTable.get(componentIdx, errCtxTableIdx, );
                        if (handle === undefined) {{
                            const {{ waitableIdx, localIdx }} = {create_local_handle_fn}(
                                componentIdx,
                                localErrCtxTable,
                                errCtxGlobalRep,
                            );
                            handle = waitableIdx;
                        }} else {{
                            const cstate = {get_or_create_async_state_fn}(componentIdx);
                            const localErrCtx = cstate.handles.get(handle);
                            localErrCtx.refCount += 1;
                            localErrCtx.componentIdx = componentIdx;
                            localErrCtx.localIdx = errCtx.localIdx;
                            localErrCtx.localTableIdx = errCtxTableIdx;
                        }}

                        {err_ctx_global_ref_count_add_fn}(errCtxGlobalRep, -1);

                        {lower_u32_fn}({{ memory, realloc, vals: [handle], storagePtr, storageLen, componentIdx }});
                    }}
                "#));
            }
        }
    }
}
