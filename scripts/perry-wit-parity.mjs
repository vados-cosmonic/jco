// Compile every JavaScript and TypeScript component in this repository with the perry-wit
// componentize backend, and report which ones the compiler accepts.
//
// Components come from two places:
//   - examples/components/*, read from the `jco componentize` commands in their package scripts
//   - packages/jco/test/fixtures/componentize/*, read from their source and WIT files
//
// Usage: node scripts/perry-wit-parity.mjs --project <dir> [--json <path>] [--out <dir>] [--only <text>]
//   --project  directory of a project that installed the perry-wit package
//   --json     write the full results to this file
//   --out      keep the compiled components in this directory
//   --only     compile only components whose name contains this text
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPOSITORY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_DIR = join(REPOSITORY_DIR, 'examples/components');
const FIXTURES_DIR = join(REPOSITORY_DIR, 'packages/jco/test/fixtures/componentize');
const JCO_DIST = join(REPOSITORY_DIR, 'packages/jco/dist');

/** `jco componentize` flags that take a value, so the value is not mistaken for a source. */
const VALUE_FLAGS = new Set([
    '-w',
    '--wit',
    '-n',
    '--world-name',
    '-o',
    '--out',
    '-d',
    '--disable',
    '--enable',
    '--backend',
    '--engine',
    '--cwd',
    '--bundle-config',
    '--preview2-adapter',
    '--aot-min-stack-size-bytes',
    '--weval-bin',
    '--wizer-bin',
    '--with-nodejs-http-via',
    '--with-nodejs-http2-via',
    '--with-nodejs-vfs-via',
    '--with-nodejs-vfs-wasi-config',
    '--with-nodejs-crypto-via',
    '--backend-perry-package',
    '--backend-perry-cli-path',
    '--backend-perry-wit-package',
]);

/** Fixture file names that are a component's entry module, most specific first. */
const FIXTURE_SOURCES = ['source.ts', 'component.ts', 'source.js', 'component.js'];

/** Fixture names that are a component's WIT, most specific first. */
const FIXTURE_WITS = ['source.wit', 'world.wit', 'wit'];

/**
 * @typedef {object} Component
 * @property {"example" | "fixture"} set where the component comes from
 * @property {string} name directory name, with the entry module when a directory holds several
 * @property {string} source absolute path of the entry module
 * @property {string | undefined} wit absolute path of the WIT file or directory
 * @property {string | undefined} world world name the build selects
 * @property {string} [note] how the entry module was chosen, when it differs from the build command
 */

/**
 * @typedef {object} Result
 * @property {Component} component
 * @property {"compiled" | "rejected" | "failed" | "skipped"} status
 * @property {string[]} codes diagnostic codes the compiler reported
 * @property {string} detail first diagnostic, error message or reason for skipping
 * @property {number} [bytes] size of the compiled component
 */

/**
 * Read the `jco componentize` commands of a package script.
 *
 * @param {string} script
 * @returns {{ sources: string[], wit?: string, world?: string, scriptOnly: boolean }[]}
 */
function componentizeCommands(script) {
    const commands = [];
    for (const segment of script.split(/&&|;/)) {
        const tokens = segment.trim().split(/\s+/);
        const start = tokens.findIndex((token, index) => token === 'componentize' && tokens[index - 1] === 'jco');
        if (start < 0) {
            continue;
        }

        const command = { sources: [], wit: undefined, world: undefined, scriptOnly: false };
        for (let index = start + 1; index < tokens.length; index++) {
            const [flag, inline] = tokens[index].split(/=(.*)/s);
            if (!flag.startsWith('-')) {
                command.sources.push(flag);
                continue;
            }
            const value = VALUE_FLAGS.has(flag) ? (inline ?? tokens[++index]) : undefined;
            if (flag === '-w' || flag === '--wit') {
                command.wit = value;
            } else if (flag === '-n' || flag === '--world-name') {
                command.world = value;
            } else if (flag === '--script-only') {
                command.scriptOnly = true;
            }
        }
        commands.push(command);
    }
    return commands;
}

/**
 * Find the TypeScript module a built JavaScript entry comes from.
 * The perry-wit backend compiles original sources, not bundler or `tsc` output.
 *
 * @param {string} directory example directory
 * @param {string} source entry the build command names, relative to `directory`
 * @returns {string | undefined} the original module, relative to `directory`
 */
function originalSource(directory, source) {
    if (!source.startsWith('dist/')) {
        return undefined;
    }
    const stem = source.slice('dist/'.length, source.length - extname(source).length);
    const candidates = [`src/${stem}.ts`, `src/${stem}.mts`, `${stem}.ts`, `src/${basename(stem)}.ts`];
    return candidates.find((candidate) => existsSync(join(directory, candidate)));
}

/**
 * List the components the examples build.
 *
 * @returns {Promise<Component[]>}
 */
async function exampleComponents() {
    const components = [];
    for (const name of (await readdir(EXAMPLES_DIR)).sort()) {
        const directory = join(EXAMPLES_DIR, name);
        const manifest = await readFile(join(directory, 'package.json'), 'utf8').then(JSON.parse, () => undefined);
        if (!manifest) {
            continue;
        }

        const seen = new Set();
        for (const script of Object.values(manifest.scripts ?? {})) {
            for (const command of componentizeCommands(script)) {
                for (const source of command.sources) {
                    const original = originalSource(directory, source);
                    const entry = original ?? source;
                    const key = `${entry} ${command.wit} ${command.world}`;
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    components.push({
                        set: 'example',
                        name: command.sources.length > 1 ? `${name}/${basename(entry)}` : name,
                        source: join(directory, entry),
                        wit: command.wit === undefined ? undefined : join(directory, command.wit),
                        world: command.world,
                        note: original === undefined ? undefined : `original of ${source}`,
                    });
                }
            }
        }
    }
    return components;
}

/**
 * List the components the componentize tests build from fixtures.
 * A fixture directory holds one entry module and its WIT; `script-only` holds several pairs.
 *
 * @returns {Promise<Component[]>}
 */
async function fixtureComponents() {
    const components = [];
    for (const name of (await readdir(FIXTURES_DIR)).sort()) {
        const directory = join(FIXTURES_DIR, name);
        if (!(await stat(directory)).isDirectory() || name === 'helpers') {
            continue;
        }

        if (name === 'script-only') {
            for (const [source, wit] of [
                ['calc.ts', 'wit-calc'],
                ['greet.js', 'wit-greeter'],
            ]) {
                components.push({
                    set: 'fixture',
                    name: `${name}/${source}`,
                    source: join(directory, source),
                    wit: join(directory, wit),
                });
            }
            continue;
        }

        const source = FIXTURE_SOURCES.find((candidate) => existsSync(join(directory, candidate)));
        const wit = FIXTURE_WITS.find((candidate) => existsSync(join(directory, candidate)));
        if (source === undefined) {
            continue;
        }
        components.push({
            set: 'fixture',
            name,
            source: join(directory, source),
            wit: wit === undefined ? undefined : join(directory, wit),
        });
    }
    return components;
}

/**
 * Compile one component with the perry-wit backend.
 *
 * @param {Component} component
 * @param {(source: string, options: object) => Promise<Uint8Array>} componentizePerryWit
 * @param {string} project directory of the project that installed perry-wit
 * @param {string} out directory that receives the compiled component
 * @returns {Promise<Result>}
 */
async function compile(component, componentizePerryWit, project, out) {
    if (component.wit === undefined) {
        return { component, status: 'skipped', codes: [], detail: 'the component has no WIT world' };
    }
    if (!existsSync(component.source)) {
        return { component, status: 'skipped', codes: [], detail: 'the entry module does not exist' };
    }

    try {
        const bytes = await componentizePerryWit(component.source, {
            wit: component.wit,
            worldName: component.world,
            cwd: project,
            out: '',
        });
        await writeFile(join(out, `${component.set}-${component.name.replaceAll('/', '-')}.wasm`), bytes);
        return { component, status: 'compiled', codes: [], detail: '', bytes: bytes.length };
    } catch (error) {
        const diagnostics = error?.cause?.diagnostics;
        if (Array.isArray(diagnostics)) {
            const first = diagnostics[0];
            return {
                component,
                status: 'rejected',
                codes: [...new Set(diagnostics.map((diagnostic) => diagnostic.code))],
                detail: first ? `${first.code}: ${first.message}` : String(error.message),
            };
        }
        return { component, status: 'failed', codes: [], detail: String(error?.message ?? error) };
    }
}

/**
 * Print the results as a table with a summary by status and diagnostic code.
 *
 * @param {Result[]} results
 */
function report(results) {
    const shorten = (text) => (text.length > 110 ? `${text.slice(0, 107)}...` : text).replaceAll('\n', ' ');
    for (const { component, status, detail, bytes } of results) {
        const source = relative(REPOSITORY_DIR, component.source);
        const outcome = status === 'compiled' ? `${bytes} bytes` : shorten(detail);
        console.log(
            `${status.padEnd(9)} ${component.set.padEnd(8)} ${component.name.padEnd(34)} ${source}\n          ${outcome}`,
        );
    }

    const count = (items) => {
        const counts = new Map();
        for (const item of items) {
            counts.set(item, (counts.get(item) ?? 0) + 1);
        }
        return [...counts].sort((first, second) => second[1] - first[1]);
    };
    console.log(`\n${results.length} components`);
    for (const [status, total] of count(results.map((result) => result.status))) {
        console.log(`  ${status}: ${total}`);
    }
    console.log('first diagnostic code of rejected components');
    for (const [code, total] of count(
        results.filter((result) => result.status === 'rejected').map((result) => result.codes[0]),
    )) {
        console.log(`  ${code}: ${total}`);
    }
}

/**
 * @param {{ project: string, json?: string, out?: string, only?: string }} args
 */
async function main(args) {
    const { componentizePerryWit } = await import(join(JCO_DIST, 'cmd/componentize/perry-wit.js')).catch((cause) => {
        throw new Error('Build Jco first (pnpm --filter @bytecodealliance/jco run build:ts).', { cause });
    });
    const out = args.out ? resolve(args.out) : await mkdtemp(join(tmpdir(), 'perry-wit-parity-'));
    await mkdir(out, { recursive: true });

    try {
        const components = [...(await exampleComponents()), ...(await fixtureComponents())].filter(
            (component) => args.only === undefined || component.name.includes(args.only),
        );
        const results = [];
        for (const component of components) {
            results.push(await compile(component, componentizePerryWit, resolve(args.project), out));
        }
        report(results);
        if (args.json) {
            await writeFile(args.json, `${JSON.stringify(results, null, 2)}\n`);
        }
    } finally {
        if (!args.out) {
            await rm(out, { recursive: true, force: true });
        }
    }
}

const { values } = parseArgs({
    options: {
        project: { type: 'string' },
        json: { type: 'string' },
        out: { type: 'string' },
        only: { type: 'string' },
    },
    strict: true,
});
if (!values.project) {
    console.error(
        'Usage: node scripts/perry-wit-parity.mjs --project <dir> [--json <path>] [--out <dir>] [--only <text>]',
    );
    process.exitCode = 2;
} else {
    main(values).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
