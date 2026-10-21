import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { optimize } from '../build.js';
import { bundlers } from '../cases.js';

const helpers = `
export function used(x) { return x + 1; }
export function unused() { throw new Error('UNUSED_INTRINSIC'); }
export function make() { return { used, unused }; }
`;
const shapes = {
    'named-import': `import { used } from './helpers.mjs';
        export function create() { return { use: used }; }`,
    'factory-property': `import { make } from './helpers.mjs';
        export function create() { const ns = make(); return { use: ns.used }; }`,
    'factory-bound': `import { make } from './helpers.mjs';
        export function create() { const ns = make(); return { use: ns.used.bind(ns) }; }`,
};

for (const bundler of bundlers) {
    test(`${bundler}: isolate factory property elimination`, async () => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-factory-shapes-'));
        try {
            const reports = [];
            await writeFile(join(dir, 'helpers.mjs'), helpers);
            for (const [shape, source] of Object.entries(shapes)) {
                const entry = join(dir, `${shape}.mjs`);
                await writeFile(entry, source);
                const { code } = await optimize(entry, bundler);
                const bundle = join(dir, `${shape}-bundled.mjs`);
                await writeFile(bundle, code);
                const { create } = await import(pathToFileURL(bundle).href);
                assert.equal(create().use(17), 18);
                assert.equal(create().use(99), 100);
                // Record retention rather than requiring the optimizer to remain
                // ineffective. Improved future optimizers should pass this probe.
                reports.push({
                    shape,
                    bytes: Buffer.byteLength(code),
                    retainsUnused: code.includes('UNUSED_INTRINSIC'),
                    code,
                });
            }
            const output = resolve(
                process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT ?? 'bench/output/external-runtime-investigation',
            );
            await mkdir(output, { recursive: true });
            await writeFile(join(output, `shapes-${bundler}.json`), JSON.stringify(reports, null, 2) + '\n');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}
