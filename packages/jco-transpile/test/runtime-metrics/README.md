# Bundled runtime comparisons

These tests ask whether an application pays more for the external CM runtime
**after bundling its complete dependency graph**. They compare the same component,
transpilation options, exported API, Wasm modules and host imports in each mode.
The production default remains inline. The runtime implementation is still being
converted; rerun these comparisons as more intrinsics move into the package.

## Running and gating

Build the transpiler, runtime and normal in-repo component fixtures first (the
same prerequisites as the transpilation/P3 suites). No new Rust target or mega
component is needed. Then, from the repository root:

```sh
pnpm --filter @bytecodealliance/jco-cm-runtime build
pnpm --filter @bytecodealliance/jco-transpile test:runtime-metrics
```

The default gate prevents regressions against the committed **observed baseline**.
It does not endorse that baseline's overhead. Every JSON report lists the axes
that fail parity even when this gate passes. To enforce parity instead:

```sh
pnpm --filter @bytecodealliance/jco-transpile test:runtime-metrics:parity
```

The parity command is expected to fail while the recorded penalties remain. It
uses the same tests and measurements, with size ceilings of inline + 5% and
128–256 bytes, and timing ceilings of inline + 25% plus a noise floor (250 ns for
calls, 25 µs for parsing/evaluation and 50 µs for initialization). A claim that external
should become the default requires inspecting every measured axis, including
compressed transfer size, and broader compatibility tests.

Vitest filters work with either command. `JCO_RUNTIME_METRICS_OUTPUT` selects the
report directory (default `test/output/runtime-metrics` in this package). Reports
include all size/timing observations, raw paired samples, known parity losses,
source/bundle sizes, Wasm SHA-256 digests, and diagnostic memory/build costs. The
bundled `.mjs` files are saved for inspection; core Wasm is counted separately.
A runtime import left outside the bundle fails the test, rather than appearing
as a free size reduction.

## Representative coverage

| Scenario  | Work exercised or retained in its complete exported API                       |
| --------- | ----------------------------------------------------------------------------- |
| adder     | Minimal u32 export; makes fixed runtime overhead visible                      |
| numbers   | Integer widths, signed/unsigned i64, floats, Unicode char                     |
| strings   | UTF-8 strings, realloc and post-return; known guest test inputs               |
| lists     | Typed lists, subarray offsets, ownership and allocation cleanup               |
| records   | Records, tuples and flags                                                     |
| variants  | Variants, options, results (including errors), enums                          |
| flavorful | Existing nested record/list/variant baseline, typedefs, imports               |
| resources | Owned resources, destructor calls and isolated context slots                  |
| events    | Waitable set creation, polling, event writes and dropping                     |
| async     | Fused guest-to-guest sync lowering to async lifting, yield, task.return       |
| streams   | Stream handles, zero-length read/write and a deliberately blocked read        |
| futures   | Rust future lift/lower, resolved promises; resource payload APIs retained     |
| portfolio | Eight independent components bundled together to expose sharing/deduplication |

The classic ABI fixtures, `flavorful` and the Rust P3 future fixture already have
functional suites/build machinery in the repo. Workloads validate known answers
in both bundled modes; comparing two equally wrong answers is insufficient.
They do not call classic fixtures' `testImports` conformance driver: those host
interfaces are supplied at instantiation, while the existing runtime suite tests
its full import protocol. The portfolio retains independent stores and executes
each component's workload.

This is representative coverage, not exhaustive ABI conformance. There is no
browser-engine timing claim, large streaming/backpressure throughput benchmark,
network/disk benchmark, or allocation-rate gate. The stream fixture leaves a
read pending by design; its behavior/startup are tested on fresh instances,
without a misleading hot-loop benchmark that would accumulate handles.

## Measurement method

Both bundlers use normal tree shaking and production minification: Rolldown's
native minifier, and Rollup followed by Oxc. File-URL resolution honors the
runtime package's published `sideEffects` metadata in both optimizers. There are
no custom pure annotations
or provider substitutions to make the runtime easier to optimize. Each graph is
one ESM JavaScript chunk with external core Wasm (`base64Cutoff: 0`). Host imports
and the Wasm loader are supplied at instantiation in both modes. Only Node
builtins may remain external. This isolates the generated adapters/runtime from
application-specific shims without excluding the CM runtime's cost.

Size measurements include raw UTF-8, gzip level 9, and Brotli quality 11, plus
unshaken controls. Each pair must emit byte-identical core Wasm. An unused named
runtime import must disappear completely. The portfolio measures a shared graph
rather than summing independent compressed files: inline duplication can compress
well even when external factories deduplicate better in raw JavaScript.

Timing runs in a separate Node process **after bundling**, with precompiled core
modules. Both paths are warmed and calibrated together, then sampled in nine
pairs with alternating order. Synchronous workloads stay synchronous. Results
include medians, individual samples and median paired ratios. Parsing uses fresh
`vm.SourceTextModule` objects; evaluation links/evaluates each fresh module
without instantiating a component. Initialization measures the generated instantiate
API with cached core modules. Neither includes core Wasm compilation, process
startup, network fetch, or application import/shim setup. These isolate adapter
cost rather than claiming end-to-end cold-start latency.

GC runs before each mode's sample. Retained JS heap/external/ArrayBuffer deltas for four
fresh stores are diagnostic: they are noisy, exclude some native/Wasm memory and
are not a complete memory footprint or a CI gate. Bundle duration is also
diagnostic. The child process owns all stores and timers and exits after writing
its report. The suite uses one worker and runs outside other functional suites;
run it on an otherwise idle machine for useful timing comparisons.

## Reviewing and updating baselines

Size gates limit **both** inline/external absolute output to baseline + 5% + 128
bytes, and the external/inline ratio to its baseline + 5% + 128 bytes. This stops
a worsening inline output from masking external growth. Timing gates allow the
larger of the parity ratio or the observed relative overhead + 35%, plus the
metric's noise floor. These are regression budgets, not performance-parity claims.

To deliberately record a new complete baseline on an idle machine:

```sh
pnpm --filter @bytecodealliance/jco-transpile test:runtime-metrics --record
```

Recording runs all functional/control checks, takes no filters, and is disabled
in CI. It writes `baseline.json` only after the complete suite passes. Review
per-axis ratios and the saved bundles before committing a baseline update;
do not update it merely to make a regression green. Keep optimizer versions in
`pnpm-lock.yaml` pinned/reviewed alongside baseline changes.
