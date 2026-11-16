import { cli, clocks, filesystem, random } from '@bytecodealliance/preview3-shim';
import { readFile } from 'node:fs/promises';
import { instantiate } from './out/stack-loop.js';

const n = process.argv[2] ?? '100000';
/** Compile a named core module before the guest starts its timed loop. */
const getCoreModule = async (name) => WebAssembly.compile(await readFile(new URL(`./out/${name}`, import.meta.url)));
const instance = await instantiate(getCoreModule, {
    'wasi:cli/environment': { ...cli.environment, getArguments: () => ['stack-loop', n] },
    'wasi:cli/exit': cli.exit,
    'wasi:cli/stderr': cli.stderr,
    'wasi:cli/stdin': cli.stdin,
    'wasi:cli/stdout': cli.stdout,
    'wasi:cli/terminal-input': cli.terminalInput,
    'wasi:cli/terminal-output': cli.terminalOutput,
    'wasi:cli/terminal-stderr': cli.terminalStderr,
    'wasi:cli/terminal-stdin': cli.terminalStdin,
    'wasi:cli/terminal-stdout': cli.terminalStdout,
    'wasi:cli/types': {},
    'wasi:clocks/monotonic-clock': clocks.monotonicClock,
    'wasi:clocks/system-clock': clocks.systemClock,
    'wasi:clocks/types': {},
    'wasi:filesystem/preopens': filesystem.preopens,
    'wasi:filesystem/types': filesystem.types,
    'wasi:random/insecure-seed': random.insecureSeed,
    'wasi:random/random': random.random,
});
await instance.run.run();
