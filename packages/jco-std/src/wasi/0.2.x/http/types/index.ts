/// <reference path="../../generated/types/wit.d.ts" />

import { getEnvironment } from 'wasi:cli/environment@0.2.6';
import * as wasiConfig from 'wasi:config/store@0.2.0-draft';

export * from './request.js';
export * from './response.js';

/**
 * Build request environment variables via `wasi:cli/environment`
 */
export function buildEnvFromWASI(): Record<string, string> {
    return Object.fromEntries(getEnvironment());
}

/**
 * Build a helper that can use `wasi:config` to provide configuration values
 */
export function buildConfigHelperFromWASI() {
    return {
        getString(k: string): string | undefined {
            return wasiConfig.get(k);
        },
        getAllString(): Record<string, string> {
            return Object.fromEntries(wasiConfig.getAll());
        },
    };
}
