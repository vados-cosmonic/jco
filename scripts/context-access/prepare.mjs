import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RETIRED_VARIANTS } from './candidates.mjs';

const require = createRequire(new URL('../../packages/jco-transpile/package.json', import.meta.url));
const ts = require('typescript-compiler-api');
const prefix = '__jcoEmbeddedRuntime$';

/** Walk a generated JavaScript AST and apply nonoverlapping edits from right to left. */
function edit(source, select) {
    const tree = ts.createSourceFile('component.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const patches = [];

    /** Visit a node, stopping when its entire source range is replaced. */
    function visit(node) {
        const replacement = select(node, tree);
        if (replacement !== undefined) {
            patches.push([node.getStart(tree), node.end, replacement]);
        } else {
            ts.forEachChild(node, visit);
        }
    }

    visit(tree);
    if (!patches.length) {
        throw new Error('No matching AST nodes');
    }
    for (const [start, end, replacement] of patches.sort((left, right) => right[0] - left[0])) {
        source = source.slice(0, start) + replacement + source.slice(end);
    }
    return source;
}

/** Replace exactly the two canonical context operation bodies. */
function contextBodies(source, transform) {
    let count = 0;
    const result = edit(source, (node, tree) => {
        if (
            !ts.isFunctionDeclaration(node) ||
            ![prefix + 'contextGet', prefix + 'contextSet'].includes(node.name?.text)
        ) {
            return;
        }
        count++;
        const body = transform(node.body.getText(tree), node.name.text.endsWith('contextGet'));
        return node.getText(tree).slice(0, node.body.getStart(tree) - node.getStart(tree)) + body;
    });
    if (count !== 2) {
        throw new Error(`Expected two context functions, found ${count}`);
    }
    return result;
}

/** Remove diagnostic calls and their argument construction, leaving all checks intact. */
function noContextLogging(source) {
    return contextBodies(source, (body) =>
        edit(body, (node, tree) => {
            if (
                ts.isExpressionStatement(node) &&
                ts.isCallExpression(node.expression) &&
                node.expression.expression.getText(tree) === prefix + 'debugLog'
            ) {
                return '';
            }
        }),
    );
}

/** Read task registers without creating snapshots, only inside context operations. */
function noContextCopies(source) {
    return contextBodies(source, (body) =>
        edit(body, (node, tree) => {
            if (!ts.isCallExpression(node) || node.expression.getText(tree) !== prefix + 'getCurrentTaskMeta') {
                return;
            }
            return node.arguments.length === 1
                ? '_context.registers.current'
                : '(ctx.componentIdx == null ? _context.registers.current : _context.registers[ctx.componentIdx])';
        }),
    );
}

/** Inject benchmark-only state into each component instantiation. */
function inject(source, code) {
    const marker = 'export function instantiate(getCoreModule, imports, instantiateCore, options) {';
    if (!source.includes(marker)) {
        throw new Error('Unrecognized instantiation signature');
    }
    return source.replace(marker, marker + '\n' + code);
}

/** Implement checked lookup without metadata copies, wrapper objects, or diagnostics. */
function directLookup(source, cache = false) {
    if (cache === 'epoch') {
        source = edit(source, (node, tree) => {
            if (
                !ts.isMethodDeclaration(node) ||
                node.parent.name?.text !== 'RepTable' ||
                !['insert', 'remove', 'clear'].includes(node.name.getText(tree))
            ) {
                return;
            }
            const start = node.body.getStart(tree) - node.getStart(tree);
            const original = node.getText(tree);
            return (
                original.slice(0, start + 1) +
                '\nthis.__benchmarkEpoch = (this.__benchmarkEpoch ?? 0) + 1;\n' +
                original.slice(start + 1)
            );
        });
    }
    const cacheCheck =
        cache === 'epoch'
            ? '&& meta.__benchmarkLookup === context.lookup && meta.__benchmarkEpoch === meta.__benchmarkThreads.__benchmarkEpoch && meta.__benchmarkThread.id() === meta.threadID && meta.__benchmarkThread.taskID() === meta.taskID && meta.__benchmarkThread.componentIdx() === meta.componentIdx'
            : '&& meta.__benchmarkThreads.get(meta.threadID) === meta.__benchmarkThread && meta.__benchmarkThread.taskID() === meta.taskID';
    const resolver = `
    function __benchmarkThread(context, meta) {
        if (!meta || meta.componentIdx === -1 || !meta.threadID) return;
        ${
            cache
                ? `
        if (meta.__benchmarkThread ${cacheCheck}) return meta.__benchmarkThread;
        `
                : ''
        }
        const threads = context.lookup.asyncState.get(meta.componentIdx)?.threads;
        const thread = threads?.get(meta.threadID);
        if (!thread || thread.taskID() !== meta.taskID) return;
        ${cache ? 'meta.__benchmarkThreads = threads; meta.__benchmarkThread = thread;' : ''}
        ${cache === 'epoch' ? 'meta.__benchmarkEpoch = threads.__benchmarkEpoch; meta.__benchmarkLookup = context.lookup;' : ''}
        return thread;
    }
    `;
    return inject(
        contextBodies(
            source,
            (_body, get) => `{
        const { slot } = ctx;
        if (slot === undefined) throw new TypeError('missing slot');
        ${get ? '' : `if (!${prefix}typeCheckValidI32(value)) throw new Error('invalid value for context set (not valid i32)');`}
        const meta = ctx.componentIdx == null ? _context.registers.current : _context.registers[ctx.componentIdx];
        const thread = __benchmarkThread(_context, meta) || __benchmarkThread(_context, _context.registers.current);
        if (!thread) throw new Error('missing current thread');
        if (slot < 0 || slot >= thread.storage.length) throw new Error('invalid slot for current thread');
        ${get ? 'return thread.storage[slot];' : 'thread.storage[slot] = value;'}
    }`,
        ),
        resolver,
    );
}

/** Construct controlled variants from identical PR #2483 output. */
export function variants(source) {
    const noLog = noContextLogging(source);
    const noRuntimeLog = edit(source, (node, tree) => {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === prefix + 'debugLog') {
            return '(void 0)';
        }
    });
    return {
        pr2483: source,
        'no-context-log': noLog,
        'no-meta-copy': noContextCopies(source),
        'no-log-no-copy': noContextCopies(noLog),
        'no-runtime-log': noRuntimeLog,
        'direct-checked': directLookup(source),
        'direct-no-runtime-log': directLookup(noRuntimeLog),
        'cache-checked': directLookup(source, true),
        'cache-epoch': directLookup(source, 'epoch'),
    };
}

/** Prepare self-contained variant artifacts from the issue's existing Rust reproduction. */
export async function prepare(fixture, output) {
    await mkdir(output, { recursive: true });
    // Retire only the known generated artifacts, preserving historical measurements.
    for (const variant of RETIRED_VARIANTS) {
        await rm(join(output, 'variants', variant), { recursive: true, force: true });
        await rm(join(output, `run-${variant}.mjs`), { force: true });
    }
    const original = await readFile(join(fixture, 'out-option/stack-loop.js'), 'utf8');
    const runner = await readFile(join(fixture, 'run.mjs'), 'utf8');
    const matrix = variants(original);
    for (const [name, source] of Object.entries(matrix)) {
        await cp(join(fixture, 'out-option'), join(output, 'variants', name), { recursive: true });
        await writeFile(join(output, 'variants', name, 'stack-loop.js'), source);
        await writeFile(
            join(output, `run-${name}.mjs`),
            runner
                .replaceAll('./out/', `./variants/${name}/`)
                .replace(
                    '});\nawait instance.run.run();',
                    '}, undefined, { debug: false });\nawait instance.run.run();',
                ),
        );
    }
    await cp(join(fixture, 'out2'), join(output, 'out2'), { recursive: true });
    await cp(join(fixture, 'run2.mjs'), join(output, 'run-wasip2.mjs'));
    await cp(join(fixture, 'src'), join(output, 'src'), { recursive: true });
    await cp(join(fixture, 'target/wasm32-wasip3/release/stack-loop.wasm'), join(output, 'stack-loop.wasm'));
    await writeFile(join(output, 'package.json'), '{"type":"module"}\n');
    await writeFile(
        join(output, 'manifest.json'),
        JSON.stringify(
            {
                fixture,
                variants: [...Object.keys(matrix), 'wasip2'],
                sourceHash: createHash('sha256').update(original).digest('hex'),
                baselineCommit: 'cfc2c84ccc5552602b24573eed6cfe13323a5c55',
            },
            null,
            2,
        ) + '\n',
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.length !== 4) {
        throw new Error('Usage: node prepare.mjs FIXTURE_DIRECTORY OUTPUT_DIRECTORY');
    }
    await prepare(resolve(process.argv[2]), resolve(process.argv[3]));
}
