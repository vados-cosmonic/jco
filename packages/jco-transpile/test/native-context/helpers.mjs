import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nativeContext } from '../../bench/native-context/transform.mjs';
import { variants } from '../../../../scripts/context-access/prepare.mjs';

export const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const fixtures = join(root, 'packages/jco-transpile/test/fixtures/components/p3');
export const driver =
    process.env.JCO_CONTEXT_TRANSPILE ??
    join(root, 'scripts/context-access/transpile/target/debug/context-access-transpile');
const runtimeURL = new URL('../../bench/native-context/runtime.mjs', import.meta.url).href;

/** Compile a small core WAT fixture with the same pinned parser as bindgen. */
export async function core(test, wat) {
    const output = await mkdtemp(join(tmpdir(), 'jco-native-core-'));
    test.after(() => rm(output, { recursive: true, force: true }));
    await writeFile(join(output, 'core.wat'), wat);
    execFileSync(driver, ['--parse', join(output, 'core.wat'), join(output, 'core.wasm')]);
    return WebAssembly.compile(await readFile(join(output, 'core.wasm')));
}

/** Transpile real component fixtures with the branch's native bindgen, then instrument them. */
export async function component(
    test,
    fixture,
    { variant = 'native', imports = {}, asyncImports = [], asyncExports = [], minify = false, mutate } = {},
) {
    const output = await mkdtemp(join(tmpdir(), 'jco-native-context-'));
    test.after(() => rm(output, { recursive: true, force: true }));
    execFileSync(driver, [resolve(fixtures, fixture), output, asyncImports.join(','), asyncExports.join(',')], {
        stdio: 'pipe',
    });
    const path = join(output, 'stack-loop.js');
    let source = await readFile(path, 'utf8');
    const metadata = JSON.parse(await readFile(join(output, 'core-types.json'), 'utf8'));
    if (variant === 'native') source = nativeContext(source, metadata, runtimeURL);
    else if (variant === 'checked') source = variants(source)['cache-checked'];
    else if (variant !== 'baseline') throw new Error(`Unknown test variant: ${variant}`);
    if (mutate) source = mutate(source);
    if (minify) {
        const { minify: minifyJS } = await import('oxc-minify');
        source = (await minifyJS('component.js', source)).code;
    }
    await writeFile(path, source);
    await writeFile(join(output, 'package.json'), '{"type":"module"}');
    const module = await import(pathToFileURL(path));
    return module.instantiate(
        async (name) => WebAssembly.compile(await readFile(join(output, name))),
        imports,
        undefined,
        { debug: false },
    );
}
