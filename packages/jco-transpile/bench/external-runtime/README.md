# Initial bundled runtime findings

Measured on Linux x64, Node v24.21.0, Rolldown 1.2.13,
Rollup 4.64.1 and Oxc 0.151.0.
The runtime is the implementation stacked on host-intrinsics commit 678ac430
(166/274 variants externalized), not a completed future implementation.
See [baseline.json](baseline.json) for all 50 size/performance observations and
the sections below for methodology, budgets, workload coverage and limitations.

**External output has not reached parity.** Warm call throughput is close in
these cases, but single-component transfer size and source/initialization costs
still regress. These results support keeping production's inline default.

## Complete bundled JavaScript

Ratios are external / inline; below 1 favors external. Both modes include their
complete runtime dependency graph. Core Wasm asset bytes/digests match exactly.

| Bundler  | Scenario  | Raw JS |  Gzip | Brotli |
| -------- | --------- | -----: | ----: | -----: |
| rolldown | adder     |  2.51× | 2.48× |  2.41× |
| rolldown | flavorful |  1.33× | 1.52× |  1.53× |
| rolldown | futures   |  1.12× | 1.22× |  1.22× |
| rolldown | portfolio |  0.83× | 0.67× |  1.17× |
| rollup   | adder     |  2.51× | 2.50× |  2.43× |
| rollup   | flavorful |  1.33× | 1.52× |  1.53× |
| rollup   | futures   |  1.12× | 1.22× |  1.23× |
| rollup   | portfolio |  0.83× | 0.67× |  1.17× |

The minimal adder is 40,671 vs 102,064 bytes with Rolldown. Its gzip payload is
11,413 vs 28,356 bytes, and Brotli is 10,303 vs 24,879 bytes. The representative
single-component corpus retains a substantial fixed cost from the runtime.

Sharing across the eight-component portfolio improves raw size by about 17%
and gzip by about 33%. However, its Brotli output grows about 17%:
51,758 vs 60,428 bytes with Rolldown. Repeated inline code compresses well under
Brotli. Raw deduplication alone is insufficient evidence for transfer-size parity.

An entirely unused runtime import disappears with both bundlers. Once
`runtime.create` is used, the adder bundle still retains unneeded namespaces
such as error-context helpers and JSPI support. Source inspection shows the
provider returns all namespaces and binds methods to their namespace objects;
these object/receiver contracts limit what the current optimizers eliminate.
The size gates provide a baseline for investigating narrower/lazier factories
or static specialization without weakening provider semantics.

## Execution costs

Across the recorded cases, external/inline median warm-call ratios range from
0.92–1.03 with Rolldown and 0.99–1.08 with Rollup. No hot-call case misses the
25% parity target in this recording. These observations are not proof of an
8% regression or an 8% improvement: inspect repeated paired samples before
attributing small timing differences to the runtime.

Parsing ratios span 1.01–2.08 (Rolldown) and 1.09–2.16 (Rollup). Initialization
ratios span 1.11–2.10 and 1.11–2.15, respectively. Evaluation is measured
separately; the fresh-module overhead is much smaller in absolute time, and
its configured additive noise allowance matters. These measurements exclude
Wasm compilation, process startup and application I/O/shim setup.

Memory deltas and bundle times are diagnostic, not portable memory/performance
guarantees. Stream throughput is deliberately unmeasured: this fixture leaves
a read blocked and would accumulate handles in a reused hot loop.

## Gates and next steps

A passing default command means no regression beyond the reviewed observed
budgets; it never means parity. The strict parity command is expected to fail
for the losses above. CI uploads full JSON/Markdown reports and inspectable JS
bundles on every comparison run. Timed blocks verify independent checksums
outside the clock; a worker canary rejects a constant stub that could otherwise
look fast while passing its first known-answer check.

Continue intrinsic conversion, then use these same gates to assess factory
specialization, retained namespaces, multi-component sharing and compressed
transfer costs. Revisit the default only after the parity gate passes across
representative applications and relevant engines, alongside functional tests.

## Benchmark scope

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
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime
```

The default gate prevents regressions against the committed **observed baseline**.
It does not endorse that baseline's overhead. Every JSON report lists the axes
that fail parity even when this gate passes. To enforce parity instead:

```sh
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:parity
```

The parity command is expected to fail while the recorded penalties remain. It
uses the same tests and measurements, with size ceilings of inline + 5% and
128–256 bytes, and timing ceilings of inline + 25% plus a noise floor (250 ns for
calls, 25 µs for parsing/evaluation and 50 µs for initialization). A claim that external
should become the default requires inspecting every measured axis, including
compressed transfer size, and broader compatibility tests.

Vitest filters work with either command. `JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT` selects the
report directory (default `bench/output/external-runtime` in this package). Reports
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
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime --record
```

Recording runs all functional/control checks, takes no filters, and is disabled
in CI. It writes `baseline.json` only after the complete suite passes. Review
per-axis ratios and the saved bundles before committing a baseline update;
do not update it merely to make a regression green. Keep optimizer versions in
`pnpm-lock.yaml` pinned/reviewed alongside baseline changes.
