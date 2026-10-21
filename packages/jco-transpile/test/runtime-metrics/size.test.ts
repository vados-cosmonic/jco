import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, test } from 'vitest';
import { bundlers, scenarios } from './cases.js';
import { buildPair, optimize, readBundle } from './build.js';
import { measure } from './measure.js';
import { outputDir, reportAndGate } from './report.js';
import { defaultRuntimeUrl } from '../transpilation.js';

for (const bundler of bundlers) {
    test.each(scenarios)(`${bundler}: bundled size of $id`, async ({ id, components }) => {
        const pair = await buildPair(components, bundler);
        try {
            assert.deepEqual(
                pair.external.wasm,
                pair.inline.wasm,
                'runtime selection must not change core Wasm payloads',
            );
            for (const mode of ['inline', 'external'] as const) {
                const artifact = pair[mode];
                assert.equal(artifact.chunks, 1);
                assert.isAtMost(
                    artifact.js.raw,
                    artifact.unshakenBytes + 128,
                    'tree shaking should not grow the bundle',
                );
                assert.isAtMost(artifact.js.gzip, artifact.js.raw);
                assert.isAtMost(artifact.js.brotli, artifact.js.raw);
                await mkdir(outputDir, { recursive: true });
                await writeFile(join(outputDir, `${bundler}--${id}--${mode}.mjs`), await readBundle(artifact));
            }
            const checked = await measure(pair, true);
            assert.deepEqual(checked.verified, [...components]);
            const failures = await reportAndGate({
                kind: 'size',
                bundler,
                scenario: id,
                values: { inline: pair.inline.js, external: pair.external.js },
                components,
                wasm: pair.inline.wasm,
                diagnostics: Object.fromEntries(
                    ['inline', 'external'].map((mode) => {
                        const artifact = pair[mode as 'inline' | 'external'];
                        return [
                            mode,
                            {
                                generatedBindingBytes: artifact.sourceBytes,
                                bundleMs: artifact.bundleMs,
                                unshakenBytes: artifact.unshakenBytes,
                                chunks: artifact.chunks,
                                builtins: artifact.builtins,
                            },
                        ];
                    }),
                ),
            });
            assert.deepEqual(failures, []);
        } finally {
            await pair.cleanup();
        }
    });
    test(`${bundler}: unused runtime import disappears`, async () => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-unused-runtime-'));
        try {
            await writeFile(
                join(dir, 'entry.mjs'),
                `import { runtime } from ${JSON.stringify(defaultRuntimeUrl.href)}; export const answer = 42;`,
            );
            const { code } = await optimize(join(dir, 'entry.mjs'), bundler);
            assert.isBelow(Buffer.byteLength(code), 100, 'an unused runtime must not retain its factories or classes');
            assert.include(code, '42');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}
