import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const output = resolve(
    process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT ?? 'bench/output/external-runtime-investigation',
);
process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT = output;
await mkdir(output, { recursive: true });
// Prevent filtered/failed runs from publishing an old complete summary.
for (const name of ['adder', 'flavorful', 'async', 'shapes-rolldown', 'shapes-rollup', 'summary']) {
    await rm(join(output, name + '.json'), { force: true });
}
await rm(join(output, 'summary.md'), { force: true });
const child = spawn(
    process.execPath,
    [
        fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
        'run',
        '-c',
        'bench/external-runtime/investigation/vitest.config.ts',
        ...args,
    ],
    { stdio: 'inherit', env: process.env },
);
const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
});
process.exitCode = Number(code);
if (code === 0 && args.length === 0) {
    await import('../bench/external-runtime/investigation/summarize.mjs');
}
