import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { resolve, join } from 'node:path';

const output = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const variants = process.env.VARIANTS?.split(',') ?? manifest.variants;
if (process.env.BENCH_WASMTIME) {
    variants.push('wasmtime');
}
const repetitions = Number(process.env.REPETITIONS ?? 11);
const counts = (process.env.COUNTS ?? '1000,100000,1000000').split(',').map(Number);
const resultName = process.env.RESULT_NAME ?? 'samples';
const samples = [];
let seed = 2481;
const env = { ...process.env };
delete env.JCO_DEBUG;

/** Shuffle paired samples reproducibly to spread machine drift across variants. */
function shuffled(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const other = seed % (index + 1);
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

/** Summarize independent process observations without treating loop iterations as samples. */
function distribution(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return {
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        max: sorted.at(-1),
        q1: sorted[Math.floor(sorted.length / 4)],
        q3: sorted[Math.floor((sorted.length * 3) / 4)],
    };
}

await writeFile(join(output, resultName + '.jsonl'), '');
await writeFile(
    join(output, resultName + '-environment.json'),
    JSON.stringify(
        {
            node: process.version,
            v8: process.versions.v8,
            platform: process.platform,
            kernel: release(),
            cpu: cpus()[0].model,
            cpus: cpus().length,
            repetitions,
            counts,
            variants,
            seed,
            methodology:
                'Serial fresh processes; shuffled variant order per round; in-guest Instant; no explicit warmup; checksum required; no CPU pinning.',
        },
        null,
        2,
    ) + '\n',
);

for (const count of counts) {
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (const variant of shuffled(variants)) {
            const command = variant === 'wasmtime' ? process.env.BENCH_WASMTIME : process.execPath;
            const args =
                variant === 'wasmtime'
                    ? [
                          'run',
                          '-W',
                          'component-model-async=y',
                          '-S',
                          'p3=y',
                          join(output, 'stack-loop.wasm'),
                          String(count),
                      ]
                    : ['--experimental-wasm-jspi', join(output, `run-${variant}.mjs`), String(count)];
            const stdout = execFileSync(command, args, { env, encoding: 'utf8', timeout: 60000 });
            const match = stdout.match(/(\d+) calls in ([\d.]+)(ns|µs|ms|s) \(sum (\d+)\)/);
            const remainder = count % 256;
            const sum = Math.floor(count / 256) * 32640 + (remainder * (remainder - 1)) / 2;
            if (!match || Number(match[1]) !== count || Number(match[4]) !== sum) {
                throw new Error(`Bad output: ${stdout}`);
            }
            const milliseconds = Number(match[2]) * { ns: 1e-6, µs: 1e-3, ms: 1, s: 1000 }[match[3]];
            const sample = { variant, count, repetition, milliseconds, stdout: stdout.trim() };
            samples.push(sample);
            await appendFile(join(output, resultName + '.jsonl'), JSON.stringify(sample) + '\n');
        }
        console.log(`${count}: ${repetition + 1}/${repetitions}`);
    }
}

const summary = {};
for (const count of counts) {
    summary[count] = Object.fromEntries(
        variants.map((variant) => [
            variant,
            distribution(
                samples
                    .filter((sample) => sample.count === count && sample.variant === variant)
                    .map((sample) => sample.milliseconds),
            ),
        ]),
    );
}
await writeFile(join(output, resultName + '-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
