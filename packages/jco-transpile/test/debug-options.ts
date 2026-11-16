import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, vi } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

const fixture = new URL('./fixtures/components/p3/context-sync/component.wat', import.meta.url);

for (const instantiation of ['sync', 'async'] as const) {
    test(`debug configuration belongs to each ${instantiation} instance`, async () => {
        const component = await parse(await readFile(fixture, 'utf8'));
        const { files } = await transpileBytes(component, {
            name: 'component',
            instantiation,
            cmRuntimeEsModule: undefined,
        });
        const directory = await getTmpDir();
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
        try {
            await writeFiles(files, { baseDir: directory });
            await writeFile(join(directory, 'package.json'), '{"type":"module"}');
            vi.stubEnv('JCO_DEBUG', '');
            const { instantiate } = await import(pathToFileURL(join(directory, 'component.js')).href);
            const modules = new Map(
                Object.entries(files)
                    .filter(([name]) => name.endsWith('.wasm'))
                    .map(([name, bytes]) => [name, new WebAssembly.Module(bytes)]),
            );
            const load = (name: string) => modules.get(name);
            vi.stubEnv('JCO_DEBUG', '1');
            const quietOptions = { debug: false };
            const quiet = await instantiate(load, {}, undefined, quietOptions);
            const verbose = await instantiate(load, {}, undefined, { debug: true });
            vi.stubEnv('JCO_DEBUG', '1');
            const fromEnvironment = await instantiate(load, {});
            vi.stubEnv('JCO_DEBUG', '');
            const defaultQuiet = await instantiate(load, {});
            quietOptions.debug = true;

            // Options and the environment are snapshots, and alternating calls
            // must not change another instance's logging configuration.
            for (const instance of [quiet, defaultQuiet, verbose, quiet, fromEnvironment, defaultQuiet]) {
                debug.mockClear();
                expect(instance.pushContext(42)).toBe(42);
                expect(instance.pullContext()).toBe(0);
                if (instance === verbose || instance === fromEnvironment) {
                    expect(debug).toHaveBeenCalledWith('[contextGet()] args', expect.any(Object));
                } else {
                    expect(debug).not.toHaveBeenCalled();
                }
            }
            if (instantiation === 'async') {
                const options = { debug: false };
                const pending = instantiate(async (name: string) => load(name), {}, undefined, options);
                options.debug = true;
                vi.stubEnv('JCO_DEBUG', '1');
                const instance = await pending;
                debug.mockClear();
                expect(instance.pushContext(9)).toBe(9);
                expect(debug).not.toHaveBeenCalled();
            }
        } finally {
            vi.unstubAllEnvs();
            debug.mockRestore();
            await rm(directory, { recursive: true, force: true });
        }
    });
}
