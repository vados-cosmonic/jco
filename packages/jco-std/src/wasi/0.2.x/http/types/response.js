/* global globalThis */

// /** Get the global `TextEncoder` */
// function ensureGlobalTextEncoder() {
//     if (!globalThis.TextEncoder) {
//         throw new TypeError('TextEncoder not provided by platform');
//     }
//     return globalThis.TextEncoder;
// }

/**
 * Write an `outgoing-response`
 *
 * @param {Response} resp
 * @param {object} outparam
 */
export async function writeWasiResponse(resp, outgoingWasiResp) {
    const { OutgoingBody, ResponseOutparam, Fields, OutgoingResponse } =
        await import('wasi:http/incoming-hander@0.2.4');

    // Start buliding the outgoing response
    const headers = new Fields.fromList([...resp.headers.entries()]);
    const outgoingResponse = new OutgoingResponse(headers);

    // Set status
    const status = resp.status;
    outgoingResponse.setStatusCode(status);

    // Build the outgoing response body
    let outgoingBody = outgoingResponse.body();
    {
        // Create a stream for the response body
        let outputStream = outgoingBody.write();
        for await (const chunk of resp.body) {
            if (chunk.length === 0) {
                continue;
            }
            let written = 0;
            while (written < chunk.length) {
                await outputStream.subscribe();
                const { tag, val: bytesAllowed } = outputStream.checkWrite();
                if (tag == 'error') {
                    throw new Error('response output write check failed');
                }
                outputStream.write(
                    new Uint8Array(new DataView(chunk, written, bytesAllowed))
                );
                written += bytesAllowed;
            }
        }
        outputStream[Symbol.dispose]();
    }

    // Set the outgoing response body
    OutgoingBody.finish(outgoingBody, undefined);

    // Set the outparam
    ResponseOutparam.set(outgoingWasiResp, {
        tag: 'ok',
        val: outgoingResponse,
    });
}
