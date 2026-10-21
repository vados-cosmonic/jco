import { assert, test } from 'vitest';
import { buildPair } from './build.js';
import { bundlers, components } from './cases.js';
import { measure } from './measure.js';
import { reportAndGate } from './report.js';

for (const bundler of bundlers) {
    // Intentionally serial: bundling and sibling benchmarks must not compete
    // with the isolated timing process. The dedicated config uses one worker.
    test.each(components)(`${bundler}: bundled performance of $id`, async ({ id }) => {
        const pair = await buildPair([id], bundler);
        try {
            const result = await measure(pair);
            assert.deepEqual(result.verified, [id]);
            assert.equal('call' in result.medians.inline, id !== 'streams');
            for (const metric of ['parse', 'evaluate', 'instantiate']) {
                assert.isAbove(result.medians.inline[metric], 0);
            }
            const failures = await reportAndGate({
                kind: 'performance',
                bundler,
                scenario: id,
                values: result.medians,
                units: 'nanoseconds',
                ...result,
            });
            assert.deepEqual(failures, []);
        } finally {
            await pair.cleanup();
        }
    });
}
