// Allocation diagnostics run in their own process, outside all timing samples.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importsFor, workload } from '../workloads.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const report = {};
for (const mode of ['inline', 'external']) {
    const artifact = config[mode];
    const modules = new Map();
    for (const name of Object.keys(artifact.wasm.files)) {
        modules.set(name, new WebAssembly.Module(await readFile(join(artifact.dir, name))));
    }
    const binding = await import(pathToFileURL(artifact.bundle).href);
    const imports = importsFor(artifact.parts[0]);
    const counts = {};
    const factories = {};
    const restores = [];
    function wrapConstructor(owner, name, label = name) {
        const original = owner[name];
        if (typeof original !== 'function') {
            return;
        }
        owner[name] = new Proxy(original, {
            construct(target, args, newTarget) {
                counts[label] = (counts[label] ?? 0) + 1;
                return Reflect.construct(target, args, newTarget);
            },
        });
        restores.push(() => {
            owner[name] = original;
        });
    }
    let instance;
    try {
        globalThis.__jcoFactoryCounts = (name) => {
            factories[name] = (factories[name] ?? 0) + 1;
        };
        for (const name of [
            'Map',
            'Set',
            'WeakMap',
            'WeakSet',
            'TextEncoder',
            'TextDecoder',
            'Int32Array',
            'Float32Array',
            'BigInt64Array',
            'Float64Array',
            'Uint8Array',
            'Uint16Array',
            'DataView',
        ]) {
            wrapConstructor(globalThis, name);
        }
        wrapConstructor(WebAssembly, 'Global', 'WebAssembly.Global');
        const bind = Function.prototype.bind;
        Function.prototype.bind = function (...args) {
            counts.bind = (counts.bind ?? 0) + 1;
            return Reflect.apply(bind, this, args);
        };
        restores.push(() => {
            Function.prototype.bind = bind;
        });
        instance = binding.create0((name) => {
            assert.ok(modules.has(name));
            return modules.get(name);
        }, imports);
    } finally {
        for (const restore of restores.toReversed()) {
            restore();
        }
        delete globalThis.__jcoFactoryCounts;
    }
    await workload(artifact.parts[0], instance);
    report[mode] = { constructors: counts, factories };
}
await writeFile(config.output, JSON.stringify(report));
process.exit(0);
