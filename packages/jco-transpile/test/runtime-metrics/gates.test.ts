import { assert, expect, test } from 'vitest';
import { parityLosses, regressionLosses } from './report.js';
import { workload } from './workloads.mjs';

test.concurrent('budgets detect absolute growth even when both sizes grow equally', () => {
    const baseline = { inline: { raw: 10000 }, external: { raw: 20000 } };
    const changed = { inline: { raw: 12000 }, external: { raw: 24000 } };
    assert.lengthOf(regressionLosses(changed, baseline, 'size'), 2);
    assert.deepEqual(parityLosses(baseline), ['raw']);
});
test.concurrent('budgets reject missing measurements instead of silently passing', () => {
    assert.isNotEmpty(
        regressionLosses({ inline: { call: 1000 }, external: {} }, { inline: {}, external: {} }, 'performance'),
    );
    assert.throws(() => parityLosses({ inline: { call: 1000 }, external: {} }), /Invalid metric/);
});
test.concurrent('workloads reject bundled stubs even if both modes agree on the wrong answer', async () => {
    await expect(workload('adder', { add: { add: () => 0 } })).rejects.toThrow();
});

test.concurrent('relative timing gates reject an external slowdown without relying on native-call speed', () => {
    const baseline = { inline: { call: 1000 }, external: { call: 1100 } };
    assert.deepEqual(
        regressionLosses({ inline: { call: 2000 }, external: { call: 2200 } }, baseline, 'performance'),
        [],
    );
    assert.isNotEmpty(regressionLosses({ inline: { call: 1000 }, external: { call: 3000 } }, baseline, 'performance'));
});

test.concurrent('the timing worker rejects a constant stub that passes the initial known-answer check', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { measure } = await import('./measure.js');
    const dir = await mkdtemp(join(tmpdir(), 'jco-bad-benchmark-'));
    try {
        const bundle = join(dir, 'stub.mjs');
        await writeFile(bundle, 'export function create0() { return { add: { add: () => 42 } }; }');
        const artifact = { dir, bundle, parts: ['adder'] as const, wasm: { bytes: 0, files: {} } };
        await expect(measure({ inline: artifact, external: artifact })).rejects.toThrow(/checksum/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
