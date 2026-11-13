import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import type { ComponentizeOptions } from "../componentize.js";

const PERRY_WIT_PACKAGE = "perry-wit";

/** Extensions tried, in order, for a relative import that names no file. */
const MODULE_EXTENSIONS = [".ts", ".mts", ".tsx", ".js", ".mjs"];

/** A TypeScript extension that may stand in for the JavaScript extension an import names. */
const TYPESCRIPT_FOR_JAVASCRIPT: Record<string, string[]> = {
    ".js": [".ts", ".tsx"],
    ".mjs": [".mts"],
};

/** These options configure the JavaScript engines, Jco's bundler or Jco's Node.js adapters. */
const UNSUPPORTED_OPTIONS: Array<keyof ComponentizeOptions> = [
    "bundle",
    "bundleConfig",
    "backendQjsDisableAsync",
    "backendQjsStubWasi",
    "wizerBin",
    "nodejsHttpVia",
    "withNodejsHttpVia",
    "nodejsHttp2Via",
    "withNodejsHttp2Via",
    "nodejsVfsVia",
    "withNodejsVfsVia",
    "withNodejsVfsWasiConfig",
    "withNodejsCryptoVia",
];

/** A file handed to the compiler, named by a path the compiler only reports and resolves against. */
interface SourceFile {
    path: string;
    contents: string | Uint8Array;
}

/** One WIT package: its WIT files, or its binary encoding. */
type WitPackage = SourceFile[] | Uint8Array;

/** A problem the compiler reports. */
interface PerryWitDiagnostic {
    code: string;
    severity: string;
    message: string;
}

/** The part of the `perry-wit` package this backend uses. */
interface PerryWitModule {
    compile(options: {
        source: SourceFile;
        modules: Map<string, string>;
        wit: WitPackage;
        witDependencies: WitPackage[];
        world?: string;
    }): Promise<{ component: Uint8Array }>;
}

/**
 * Load the `perry-wit` package the user's project installed, never one Jco depends on.
 *
 * @param packageName - package to load, which may be an npm alias
 * @param cwd - directory resolution starts from
 */
async function loadPerryWit(packageName: string, cwd: string): Promise<PerryWitModule> {
    const require = createRequire(pathToFileURL(join(cwd, "package.json")));
    let entry: string;
    try {
        entry = require.resolve(packageName);
    } catch (cause) {
        throw new Error(
            `Cannot resolve the Perry-WIT package "${packageName}" from ${cwd}. Install it in this project (npm install --save-dev ${packageName}), or name another package with --backend-perry-wit-package <name>.`,
            { cause },
        );
    }

    const module: Partial<PerryWitModule> = await import(pathToFileURL(entry).href);
    if (typeof module.compile !== "function") {
        throw new Error(`Perry-WIT package "${packageName}" (${entry}) does not export a compile function.`);
    }
    return module as PerryWitModule;
}

/**
 * List the relative specifiers a module imports or re-exports.
 *
 * Bare specifiers are left to the compiler, which reports the ones it cannot resolve.
 *
 * @param source - module text
 */
function relativeSpecifiers(source: string): string[] {
    const specifiers = new Set<string>();
    const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']*)\1/g;
    for (const match of source.matchAll(pattern)) {
        specifiers.add(match[2]);
    }
    return [...specifiers];
}

/**
 * Find the file a relative import names, trying TypeScript sources for JavaScript extensions
 * and the usual extensions and index files for extensionless specifiers.
 *
 * @param importer - absolute path of the importing module
 * @param specifier - relative specifier it imports
 * @returns the absolute path of the module, or undefined when no file matches
 */
async function resolveRelativeImport(importer: string, specifier: string): Promise<string | undefined> {
    const target = resolve(dirname(importer), specifier);
    const extension = extname(target);
    const stem = target.slice(0, target.length - extension.length);
    const candidates = [
        ...(TYPESCRIPT_FOR_JAVASCRIPT[extension] ?? []).map((replacement) => `${stem}${replacement}`),
        target,
        ...MODULE_EXTENSIONS.map((candidate) => `${target}${candidate}`),
        ...MODULE_EXTENSIONS.map((candidate) => join(target, `index${candidate}`)),
    ];

    for (const candidate of candidates) {
        const isFile = await stat(candidate).then(
            (stats) => stats.isFile(),
            () => false,
        );
        if (isFile) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Read the entry module and every module it reaches through relative imports.
 *
 * The compiler reads no files, so it receives the whole module graph up front.
 *
 * @param entry - absolute path of the entry module
 * @returns module text keyed by absolute path, entry first
 */
async function readModuleGraph(entry: string): Promise<Map<string, string>> {
    const modules = new Map<string, string>();
    const pending = [entry];

    while (pending.length > 0) {
        const path = pending.pop() as string;
        if (modules.has(path)) {
            continue;
        }
        const source = await readFile(path, "utf8");
        modules.set(path, source);

        for (const specifier of relativeSpecifiers(source)) {
            const imported = await resolveRelativeImport(path, specifier);
            if (imported !== undefined) {
                pending.push(imported);
            }
        }
    }
    return modules;
}

/**
 * Find the deepest directory that contains every path.
 *
 * @param paths - absolute file paths
 */
function commonDirectory(paths: string[]): string {
    let common = dirname(paths[0]).split(sep);
    for (const path of paths.slice(1)) {
        const segments = dirname(path).split(sep);
        let shared = 0;
        while (shared < common.length && shared < segments.length && common[shared] === segments[shared]) {
            shared++;
        }
        common = common.slice(0, shared);
    }
    return common.join(sep) || sep;
}

/**
 * Read the `.wit` files directly inside a directory, in name order.
 *
 * @param directory - absolute path of the directory
 */
async function readWitFiles(directory: string): Promise<SourceFile[]> {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".wit")).sort();
    return Promise.all(
        names.map(async (name) => ({ path: name, contents: await readFile(join(directory, name), "utf8") })),
    );
}

/**
 * Read a WIT path the way `wit-parser` lays packages out:
 * a single file, or a directory holding one package with its dependencies under `deps/`.
 * A dependency is a directory of `.wit` files, one `.wit` file, or a binary `.wasm` package.
 *
 * @param witPath - absolute path of the WIT file or directory
 */
async function readWit(witPath: string): Promise<{ wit: WitPackage; witDependencies: WitPackage[] }> {
    if (!(await stat(witPath)).isDirectory()) {
        return { wit: [{ path: basename(witPath), contents: await readFile(witPath, "utf8") }], witDependencies: [] };
    }

    const wit = await readWitFiles(witPath);
    if (wit.length === 0) {
        throw new Error(`WIT directory ${witPath} holds no .wit files.`);
    }

    const dependencies = join(witPath, "deps");
    const entries = await readdir(dependencies, { withFileTypes: true }).catch(() => []);
    const witDependencies: WitPackage[] = [];
    for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
        const path = join(dependencies, entry.name);
        if (entry.isDirectory()) {
            const files = await readWitFiles(path);
            if (files.length > 0) {
                witDependencies.push(files);
            }
        } else if (entry.name.endsWith(".wit")) {
            witDependencies.push([{ path: entry.name, contents: await readFile(path, "utf8") }]);
        } else if (entry.name.endsWith(".wasm")) {
            witDependencies.push(new Uint8Array(await readFile(path)));
        }
    }
    return { wit, witDependencies };
}

/**
 * Tell whether an error carries the compiler's diagnostics.
 *
 * @param error - value a failed compilation threw
 */
function hasDiagnostics(error: unknown): error is Error & { diagnostics: PerryWitDiagnostic[] } {
    return error instanceof Error && Array.isArray((error as { diagnostics?: unknown }).diagnostics);
}

/**
 * Compile a TypeScript entry module ahead of time into a component with Perry-WIT.
 *
 * Perry-WIT lowers a static subset of TypeScript to WebAssembly instead of embedding a
 * JavaScript engine, so it compiles the original sources: Jco does not bundle them, erase
 * their types or add its Node.js adapters.
 *
 * @param source - absolute path of the entry module
 * @param opts - componentize options, of which this backend uses `wit`, `worldName` and `cwd`
 * @returns the component binary
 */
export async function componentizePerryWit(source: string, opts: ComponentizeOptions): Promise<Uint8Array> {
    if (opts.wit === undefined) {
        throw new Error("--wit is required for the perry-wit backend");
    }
    const unsupported = UNSUPPORTED_OPTIONS.filter((option) => opts[option] !== undefined && opts[option] !== false);
    if (unsupported.length > 0) {
        const flags = unsupported.map((option) => `--${option.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
        throw new Error(
            `The perry-wit backend does not support ${flags.join(", ")}. Perry-WIT compiles the original TypeScript sources.`,
        );
    }

    const cwd = resolve(opts.cwd ?? dirname(source));
    const perryWit = await loadPerryWit(opts.backendPerryWitPackage ?? PERRY_WIT_PACKAGE, cwd);

    // Name modules relative to the directory that holds them all, so diagnostics stay short
    // and the compiler resolves each relative import to the module read for it.
    const graph = await readModuleGraph(source);
    const root = commonDirectory([...graph.keys()]);
    const name = (path: string) => relative(root, path).split(sep).join("/");
    const modules = new Map<string, string>();
    for (const [path, contents] of graph) {
        if (path !== source) {
            modules.set(name(path), contents);
        }
    }

    const { wit, witDependencies } = await readWit(resolve(opts.wit));
    try {
        const { component } = await perryWit.compile({
            source: { path: name(source), contents: graph.get(source) as string },
            modules,
            wit,
            witDependencies,
            world: opts.worldName,
        });
        return component;
    } catch (error) {
        if (hasDiagnostics(error)) {
            throw new Error(`Perry-WIT rejected ${source}:\n${error.message}`, { cause: error });
        }
        throw error;
    }
}
