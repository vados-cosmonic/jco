export * from './request';
export * from './response';

import { getEnvironment } from 'wasi:cli/environment@0.2.3';
import * as wasiConfig from 'wasi:config/store@0.2.3';

/**
 * Build request environment variables via `wasi:cli/environment`
 */
export function buildEnvFromWASI() {
    return Object.fromEntries(getEnvironment());
}

/**
 * Build a helper that can use `wasi:config` to provide configuration values
 */
export function buildConfigHelperFromWASI() {
    return {
        getString(k: string): string {
            return wasiConfig.get(k);
        },
        getAllString(): Record<string, string> {
            return Object.fromEntries(wasiConfig.getAll());
        },
    };
}
