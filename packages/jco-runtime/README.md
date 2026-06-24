# `@bytecodealliance/jco-runtime`

This [`@bytecodealliance/jco`][jco] sub-project contains shared functionality and 
[Component Model][cm-book] implementation that enables a JS environment with a 
host binding (e.g. `jco transpile`) to execute WebAssembly components.

[WebAssembly Components][cm-book] are a WebAssembly binaries that use the Component Model,
and the support for operations in the [canonical ABI][cabi] is what makes running components
possible.

In general to use this library, include it as a dependency and pass the correct options to 
`jco transpile`, and the resulting runanble ES module will use this library in `import()` statements.

WebAssembly components can be used in server side applications _and_ in the browser, and
`@bytecodealliance/jco-runtime` works in both environments.

> [!NOTE]
> This is functionally different from the [WASI preview2][p2-shim] or [WASI preview3 shims][p3-shim]. While those projects
> contain implementation for WASI interfaces (Filesystem, HTTP, etc), this repository contains implementation
> for lower level Component Model concepts (intrinsics like `backpressure.inc`).

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco
[cabi]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[p3-shim]: https://www.npmjs.com/package/@bytecodealliance/preview3-shim

# Quickstart

`@bytecodealliance/jco-runtime` is primarily used it's exports as a module,
holistically. Put another way, packages that serve as runtimes to `jco transpile`
are expected to have certain exports that binding code will use.

The required namespace is the following:

```typescript
namespace runtime {
    // TODO
}
``` 
# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
