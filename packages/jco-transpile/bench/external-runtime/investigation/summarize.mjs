import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Run after a complete investigation. Missing cases fail instead of publishing
// a partial comparison. All raw samples remain alongside this concise summary.
const output = resolve(
    process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT ?? 'bench/output/external-runtime-investigation',
);
const median = (xs) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];
const cases = {};
let environment;
for (const id of ['adder', 'flavorful', 'async']) {
    const data = JSON.parse(await readFile(join(output, `${id}.json`), 'utf8'));
    environment ??= data.environment;
    cases[id] = {
        requestedMembers: data.requestedMembers,
        experiments: Object.fromEntries(
            data.reports.map(({ name, caveat, sizes, measurements, allocations }) => [
                name,
                {
                    caveat,
                    sizes,
                    allocations,
                    timingRatios: Object.fromEntries(
                        ['parse', 'evaluate', 'instantiate', 'call'].map((metric) => {
                            const ratios = measurements.map((m) => m.pairedRatios[metric]);
                            return [
                                metric,
                                { median: median(ratios), min: Math.min(...ratios), max: Math.max(...ratios) },
                            ];
                        }),
                    ),
                    medianNanoseconds: Object.fromEntries(
                        ['inline', 'external'].map((mode) => [
                            mode,
                            Object.fromEntries(
                                ['parse', 'evaluate', 'instantiate', 'call'].map((metric) => [
                                    metric,
                                    median(measurements.map((m) => m.medians[mode][metric])),
                                ]),
                            ),
                        ]),
                    ),
                },
            ]),
        ),
    };
}
const shapes = Object.fromEntries(
    await Promise.all(
        ['rolldown', 'rollup'].map(async (name) => [
            name,
            JSON.parse(await readFile(join(output, `shapes-${name}.json`), 'utf8')),
        ]),
    ),
);
const summary = {
    schema: 1,
    environment,
    method: 'Three child processes per experiment, each with nine alternating paired samples. Ratios summarize the three median paired ratios. Constructor counts use separate instrumented processes.',
    cases,
    shapes,
};
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const lines = [
    '# Runtime bundling investigation',
    '',
    'External / inline timing ratios (median of three runs); size in bytes. Diagnostic source changes are not production fixes.',
    '',
    '| Case | Experiment | Inline JS | External JS | Parse | Instantiate | Call |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
];
for (const [id, { experiments }] of Object.entries(cases)) {
    for (const [name, { sizes, timingRatios }] of Object.entries(experiments)) {
        lines.push(
            `| ${id} | ${name} | ${sizes.inline.raw} | ${sizes.external.raw} | ${timingRatios.parse.median.toFixed(2)}× | ${timingRatios.instantiate.median.toFixed(2)}× | ${timingRatios.call.median.toFixed(2)}× |`,
        );
    }
}
await writeFile(join(output, 'summary.md'), lines.join('\n') + '\n');
console.log(`Investigation summary: ${join(output, 'summary.md')}`);
