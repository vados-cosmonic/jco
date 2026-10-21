// This process owns the timing loop; Vitest/bundler/JIT work runs elsewhere.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SourceTextModule } from 'node:vm';
import assert from 'node:assert/strict';
import { expectedResult, importsFor, workload } from './workloads.mjs';

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const emptySamples = () => ({ parse: [], evaluate: [], instantiate: [], call: [] });
const samples = { inline: emptySamples(), external: emptySamples() };
const prepared = {};
for (const mode of ['inline', 'external']) {
    const artifact = config[mode];
    const code = await readFile(artifact.bundle, 'utf8');
    const modules = new Map();
    for (const name of Object.keys(artifact.wasm.files)) {
        modules.set(name, new WebAssembly.Module(await readFile(join(artifact.dir, name))));
    }
    // Core compilation is deliberately outside both initialization and call timings.

    const binding = await import(pathToFileURL(artifact.bundle).href);
    const imports = artifact.parts.map(importsFor);
    const instantiate = () =>
        artifact.parts.map((id, i) =>
            binding[`create${i}`]((name) => {
                assert.ok(modules.has(name), `unexpected core module request ${name}`);
                return modules.get(name);
            }, imports[i]),
        );

    const instances = instantiate();

    const workloads = [];
    for (const [i, instance] of instances.entries()) {
        workloads.push(await workload(artifact.parts[i], instance));
    }
    assert.equal(workloads.length, artifact.parts.length);

    prepared[mode] = { code, instantiate, workloads, artifact };
}

const verified = [...config.inline.parts];
if (config.verifyOnly) {
    await writeFile(config.output, JSON.stringify({ verified }));
    process.exit(0);
}
let sink = 0;
async function runCalls(mode, calls) {
    const { workloads } = prepared[mode];
    // Keep sync calls synchronous; awaiting every scalar would hide adapter cost.
    const work = workloads[0];
    let checksum = 0;
    const start = performance.now();
    if (work.async) {
        for (let i = 0; i < calls; i++) {
            checksum += Number(await work.call(i));
        }
    } else {
        for (let i = 0; i < calls; i++) {
            checksum += Number(work.call(i));
        }
    }
    const elapsed = ((performance.now() - start) * 1e6) / calls;
    let expected = 0;
    for (let i = 0; i < calls; i++) {
        expected += expectedResult(prepared[mode].artifact.parts[0], i);
    }
    assert.equal(checksum, expected, 'timed workload checksum must match known results');
    sink += checksum;
    return elapsed;
}
const callable = Boolean(prepared.inline.workloads[0].call);
let calls = 0;
if (callable) {
    // Calibrate on both paths, with a cap for operations that yield to timers.
    calls = 16;
    for (;;) {
        const times = [await runCalls('inline', calls), await runCalls('external', calls)];
        if (Math.min(...times) * calls >= 15e6 || calls >= 16384) {
            break;
        }
        calls *= 2;
    }
}
for (let sample = 0; sample < 9; sample++) {
    // Paired, alternating order reduces thermal, GC and background-load bias.
    for (const mode of sample % 2 ? ['external', 'inline'] : ['inline', 'external']) {
        const state = prepared[mode];

        globalThis.gc();
        let start = performance.now();
        // Parsing fresh vm modules measures source compilation without disk I/O,
        // Wasm compilation, or native ESM's module cache. No module is evaluated.
        const parsed = new SourceTextModule(state.code);
        samples[mode].parse.push((performance.now() - start) * 1e6);
        assert.equal(parsed.status, 'unlinked');
        start = performance.now();
        await parsed.link((specifier) => {
            throw new Error('Unexpected static dependency: ' + specifier);
        });
        await parsed.evaluate();
        samples[mode].evaluate.push((performance.now() - start) * 1e6);
        start = performance.now();
        const fresh = state.instantiate();
        samples[mode].instantiate.push((performance.now() - start) * 1e6);
        // Validate every newly instantiated store, outside the measured interval.
        for (const [i, instance] of fresh.entries()) {
            await workload(state.artifact.parts[i], instance);
        }
        if (callable) {
            samples[mode].call.push(await runCalls(mode, calls));
        }
    }
}
const memory = {};
for (const mode of ['inline', 'external']) {
    globalThis.gc();
    const before = process.memoryUsage();
    const retained = Array.from({ length: 4 }, () => prepared[mode].instantiate());
    globalThis.gc();
    const after = process.memoryUsage();
    memory[mode] = Object.fromEntries(
        ['heapUsed', 'external', 'arrayBuffers'].map((key) => [key, (after[key] - before[key]) / retained.length]),
    );
    assert.equal(retained.length, 4);
}
assert.ok(Number.isFinite(sink));
const result = {
    verified,
    samples,
    callsPerSample: calls,
    sink,
    memory,
    medians: Object.fromEntries(
        ['inline', 'external'].map((mode) => [
            mode,
            Object.fromEntries(
                Object.entries(samples[mode])
                    .filter(([, values]) => values.length)
                    .map(([key, values]) => [key, median(values)]),
            ),
        ]),
    ),
    pairedRatios: Object.fromEntries(
        ['parse', 'evaluate', 'instantiate', ...(callable ? ['call'] : [])].map((key) => [
            key,
            median(samples.inline[key].map((value, index) => samples.external[key][index] / value)),
        ]),
    ),
};
await writeFile(config.output, JSON.stringify(result));
// A fixture can deliberately leave a stream read pending. The isolated process
// is also the cleanup boundary for guest stores and their scheduler timers.
process.exit(0);
