import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { transpileBytes, writeFiles } from './transpilation.js';

const leaf = new TextEncoder().encode(`(component
    (import "host" (func $host (param "n" u32) (result u32)))
    (core func $lower (canon lower (func $host)))
    (core module $module
        (import "" "host" (func $host (param i32) (result i32)))
        (global $initial (mut i32) (i32.const 0))
        (func $start (global.set $initial (call $host (i32.const 7))))
        (start $start)
        (func (export "run") (param i32) (result i32)
            (i32.add (global.get $initial) (call $host (local.get 0)))))
    (core instance $i (instantiate $module (with "" (instance (export "host" (func $lower))))))
    (func (export "run") (param "n" u32) (result u32) (canon lift (core func $i "run"))))`);

test('sync imports preserve initialization results, host errors and instance stopping', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-sync-host-'));
    try {
        const { files } = await transpileBytes(leaf, { name: 'leaf', instantiation: 'async' });
        await writeFiles(files, { baseDir: dir });
        const { instantiate } = await import(pathToFileURL(join(dir, 'leaf.js')).href);
        const error = new Error('host failed');
        const instance = await instantiate(undefined, {
            host: {
                default(n: number) {
                    if (n === 0) throw error;
                    return n + 1;
                },
            },
        });
        expect(instance.run(3)).toBe(12);
        expect(() => instance.run(0)).toThrow(error);
        await instance._util.whenIdle();

        let stop: (() => void) | undefined;
        const other = await instantiate(undefined, {
            host: {
                default(n: number) {
                    stop?.();
                    return n;
                },
            },
        });
        stop = () => other._util.stop();
        expect(() => other.run(1)).toThrow(/stopped/);
        expect(() => other.run(1)).toThrow(/stopped/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('module-mode imports can read instance flags during and after initialization', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-sync-module-'));
    try {
        await writeFile(join(dir, 'host.mjs'), 'export default n => n + 1;');
        const { files } = await transpileBytes(leaf, { name: 'leaf', map: { host: './host.mjs' } });
        await writeFiles(files, { baseDir: dir });
        const instance = await import(pathToFileURL(join(dir, 'leaf.js')).href);
        expect(instance.run(3)).toBe(12);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
