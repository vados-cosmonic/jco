import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';

import { log, level } from 'wasi:logging/logging@0.1.0-draft';

import { createWebPlatformRequest } from '../types/request.js';
import { writeWasiResponse } from '../types/response.js';
import { buildEnvFromWASI, buildConfigHelperFromWASI } from '../types/index.js';

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

/** Configuration for generating ENV variables that will be used in the Hono app */
export enum WASIEnvGenerationStrategy {
    /** Don't generate environment variables from WASI */
    Never = 'never',
    /** Generate environment variables from WASI once at app startup */
    OnceBeforeStartup = 'once-before-startup',
    /** Generate environment variables from WASI once at app startup */
    OncePerRequest = 'on-request',
}

/** Configuration for the execution context */
interface ExecCtxConfig {
    /** Enable use of the `wasi:config` helper from the execution context */
    enableWasiConfigHelper?: boolean;
}

/** Options for building a `AppAdapter` */
interface AppAdapterOpts<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    /** The Hono app */
    app: Hono<Env, Schema, BasePath>;

    /** How the hono App should be adapted */
    type?: AppAdapterType;

    /** Strategy to use when generating env for requests */
    wasiEnvGenerationStrategy?: WASIEnvGenerationStrategy;

    /** Configuration for how to generate the env passed to Hono */
    execCtx?: ExecCtxConfig;
}

/**
 * Adapter that converts a Hono application into one that can run
 * in a WebAssembly HTTP (i.e `wasi:http/incoming-handler`) context.
 *
 * There are multiple ways to run in an WASI HTTP context, namely:
 * - via manual `wasi:http/incoming-handler` bindings
 * - via WinterTC `fetch-event` integration
 *
 * The goal of this adapter is to enable easy use of a Hono applications via
 * the `wasi:http/incoming-adapter` by creating the relevant component export.
 *
 * @class WasiHttpAdapter
 */
class WasiHttpAdapter<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    /** The Hono App that should be used */
    #app: Hono<Env, Schema, BasePath>;

    /** The Hono App that should be used */
    #adapterType: AppAdapterType;

    /** The strategy to use for generating environment variables */
    #wasiEnvGenerationStrategy: WASIEnvGenerationStrategy;

    /** Whether to include wasi  strategy to use for generating environment variables */
    #execCtxConfig: ExecCtxConfig;

    constructor(opts: AppAdapterOpts<Env, Schema, BasePath>) {
        if (!opts.app) {
            throw TypeError('Hono app must be provided');
        }
        this.#app = opts.app;
        this.#adapterType = opts.type ?? AppAdapterType.WasiHTTP;
        // While more compute-intensive, by default we use once per-request to
        // ensure that if the host platform were to change ENV, it would be noticed by
        // subsequent requests.
        this.#wasiEnvGenerationStrategy =
            opts.wasiEnvGenerationStrategy ??
            WASIEnvGenerationStrategy.OncePerRequest;
        this.#execCtxConfig = opts.execCtx ?? {};
    }

    getAdapterType() {
        return this.#adapterType;
    }

    getEnvGenerationStrategy() {
        return this.#wasiEnvGenerationStrategy;
    }

    wasiConfigHelperEnabled() {
        return this.#execCtxConfig.enableWasiConfigHelper;
    }

    /**
     * Build an ESM export that represents the app
     */
    asESMExport() {
        switch (this.#adapterType) {
            // Build an export that would satisfy wasi:http/incoming-handler
            case AppAdapterType.WasiHTTP:
                let env;
                if (
                    this.#wasiEnvGenerationStrategy ===
                    WASIEnvGenerationStrategy.OnceBeforeStartup
                ) {
                    env = buildEnvFromWASI();
                }

                return {
                    incomingHandler: {
                        handle(
                            wasiRequest: IncomingRequest,
                            wasiResponse: ResponseOutparam
                        ) {
                            if (
                                this.#wasiEnvGenerationStrategy ===
                                WASIEnvGenerationStrategy.OncePerRequest
                            ) {
                                env = buildEnvFromWASI();
                            }
                            const resp = this.#app.fetch(
                                createWebPlatformRequest(wasiRequest),
                                env,
                                buildExecContext({
                                    adapterConfigHelperEnabled:
                                        this.#execCtxConfig
                                            .enableWasiConfigHelper,
                                })
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
                    `unexpected adapter type [${this.#adapterType}], fetch-event adapters should be use via 'fire()'`
                );
        }
    }
}

/** This global variable will be set to the application adapter when present */
let ADAPTER: WasiHttpAdapter<any, any, any>;

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
                `invalid adapter type [${adapterType}], expected WASI HTTP. For fetch-event, use 'fire()'`
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

/** Options for calling `fire()` */
export interface FireOpts {
    /**
     * Whether to use the `wasi:http/incoming-handler` adapter
     * rather than the default WinterTC `fetch-event` integration.
     */
    useWasiHTTP?: boolean;

    // Configuration for how to generate the env passed to Hono
    wasiEnvGenerationStrategy?: WASIEnvGenerationStrategy;

    // Configuration for how to generate the env passed to Hono
    execCtx?: {
        /** Enable use of the `wasi:config` helper from the execution context */
        wasiConfig?: boolean;
    };
}

/**
 * Serves a Hono application as a `wasi:http/incoming-handler` compliant server
 *
 * @param {Hono} app
 */
export function fire<
    Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {},
    BasePath extends string = '/',
>(app: Hono<Env, Schema, BasePath>, opts?: FireOpts) {
    const adapter = new WasiHttpAdapter({
        app,
        type: opts?.useWasiHTTP
            ? AppAdapterType.WasiHTTP
            : AppAdapterType.FetchEvent,
        wasiEnvGenerationStrategy: opts?.wasiEnvGenerationStrategy,
    });
    const adapterType = adapter.getAdapterType();
    const adapterEnvGenerationStrategy = adapter.getEnvGenerationStrategy();
    const adapterConfigHelperEnabled = adapter.wasiConfigHelperEnabled();

    // If we're doing fetch-event, set up the application and exit early
    if (adapterType === AppAdapterType.FetchEvent) {
        let env;
        if (
            adapterEnvGenerationStrategy ===
            WASIEnvGenerationStrategy.OnceBeforeStartup
        ) {
            env = buildEnvFromWASI();
        }

        import('hono/service-worker')
            .then((m) => {
                const addEventListener = ensureGlobalAddEventListener();
                addEventListener('fetch', (evt: any) => {
                    if (
                        adapterEnvGenerationStrategy ===
                        WASIEnvGenerationStrategy.OncePerRequest
                    ) {
                        env = buildEnvFromWASI();
                    }
                    evt.respondWith(
                        app.fetch(
                            evt.request,
                            env,
                            buildExecContext({ adapterConfigHelperEnabled })
                        )
                    );
                });
            })
            .catch((err) => {
                console.error('failed to build fetch event listener', err);
                throw err;
            });
        return;
    }

    // If we're not doing fetch-event (i.e. we're using `wasi:http/incoming-handler`),
    // then we should set up the adapter, as we expect the user to have exported this
    // file's `incomingHandler` export.
    ADAPTER = adapter;

}

/** Arguments for `buildExecContext()` */
interface BuildExecContextArgs {
    adapterConfigHelperEnabled?: boolean;
}

/** Build a execution context from a given adapter */
function buildExecContext(args?: BuildExecContextArgs) {
    return {
        waitUntil: () => {
            throw new Error('waitUntil is not yet implemented for WASI');
        },
        passThroughOnException: () => {
            throw new Error(
                'passThroughOnException is not yet implemented for WASI'
            );
        },
        props: {
            config: args?.adapterConfigHelperEnabled
                ? buildConfigHelperFromWASI()
                : undefined,
        },
    };
}

/////////////
// Logging //
/////////////

/** Default logger which uses info logging */
const logInfo = (msg: string, ...rest: string[]) => {
    log(level.info, [msg, ...rest].join(' '));
};

/** Default logger which uses error logging */
const logError = (msg: string, ...rest: string[]) => {
    log(level.error, [msg, ...rest].join(' '));
};

/** Default logger which uses trace logging */
const logTrace = (msg: string, ...rest: string[]) => {
    log(level.trace, [msg, ...rest].join(' '));
};

/** Default logger which uses debug logging */
const logDebug = (msg: string, ...rest: string[]) => {
    log(level.debug, [msg, ...rest].join(' '));
};

/** Default logger which uses warn logging */
const logWarn = (msg: string, ...rest: string[]) => {
    log(level.warn, [msg, ...rest].join(' '));
};

/** Default logger which uses critical logging */
const logCritical = (msg: string, ...rest: string[]) => {
    log(level.critical, [msg, ...rest].join(' '));
};

let LOGGER_FN: (msg: string, ...rest: string[]) => void;
/**
 * Function for building a reusable logger function that can be used
 * for logging at various levels
 */
function buildLogger() {
    if (LOGGER_FN) {
        return LOGGER_FN;
    }
    const fn = (msg: string, ...rest: string[]) => {
        log(level.info, [msg, ...rest].join(' '));
    };
    fn.trace = (msg: string, ...rest: string[]) => {
        log(level.trace, [msg, ...rest].join(' '));
    };
    fn.debug = (msg: string, ...rest: string[]) => {
        log(level.debug, [msg, ...rest].join(' '));
    };
    fn.info = (msg: string, ...rest: string[]) => {
        log(level.info, [msg, ...rest].join(' '));
    };
    fn.warn = (msg: string, ...rest: string[]) => {
        log(level.warn, [msg, ...rest].join(' '));
    };
    fn.critical = (msg: string, ...rest: string[]) => {
        log(level.critical, [msg, ...rest].join(' '));
    };
    fn.error = (msg: string, ...rest: string[]) => {
        log(level.error, [msg, ...rest].join(' '));
    };
    LOGGER_FN = fn;
    return LOGGER_FN;
}

/**
 * Logging facilities
 *
 * Direct loggers for each level cna be used, or a reusable,
 * all-in-one logger can be built.
 */
export const logger = {
    build: buildLogger,
    trace: logTrace,
    debug: logDebug,
    info: logInfo,
    warn: logWarn,
    error: logError,
    critical: logCritical,
};
