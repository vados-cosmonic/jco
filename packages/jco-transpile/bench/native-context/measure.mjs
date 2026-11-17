import { execFileSync } from 'node:child_process';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus, release } from 'node:os';
const output = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const eligible = ['pr2483', 'cache-checked', 'cache-epoch', 'native-isolated'];
if (manifest.variants.some((name) => !eligible.includes(name))) throw new Error('Ineligible benchmark variant');
const repetitions = Number(process.env.REPETITIONS ?? 9);
const samples = [];
let seed = 2481;
/** Randomize order within each round while retaining reproducibility. */
function shuffle(values) {
    return values
        .map((value) => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return { value, key: seed };
        })
        .sort((left, right) => left.key - right.key)
        .map(({ value }) => value);
}
const env = { ...process.env };
delete env.JCO_DEBUG;
await writeFile(join(output, 'samples.jsonl'), '');
await writeFile(
    join(output, 'environment.json'),
    JSON.stringify(
        {
            node: process.version,
            v8: process.versions.v8,
            cpu: cpus()[0].model,
            cpus: cpus().length,
            kernel: release(),
            repetitions,
            seed,
            manifest,
            methodology:
                'Serial fresh processes, shuffled order per paired round. Rust in-guest timer without explicit warmup; boundary loop JS timer after 5 x 100 warmup calls. No CPU pinning.',
        },
        null,
        2,
    ) + '\n',
);
for (const [benchmark, count] of [
    ['rust', 1000],
    ['rust', 1000000],
    ['sync', 100000],
    ['jspi', 10000],
]) {
    const variants = benchmark === 'rust' ? [...eligible, 'wasip2'] : eligible;
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (const variant of shuffle(variants)) {
            const args =
                benchmark === 'rust'
                    ? ['--experimental-wasm-jspi', join(output, `run-${variant}.mjs`), String(count)]
                    : ['--experimental-wasm-jspi', join(output, 'boundary.mjs'), benchmark, variant, String(count)];
            const before = performance.now();
            const stdout = execFileSync(process.execPath, args, { env, encoding: 'utf8', timeout: 60000 });
            const processMilliseconds = performance.now() - before;
            let milliseconds;
            let startup;
            if (benchmark === 'rust') {
                const match = stdout.match(/(\d+) calls in ([\d.]+)(ns|µs|ms|s) \(sum (\d+)\)/);
                const remainder = count % 256;
                const sum = Math.floor(count / 256) * 32640 + (remainder * (remainder - 1)) / 2;
                if (!match || +match[1] !== count || +match[4] !== sum)
                    throw new Error(`Invalid Rust output: ${stdout}`);
                milliseconds = +match[2] * { ns: 1e-6, µs: 1e-3, ms: 1, s: 1000 }[match[3]];
            } else {
                ({ milliseconds, startup } = JSON.parse(stdout));
            }
            const sample = { benchmark, count, repetition, variant, milliseconds, startup, processMilliseconds };
            samples.push(sample);
            await appendFile(join(output, 'samples.jsonl'), JSON.stringify(sample) + '\n');
        }
        console.log(`${benchmark}/${count}: ${repetition + 1}/${repetitions}`);
    }
}
/** Report process-level quartiles without treating guest iterations as independent samples. */
function distribution(values) {
    const sorted = values.toSorted((left, right) => left - right);
    return {
        min: sorted[0],
        q1: sorted[Math.floor(sorted.length / 4)],
        median: sorted[Math.floor(sorted.length / 2)],
        q3: sorted[Math.floor((sorted.length * 3) / 4)],
        max: sorted.at(-1),
    };
}
const summary = {};
for (const key of [...new Set(samples.map((sample) => `${sample.benchmark}/${sample.count}`))]) {
    const selected = samples.filter((sample) => `${sample.benchmark}/${sample.count}` === key);
    summary[key] = Object.fromEntries(
        [...new Set(selected.map((sample) => sample.variant))].map((variant) => [
            variant,
            distribution(selected.filter((sample) => sample.variant === variant).map((sample) => sample.milliseconds)),
        ]),
    );
}
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
