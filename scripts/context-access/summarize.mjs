import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertVariant, RETIRED_VARIANTS } from './candidates.mjs';

const output = resolve(process.argv[2]);
let seed = 2481;

/** Read newline-delimited independent process observations. */
async function readSamples(name) {
    return (await readFile(join(output, name), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
}

/** Return the middle observation, averaging the two middle values for even samples. */
function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Quantify paired round uncertainty without treating loop iterations as independent data. */
function comparison(baseline, candidate) {
    if (baseline.length !== candidate.length || baseline.length < 5) {
        throw new Error('At least five complete paired process rounds are required');
    }
    const ratios = [];
    for (let sample = 0; sample < 10000; sample++) {
        const selectedBaseline = [];
        const selectedCandidate = [];
        for (let index = 0; index < baseline.length; index++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const selected = seed % baseline.length;
            selectedBaseline.push(baseline[selected]);
            selectedCandidate.push(candidate[selected]);
        }
        ratios.push(median(selectedBaseline) / median(selectedCandidate));
    }
    ratios.sort((left, right) => left - right);
    return {
        median: median(candidate),
        min: Math.min(...candidate),
        max: Math.max(...candidate),
        processes: candidate.length,
        speedup: median(baseline) / median(candidate),
        speedupCI95: [ratios[250], ratios[9750]],
    };
}

/** Match samples by round before bootstrapping the ratio of medians. */
function summarize(rows, value, baselineName = 'pr2483') {
    const variants = [...new Set(rows.map((row) => row.variant))];
    const selected = (variant) =>
        rows.filter((row) => row.variant === variant).sort((left, right) => left.repetition - right.repetition);
    const baseline = selected(baselineName);
    if (baseline.some((row, index) => row.repetition !== index)) {
        throw new Error('Baseline rounds must be unique and contiguous');
    }
    const result = {};
    for (const variant of variants) {
        const candidate = selected(variant);
        if (
            candidate.length !== baseline.length ||
            candidate.some((row, index) => row.repetition !== baseline[index].repetition)
        ) {
            throw new Error(`Incomplete paired rounds: ${variant}`);
        }
        // Preserve the archived bootstrap sequence while excluding rejected candidates.
        const estimate = comparison(baseline.map(value), candidate.map(value));
        if (!RETIRED_VARIANTS.includes(variant)) {
            assertVariant(variant);
            result[variant] = estimate;
        }
    }
    return result;
}

const rust = await readSamples('samples.jsonl');
if (rust.some((row) => row.count !== 1000000)) {
    throw new Error('The report requires the one-million-call Rust matrix');
}
const micro = await readSamples('micro.jsonl');
const result = {
    method: 'Median across fresh processes. 95% paired-round percentile bootstrap intervals for ratio of medians, 10,000 resamples. Shared-host timing noise and multiple comparisons limit small-effect claims.',
    rust: summarize(rust, (row) => row.milliseconds),
    reads: summarize(micro, (row) => row.measurements.get.median),
    readWrite: summarize(micro, (row) => row.measurements['get-set-get'].median),
};
try {
    const epoch = await readSamples('epoch.jsonl');
    result.epoch = summarize(epoch, (row) => row.milliseconds);
    result.epochVsChecked = summarize(
        epoch.filter((row) => ['cache-checked', 'cache-epoch'].includes(row.variant)),
        (row) => row.milliseconds,
        'cache-checked',
    );
} catch (error) {
    if (error.code !== 'ENOENT') {
        throw error;
    }
}
result.loggingOverDirect = summarize(
    rust.filter((row) => ['direct-checked', 'direct-no-runtime-log'].includes(row.variant)),
    (row) => row.milliseconds,
    'direct-checked',
);
await writeFile(join(output, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
for (const [workload, results] of Object.entries(result)) {
    if (workload === 'method') {
        continue;
    }
    console.log(workload);
    for (const [variant, value] of Object.entries(results)) {
        console.log(
            `${variant.padEnd(24)} ${value.median.toFixed(2).padStart(8)} ms  ${value.speedup.toFixed(2)}x [${value.speedupCI95.map((entry) => entry.toFixed(2)).join(', ')}]`,
        );
    }
}
