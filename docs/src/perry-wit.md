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

The entry module of a component written for the JavaScript engine backends can keep its shape,
with a Perry-WIT build that supports these conventions:

- **Exported interfaces.** `export const name = { ... }` implements the exported interface `name`
  with an object of functions, as do `export { object as name }` and exported functions.
- **Types from the world.** Parameters and results of exports that have no annotation take their
  types from the WIT signature, so a JavaScript entry module needs none for its exports.
- **Imported resources.** A resource imported by name is a class: `new Resource(...)`, its methods
  and its static functions.
  An `option` argument may be `undefined`.
- **Exported resources.** A class in the export object implements an exported resource.
  `#private` fields and `[Symbol.dispose]` are supported.
- **Fetch listeners.** `addEventListener('fetch', (event) => event.respondWith(...))` implements
  `wasi:http/incoming-handler@0.2.x`.
- **Sleeping.** `await new Promise((resolve) => setTimeout(resolve, ms))` is supported.

Other code needs changes more often:

- Values the compiler cannot infer a type for need annotations, also in JavaScript.
- Only the entry module follows these conventions.
  Modules it imports use the explicit Perry-WIT bindings.
- State on `globalThis`, closures passed to the `Promise` constructor, callback timers and
  Web APIs such as `ReadableStream` are unavailable.
- An empty `option` the component receives is `null`, not `undefined`.
- The world must import what the source uses: `console` needs `wasi:cli/stderr` and timers need
  the WASI clocks.
- npm packages are not bundled, so only local modules can be imported.
- Node.js built-in modules are mostly unavailable.

The [Perry-WIT authoring guide](https://github.com/ahirner/perry-wit/blob/main/docs/src/authoring.md)
describes the subset.

Bundling options, Node.js adapter options and options specific to StarlingMonkey or QuickJS are
rejected, as is `--script-only`.

`scripts/perry-wit-parity.mjs` in the Jco repository compiles every example component and
componentize test fixture with this backend and reports which ones the compiler accepts.
It skips components that need a bundler or the API of one JavaScript engine; `--all` includes them.
