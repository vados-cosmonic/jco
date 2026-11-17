/** Experiments eligible for further validation; this list is not a sandbox certification. */
export const CONTEXT_VARIANTS = Object.freeze([
    'pr2483',
    'no-context-log',
    'no-meta-copy',
    'no-log-no-copy',
    'no-runtime-log',
    'direct-checked',
    'direct-no-runtime-log',
    'cache-checked',
    'cache-epoch',
]);

/** Historical experiments rejected because they fail context isolation. */
export const RETIRED_VARIANTS = Object.freeze(['cache-unchecked', 'single-array', 'wasm-globals']);

/** Reject retired or unknown variants before reading generated code or starting a process. */
export function assertVariant(name, contextOnly = false) {
    if (!CONTEXT_VARIANTS.includes(name) && (contextOnly || !['wasip2', 'wasmtime'].includes(name))) {
        throw new Error(`Ineligible context experiment: ${name}. Regenerate stale artifacts with prepare.mjs.`);
    }
}
