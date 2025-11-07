/* global Buffer */
import { transpile, writeFiles } from "@bytecodealliance/jco-transpile";

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

    const { files } = await transpile(componentPath, opts);
    await writeFiles(files);
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== 'undefined') {
    __vite_ssr_import_meta__.resolve = (path) =>
        'file://' + globalCreateRequire(import.meta.url).resolve(path);
}
