import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeContext } from './transform.mjs';
import { variants } from '../../../../scripts/context-access/prepare.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixture = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const driver =
    process.env.JCO_CONTEXT_TRANSPILE ??
    join(root, 'scripts/context-access/transpile/target/debug/context-access-transpile');
const runtimeURL = new URL('./runtime.mjs', import.meta.url).href;
const names = ['pr2483', 'cache-checked', 'cache-epoch', 'native-isolated'];
await mkdir(output, { recursive: true });
await writeFile(join(output, 'package.json'), '{"type":"module"}');
await symlink(join(fixture, 'node_modules'), join(output, 'node_modules')).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
});

/** Build all eligible implementations from one identical set of bindgen output. */
async function build(input, benchmark, asyncImports = '', asyncExports = '') {
    const base = join(output, benchmark, 'base');
    execFileSync(driver, [input, base, asyncImports, asyncExports]);
    const source = await readFile(join(base, 'stack-loop.js'), 'utf8');
    const metadata = JSON.parse(await readFile(join(base, 'core-types.json'), 'utf8'));
    const generated = variants(source);
    generated['native-isolated'] = nativeContext(source, metadata, runtimeURL);
    for (const variant of names) {
        const path = join(output, benchmark, variant);
        await cp(base, path, { recursive: true });
        await writeFile(join(path, 'stack-loop.js'), generated[variant]);
    }
    return {
        sha256: createHash('sha256').update(source).digest('hex'),
        sourceBytes: source.length,
        nativeBytes: generated['native-isolated'].length,
    };
}

const metadata = {};
metadata.rust = await build(join(fixture, 'target/wasm32-wasip3/release/stack-loop.wasm'), 'rust');
const runner = await readFile(join(fixture, 'run.mjs'), 'utf8');
for (const variant of names) {
    await writeFile(
        join(output, `run-${variant}.mjs`),
        runner
            .replaceAll('./out/', `./rust/${variant}/`)
            .replace('});\nawait instance.run.run();', '}, undefined, { debug: false });\nawait instance.run.run();'),
    );
}
await cp(join(fixture, 'out2'), join(output, 'out2'), { recursive: true });
await cp(join(fixture, 'run2.mjs'), join(output, 'run-wasip2.mjs'));
for (const mode of ['sync', 'jspi']) {
    metadata[mode] = await build(
        join(root, 'packages/jco-transpile/test/fixtures/components/p3/context-boundary.wat'),
        mode,
        mode === 'jspi' ? 'pause' : '',
        mode === 'jspi' ? 'run' : '',
    );
}
await writeFile(
    join(output, 'boundary.mjs'),
    `
import { readFile } from 'node:fs/promises';
const [mode, variant, countString] = process.argv.slice(2);
const count = Number(countString);
const directory = new URL('./' + mode + '/' + variant + '/', import.meta.url);
const start = performance.now();
const { instantiate } = await import(new URL('stack-loop.js', directory));
const instance = await instantiate(async (name) => WebAssembly.compile(await readFile(new URL(name, directory))), {
    pause: { default: () => mode === 'jspi' ? Promise.resolve() : undefined },
}, undefined, { debug: false });
const startup = performance.now() - start;
for (let warmup = 0; warmup < 5; warmup++) await instance.run(100);
const before = performance.now();
const result = await instance.run(count);
const milliseconds = performance.now() - before;
if (result !== count) throw new Error('Incorrect boundary benchmark result');
console.log(JSON.stringify({ milliseconds, startup, result }));
`,
);
await writeFile(join(output, 'manifest.json'), JSON.stringify({ variants: names, fixture, metadata }, null, 2) + '\n');
console.log(JSON.stringify(metadata, null, 2));
