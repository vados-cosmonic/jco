import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Artifact } from '../build.js';

export async function startup(pair: { inline: Artifact; external: Artifact }) {
    const output = join(pair.inline.dir, 'startup-counts.json');
    const config = join(pair.inline.dir, 'startup-config.json');
    await writeFile(config, JSON.stringify({ inline: pair.inline, external: pair.external, output }));
    await promisify(execFile)(
        process.execPath,
        [
            ...process.execArgv.filter((arg) => arg === '--experimental-wasm-jspi'),
            fileURLToPath(new URL('./startup.mjs', import.meta.url)),
            config,
        ],
        { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(await readFile(output, 'utf8'));
}
