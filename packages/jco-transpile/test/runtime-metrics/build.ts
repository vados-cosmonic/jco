import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { rollup } from 'rollup';
import { minify } from 'oxc-minify';
import { componentPath, type Bundler, type ComponentId } from './cases.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const runtimeDirectory = dirname(fileURLToPath(defaultRuntimeUrl));
const runtimePackage = JSON.parse(await readFile(new URL('../package.json', defaultRuntimeUrl), 'utf8'));
// Match the package's published side-effects contract when resolving file URLs.
// Rollup's bare filesystem resolver otherwise has no package metadata to use.
const runtimeSideEffects = runtimePackage.sideEffects !== false;

export type Mode = 'inline' | 'external';
export interface Artifact {
    dir: string;
    bundle: string;
    parts: readonly ComponentId[];
    sourceBytes: number;
    bundleMs: number;
    js: { raw: number; gzip: number; brotli: number };
    unshakenBytes: number;
    chunks: number;
    builtins: string[];
    wasm: { bytes: number; files: Record<string, string> };
}
export async function optimize(entry: string, bundler: Bundler, treeshake = true) {
    const options = {
        input: entry,
        treeshake,
        external: (id: string) => id.startsWith('node:'),
        plugins: [
            {
                name: 'runtime-file-urls',
                resolveId(id: string, importer?: string) {
                    const path = id.startsWith('file:')
                        ? fileURLToPath(id)
                        : isAbsolute(id)
                          ? id
                          : id.startsWith('.') && importer
                            ? resolve(dirname(importer), id)
                            : undefined;
                    if (path?.startsWith(runtimeDirectory + sep)) {
                        return { id: path, moduleSideEffects: runtimeSideEffects };
                    }
                    if (id.startsWith('file:')) {
                        return fileURLToPath(id);
                    }
                },
            },
        ],
        onwarn(warning: { code?: string; message: string }) {
            // Jco's marker is metadata, with no JavaScript runtime semantics.
            if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use components')) {
                return;
            }
            throw new Error(warning.message);
        },
    };
    const build = bundler === 'rolldown' ? await rolldown({ ...options, platform: 'node' }) : await rollup(options);
    try {
        const generated = await build.generate(
            bundler === 'rolldown'
                ? { format: 'esm', minify: true, codeSplitting: false }
                : { format: 'esm', inlineDynamicImports: true },
        );
        if (generated.output.length !== 1 || generated.output[0].type !== 'chunk') {
            throw new Error('Metrics require a single complete JavaScript bundle');
        }
        const chunk = generated.output[0];
        const imports = [...chunk.imports, ...chunk.dynamicImports];
        if (imports.some((id) => !id.startsWith('node:'))) {
            throw new Error(`Unbundled dependency would invalidate size measurements: ${imports.join(', ')}`);
        }
        const code =
            bundler === 'rolldown'
                ? chunk.code
                : (
                      await minify('bundle.mjs', chunk.code, {
                          module: true,
                          compress: { target: 'es2022' },
                          mangle: {},
                      })
                  ).code;
        return { code, chunks: generated.output.length, builtins: imports.toSorted() };
    } finally {
        await build.close();
    }
}
async function buildArtifact(
    dir: string,
    mode: Mode,
    parts: readonly ComponentId[],
    bundler: Bundler,
): Promise<Artifact> {
    await mkdir(dir, { recursive: true });
    const files: Record<string, string> = {};
    let wasmBytes = 0;
    let sourceBytes = 0;
    const exports: string[] = [];
    for (const [i, id] of parts.entries()) {
        const prefix = `parts/${i}`;
        const name = `component${i}`;
        const result = await transpile(componentPath(id), {
            name,
            instantiation: 'sync',
            wasiShim: false,
            base64Cutoff: 0,
            asyncMode: 'jspi',
            cmRuntimeEsModule: mode === 'external' ? defaultRuntimeUrl.href : undefined,
        });
        const partDir = join(dir, prefix);
        await writeFiles(result.files, { baseDir: partDir });
        for (const [path, bytes] of Object.entries(result.files)) {
            if (path.endsWith('.js')) {
                sourceBytes += bytes.byteLength;
            }
            if (path.endsWith('.wasm')) {
                wasmBytes += bytes.byteLength;
                files[`${prefix}/${path}`] = createHash('sha256').update(bytes).digest('hex');
            }
        }
        exports.push(`import { instantiate as instantiate${i} } from './${prefix}/${name}.js';
export function create${i}(load, imports) { return instantiate${i}(name => load('${prefix}/' + name), imports); }`);
    }
    const entry = join(dir, 'entry.js');
    await writeFile(entry, exports.join('\n'));
    const start = performance.now();
    const result = await optimize(entry, bundler);
    const bundleMs = performance.now() - start;
    const unshaken = await optimize(entry, bundler, false);
    const bundle = join(dir, 'bundle.mjs');
    await writeFile(bundle, result.code);
    return {
        dir,
        bundle,
        parts,
        sourceBytes,
        bundleMs,
        js: {
            raw: Buffer.byteLength(result.code),
            gzip: gzipSync(result.code, { level: 9 }).byteLength,
            brotli: brotliCompressSync(result.code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
        },
        unshakenBytes: Buffer.byteLength(unshaken.code),
        chunks: result.chunks,
        builtins: result.builtins,
        wasm: { bytes: wasmBytes, files },
    };
}
export async function buildPair(parts: readonly ComponentId[], bundler: Bundler) {
    const dir = await mkdtemp(join(tmpdir(), 'jco-runtime-metrics-'));
    try {
        const inline = await buildArtifact(join(dir, 'inline'), 'inline', parts, bundler);
        const external = await buildArtifact(join(dir, 'external'), 'external', parts, bundler);
        return { inline, external, cleanup: () => rm(dir, { recursive: true, force: true }) };
    } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
    }
}
export async function readBundle(artifact: Artifact) {
    return readFile(artifact.bundle, 'utf8');
}
