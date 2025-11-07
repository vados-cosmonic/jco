/* global Buffer */
import { transpile, transpileBytes, writeFiles } from "@bytecodealliance/jco-transpile";

// These re-exports exist to avoid breaking backwards compatibility
export { generateHostTypes as types, generateGuestTypes as guestTypes } from "@bytecodealliance/jco-transpile";
export { typesComponent } from './types.js';

/**
 * Transpile a given component
 *
 * @param {string} componentPath - Path to the component
 * @param {import('@bytecodealliance/jco-transpile').TranspileOpts} opts - Options for Transpilation
 * @param {improt('commander').Command} program - program
 * @returns {Promise<void>} A `Promise` that resolves when the transpilation is complete and files are written out
*/
export async function transpile(componentPath, opts, program) {
    // Parse options to wasm-opt, if present
    const varIdx = program?.parent.rawArgs.indexOf('--');
    if (varIdx !== undefined && varIdx !== -1) {
        opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
    }

    const { files } = await transpile(componentPath, processOpts(opts));
    await writeFiles(files);
}

/**
 * Bare-bones transpilation
 *
 * NOTE: this function is deprecated, and will be removed in a future version.
 * use `transpile` instead, and if only transpile functionality is
 * needed, consider using `@bytecodealliance/jco-transpile` directly.
 *
 * @param {Uint8Array} componentBytes
 * @param {{
 *   name: string,
 *   instantiation?: 'async' | 'sync',
 *   importBindings?: 'js' | 'optimized' | 'hybrid' | 'direct-optimized',
 *   map?: Record<string, string>,
 *   asyncMode?: string,
 *   asyncImports?: string[],
 *   asyncExports?: string[],
 *   validLiftingOptimization?: bool,
 *   tracing?: bool,
 *   nodejsCompat?: bool,
 *   tlaCompat?: bool,
 *   base64Cutoff?: bool,
 *   js?: bool,
 *   minify?: bool,
 *   optimize?: bool,
 *   namespacedExports?: bool,
 *   outDir?: string,
 *   multiMemory?: bool,
 *   experimentalIdlImports?: bool,
 *   optArgs?: string[],
 *   wasmOptBin?: string[],
 * }} opts - options to use for transpilation
 * @returns {Promise<{ [filename: string]: Uint8Array }>}
 */
export async function transpileComponent(componentBytes, opts) {
    return await transpileBytes(componentBytes, opts);
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== 'undefined') {
    __vite_ssr_import_meta__.resolve = (path) =>
        'file://' + globalCreateRequire(import.meta.url).resolve(path);
}
