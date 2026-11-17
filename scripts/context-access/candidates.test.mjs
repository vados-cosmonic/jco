import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { assertVariant, CONTEXT_VARIANTS, RETIRED_VARIANTS } from './candidates.mjs';

test('only eligible context variants and reference runtimes can be selected', () => {
    for (const variant of CONTEXT_VARIANTS) {
        assert.doesNotThrow(() => assertVariant(variant, true));
    }
    for (const variant of ['wasip2', 'wasmtime']) {
        assert.doesNotThrow(() => assertVariant(variant));
        assert.throws(() => assertVariant(variant, true), /Ineligible context experiment/);
    }
    for (const variant of [...RETIRED_VARIANTS, 'unknown', '../other']) {
        assert.throws(() => assertVariant(variant), /Ineligible context experiment/);
    }
});

test('stale manifests and explicit selections cannot run retired experiments', async () => {
    const output = await mkdtemp(join(tmpdir(), 'jco-context-selection-'));
    const env = { ...process.env };
    delete env.VARIANTS;
    delete env.BENCH_WASMTIME;
    try {
        for (const variant of RETIRED_VARIANTS) {
            await writeFile(join(output, 'manifest.json'), JSON.stringify({ variants: [variant] }));
            for (const [script, args, overrides] of [
                ['check.mjs', [], {}],
                ['measure.mjs', [], {}],
                ['measure.mjs', [], { VARIANTS: variant }],
                ['micro.mjs', [], {}],
                ['micro.mjs', ['--child', variant], {}],
            ]) {
                const result = spawnSync(
                    process.execPath,
                    [fileURLToPath(new URL(script, import.meta.url)), output, ...args],
                    { encoding: 'utf8', env: { ...env, ...overrides } },
                );
                assert.ifError(result.error);
                assert.notEqual(result.status, 0, `${script} accepted ${variant}`);
                assert.match(result.stderr, /Ineligible context experiment/);
                assert.deepEqual(await readdir(output), ['manifest.json']);
            }
        }
    } finally {
        await rm(output, { recursive: true, force: true });
    }
});
