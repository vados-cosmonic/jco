import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { minify } from 'oxc-minify';
import { assert, test } from 'vitest';
import { buildPair, optimize, type BundleExperiment } from '../build.js';
import { measure } from '../measure.js';
import { bundlerVersions } from '../report.js';
import {
    countFactoryCalls,
    factorySizes,
    omitBindingChecks,
    omitReceiverBinding,
    omitUnusedNamespaces,
    requestedMembers,
} from './transforms.js';
import { startup } from './startup.js';

const output = resolve(
    process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT ?? 'bench/output/external-runtime-investigation',
);
const size = (code: string) => ({
    raw: Buffer.byteLength(code),
    gzip: gzipSync(code, { level: 9 }).byteLength,
    brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
});

// Serial and opt-in: these are causal experiments, not relaxed parity gates.
for (const id of ['adder', 'flavorful', 'async'] as const) {
    test(`diagnose ${id}`, async () => {
        const pair = await buildPair([id], 'rolldown');
        try {
            await mkdir(output, { recursive: true });
            const binding = await readFile(join(pair.external.dir, 'parts/0/component0.js'), 'utf8');
            const members = requestedMembers(binding);
            assert.isNotEmpty(members);
            const namespaces = new Set(members.map((member) => member.split('.')[0]));
            const experiments: { name: string; options?: BundleExperiment; passes?: number; caveat?: string }[] = [
                { name: 'default' },
                {
                    name: 'pure-reads',
                    options: { assumePureReads: true },
                    caveat: 'Changes observable getter/global semantics; diagnostic only.',
                },
                { name: 'extra-minification', passes: 3 },
                {
                    name: 'debug-disabled',
                    options: { define: { 'globalThis.process.env.JCO_DEBUG': 'false' } },
                    caveat: 'Explicitly disables runtime debug logging in both modes.',
                },
                {
                    name: 'omit-unused-namespaces',
                    options: {
                        transform: (code, path) =>
                            path.endsWith('/jco-cm-runtime/dist/runtime.js')
                                ? omitUnusedNamespaces(code, namespaces)
                                : code,
                    },
                    caveat: 'Closed-world diagnostic provider: omits namespaces not read by this binding; not a general provider replacement.',
                },
                {
                    name: 'omit-binding-checks',
                    options: {
                        transform: (code, path) =>
                            path.endsWith('/parts/0/component0.js') ? omitBindingChecks(code) : code,
                    },
                    caveat: 'Drops provider validation; not safe for arbitrary providers.',
                },
                {
                    name: 'omit-receiver-binding',
                    options: {
                        transform: (code, path) =>
                            path.endsWith('/parts/0/component0.js') ? omitReceiverBinding(code) : code,
                    },
                    caveat: 'Drops generated receiver binding; not safe for arbitrary providers or all intrinsics.',
                },
            ];
            const reports = [];
            for (const experiment of experiments) {
                const artifacts = { ...pair };
                const sizes: Record<string, ReturnType<typeof size>> = {};
                const profile = { ...pair };
                for (const mode of ['inline', 'external'] as const) {
                    const artifact = pair[mode];
                    const built = await optimize(join(artifact.dir, 'entry.js'), 'rolldown', true, experiment.options);
                    let code = built.code;
                    for (let pass = 0; pass < (experiment.passes ?? 0); pass++) {
                        const result = await minify('bundle.mjs', code, {
                            module: true,
                            compress: { target: 'es2022' },
                            mangle: {},
                        });
                        assert.deepEqual(result.errors, []);
                        code = result.code;
                    }
                    const bundle = join(artifact.dir, `${experiment.name}.mjs`);
                    await writeFile(bundle, code);
                    await writeFile(join(output, `${id}--${experiment.name}--${mode}.mjs`), code);
                    artifacts[mode] = { ...artifact, bundle };
                    sizes[mode] = size(code);
                    if (experiment.name === 'default') {
                        assert.equal(
                            code,
                            await readFile(artifact.bundle, 'utf8'),
                            'diagnostic defaults must match the regression suite',
                        );
                        const inspected = await optimize(join(artifact.dir, 'entry.js'), 'rolldown', true, {
                            minify: false,
                        });
                        await writeFile(join(output, `${id}--${mode}--readable.mjs`), inspected.code);
                        await writeFile(
                            join(output, `${id}--${mode}--retention.json`),
                            JSON.stringify(
                                {
                                    modules: Object.fromEntries(
                                        Object.entries(inspected.modules).map(([path, bytes]) => [
                                            path.startsWith(artifact.dir)
                                                ? path.slice(artifact.dir.length + 1)
                                                : relative(process.cwd(), path),
                                            bytes,
                                        ]),
                                    ),
                                    factories: factorySizes(inspected.code),
                                },
                                null,
                                2,
                            ),
                        );
                    }
                    if (['default', 'omit-unused-namespaces'].includes(experiment.name)) {
                        const instrumented = await optimize(join(artifact.dir, 'entry.js'), 'rolldown', true, {
                            ...experiment.options,
                            transform(code, path) {
                                const transformed = experiment.options?.transform?.(code, path) ?? code;
                                return path.includes('/jco-cm-runtime/dist/')
                                    ? countFactoryCalls(transformed)
                                    : transformed;
                            },
                        });
                        const bundle = join(artifact.dir, `${experiment.name}-instrumented.mjs`);
                        await writeFile(bundle, instrumented.code);
                        profile[mode] = { ...artifact, bundle };
                    }
                }
                const measurements = [];
                for (let repeat = 0; repeat < 3; repeat++) {
                    const observation = await measure(artifacts);
                    assert.deepEqual(observation.verified, [id]);
                    measurements.push(observation);
                }
                const allocations = ['default', 'omit-unused-namespaces'].includes(experiment.name)
                    ? await startup(profile)
                    : undefined;
                reports.push({ name: experiment.name, caveat: experiment.caveat, sizes, measurements, allocations });
                console.log(
                    id,
                    experiment.name,
                    JSON.stringify({ sizes, pairedRatios: measurements.map((m) => m.pairedRatios), allocations }),
                );
            }
            await writeFile(
                join(output, `${id}.json`),
                JSON.stringify(
                    {
                        schema: 1,
                        environment: {
                            node: process.version,
                            platform: process.platform,
                            arch: process.arch,
                            bundlerVersions,
                        },
                        requestedMembers: members,
                        reports,
                    },
                    null,
                    2,
                ) + '\n',
            );
        } finally {
            await pair.cleanup();
        }
    });
}
