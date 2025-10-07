import { readdir, stat } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { join } from "node:path";

import { suite, test, assert } from "vitest";
import { default as which } from "which";
import { componentize } from "@bytecodealliance/componentize-js";

const FIXTURE_APPS_DIR = fileURLToPath(new URL("../fixtures/apps", import.meta.url));

/** WIT world to use for individual tests by fixture app app dir */
const TEST_WIT_WORLD_LOOKUP = {
    "config-use": "simple",
};

const DEFAULT_TEST_WIT_WORLD = "simple";

/** Get the binary path to wasmtime if it doesn't exist */
async function getWasmtimeBin(env?: Record<string, string>): Promise<string> {
    try {
        return env?.TEST_WASMTIME_BIN ?? await which('wasmtime');
    } catch (err) {
        console.error("failed to find wasmtime binary, either set TEST_WASMTIME_BIN in env or ensure it is on your PATH");
        throw err;
    }
}

suite("apps", async () => {
    // Run tests for all app.js scripts at ./fixtures/apps/*/app.js
    const dirs = await readdir(FIXTURE_APPS_DIR, { withFileTypes: true });
    for (const appDir of dirs) {
        // Get the script path, skip the folder if it doesn't 
        if (!appDir.isDirectory()) { continue; }
        const sourcePath = join(FIXTURE_APPS_DIR, appDir.name, "app.js");
        const scriptExists = await (stat(sourcePath).then(() => true).catch(() => false));
        if (!scriptExists) {
            console.error(`no script found @ [${sourcePath}], skipping`);
            continue;
        }

        // Get the WIT path & world for the given test
        const witPath = join(FIXTURE_APPS_DIR, "wit");
        const worldName = TEST_WIT_WORLD_LOOKUP[appDir.name] ?? DEFAULT_TEST_WIT_WORLD;

        // Get wasmtime dir path, ensure it exists
        const wasmtimeBin = await getWasmtimeBin();

        test.concurrent(`[${appDir}]`, async () => {
            // TODO: bundle w/ hono lib via rollup (rolldown?)
            
            // Build the component with componentize-js
            let { component } = await componentize({
                sourcePath,
                witPath,
                worldName,
            });

            // TODO: Serve with wasmtime?

            // TODO: Perform HTTP requests

            assert(true, "test works");
        });
    }

})
