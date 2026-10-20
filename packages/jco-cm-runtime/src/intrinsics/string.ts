export type StringRealloc = (oldPtr: number, oldSize: number, alignment: number, newSize: number) => number;
export type AsyncStringRealloc = (
    oldPtr: number,
    oldSize: number,
    alignment: number,
    newSize: number,
) => number | PromiseLike<number>;

export interface StringAllocation {
    ptr: number;
    len: number;
    /** Omitted for the UTF-8 empty-string sentinel, matching inline bindgen. */
    codepoints?: number;
}

/** Only the codec methods used by generated bindings are required. */
export interface StringDecoder {
    decode(input: ArrayBufferLike | ArrayBufferView): string;
}

export interface StringEncoder {
    encode(input: string): Uint8Array;
    encodeInto(input: string, destination: Uint8Array): { read: number; written: number };
}

type Memory = { readonly buffer: ArrayBufferLike };

export interface StringIntrinsics {
    readonly utf16Decoder: StringDecoder;
    readonly utf8Decoder: StringDecoder;
    readonly utf8Encoder: StringEncoder;
    utf16Encode(value: unknown, realloc: StringRealloc, memory: Memory): StringAllocation;
    utf16EncodeAsync(value: unknown, realloc: AsyncStringRealloc, memory: Memory): Promise<StringAllocation>;
    utf16ValidatingCopy(from: Uint16Array, to: Uint16Array): boolean;
    utf8Encode(value: unknown, realloc: StringRealloc, memory: Memory): StringAllocation;
    utf8EncodeAsync(value: unknown, realloc: AsyncStringRealloc, memory: Memory): Promise<StringAllocation>;
    validateGuestChar(value: number): string;
    validateHostChar(value: unknown): number | undefined;
}

function requireString(value: unknown): string {
    if (typeof value !== 'string') {
        throw new TypeError('expected a string, received [' + typeof value + ']');
    }
    return value;
}

function utf8Size(s: string): { len: number; codepoints: number } {
    let len = 0;
    let codepoints = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        codepoints++;
        if (ch < 0x80) {
            len += 1;
        } else if (ch < 0x800) {
            len += 2;
        } else if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            len += 4;
            i++;
        } else {
            len += 3;
        }
    }
    return { len, codepoints };
}

export function createStringIntrinsics(): StringIntrinsics {
    // Keep codec state private to the store, including TextDecoder streaming state.
    const utf16Decoder = new TextDecoder('utf-16', { fatal: true, ignoreBOM: true });
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const utf8Encoder = new TextEncoder();
    const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

    function writeUtf16(str: string, ptr: number, memory: Memory): StringAllocation {
        const len = str.length;
        const out = new Uint16Array(memory.buffer, ptr, len);
        const put = isLE
            ? (i: number, ch: number) => {
                  out[i] = ch;
              }
            : (i: number, ch: number) => {
                  out[i] = ((ch & 0xff) << 8) | (ch >>> 8);
              };
        for (let i = 0; i < len; i++) {
            let ch = str.charCodeAt(i);
            if ((ch & 0xf800) === 0xd800) {
                if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                    put(i++, ch);
                    ch = str.charCodeAt(i);
                } else {
                    ch = 0xfffd;
                }
            }
            put(i, ch);
        }
        return { ptr, len, codepoints: [...str].length };
    }

    function writeUtf8(s: string, ptr: number, len: number, codepoints: number, memory: Memory): StringAllocation {
        const { read, written } = utf8Encoder.encodeInto(s, new Uint8Array(memory.buffer, ptr, len));
        if (read !== s.length || written !== len) {
            throw new Error('failed to encode whole string');
        }
        return { ptr, len, codepoints };
    }

    return {
        utf16Decoder,
        utf8Decoder,
        utf8Encoder,
        utf16Encode(value, realloc, memory) {
            const str = requireString(value);
            const ptr = realloc(0, 0, 2, str.length * 2);
            return writeUtf16(str, ptr, memory);
        },
        async utf16EncodeAsync(value, realloc, memory) {
            const str = requireString(value);
            const ptr = await realloc(0, 0, 2, str.length * 2);
            return writeUtf16(str, ptr, memory);
        },
        utf16ValidatingCopy(from, to) {
            let allLatin1 = true;
            let highSurrogate = false;
            for (let i = 0; i < from.length; i++) {
                const unit = from[i];
                if (highSurrogate !== ((unit & 0xfc00) === 0xdc00)) {
                    throw new Error('invalid utf16 encoding');
                }
                highSurrogate = (unit & 0xfc00) === 0xd800;
                if (unit > 0xff) {
                    allLatin1 = false;
                }
                to[i] = unit;
            }
            if (highSurrogate) {
                throw new Error('invalid utf16 encoding');
            }
            return allLatin1;
        },
        utf8Encode(value, realloc, memory) {
            const s = requireString(value);
            if (s.length === 0) {
                return { ptr: 1, len: 0 };
            }
            // Some preview1 allocators cannot shrink, so allocate exactly once.
            const { len, codepoints } = utf8Size(s);
            const ptr = realloc(0, 0, 1, len);
            return writeUtf8(s, ptr, len, codepoints, memory);
        },
        async utf8EncodeAsync(value, realloc, memory) {
            const s = requireString(value);
            if (s.length === 0) {
                return { ptr: 1, len: 0 };
            }
            const { len, codepoints } = utf8Size(s);
            const ptr = await realloc(0, 0, 1, len);
            return writeUtf8(s, ptr, len, codepoints, memory);
        },
        validateGuestChar(value) {
            if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
                throw new TypeError('not a valid char');
            }
            return String.fromCodePoint(value);
        },
        validateHostChar(value) {
            if (typeof value !== 'string') {
                throw new TypeError('must be a string');
            }
            return value.codePointAt(0);
        },
    };
}
