import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { bundlers, components, scenarios } from './cases.js';
const expectedReports = bundlers
    .flatMap((bundler) => [
        ...scenarios.map(({ id }) => `size--${bundler}--${id}`),
        ...components.map(({ id }) => `performance--${bundler}--${id}`),
    ])
    .toSorted();

export const gate = process.env.JCO_RUNTIME_METRICS_GATE ?? 'baseline';
export const recording = process.env.JCO_RUNTIME_METRICS_RECORD === '1';
if (!['baseline', 'parity'].includes(gate)) {
    throw new Error(`Unknown metrics gate: ${gate}`);
}
if (recording && process.env.CI) {
    throw new Error('Baseline recording is disabled in CI');
}
export const bundlerVersions = Object.fromEntries(
    await Promise.all(
        ['rolldown', 'rollup', 'oxc-minify'].map(async (name) => [
            name,
            JSON.parse(await readFile(new URL('../../node_modules/' + name + '/package.json', import.meta.url), 'utf8'))
                .version,
        ]),
    ),
);
export const outputDir = resolve(process.env.JCO_RUNTIME_METRICS_OUTPUT ?? 'test/output/runtime-metrics');
export interface Values {
    inline: Record<string, number>;
    external: Record<string, number>;
}
export interface Report {
    kind: 'size' | 'performance';
    bundler: string;
    scenario: string;
    values: Values;
    [key: string]: unknown;
}
export interface Baseline {
    schema: number;
    entries: Record<string, Values>;
}
export const keyOf = (report: Pick<Report, 'kind' | 'bundler' | 'scenario'>) =>
    `${report.kind}--${report.bundler}--${report.scenario}`;

/** Additive tolerances keep tiny operations from producing meaningless ratios. */
export const parity = {
    raw: { ratio: 1.05, slack: 256 },
    gzip: { ratio: 1.05, slack: 128 },
    brotli: { ratio: 1.05, slack: 128 },
    parse: { ratio: 1.25, slack: 25_000 },
    evaluate: { ratio: 1.25, slack: 25_000 },
    instantiate: { ratio: 1.25, slack: 50_000 },
    call: { ratio: 1.25, slack: 250 },
} as const;
export function parityLosses(values: Values) {
    if (
        !Object.keys(values.inline).length ||
        Object.keys(values.inline).toSorted().join() !== Object.keys(values.external).toSorted().join()
    ) {
        throw new Error('Invalid metric set: both modes must report the same nonempty axes');
    }
    return Object.entries(values.inline)
        .filter(([metric, inline]) => {
            const target = parity[metric as keyof typeof parity];
            if (!target || !Number.isFinite(inline) || !Number.isFinite(values.external[metric])) {
                throw new Error(`Invalid metric ${metric}`);
            }
            return values.external[metric] > inline * target.ratio + target.slack;
        })
        .map(([metric]) => metric);
}
export function regressionLosses(values: Values, baseline: Values, kind: Report['kind']) {
    const failures: string[] = [];
    for (const [metric, inline] of Object.entries(values.inline)) {
        const external = values.external[metric];
        const oldInline = baseline.inline[metric];
        const oldExternal = baseline.external[metric];
        if (![inline, external, oldInline, oldExternal].every((n) => Number.isFinite(n) && n > 0)) {
            failures.push(`${metric}: missing/invalid observation or baseline`);
            continue;
        }
        if (kind === 'size') {
            // Gate BOTH absolute outputs and the relative penalty. A worsening
            // inline baseline must not make an external regression look better.
            for (const mode of ['inline', 'external'] as const) {
                if (values[mode][metric] > baseline[mode][metric] * 1.05 + 128) {
                    failures.push(`${metric}: ${mode} exceeds baseline by >5% + 128 bytes`);
                }
            }
            if (external / inline > (oldExternal / oldInline) * 1.05 + 128 / inline) {
                failures.push(`${metric}: external/inline size ratio regressed >5% + 128 bytes`);
            }
        } else {
            // Relative timing is portable across machines; allow 35% over the
            // observed penalty or the parity target, plus the metric's noise floor.
            const target = parity[metric as keyof typeof parity];
            const ratio = Math.max(target.ratio, (oldExternal / oldInline) * 1.35);
            if (external > inline * ratio + target.slack) {
                failures.push(`${metric}: external/inline timing exceeds ${ratio.toFixed(2)}x + ${target.slack}ns`);
            }
        }
    }
    return failures;
}
export async function reportAndGate(report: Report) {
    await mkdir(outputDir, { recursive: true });
    const losses = parityLosses(report.values);
    const key = keyOf(report);
    await writeFile(
        join(outputDir, `${key}.json`),
        JSON.stringify(
            {
                schema: 1,
                expectedReports,
                ...report,
                parityLosses: losses,
                environment: {
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    bundlers: bundlerVersions,
                },
            },
            null,
            2,
        ) + '\n',
    );
    console.log(`${key}: ${JSON.stringify(report.values)}; parity losses: ${losses.join(', ') || 'none'}`);
    if (recording) {
        return [];
    }
    if (gate === 'parity') {
        return losses.map((metric) => `${metric}: external runtime misses parity target`);
    }
    const baseline: Baseline = JSON.parse(await readFile(new URL('./baseline.json', import.meta.url), 'utf8'));
    if (baseline.schema !== 1 || !baseline.entries[key]) {
        return [`Missing baseline for ${key}; record and review measurements before gating`];
    }
    return regressionLosses(report.values, baseline.entries[key], report.kind);
}
