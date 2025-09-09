import { env } from 'node:process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { generateGuestTypes } from '@bytecodealliance/jco-transpile';

/** World that should be used for binding generation */
const BINDING_WORLD = env.BINDING_WORLD;

/** Path to the WIT file or folder that should be searched for the world */
const WIT_PATH = env.WIT_PATH;

/** Alternate output path for generated files */
const OUTPUT_DIR_PATH = env.OUTPUT_DIR_PATH;

async function main() {
    // Ensure the WIT path exists
    const exists = await access(WIT_PATH)
        .then(() => true)
        .catch(() => false);
    if (!exists) {
        throw new Error(`specified WIT_PATH [${WIT_PATH}] does not exist`);
    }

    // Generate options
    const opts = {};
    if (BINDING_WORLD) {
        opts.worldName = BINDING_WORLD;
    }
    if (OUTPUT_DIR_PATH) {
        opts.outDir = OUTPUT_DIR_PATH;
    }

    // Generate types and write them to disk
    const files = await generateGuestTypes(WIT_PATH, opts);
    await writeFiles(files, false);
}

/**
 * Helper function for writing out files in the form that jco-tranpsile generates them
 *
 * @param {Record<string, string>} files
 * @returns {Promise<void>} A Promise that resovles when all files have been written
 */
export async function writeFiles(files) {
    return Promise.all(
        Object.entries(files).map(async ([name, file]) => {
            await mkdir(dirname(name), { recursive: true });
            await writeFile(name, file);
        })
    );
}

await main();
