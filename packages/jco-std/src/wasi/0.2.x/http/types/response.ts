/// <reference types="../../generated/types/wit.d.ts" />

import { OutgoingBody, ResponseOutparam, Fields, OutgoingResponse } from 'wasi:http/incoming-hander@0.2.4';

/**
 * Write an `outgoing-response`
 *
 * @param {Response} resp
 * @param {object} outparam
 */
export async function writeWasiResponse(resp: Response, outgoingWasiResp: OutgoingResponse) {

    // Start buliding the outgoing response
    const headers = new Fields.fromList([...resp.headers.entries()]);
    const outgoingResponse = new OutgoingResponse(headers);

    // Set status
    const status = resp.status;
    outgoingResponse.setStatusCode(status);

    // Build the outgoing response body
    const outgoingBody = outgoingResponse.body();
    {
        // Create a stream for the response body
        const outputStream = outgoingBody.write();
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

    // Set the outgoing response body w/ no trailers
    OutgoingBody.finish(outgoingBody, undefined);

    // Set the outparam
    ResponseOutparam.set(outgoingWasiResp, {
        tag: 'ok',
        val: outgoingResponse,
    });
}
