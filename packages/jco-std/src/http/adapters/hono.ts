import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';

/** Strategy for interfacing with WASI environment */
enum AppAdapterType {
    WasiHTTP = 'wasi-http',
    FetchEvent = 'fetch-event',
}

/** Options for building a `AppAdapter` */
interface AppAdapterOpts {
    app: Hono;
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
    #type: AppAdapterType;

    constructor(opts: AppAdapterOpts) {
        if (!opts.app) {
            throw TypeError('Hono app must be provided');
        }
        this.#app = opts.app;
        this.#type = opts.type ?? AppAdapterType.WasiHTTP;
    }

    /**
     * Build an ESM export that represents the app
     */
    async asESMExport() {
        switch (this.#type) {
            // Build an export that would satisfy wasi:http/incoming-handler
            case AppAdapterType.WasiHTTP:
                return {
                    incomingHandler: {
                        handle(req, responseOutParam) {
                            throw new Error('not implemented');
                        },
                    },
                };
            // Given that fetch-event is implemented natively for StarlingMonkey,
            // we know that we have already set the handle  already set the we only ahve
            case AppAdapterType.FetchEvent:
                const { handle } = await import('hono/service-worker');
                addEventListener('fetch', handle(this.#app));
                return {};
            default:
                throw new Error(`unexpected adapter type [${this.#type}]`);
        }
    }
}

/**
 * Serves a Hono application as a `wasi:http/incoming-handler` compliant server
 *
 * @param {Hono} app
 */
export function serve<
    Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {},
    BasePath extends string = '/',
>(app: Hono<Env, Schema, BasePath>) {
    // TODO: detect whether the application is a HTTP incoming handler or not
    const adapter = new AppAdapter({
        app,
    });
    throw new Error('not done');
    return adapter.asESMExport();
}
