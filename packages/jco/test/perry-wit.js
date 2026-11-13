import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";

import { cli, commandComponent, test } from "./perry/helpers.js";

/** A project that installed the real `perry-wit` package, for the end-to-end test. */
const PERRY_WIT_PROJECT = process.env.TEST_PERRY_WIT_PROJECT;

const WORLD = "package local:greeter;\n\nworld greeter {\n  export hello: func(name: string) -> string;\n}\n";

/**
 * Install a project-local `perry-wit` test double. Its `compile` records the options it
 * receives, so tests can assert what the backend hands the compiler without the real package.
 *
 * @param {string} dir - project directory
 * @param {{ name?: string, body?: string }} [options] - package name and the body of `compile`
 */
async function installCompiler(dir, { name = "perry-wit", body } = {}) {
    const pkg = join(dir, "node_modules", name);
    await mkdir(pkg, { recursive: true });
    await writeFile(
        join(pkg, "package.json"),
        JSON.stringify({ name, version: "0.0.0-test", type: "module", exports: "./index.js" }),
    );
    await writeFile(
        join(pkg, "index.js"),
        `
        import { writeFileSync } from "node:fs";
        export async function compile(options) {
            const text = (value) => (typeof value === "string" ? value : "<bytes>");
            const packages = (wit) => (wit instanceof Uint8Array ? "<bytes>" : wit.map(({ path, contents }) => [path, text(contents)]));
            writeFileSync(${JSON.stringify(join(dir, "invocation.json"))}, JSON.stringify({
                source: options.source,
                modules: [...options.modules],
                wit: packages(options.wit),
                witDependencies: options.witDependencies.map(packages),
                world: options.world ?? null,
            }));
            ${body ?? `return { component: new Uint8Array(${JSON.stringify([...commandComponent])}) };`}
        }
    `,
    );
}

/**
 * Write a TypeScript entry module that imports two modules by relative specifiers,
 * and a WIT directory with one dependency.
 *
 * @param {string} dir - project directory
 */
async function writeProgram(dir) {
    await mkdir(join(dir, "src", "lib"), { recursive: true });
    await mkdir(join(dir, "wit", "deps", "types"), { recursive: true });
    await writeFile(
        join(dir, "src", "main.ts"),
        'import { greeting } from "./lib/greeting.js";\nimport { punctuation } from "./punctuation";\nexport function hello(name: string): string { return `${greeting}, ${name}${punctuation}`; }\n',
    );
    await writeFile(join(dir, "src", "lib", "greeting.ts"), 'export const greeting: string = "hello";\n');
    await writeFile(join(dir, "src", "punctuation.ts"), 'export const punctuation: string = "!";\n');
    await writeFile(join(dir, "wit", "world.wit"), WORLD);
    await writeFile(join(dir, "wit", "deps", "types", "types.wit"), "package local:types;\n\ninterface names {}\n");
}

test.concurrent("passes the module graph, the WIT package and its dependencies to the project's compiler", async ({
    project,
}) => {
    const dir = await project();
    const caller = await project();
    await installCompiler(dir);
    await writeProgram(dir);
    await cli(
        caller,
        "componentize",
        join(dir, "src", "main.ts"),
        "--backend",
        "perry-wit",
        "--cwd",
        dir,
        "--wit",
        join(dir, "wit"),
        "--world-name",
        "greeter",
        "-o",
        "result.wasm",
    );

    const invocation = JSON.parse(await readFile(join(dir, "invocation.json"), "utf8"));
    assert.deepEqual(invocation.source, {
        path: "main.ts",
        contents: await readFile(join(dir, "src", "main.ts"), "utf8"),
    });
    assert.deepEqual(
        invocation.modules.map(([path]) => path).sort(),
        ["lib/greeting.ts", "punctuation.ts"],
        "relative imports resolve to the TypeScript modules they name",
    );
    assert.deepEqual(invocation.wit, [["world.wit", WORLD]]);
    assert.deepEqual(invocation.witDependencies, [[["types.wit", "package local:types;\n\ninterface names {}\n"]]]);
    assert.strictEqual(invocation.world, "greeter");
    assert.deepEqual(new Uint8Array(await readFile(join(caller, "result.wasm"))), commandComponent);
});

test.concurrent("resolves the compiler from the entry module's project and accepts a single WIT file", async ({
    project,
}) => {
    const dir = await project();
    await installCompiler(dir, { name: "my-perry-wit" });
    await writeProgram(dir);
    await cli(
        dir,
        "componentize",
        "src/main.ts",
        "--backend",
        "perry-wit",
        "--backend-perry-wit-package",
        "my-perry-wit",
        "--wit",
        "wit/world.wit",
        "-o",
        "result.wasm",
    );

    const invocation = JSON.parse(await readFile(join(dir, "invocation.json"), "utf8"));
    assert.deepEqual(invocation.wit, [["world.wit", WORLD]]);
    assert.deepEqual(invocation.witDependencies, []);
    assert.strictEqual(invocation.world, null);
});

test.concurrent("reports a missing project-installed compiler with installation guidance", async ({ project }) => {
    const dir = await project();
    await writeProgram(dir);
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry-wit", "--wit", "wit", "-o", "out.wasm"),
        /Cannot resolve the Perry-WIT package "perry-wit".*npm install --save-dev perry-wit/s,
    );
});

test.concurrent("reports the compiler's diagnostics for a rejected program", async ({ project }) => {
    const dir = await project();
    await installCompiler(dir, {
        body: `throw Object.assign(new Error("main.ts:1:1: error[missing-type-annotation]: add a type"), {
            diagnostics: [{ code: "missing-type-annotation", severity: "error", message: "add a type" }],
        });`,
    });
    await writeProgram(dir);
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry-wit", "--wit", "wit", "-o", "out.wasm"),
        /Perry-WIT rejected .*main\.ts:\s+main\.ts:1:1: error\[missing-type-annotation\]: add a type/s,
    );
});

test.concurrent("requires a WIT world and rejects options of other backends", async ({ project }) => {
    const dir = await project();
    await installCompiler(dir);
    await writeProgram(dir);
    const componentize = (...args) =>
        cli(dir, "componentize", "src/main.ts", "--backend", "perry-wit", "-o", "out.wasm", ...args);

    await assert.rejects(componentize(), /--wit is required for the perry-wit backend/);
    await assert.rejects(componentize("--wit", "wit", "--bundle"), /The perry-wit backend does not support --bundle/);
    await assert.rejects(
        componentize("--wit", "wit", "--engine", "engine.wasm"),
        /--engine is only supported by the starlingmonkey and quickjs backends/,
    );
    await assert.rejects(
        componentize("--wit", "wit", "--disable", "all"),
        /--disable option is only supported by the starlingmonkey backend/,
    );
    await assert.rejects(
        cli(
            dir,
            "componentize",
            "src/main.ts",
            "--backend-perry-wit-package",
            "perry-wit",
            "--wit",
            "wit",
            "-o",
            "o.wasm",
        ),
        /--backend-perry-wit-package is only supported by the perry-wit backend/,
    );
});

test.skipIf(!PERRY_WIT_PROJECT)(
    "compiles TypeScript against a WIT world with the real compiler",
    async ({ project }) => {
        const dir = await project();
        await writeProgram(dir);
        await cli(
            dir,
            "componentize",
            "src/main.ts",
            "--backend",
            "perry-wit",
            "--cwd",
            PERRY_WIT_PROJECT,
            "--wit",
            "wit/world.wit",
            "-o",
            "result.wasm",
        );

        const wit = await componentWit(new Uint8Array(await readFile(join(dir, "result.wasm"))));
        assert.match(wit, /export hello: func\(name: string\) -> string;/);
    },
);
