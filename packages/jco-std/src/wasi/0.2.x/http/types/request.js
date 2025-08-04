/* global globalThis */

import { IncomingRequest } from "../";

/**
 * This file implements helpers and relevant types for use with `wasi:http` 0.2.x APIs
 *
 * @see: https://github.com/WebAssembly/wasi-http
 */

/** Get the global URL function */
function getGlobalURL() {
    if (!globalThis.URL) {
        throw new TypeError('URL not provided by');
    }
    return globalThis.URL;
}

/**
 * Create a `Request` from a `wasi:http/incoming-handler` `incoming-request`.
 *
 * @param {any} incomingRequest - request handler for a WASI HTTP request
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Request
 * @see https://github.com/WebAssembly/wasi-http
 */
export function fromWasi(incomingRequest) {
    const method = incomingRequest.method();
    // TODO: get bindings
    const method = incomingRequest.method();

    if (!incomingRequest) {
        throw new TypeError("incomingRequest not specified");
    }
    const URL = getGlobalURL();
    // TODO: build the URL itself
    
    const url = new URL();
}
