export namespace WasiHttpOutgoingHandler {
  export function handle(request: OutgoingRequest, options: RequestOptions | undefined): FutureIncomingResponse;
}
import type { OutgoingRequest } from './wasi-http-types.js';
export { OutgoingRequest };
import type { RequestOptions } from './wasi-http-types.js';
export { RequestOptions };
import type { FutureIncomingResponse } from './wasi-http-types.js';
export { FutureIncomingResponse };
import type { ErrorCode } from './wasi-http-types.js';
export { ErrorCode };
