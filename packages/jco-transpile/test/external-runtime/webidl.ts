import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

const COMPONENT = `(component
  (import "webidl:js/global@0.0.1" (instance $host
    (export "is-finite" (func (param "value" f64) (result bool)))))
  (core func $check (canon lower (func $host "is-finite")))
  (core module $m
    (import "host" "check" (func $check (param f64) (result i32)))
    (func (export "check") (param f64) (result i32) local.get 0 call $check))
  (core instance $i (instantiate $m
    (with "host" (instance (export "check" (func $check))))))
  (func (export "check") (param "value" f64) (result bool) (canon lift (core func $i "check"))))`;

for (const external of [false, true]) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `WebIDL imports (external=${external}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await writeFile(
                        join(dir, 'provider.js'),
                        `
import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const state = { calls: 0 };
export const runtime = {
  apiVersion: 1,
  create(options) {
    const instance = defaults.create(options);
    const webidl = instance.intrinsics.webidl;
    return {
      ...instance,
      intrinsics: {
        ...instance.intrinsics,
        webidl: {
          marker: 42,
          globalThisIdlProxy() {
            if (this.marker !== 42) throw new Error('lost WebIDL receiver');
            state.calls++;
            return webidl.globalThisIdlProxy();
          }
        }
      }
    };
  }
};`,
                    );
                    const { files } = await transpileBytes(await parse(COMPONENT), {
                        name: 'webidl',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: external ? './provider.js' : undefined,
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = new TextDecoder().decode(files['webidl.js']);
                    if (external) {
                        assert.notInclude(source, 'function globalThisIdlProxy');
                        assert.notInclude(source, 'var idlProxy');
                    }
                    const bindings = await import(pathToFileURL(join(dir, 'webidl.js')).href);
                    if (instantiation) {
                        const instance = await bindings.instantiate(
                            (name: string) => new WebAssembly.Module(files[name]),
                            { 'webidl:js/global': { isFinite: () => false } },
                        );
                        assert.strictEqual(instance.check(42), false);
                    } else {
                        assert.strictEqual(bindings.check(42), true);
                        assert.strictEqual(bindings.check(Infinity), false);
                    }
                    if (external) {
                        const { state } = await import(pathToFileURL(join(dir, 'provider.js')).href);
                        assert.strictEqual(state.calls, instantiation ? 0 : 1);
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}
