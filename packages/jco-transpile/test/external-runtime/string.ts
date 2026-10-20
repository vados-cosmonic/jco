import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

function echo(encoding: 'utf8' | 'utf16') {
    return `(component
      (core module $m
        (memory (export "memory") 1)
        (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 1024)
        (func (export "echo") (param i32 i32) (result i32)
          (i32.store (i32.const 0) (local.get 0))
          (i32.store (i32.const 4) (local.get 1))
          i32.const 0)
        (func (export "char") (param i32) (result i32) local.get 0))
      (core instance $i (instantiate $m))
      (alias core export $i "memory" (core memory $mem))
      (alias core export $i "realloc" (core func $realloc))
      (func (export "echo") (param "s" string) (result string)
        (canon lift (core func $i "echo") string-encoding=${encoding}
          (memory $mem) (realloc (core func $realloc))))
      (func (export "char") (param "c" char) (result char)
        (canon lift (core func $i "char"))))`;
}

function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const runtime = {
  apiVersion: 1,
  create(options) {
    const instance = defaults.create(options);
    const original = instance.intrinsics.string;
    const string = { ...original, marker: 42 };
    for (const key of Object.keys(original)) {
      if (typeof original[key] === 'function') {
        string[key] = function (...args) {
          if (this.marker !== 42) throw new Error('lost string namespace receiver');
          calls.push(key);
          return original[key](...args);
        };
      } else {
        const codec = { marker: 42 };
        for (const method of key === 'utf8Encoder' ? ['encode', 'encodeInto'] : ['decode']) {
          codec[method] = function (...args) {
            if (this !== codec) throw new Error('lost codec object receiver');
            calls.push(key + '.' + method);
            return original[key][method](...args);
          };
        }
        string[key] = codec;
      }
    }
    ${mutate}
    return { ...instance, intrinsics: { ...instance.intrinsics, string } };
  }
};`;
}

for (const encoding of ['utf8', 'utf16'] as const) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `string provider (${encoding}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await writeFile(join(dir, 'provider.js'), providerSource());
                    const { files } = await transpileBytes(await parse(echo(encoding)), {
                        name: 'strings',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: './provider.js',
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = new TextDecoder().decode(files['strings.js']);
                    assert.notInclude(source, 'new TextDecoder(');
                    assert.notInclude(source, 'new TextEncoder(');
                    assert.notInclude(source, 'function _utf8AllocateAndEncode(');
                    assert.notInclude(source, 'function _utf16AllocateAndEncode(');
                    const bindings = await import(pathToFileURL(join(dir, 'strings.js')).href);
                    const instance = instantiation
                        ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                        : bindings;
                    const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                    for (const s of ['', 'café 中文 🚀', '\ufeffbom', '\ud800x\udc00']) {
                        assert.strictEqual(instance.echo(s), s.toWellFormed());
                    }
                    assert.strictEqual(instance.char('🚀'), '🚀');
                    assert.include(provider.calls, `${encoding}Encode`);
                    assert.include(provider.calls, `${encoding}Decoder.decode`);
                    assert.include(provider.calls, 'validateHostChar');
                    assert.include(provider.calls, 'validateGuestChar');
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}

test.concurrent('transcoding calls custom UTF-8 encoder objects', async () => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource());
        const component = await readFile(
            new URL('../fixtures/components/runtime/string-transcoding.component.wat', import.meta.url),
            'utf8',
        );
        const { files } = await transpileBytes(await parse(component), {
            name: 'transcoding',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'transcoding.js')).href);
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
        const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
        assert.strictEqual(instance.utf16ViaUtf8.echo('café 🚀'), 'café 🚀');
        assert.include(provider.calls, 'utf8Encoder.encodeInto');
        assert.include(provider.calls, 'utf16Decoder.decode');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([
    { mutate: 'string.utf8Decoder = undefined;', method: 'utf8Decoder.decode', encoding: 'utf8' as const },
    { mutate: 'string.utf8Decoder.decode = 0;', method: 'utf8Decoder.decode', encoding: 'utf8' as const },
    { mutate: 'string.utf16Decoder = null;', method: 'utf16Decoder.decode', encoding: 'utf16' as const },
    { mutate: 'string.utf16Decoder.decode = 0;', method: 'utf16Decoder.decode', encoding: 'utf16' as const },
    { mutate: 'string.utf8Encode = 0;', method: 'utf8Encode', encoding: 'utf8' as const },
])('rejects invalid string providers: $mutate', async ({ mutate, method, encoding }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutate));
        const { files } = await transpileBytes(await parse(echo(encoding)), {
            name: 'invalid',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'invalid.js')).href);
        assert.throws(
            () => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}),
            TypeError,
            `runtime intrinsic string.${method} must be a function`,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
