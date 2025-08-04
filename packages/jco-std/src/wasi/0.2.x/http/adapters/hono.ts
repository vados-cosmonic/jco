import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';

import { createWebPlatformRequest } from '../types/request.js';
import { writeWasiResponse } from '../types/response.js';

// TODO: use type bindings for types below
type IncomingRequest = any;
type ResponseOutparam = any;

/** Get the global `AddEventListener` */
function ensureGlobalAddEventListener() {
    if (!globalThis.addEventListener) {
        throw new TypeError('AddEventListener not provided by platform');
    }
    return globalThis.addEventListener;
}

/** Strategy for interfacing with WASI environment */
enum AppAdapterType {
    WasiHTTP = 'wasi-http',
    FetchEvent = 'fetch-event',
}

/** Options for building a `AppAdapter` */
interface AppAdapterOpts<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    app: Hono<Env, Schema, BasePath>;
    type?: AppAdapterType;
}

/**
 * Adapter that converts a Hono application into one that can run
 * in a WebAssembly HTTP (i.e `wasi:http/incoming-handler`) context.
 *
 * There are multiple ways to run in an WASI HTTP context, namely:
 * - via manual `wasi:http/incoming-handler` bindings
 * - via WinterTC `fetch-event` integration
 *
 * The goal of this adapter is to make both strategies easy to use with
 * applications built with Hono (`Hono` objects).
 *
 * @class AppAdapter
 */
class AppAdapter<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    /** The Hono App that should be used */
    #app: Hono<Env, Schema, BasePath>;

    /** The Hono App that should be used */
    #adapterType: AppAdapterType;

    constructor(opts: AppAdapterOpts<Env, Schema, BasePath>) {
        if (!opts.app) {
            throw TypeError('Hono app must be provided');
        }
        this.#app = opts.app;
        this.#adapterType = opts.type ?? AppAdapterType.WasiHTTP;
    }

    getAdapterType() {
        return this.#adapterType;
    }

    /**
     * Build an ESM export that represents the app
     */
    asESMExport() {
        switch (this.#adapterType) {
            // Build an export that would satisfy wasi:http/incoming-handler
            case AppAdapterType.WasiHTTP:
                return {
                    incomingHandler: {
                        handle(
                            wasiRequest: IncomingRequest,
                            wasiResponse: ResponseOutparam
                        ) {
                            const env = {}; // TODO: build ENV
                            const executionContext = {}; // TODO: add useful information in execution context? WASI version?
                            const resp = this.#app.fetch(
                                createWebPlatformRequest(wasiRequest),
                                env,
                                executionContext
                            );
                            writeWasiResponse(resp, wasiResponse);
                        },
                    },
                };
            // Given that fetch-event is implemented natively for StarlingMonkey,
            // we know that we have already set the handle  already set the we only ahve
            case AppAdapterType.FetchEvent:
            default:
                throw new Error(
                    `unexpected adapter type [${this.#adapterType}]`
                );
        }
    }
}

/** This global variable will be set to the application adapter when present */
let ADAPTER: AppAdapter<any, any, any>;

/**
 * A pre-made incomingHandler export for downstream users to export.
 *
 * This export should *not* be used at the top level of a component
 * that implements `fetch`-based HTTP handlers.
 */
export const incomingHandler = {
    handle(req: IncomingRequest, resp: ResponseOutparam) {
        if (!ADAPTER) {
            throw new Error(
                'app has not been set, ensure fire() was called with your app'
            );
        }
        const adapterType = ADAPTER.getAdapterType();
        if (adapterType !== AppAdapterType.WasiHTTP) {
            throw new Error(
                `invalid adapter type [${adapterType}], expected WASI HTTP`
            );
        }
        const { incomingHandler } = ADAPTER.asESMExport();
        if (!incomingHandler) {
            throw new Error(
                'unexpectedly missing incomingHandler generated ESM export'
            );
        }
        incomingHandler.handle(req, resp);
    },
};

/**
 * Serves a Hono application as a `wasi:http/incoming-handler` compliant server
 *
 * @param {Hono} app
 */
export function fire<
    Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {},
    BasePath extends string = '/',
>(app: Hono<Env, Schema, BasePath>) {
    // TODO: detect whether the application is a HTTP incoming handler or not
    const adapter = new AppAdapter({
        app,
    });

    const adapterType = adapter.getAdapterType();
    if (adapterType === AppAdapterType.FetchEvent) {
        import('hono/service-worker')
            .then((m) => {
                const addEventListener = ensureGlobalAddEventListener();
                addEventListener('fetch', (evt: any) => {
                    const env = {}; // TODO: build env
                    const executionContext = {}; // TODO: build execution context
                    evt.respondWith(app.fetch(evt.request, env));
                });
            })
            .catch((err) => {
                console.error('failed to build fetch event listener', err);
                throw err;
            });
        return;
    }

    ADAPTER = adapter;

    // TODO: create logger that can be used from every request
    //   - wrap this around wasi:logging

    // TODO: create env as second arg to app.fetch(Request, Env, ExecutionContext)
    //   - use wasi:config to build this

    // TODO: create request as first arg to app.fetch(Request, Env, ExecutionContext)

    // TODO: add ExecutionContext as 3rd arg
    //   - add logger in there?

    // TODO: reuse bytes for stored web requests?

    // The interface could actually look like this:
    //
    // ```
    // import { fire } from "./export.mjs";
    // export { incomingHandler } from "./export.mjs"; // EXTRA emphasis here.
    //
    // fire({ get: () => console.log("INSIDE APP!") });
    // ```
}
