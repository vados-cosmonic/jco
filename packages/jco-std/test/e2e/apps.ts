import { readdir, stat } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { join } from "node:path";

import { suite, test, assert } from "vitest";

const FIXTURE_APPS_DIR = fileURLToPath(new URL("../fixtures/apps", import.meta.url));

suite("apps", async () => {
    // Run tests for all app.js scripts at ./fixtures/apps/*/app.js
    const dirs = await readdir(FIXTURE_APPS_DIR);
    for (const appDir of dirs) {
        const scriptPath = join(FIXTURE_APPS_DIR, appDir, "app.js");
        const scriptExists = await (stat(scriptPath).then(() => true).catch(() => false));
        if (!scriptExists) {
            console.error(`no script found @ [${scriptPath}]`);
            continue;
        }

        test.concurrent(`[${appDir}]`, async () => {
            // TODO: Build the component with jco
            // TODO: Serve with wasmtime?
            // TODO: Perform requests
            assert(true, "test works");
        });
    }

})
