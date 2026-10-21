import assert from 'node:assert/strict';

export async function testStringIntrinsics({ load }) {
    const {
        initializeUtf8Encoder,
        initializeUtf8Decoder,
        initializeUtf16Decoder,
        initializeUtf16Encoding,
        utf8Encode,
        utf16Encode,
    } = await load('intrinsics/string');
    const stringMemory = { buffer: new ArrayBuffer(16) };
    assert.deepEqual(
        utf8Encode(initializeUtf8Encoder(), 'é', () => 0, stringMemory),
        { ptr: 0, len: 2, codepoints: 1 },
    );
    assert.equal(initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)), 'é');
    assert.deepEqual(
        utf16Encode(initializeUtf16Encoding(), '🚀', () => 0, stringMemory),
        { ptr: 0, len: 2, codepoints: 1 },
    );
    assert.equal(initializeUtf16Decoder().decode(new Uint16Array(stringMemory.buffer, 0, 2)), '🚀');
}
