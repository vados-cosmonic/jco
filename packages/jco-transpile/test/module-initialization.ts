import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { nodeExec } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

const guest = new TextEncoder().encode(`(component
    (core module $m (func (export "run") (result i32) i32.const 42))
    (core instance $i (instantiate $m))
    (func (export "run") (result s32) (canon lift (core func $i "run"))))`);

test.each([undefined, '@bytecodealliance/jco-cm-runtime'])(
    'direct module initialization with provider %s',
    async (cmRuntimeEsModule) => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-module-init-'));
        try {
            // Use the public package spelling so external bindgen selects the
            // standard runtime even from this isolated output directory.
            const scope = join(dir, 'node_modules', '@bytecodealliance');
            await mkdir(scope, { recursive: true });
            await symlink(
                fileURLToPath(new URL('../../jco-cm-runtime', import.meta.url)),
                join(scope, 'jco-cm-runtime'),
                'junction',
            );
            const { files } = await transpileBytes(guest, { name: 'entry', cmRuntimeEsModule });
            await writeFiles(files, { baseDir: dir });
            // Use the native module loader in a fresh process so that replacing
            // instantiate cannot intercept any compilation by the test runner.
            const script = join(dir, 'check.mjs');
            await writeFile(
                script,
                `
                import assert from 'node:assert/strict';
                assert.equal((await import('./entry.js')).run(), 42);
                const failure = new Error('instantiation failed');
                WebAssembly.instantiate = async () => { throw failure; };
                await assert.rejects(import('./entry.js?error'), e => e === failure);
                if (typeof WebAssembly.SuspendError === 'function') {
                    WebAssembly.instantiate = async () => { throw new WebAssembly.SuspendError('suspended'); };
                    await assert.rejects(import('./entry.js?suspend'), {
                        name: 'RuntimeError', message: 'cannot block a synchronous task before returning',
                    });
                }
            `,
            );
            await nodeExec(script);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
