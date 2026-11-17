import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { operations } from './check.mjs';
import { assertVariant } from './candidates.mjs';

/** Build a core Wasm loop that exercises actual generated canonical imports. */
function loopModule(write) {
    /** Encode a short length-prefixed vector in the core binary format. */
    const vector = (bytes) => [bytes.length, ...bytes];
    const body = [
        1,
        1,
        0x7f, // One i32 local: checksum.
        0x02,
        0x40,
        0x03,
        0x40, // block; loop
        0x20,
        0,
        0x45,
        0x0d,
        1, // break when count is zero
        ...(write ? [0x10, 0, 0x20, 0, 0x6a, 0x10, 1] : []), // set(get() + remaining)
        0x20,
        1,
        0x10,
        0,
        0x6a,
        0x21,
        1, // checksum += get()
        0x20,
        0,
        0x41,
        1,
        0x6b,
        0x21,
        0, // remaining--
        0x0c,
        0,
        0x0b,
        0x0b, // repeat; end loop; end block
        0x20,
        1,
        0x0b, // return checksum
    ];
    const sections = [
        [1, [3, 0x60, 0, 1, 0x7f, 0x60, 1, 0x7f, 0, 0x60, 1, 0x7f, 1, 0x7f]],
        [2, [2, 0, 3, 103, 101, 116, 0, 0, 0, 3, 115, 101, 116, 0, 1]],
        [3, [1, 2]],
        [7, [1, 3, 114, 117, 110, 0, 2]],
        [10, [1, ...vector(body)]],
    ];
    return new WebAssembly.Module(
        new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, ...sections.flatMap(([id, bytes]) => [id, ...vector(bytes)])]),
    );
}

/** Bind extracted operations to a real generated thread table. */
async function imports(output, variant) {
    assertVariant(variant, true);
    const source = await readFile(join(output, 'variants', variant, 'stack-loop.js'), 'utf8');
    const ops = operations(source);
    const threads = new ops.Table();
    const task = { id: () => 1n };
    const thread = { storage: [0, 0], taskID: () => 1n, task: () => task, id: () => 1, componentIdx: () => 0 };
    const meta = { componentIdx: 0, taskID: 1n, threadID: threads.insert(thread) };
    const context = { registers: { 0: meta, current: meta }, lookup: { asyncState: new Map([[0, { threads }]]) } };
    const options = { componentIdx: 0, slot: 0 };
    return { get: ops.get.bind(null, context, options), set: ops.set.bind(null, context, options) };
}

/** Expected wrapping i32 checksum, computed outside the timed region. */
function expected(count, write) {
    let sum = 0;
    let value = 17;
    for (let remaining = count; remaining > 0; remaining--) {
        if (write) {
            value = (value + remaining) | 0;
        }
        sum = (sum + value) | 0;
    }
    return sum;
}

const output = resolve(process.argv[2]);
if (process.argv[3] === '--child') {
    const variant = process.argv[4];
    const bindings = await imports(output, variant);
    const measurements = {};
    for (const write of [false, true]) {
        const run = new WebAssembly.Instance(loopModule(write), { '': bindings }).exports.run;
        const count = 1_000_000;
        const checksum = expected(count, write);
        for (let warmup = 0; warmup < 5; warmup++) {
            bindings.set(17);
            assert.equal(run(100_000), expected(100_000, write));
        }
        const samples = [];
        for (let sample = 0; sample < 7; sample++) {
            bindings.set(17);
            const start = performance.now();
            const actual = run(count);
            samples.push(performance.now() - start);
            assert.equal(actual, checksum);
        }
        samples.sort((left, right) => left - right);
        measurements[write ? 'get-set-get' : 'get'] = { median: samples[3], samples, count };
    }
    console.log(JSON.stringify({ variant, measurements }));
} else {
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    const variants = manifest.variants.filter((variant) => variant !== 'wasip2');
    variants.forEach((variant) => assertVariant(variant, true));
    const repetitions = Number(process.env.REPETITIONS ?? 7);
    let seed = 2481;
    await writeFile(join(output, 'micro.jsonl'), '');
    for (let repetition = 0; repetition < repetitions; repetition++) {
        const order = [...variants];
        for (let index = order.length - 1; index > 0; index--) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const other = seed % (index + 1);
            [order[index], order[other]] = [order[other], order[index]];
        }
        for (const variant of order) {
            const stdout = execFileSync(process.execPath, [process.argv[1], output, '--child', variant], {
                encoding: 'utf8',
                timeout: 120000,
                env: { ...process.env, JCO_DEBUG: '' },
            });
            const result = { repetition, ...JSON.parse(stdout) };
            await appendFile(join(output, 'micro.jsonl'), JSON.stringify(result) + '\n');
        }
        console.log(`micro: ${repetition + 1}/${repetitions}`);
    }
}
