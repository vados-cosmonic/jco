import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const record = args.includes('--record');
const parity = args.includes('--parity');
if (record && args.length !== 1) {
    throw new Error('Record the complete suite without filters');
}
if (record && process.env.CI) {
    throw new Error('Baseline recording is disabled in CI');
}
const output = resolve(process.env.JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT ?? 'bench/output/external-runtime');
await mkdir(output, { recursive: true });
// Only remove this suite's reports, preserving unrelated output.
for (const name of await readdir(output)) {
    if (/^(size|performance)--.*\.json$/.test(name)) {
        await rm(join(output, name));
    }
}
const child = spawn(
    process.execPath,
    [
        fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
        'run',
        '-c',
        'bench/external-runtime/vitest.config.ts',
        ...args.filter((arg) => !['--record', '--parity'].includes(arg)),
    ],
    {
        stdio: 'inherit',
        env: {
            ...process.env,
            JCO_EXTERNAL_RUNTIME_BENCH_GATE: parity ? 'parity' : 'baseline',
            JCO_EXTERNAL_RUNTIME_BENCH_RECORD: record ? '1' : '0',
            JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT: output,
        },
    },
);
const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
});
const reports = await Promise.all(
    (await readdir(output))
        .filter((name) => /^(size|performance)--.*\.json$/.test(name))
        .toSorted()
        .map(async (name) => [name.slice(0, -5), JSON.parse(await readFile(join(output, name), 'utf8'))]),
);
const expected = reports[0]?.[1].expectedReports ?? [];
const completeSuite =
    expected.length > 0 &&
    expected.toSorted().join() ===
        reports
            .map(([key]) => key)
            .toSorted()
            .join();
const summary = {
    completeSuite,
    selectedArgs: args,
    schema: 1,
    gate: parity ? 'parity' : 'baseline',
    parityAchieved: completeSuite && reports.every(([, r]) => r.parityLosses.length === 0),
    reports: Object.fromEntries(reports),
};
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
if (record && code === 0 && !completeSuite) {
    throw new Error('Incomplete report matrix; refusing to update baseline');
}
if (record && code === 0) {
    await writeFile(
        'bench/external-runtime/baseline.json',
        JSON.stringify(
            {
                schema: 1,
                description:
                    'Observed baselines, not parity claims. Update only after reviewing per-axis deltas and summary.json.',
                environment: reports[0][1].environment,
                entries: Object.fromEntries(reports.map(([key, value]) => [key, value.values])),
            },
            null,
            2,
        ) + '\n',
    );
}
const ratio = (report, metric) =>
    report.values.inline[metric] === undefined
        ? '—'
        : (report.values.external[metric] / report.values.inline[metric]).toFixed(2) + '×';
const lines = [
    '# Bundled runtime metrics',
    '',
    'External / inline ratios; values below 1 favor external.',
    '',
    'Complete matrix: ' + completeSuite + '. Parity achieved: ' + summary.parityAchieved + '.',
    '',
    '| Bundler | Scenario | Raw | Gzip | Brotli | Parity losses |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...reports
        .filter(([, r]) => r.kind === 'size')
        .map(
            ([, r]) =>
                '| ' +
                [
                    r.bundler,
                    r.scenario,
                    ratio(r, 'raw'),
                    ratio(r, 'gzip'),
                    ratio(r, 'brotli'),
                    r.parityLosses.join(', ') || 'none',
                ].join(' | ') +
                ' |',
        ),
    '',
    '| Bundler | Scenario | Parse | Evaluate | Instantiate | Call | Parity losses |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...reports
        .filter(([, r]) => r.kind === 'performance')
        .map(
            ([, r]) =>
                '| ' +
                [
                    r.bundler,
                    r.scenario,
                    ratio(r, 'parse'),
                    ratio(r, 'evaluate'),
                    ratio(r, 'instantiate'),
                    ratio(r, 'call'),
                    r.parityLosses.join(', ') || 'none',
                ].join(' | ') +
                ' |',
        ),
];
await writeFile(join(output, 'summary.md'), lines.join('\n') + '\n');
console.log(`Runtime metrics: parity ${summary.parityAchieved ? 'achieved' : 'NOT achieved'}; reports: ${output}`);
process.exitCode = Number(code);
