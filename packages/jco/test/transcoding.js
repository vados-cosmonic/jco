import { exec, jcoPath } from "./helpers.js";
import { execArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { setupTestWithLocalShims } from "./helpers.js";
import { suite, test, assert } from "vitest";
import { writeFile } from "node:fs/promises";

const multiMemory = execArgv.includes("--experimental-wasm-multi-memory") ? ["--multi-memory"] : [];

suite("CLI", () => {
    test.concurrent("Transcoding", async () => {
        const { outDir, cleanup } = await setupTestWithLocalShims();
        const { stderr } = await exec(
            jcoPath,
            "transpile",
            `test/fixtures/components/env-allow.composed.wasm`,
            ...multiMemory,
            "-o",
            outDir,
        );
        assert.strictEqual(stderr, "");
        await writeFile(`${outDir}/package.json`, JSON.stringify({ type: "module" }));
        const m = await import(`${pathToFileURL(outDir)}/env-allow.composed.js`);
        assert.deepStrictEqual(m.testGetEnv(), [["CUSTOM", "VAL"]]);

        await cleanup();
    });

    test.concurrent("Transcoding UTF8 <-> UTF16", async () => {
        const { stdout, stderr } = await exec(
            jcoPath,
            "run",
            `test/fixtures/components/utf8-utf16.composed.wasm`,
            ...multiMemory,
            "--",
            "asdf中文🀄️⏰",
        );
        assert.strictEqual(stdout, "ret: asdf中文🀄️⏰asdf中文🀄️⏰\n");
        assert.strictEqual(stderr, "");
    });
});
