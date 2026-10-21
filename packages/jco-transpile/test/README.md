# Transpilation tests

Build the local transpiler and fixtures with the usual workspace build before
running these suites.

Run the tests with the default inline runtime:

```sh
pnpm --filter @bytecodealliance/jco-transpile test
```

All test commands accept Vitest filters and options.

## Testing the external runtime

Build the local Component Model runtime and run the same tests against it:

```sh
pnpm --filter @bytecodealliance/jco-cm-runtime build
pnpm --filter @bytecodealliance/jco-transpile test:external-runtime
```

The `test:lts:external-runtime` and `test:extended:external-runtime` commands run
the corresponding LTS and extended suites. CI runs the transpilation test matrix
with both runtime modes.

`JCO_TEST_RUNTIME=external` selects the local built runtime through
`test/transpilation.ts`. Use that module's `transpile` and `transpileBytes`
exports in tests; `setupAsyncTest` uses them too. The normal mode is `inline`.
Explicit `cmRuntimeEsModule` options override the suite selection, including
`undefined` for assertions specifically about inline code generation.

Node tests use an absolute file URL so generated modules in temporary
directories can resolve the provider. Browser tests serve a copy of the runtime
beside their generated components. Runtime fixture output directories are
separate for the two modes.

## Comparing bundled runtimes

The dedicated `bench/external-runtime` suite compares inline and external runtime output
in the same run, using Rolldown and Rollup. It includes the complete runtime in
bundle sizes, checks core Wasm payloads, validates bundled behavior, and measures
parse, evaluation, initialization and call costs in isolated processes.

```sh
pnpm --filter @bytecodealliance/jco-cm-runtime build
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime
```

Run this command on an otherwise idle machine. It runs serially and is excluded
from the ordinary functional suites. CI runs it once on Linux with Node 24 and
uploads the measurements and bundled JavaScript. See
[bench/external-runtime/README.md](../bench/external-runtime/README.md) for coverage, budgets,
limitations, baseline updates and the stricter parity gate. A passing regression
gate does **not** imply that external and inline output have reached parity.
