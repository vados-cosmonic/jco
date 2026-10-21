import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Artifact } from './build.js';
import type { Values } from './report.js';

const exec = promisify(execFile);
export interface Measurement {
    medians: Values;
    verified: string[];
    [key: string]: unknown;
}
type MeasureArtifact = Pick<Artifact, 'dir' | 'bundle' | 'parts' | 'wasm'>;
export async function measure(
    pair: { inline: MeasureArtifact; external: MeasureArtifact },
    verifyOnly = false,
): Promise<Measurement> {
    const config = join(pair.inline.dir, 'benchmark.json');
    const output = join(pair.inline.dir, 'measurements.json');
    await writeFile(config, JSON.stringify({ inline: pair.inline, external: pair.external, output, verifyOnly }));
    await exec(
        process.execPath,
        [
            '--expose-gc',
            '--experimental-vm-modules',
            ...process.execArgv.filter((arg) => arg === '--experimental-wasm-jspi'),
            fileURLToPath(new URL('./runner.mjs', import.meta.url)),
            config,
        ],
        { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    // A file avoids pipe flushing/console interception affecting measurement delivery.
    return JSON.parse(await readFile(output, 'utf8'));
}
