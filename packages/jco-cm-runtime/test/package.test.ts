import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

const execAsync = promisify(execFile);
async function exec(command: string, args: string[], options: { cwd: string }) {
    try {
        return await execAsync(command, args, options);
    } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string };
        throw new Error(failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''), { cause: error });
    }
}
// pnpm exposes its executable/CLI path to scripts, avoiding Windows .cmd shell quoting.
const pnpm = process.env.npm_execpath?.includes('pnpm') ? process.env.npm_execpath : 'pnpm';
const runPnpm = (args: string[], cwd: string) =>
    /\.[cm]?js$/.test(pnpm) ? exec(process.execPath, [pnpm, ...args], { cwd }) : exec(pnpm, args, { cwd });
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc');

// One pack/build followed by consumers, so no build replaces artifacts under a running consumer.
test('packed exports, standalone declarations, and independent provider conformance', async () => {
    const consumer = await mkdtemp(join(tmpdir(), 'jco-runtime-consumer-'));
    try {
        await runPnpm(['--config.verify-deps-before-run=false', 'pack', '--pack-destination', consumer], packageRoot);
        const tarball = (await readdir(consumer)).find((name) => name.endsWith('.tgz'))!;
        await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
        await runPnpm(
            [
                '--ignore-workspace',
                'install',
                '--offline',
                '--ignore-scripts',
                '--lockfile=false',
                join(consumer, tarball),
            ],
            consumer,
        );
        await cp(
            new URL('../../../scripts/test-jco-cm-runtime-release.mjs', import.meta.url),
            join(consumer, 'smoke.mjs'),
        );
        await exec(process.execPath, ['smoke.mjs'], { cwd: consumer });

        const installed = join(consumer, 'node_modules/@bytecodealliance/jco-cm-runtime');
        const contract = await readFile(join(installed, 'dist/runtime.d.ts'), 'utf8');
        expect(contract).not.toMatch(/\b(?:import|from)\s*['"({]/);
        const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
        expect(Object.keys(manifest.exports).sort()).toEqual([
            '.',
            './intrinsics/conversion',
            './intrinsics/js-helper',
            './intrinsics/resource',
            './intrinsics/string',
            './intrinsics/webidl',
            './runtime',
        ]);
        expect(manifest.sideEffects).toBe(false);
        const rust = await readFile(
            new URL('../../../crates/js-component-bindgen/src/intrinsics/runtime.rs', import.meta.url),
            'utf8',
        );
        expect(rust).toContain('CM_RUNTIME_API_VERSION: u32 = 2;');

        // Copy the literal declaration into an independent provider; it must need no private files.
        await writeFile(join(consumer, 'contract.d.ts'), contract);
        await writeFile(
            join(consumer, 'provider.ts'),
            `
            import type { ResourceModule, ConversionModule, StringModule, WebIdlModule } from './contract.js';
            export const initializeWebIdlProxyCache: WebIdlModule['initializeWebIdlProxyCache'] = () => ({ proxy: undefined });
            export const validateHostChar: StringModule['validateHostChar'] = value => {
                if (typeof value !== 'string') throw new TypeError('must be a string');
                return value.codePointAt(0);
            };
            export const toUint32: ConversionModule['toUint32'] = (context, value) => {
                if (context.strict && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff)) throw new TypeError('invalid u32');
                return (value as number) >>> 0;
            };
            export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
                const scope = table[2 * handle];
                const value = table[2 * handle + 1];
                const rep = value & ~(1 << 30);
                if (value === undefined || !rep || (scope & (1 << 30))) throw new context.RuntimeError('invalid handle');
                return { rep, scope, own: !!(value & (1 << 30)) };
            };
        `,
        );
        await writeFile(
            join(consumer, 'consumer.ts'),
            `
            import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
            import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
            import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
            import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
            import * as jsHelper from '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper';
            import * as string from '@bytecodealliance/jco-cm-runtime/intrinsics/string';
            import * as webidl from '@bytecodealliance/jco-cm-runtime/intrinsics/webidl';
            import * as custom from './provider.js';
            import type { ResourceModule, ConversionModule, RuntimeModuleContracts } from '@bytecodealliance/jco-cm-runtime/runtime';
            const defaultModule: ResourceModule = resource;
            const defaultConversions: RuntimeModuleContracts['intrinsics/conversion'] = conversion;
            const helpers: RuntimeModuleContracts['intrinsics/js-helper'] = jsHelper;
            const webIdlModule: RuntimeModuleContracts['intrinsics/webidl'] = webidl;
            const webIdlCache = custom.initializeWebIdlProxyCache();
            const globalProxy = webIdlModule.globalThisIdlProxy(webIdlCache);
            if (globalProxy !== webIdlModule.globalThisIdlProxy(webIdlCache) || Reflect.get(globalProxy, 'URL') !== URL) throw new Error('WebIDL consumer failed');
            const strings: RuntimeModuleContracts['intrinsics/string'] = string;
            const encoder = strings.initializeUtf8Encoder();
            const stringMemory = { buffer: new ArrayBuffer(8) };
            const allocation = strings.utf8Encode(encoder, 'é', () => 0, stringMemory);
            if (allocation.len !== 2 || strings.initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)) !== 'é' || custom.validateHostChar('🚀') !== 0x1f680) throw new Error('string consumer failed');
            const cache = helpers.initializeDataViewCache();
            const memory = { buffer: new ArrayBuffer(8) };
            const view = helpers.dataView(cache, memory);
            view.setUint32(0, 42, true);
            if (helpers.dataView(cache, memory) !== view || view.getUint32(0, true) !== 42 || helpers.emptyFunc(1) !== undefined) throw new Error('cache consumer failed');
            const customUint32: ConversionModule['toUint32'] = custom.toUint32;
            if (customUint32({ strict: false }, -1) !== 0xffffffff || defaultConversions.toUint32({ strict: true }, 42) !== 42) throw new Error('numeric consumer failed');
            const scratch32 = defaultConversions.initializeBitcast32();
            const scratch64 = defaultConversions.initializeBitcast64();
            if (defaultConversions.i32ToF32(scratch32, 0x3f800000) !== 1 || defaultConversions.f64ToI64(scratch64, 1) !== 0x3ff0000000000000n) throw new Error('bitcast consumer failed');
            const customModule: RuntimeModuleContracts['intrinsics/resource'] = custom;
            const version: 2 = rootVersion;
            const entry = defaultModule.tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1 << 30, 0, 7, 42], 1);
            if (version !== CM_RUNTIME_API_VERSION || entry.rep !== 42 || customModule.tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 24], 1).rep !== 24) throw new Error('consumer failed');
        `,
        );
        const negatives = (await readFile(new URL('./contracts.ts', import.meta.url), 'utf8'))
            .replaceAll('../src/intrinsics/resource.js', '@bytecodealliance/jco-cm-runtime/intrinsics/resource')
            .replaceAll('../src/intrinsics/conversion.js', '@bytecodealliance/jco-cm-runtime/intrinsics/conversion')
            .replaceAll('../src/intrinsics/js-helper.js', '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper')
            .replaceAll('../src/intrinsics/string.js', '@bytecodealliance/jco-cm-runtime/intrinsics/string')
            .replaceAll('../src/intrinsics/webidl.js', '@bytecodealliance/jco-cm-runtime/intrinsics/webidl')
            .replaceAll('../src/runtime.js', '@bytecodealliance/jco-cm-runtime/runtime');
        await writeFile(join(consumer, 'negatives.ts'), negatives);
        await writeFile(
            join(consumer, 'types-only.ts'),
            `
            import type { ResourceModule, ResourceTableGetContext, RuntimeModuleContracts } from '@bytecodealliance/jco-cm-runtime/runtime';
            export type { ResourceModule, ResourceTableGetContext, RuntimeModuleContracts };
        `,
        );
        for (const mode of ['NodeNext', 'Bundler']) {
            await writeFile(
                join(consumer, 'tsconfig.json'),
                JSON.stringify({
                    compilerOptions: {
                        strict: true,
                        skipLibCheck: false,
                        target: 'ES2022',
                        lib: ['ES2022', 'DOM'],
                        types: [],
                        module: mode === 'NodeNext' ? 'NodeNext' : 'ESNext',
                        moduleResolution: mode,
                        verbatimModuleSyntax: true,
                        outDir: `out-${mode}`,
                    },
                    include: ['*.ts'],
                }),
            );
            await exec(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: consumer });
            expect((await readFile(join(consumer, `out-${mode}/types-only.js`), 'utf8')).trim()).toBe('export {};');
            await exec(process.execPath, [`out-${mode}/consumer.js`], { cwd: consumer });
        }
        // Importing the resource subpath/metadata needs no platform globals or other families.
        await writeFile(
            join(consumer, 'minimal.mjs'),
            `
            for (const key of ['WebAssembly', 'TextEncoder', 'TextDecoder', 'DataView', 'Proxy', 'Symbol', 'Int32Array', 'Float32Array', 'BigInt64Array', 'Float64Array']) {
                Object.defineProperty(globalThis, key, { get() { throw new Error('unexpected capability: ' + key); } });
            }
            await import('@bytecodealliance/jco-cm-runtime/runtime');
            const { tableGet } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/resource');
            const { toUint32, toString } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/conversion');
            const { emptyFunc } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/js-helper');
            const { validateGuestChar, utf16ValidatingCopy } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/string');
            const { initializeWebIdlProxyCache } = await import('@bytecodealliance/jco-cm-runtime/intrinsics/webidl');
            if (initializeWebIdlProxyCache().proxy !== undefined) throw new Error('eager WebIDL proxy');
            if (validateGuestChar(0x1f680) !== '🚀' || !utf16ValidatingCopy(new Uint16Array([97]), new Uint16Array(1))) throw new Error('string capability leak');
            if (emptyFunc(42) !== undefined) throw new Error('empty function capability leak');
            if (toUint32({ strict: false }, '42') !== 42 || toString(42) !== '42') throw new Error('scalar capability leak');
            const entry = tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 42], 1);
            if (entry.rep !== 42) throw new Error('bad entry');
        `,
        );
        await exec(process.execPath, ['minimal.mjs'], { cwd: consumer });
    } finally {
        await rm(consumer, { recursive: true, force: true });
    }
}, 60_000);
