
export * from './request';
export * from './response';

/// <reference types="../../generated/types/wit.d.ts" />
import { getEnvironment } from 'wasi:cli/environment@0.2.4';
import * as wasiConfig from 'wasi:config/runtime@0.2.0-draft';

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
        getString(k: string): string {
            return wasiConfig.get(k);
        },
        getAllString(): Record<string, string> {
            return Object.fromEntries(wasiConfig.getAll());
        },
    };
}
