# Perry-WIT backend

`jco componentize --backend perry-wit` compiles TypeScript ahead of time against your WIT world
with [Perry-WIT](https://github.com/ahirner/perry-wit).
Perry-WIT lowers a static subset of TypeScript directly to WebAssembly instead of embedding a
JavaScript engine, so a component that exports a string function is a few kilobytes.

This backend is experimental.
It differs from the [Perry backend](./perry.md), which runs a separately installed Perry CLI and
produces WASI P2 commands without custom WIT bindings.

## Install the compiler

Perry-WIT is **not a dependency of Jco**.
Install the `perry-wit` npm package, which bundles the compiler, in the project that holds your
source:

```sh
npm install --save-dev perry-wit
jco componentize src/main.ts --backend perry-wit --wit wit --world-name greeter -o component.wasm
```

Jco resolves `perry-wit` starting at the entry module's directory, or at `--cwd <path>` when given.
`--backend-perry-wit-package <name>` selects an npm alias or another package that exports the
same `compile` function.

## What Jco passes to the compiler

The compiler reads no files, so Jco reads them for it:

- **Modules.** The entry module and every module it reaches through relative imports.
  An import of `./math.js` resolves to `./math.ts` when that file exists.
  Jco does not bundle the sources, erase their types or add its Node.js adapters.
- **WIT.** `--wit` names one WIT file, or a directory that holds one package with its
  dependencies under `deps/`.
  A dependency is a directory of `.wit` files, a single `.wit` file or a binary `.wasm` package.
- **World.** `--world-name` selects a world when the package declares more than one.

## What the compiler accepts

Perry-WIT rejects programs outside its TypeScript subset and reports each problem as a diagnostic
with a code, such as `missing-type-annotation` or `unsupported-expression`.
Components written for the JavaScript engine backends usually need changes:

- Untyped JavaScript needs type annotations.
- An export must be a named function declaration; `export const name = { ... }` objects are not
  accepted for exported interfaces.
- Node.js built-in modules are mostly unavailable.

Bundling options, Node.js adapter options and options specific to StarlingMonkey or QuickJS are
rejected, as is `--script-only`.

`scripts/perry-wit-parity.mjs` in the Jco repository compiles every example component and
componentize test fixture with this backend and reports which ones the compiler accepts.
