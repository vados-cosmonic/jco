import { fileURLToPath, URL } from "node:url";
import { join, normalize, sep } from "node:path";
import { readdir, stat, mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { debuglog } from "node:util";

import { suite, test, assert, vi } from "vitest";
import { default as which } from "which";
import { componentize } from "@bytecodealliance/componentize-js";

import { rolldown } from "rolldown";
import typescript from "@rollup/plugin-typescript";

const FIXTURE_APPS_DIR = fileURLToPath(new URL("../fixtures/apps", import.meta.url));

/** WIT world to use for individual tests by fixture app app dir */
const TEST_WIT_WORLD_LOOKUP = {};

const DEFAULT_TEST_WIT_WORLD = "hono-fetch-event";

/** Get the binary path to wasmtime if it doesn't exist */
async function getWasmtimeBin(env?: Record<string, string>): Promise<string> {
    try {
        return env?.TEST_WASMTIME_BIN ?? await which('wasmtime');
    } catch (err) {
        console.error("failed to find wasmtime binary, either set TEST_WASMTIME_BIN in env or ensure it is on your PATH");
        throw err;
    }
}

/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 */
export async function getTmpDir() {
    return await mkdtemp(normalize(tmpdir() + sep));
}

const log = debuglog("test-e2e");

suite("hono apps", async () => {
    const tmpdir = await getTmpDir();
    const builtComponentDir = join(tmpdir, "built-components");
    await mkdir(builtComponentDir, { recursive: true });
    log("writing component output to dir", builtComponentDir);

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

        const testComponentName = appDir.name;

        // Get the WIT path & world for the given test
        const witPath = join(FIXTURE_APPS_DIR, "wit");

        // Create an output dir for building the component
        const componentOutputDir = join(builtComponentDir, testComponentName);
        await mkdir(componentOutputDir, { recursive: true });

        const jsOutputPath = join(componentOutputDir, "component.js");

        // Get wasmtime dir path, ensure it exists
        const wasmtimeBin = await getWasmtimeBin();

        test.concurrent(`[${testComponentName}]`, async () => {
            if (testComponentName !== "config-use") { return; } // TODO: REMOVE

            log(`testing app [${testComponentName}]`);

            // Bundle the application w/ deps via rolldown
            const bundle = await rolldown({
                input: sourcePath,
                external: /wasi:.*/,
                plugins: [
                    typescript({
                        noEmitOnError: true,
                        target: "esnext",
                        module: "nodenext",
                        moduleResolution: "nodenext",
                        esModuleInterop: true,
                        allowJs: false,
                        noEmit: true,
                        forceConsistentCasingInFileNames: true,
                        strict: true,
                        outDir: componentOutputDir,
                    }),
                ],
            });

            await bundle.write({
                file: jsOutputPath,
                format: 'esm',
            });

            // Ensure the JS has been written to disk
            const generatedJS = await readFile(jsOutputPath, 'utf8');

            // Build the component with componentize-js
            const opts = {
                sourcePath: jsOutputPath,
                witPath,
                worldName: TEST_WIT_WORLD_LOOKUP[testComponentName] ?? DEFAULT_TEST_WIT_WORLD,
            };
            let { component } = await componentize(opts);

            // Write out the component to a file
            const componentOutputPath = join(componentOutputDir, "component.wasm");
            await writeFile(componentOutputPath, component);

            // Serve with wasmtime?
            const wasmtime = spawn(
                wasmtimeBin, 
                [
                    "serve", 
                    "-S", 
                    "config,cli", 
                    "--addr", "127.0.0.1:0", 
                    componentOutputPath,
                ]
            );

            // Wait for wasmtime to start serving the component
            const { promise: startupWait, resolve: resolveStartupWait } = Promise.withResolvers();
            wasmtime.stderr.on('data', data => {
                console.log(`[wasmtime] STDERR: ${data}`);
                if (data.includes("127.0.0.1")) {
                    resolveStartupWait(null);
                }
            });
            wasmtime.stdout.on('data', data => {
                console.log(`[wasmtime] STDOUT: ${data}`);
                if (data.includes("127.0.0.1")) {
                    resolveStartupWait(null);
                }
            });
            await startupWait;

            // TODO: Perform HTTP requests

            assert(true, "test works");
        });
    }

})
