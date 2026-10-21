import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

function component(encoding: string) {
    return `(component
 (core module $libc
  (memory (export "memory") 1)
  (global $next (mut i32) (i32.const 1024))
  (func (export "realloc") (param i32 i32 i32 i32) (result i32)
   (local $ptr i32)
   (local.set $ptr (i32.and (i32.add (global.get $next) (i32.sub (local.get 2) (i32.const 1)))
    (i32.sub (i32.const 0) (local.get 2))))
   (global.set $next (i32.add (local.get $ptr) (local.get 3)))
   (local.get $ptr)))
 (core instance $libc (instantiate $libc))
 (alias core export $libc "memory" (core memory $mem))
 (alias core export $libc "realloc" (core func $realloc))
 (core func $new (canon error-context.new string-encoding=${encoding} (memory $mem)))
 (core func $debug (canon error-context.debug-message string-encoding=${encoding} (memory $mem) (realloc $realloc)))
 (core func $drop (canon error-context.drop))
 (core module $m
  (import "" "new" (func $new (param i32 i32) (result i32)))
  (import "" "debug" (func $debug (param i32 i32)))
  (import "" "drop" (func $drop (param i32)))
  (func (export "echo") (param i32 i32) (result i32)
   (local $handle i32)
   (local.set $handle (call $new (local.get 0) (local.get 1)))
   (call $debug (local.get $handle) (i32.const 8))
   (call $drop (local.get $handle))
   (i32.const 8)))
 (core instance $i (instantiate $m (with "" (instance
  (export "new" (func $new)) (export "debug" (func $debug)) (export "drop" (func $drop))))))
 (func (export "echo") (param "message" string) (result string)
  (canon lift (core func $i "echo") string-encoding=${encoding} (memory $mem) (realloc $realloc)))
)`;
}

// Future payload lowering directly requires the raw global-table constructor.
const GLOBAL_TABLE_COMPONENT = `(component
 (type $future (future error-context))
 (core func $new (canon future.new $future))
 (core module $caller
  (import "" "new" (func $new (result i64)))
  (func (export "new") (result i64) (call $new)))
 (core instance $caller (instantiate $caller (with "" (instance (export "new" (func $new))))))
 (func (export "new") (result u64) (canon lift (core func $caller "new")))
)`;

function providerSource(mutate = '') {
    return `import { runtime as defaults } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const stores = [];
export const runtime = {
 apiVersion: 1,
 create(options) {
  const instance = defaults.create(options);
  const original = instance.intrinsics.errorContext;
  const errorContext = { ...original, marker: 42 };
  for (const key of Object.keys(original)) {
   if (typeof original[key] !== 'function' || key === 'GlobalErrorContextTable') continue;
   errorContext[key] = function(...args) {
    if (this.marker !== 42) throw new Error('lost error-context namespace receiver');
    calls.push(key);
    return original[key](...args);
   };
  }
  ${mutate}
  stores.push(instance.intrinsics);
  return { ...instance, intrinsics: { ...instance.intrinsics, errorContext } };
 }
};`;
}

for (const encoding of ['utf8', 'utf16']) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `error-context provider (${encoding}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await writeFile(join(dir, 'provider.js'), providerSource());
                    const { files } = await transpileBytes(await parse(component(encoding)), {
                        name: 'error-context',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: './provider.js',
                    });
                    await writeFiles(files, { baseDir: dir });
                    if (!minify) {
                        const source = new TextDecoder().decode(files['error-context.js']);
                        assert.notInclude(source, 'class GlobalErrorContextTable');
                        assert.notInclude(source, 'let errCtxLocal = new Map()');
                        assert.notInclude(source, 'const ERR_CTX_TABLES = {}');
                        assert.notInclude(source, 'function errCtxNew(');
                        assert.include(source, 'errorContext.localTables must be a object');
                    }
                    const bindings = await import(pathToFileURL(join(dir, 'error-context.js')).href);
                    const instantiate = () =>
                        bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                    const instance = instantiation ? await instantiate() : bindings;
                    const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                    const store = provider.stores[0];
                    assert.isNull(store.errorContext.GlobalErrorContextTable.data);
                    for (const message of ['', 'café 中文 🦀', '\ufeffbom', '\ud800x\udc00']) {
                        assert.strictEqual(instance.echo(message), message.toWellFormed());
                        assert.strictEqual(store.errorContext.GlobalErrorContextTable.get().size(), 0);
                    }
                    assert.includeMembers(provider.calls, ['errCtxNew', 'errCtxDebugMessage', 'errCtxDrop']);
                    assert.isAbove(Object.keys(store.errorContext.tables).length, 0);
                    assert.isAbove(store.errorContext.localTables.size, 0);
                    for (const tables of store.errorContext.localTables.values()) {
                        for (const table of tables.values()) {
                            assert.strictEqual(table.size(), 0);
                        }
                    }
                    if (instantiation) {
                        const second = await instantiate();
                        assert.isNull(provider.stores[1].errorContext.GlobalErrorContextTable.data);
                        assert.strictEqual(second.echo('second'), 'second');
                        for (const key of ['GlobalErrorContextTable', 'tables', 'localTables']) {
                            assert.notStrictEqual(store.errorContext[key], provider.stores[1].errorContext[key]);
                        }
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}

test.concurrent.each([
    {
        mutation: 'errorContext.GlobalErrorContextTable = null;',
        error: 'errorContext.GlobalErrorContextTable must be a function',
    },
    { mutation: 'errorContext.localTables = null;', error: 'errorContext.localTables must be a object' },
    { mutation: 'errorContext.tables = undefined;', error: 'errorContext.tables must be a object' },
    { mutation: 'errorContext.errCtxNew = undefined;', error: 'errorContext.errCtxNew must be a function' },
])('rejects invalid error-context providers: $error', async ({ mutation, error }) => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(dir, 'provider.js'), providerSource(mutation));
        const fixture = mutation.includes('GlobalErrorContextTable') ? GLOBAL_TABLE_COMPONENT : component('utf8');
        const { files } = await transpileBytes(await parse(fixture), {
            name: 'error-context',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider.js',
        });
        if (mutation.includes('GlobalErrorContextTable')) {
            assert.include(new TextDecoder().decode(files['error-context.js']), error);
        }
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'error-context.js')).href);
        assert.throws(() => bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}), error);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
