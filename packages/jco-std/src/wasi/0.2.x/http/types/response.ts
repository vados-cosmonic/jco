import { OutgoingBody, ResponseOutparam, Fields, OutgoingResponse, FieldValue } from 'wasi:http/types@0.2.4';

/**
 * Write an `outgoing-response`
 *
 * @param {Response} resp
 * @param {object} outparam
 */
export async function writeWasiResponse(resp: Response, outgoingWasiResp: ResponseOutparam) {

    // Start buliding the outgoing response

    const encoder = new TextEncoder();
    const fields: [string, FieldValue][] = [];
    for (const [k,v] of [...resp.headers.entries()]) {
        fields.push([k.toString(), encoder.encode(v)]);
    }
    const headers = Fields.fromList(fields);
    const outgoingResponse = new OutgoingResponse(headers);

    // Set status
    const status = resp.status;
    outgoingResponse.setStatusCode(status);

    // Build the outgoing response body
    const outgoingBody = outgoingResponse.body();
    {
        // Create a stream for the response body
        const outputStream = outgoingBody.write();
        if (resp.body === null) {
            throw new Error("unexpectedly missing resp.body");
        }
        for await (const chunk of resp.body) {
            if (chunk.length === 0) {
                continue;
            }
            let written = 0;
            while (written < chunk.length) {
                await outputStream.subscribe();

                let bytesAllowedRaw = outputStream.checkWrite();
                if (!Number.isSafeInteger(bytesAllowedRaw)) {
                    throw new Error("unexpectedly unsafe integer bytes allowed");
                }
                const bytesAllowed = Number(bytesAllowedRaw);

                outputStream.write(
                    new Uint8Array(chunk.buffer, written, bytesAllowed)
                );
                if (written + bytesAllowed > Number.MAX_VALUE) {
                    throw new Error("integer overflow for written bytes");
                }
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
