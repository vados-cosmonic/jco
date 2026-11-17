# Runtime label and allocation experiments

These probes bundle the external runtime directly. No generated inline runtime,
Rust binding generator, or transpiler behavior is changed. The baseline already
snapshots `JCO_DEBUG` at module load; it does not perform the environment lookup
on every call described in issue #2481.

## Run

Install the workspace dependencies first. The scripts use the existing Rolldown
installation from `jco-transpile`; no full Wasm toolchain build is needed.
From the repository root:

```sh
node packages/jco-cm-runtime/bench/labels/verify.mjs
node packages/jco-cm-runtime/bench/labels/run.mjs
```

The default is five fresh Node processes per variant and nine timed samples per
workload per process. Build all bundles before timing. Process order rotates and
alternates between rounds. Each workload is warmed and its checksum is checked.
Reported values are medians of process medians in ns per operation, or ns per
scalar for the 16-scalar lifting workloads. Raw samples and process ranges are
recorded, not confidence intervals. Run on an idle machine. Small differences
within the process ranges are inconclusive.

Override `JCO_LABEL_BENCH_PROCESSES` for a smoke run and
`JCO_LABEL_BENCH_OUTPUT` to preserve results from multiple Node versions. Output
paths are relative to this package. The default ignored directory is
`bench/output/labels`, containing generated bundles, source snapshots and
`results.json`. Reports include Node/V8 versions, CPU, base revision, bundle
hashes, raw measurements, and minified/gzip sizes. Bundle sizes include the test
setup and workloads and are not representative application bundle sizes.

The Wasm workload executes a real core Wasm loop calling the runtime's bound
`contextGet` import. It uses actual runtime task/thread objects, but it is not a
compiled P3 application, a JSPI suspension workload, or a P2/P3 comparison.
Other workloads invoke the runtime from JavaScript. Initialization, compilation,
process startup, and cleanup are outside timing. Allocator cost is intentionally
excluded from the UTF-16 probe by returning a fixed output address.

## Variants

| Variant            | Difference from `debug-off`                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `retained`         | Keep all diagnostic calls; logging is disabled at module load.                                 |
| `debug-off`        | Drop `DEBUG` statements before bundling/minification.                                          |
| `debug-safety-off` | Also drop the internal freelist-head assertion.                                                |
| `direct-slots`     | Resolve and validate a thread, then return its storage without constructing `AsyncThreadMeta`. |
| `single-map-get`   | Replace `Map.has` followed by `Map.get` with one lookup on an existing component state.        |
| `param-cursor`     | In `liftFlatS32` only, advance a parameter cursor instead of slicing the remaining arguments.  |
| `cached-view`      | In `liftFlatS32` only, cache a DataView and refresh it when `memory.buffer` changes.           |
| `utf16-count`      | Count code points while writing UTF-16 instead of allocating `[...str]` afterward.             |

The allocation variants are isolated source substitutions in `prototypes.mjs`,
used only while building benchmark bundles. Each must match exactly one source
module. They have not been applied to production runtime implementations and
must not be combined or generalized without additional testing. In particular,
a parameter cursor affects composite lift/lower context handoffs, and a cached
view must handle memory growth across every reentrant guest call.

Every bundle checks known answers, context switching, stale task identities,
fresh realloc slots, invalid slots, resource traps, memory growth, and UTF-16
surrogates before timing. `verify.mjs` separately enables logging and verifies
that stripped bundles skip diagnostic argument evaluation while still trapping
on invalid handles, double removal, and invalid Unicode scalars.

## Runtime regression suite

From this package directory:

```sh
pnpm types:check
pnpm test
pnpm exec vitest run -c bench/labels/vitest.config.mjs
JCO_RUNTIME_DROP_LABELS=DEBUG,SAFETY pnpm exec vitest run -c bench/labels/vitest.config.mjs
```

The alternate config strips labels in runtime sources before the normal test
suite runs. The package-consumer test independently builds the ordinary package;
it continues checking the default published behavior.

For paired confirmation, alternate baseline and candidate samples within each
fresh process. Reuse the bundles produced by `run.mjs`:

```sh
# From the repository root; use the same Node executable as the original run.
node packages/jco-cm-runtime/bench/labels/confirm.mjs packages/jco-cm-runtime/bench/output/labels
```

`paired.json` records five processes with twelve paired samples each, including
per-process ratio ranges. The compared bundles have independent runtime state.
This reduces timing drift but does not establish application-level throughput or
remove all JIT/layout sensitivity. Run functional suites separately from timing.

## Follow-up candidates

| Priority             | Candidate                                         | Where / next validation                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High                 | Parameter cursors                                 | `lift.ts` repeatedly slices flat argument arrays. Extend the scalar probe to nested records, variants, tuples, and mixed direct/indirect arguments. Preserve public context contracts or add internal wrappers.                                |
| High                 | Cache memory views                                | `lift.ts` and `lower.ts` allocate views for each scalar. Refresh on buffer replacement and test growth during realloc, reentrant calls, shared memories, and multiple memories.                                                                |
| High                 | Count UTF-16 code points during the write         | `string.ts` allocates `[...str]` after an existing surrogate-aware pass. Test empty, ASCII, astral, lone-surrogate, and compact strings across sizes.                                                                                          |
| High                 | Keep byte transfers in typed arrays               | `buffers.ts` boxes guest bytes with `Array.from`, while stream queues push individual elements. Use bulk copies and owned typed-array chunks; benchmark P2/P3 I/O across chunk sizes. Guest memory must not escape past post-return or growth. |
| Medium               | Scalar results without temporary pairs            | Lift helpers repeatedly return `[value, ctx]`. Probe private scalar helpers with a mutated context; preserve the published API and reentrancy.                                                                                                 |
| Medium               | Avoid full thread-metadata construction           | `context.ts` needs storage, while `getCurrentThread` constructs metadata and calls task accessors. Measure genuine P3 workloads with multiple components, stale/recycled threads, fresh realloc slots, and suspension.                         |
| Medium               | Stable context shapes and specialized hot helpers | Initialize context fields consistently and separate direct-parameter and memory paths where profitable. Use V8 optimization/deoptimization traces on real workloads rather than assuming a shape problem.                                      |
| Medium               | Synchronous stream fast paths                     | `trackHostOperation` already returns synchronously when possible, but `PendingValueQueue.readSource` always awaits. Audit ready paths while preserving cancellation, disposal, thenable semantics, and required scheduling.                    |
| Medium               | Queue head cursors                                | `stream/queue.ts` uses `shift`/`unshift`; host buffers slice the unread tail. Benchmark many small buffered chunks before introducing head indices or ring buffers; release consumed references.                                               |
| Medium               | Batch transfers and wakeups                       | Coalesce ready work under a fairness budget, avoiding a scheduling boundary per tiny chunk. Measure throughput, tail latency, cancellation, and starvation together.                                                                           |
| Low pending evidence | Single component-state Map lookup                 | `getOrCreateAsyncState` does `has` then `get`. The probe is small and version-sensitive; prioritize only with stable end-to-end evidence.                                                                                                      |
| Exploratory          | Native UTF-8 length / encoding paths              | Compare Node `Buffer` primitives with the current exact-size scan plus `TextEncoder.encodeInto`. Keep one-allocation compatibility, code-point metadata, surrogate behavior, and browser portability.                                          |
| Longer term          | Wasm-side context slots                           | A mutable global or tiny helper module could avoid hot Wasm-to-JS crossings. Requires save/restore semantics for suspension, reentrancy, fresh realloc contexts, and instance isolation; this is a separate architecture change.               |

The first three probes do not require removing Canonical ABI checks. Allocation
pooling is a later option: escaped references, promises and reentrant calls make
shared scratch objects substantially harder to validate than removing redundant
allocations outright.

## Measurements

Base: `54a3df519bc4d32adbe2f4dba0546a3d565d5d68`.
CPU: Intel(R) Xeon(R) Processor @ 2.60GHz, Linux x64.
Node v24.21.0 / V8 13.6.233.17-node.53; Node v26.13.0 / V8 14.6.202.34-node.40.

Paired speedups below are medians of five process median ratios. Parentheses
show the range of those five process ratios, not a confidence interval.
Except for label stripping, each compares against the DEBUG-stripped baseline.

| Probe                                                 | Node 24 speedup (range) | Node 26 speedup (range) |
| ----------------------------------------------------- | ----------------------- | ----------------------- |
| Strip DEBUG (context Wasm loop)                       | 1.02× (1.01–1.04)       | 1.00× (0.96–1.05)       |
| Return thread slots directly (context Wasm loop)      | 1.19× (1.13–1.24)       | 1.32× (1.26–1.38)       |
| Single component-state Map lookup (context Wasm loop) | 1.04× (0.96–1.10)       | 1.05× (1.01–1.13)       |
| Parameter cursor (16 flat s32 values)                 | 3.57× (3.48–14.83)      | 15.07× (13.78–19.45)    |
| Cached DataView (16 memory s32 values)                | 3.05× (3.03–4.23)       | 4.74× (4.68–6.13)       |
| Count while writing (1,280 UTF-16 code units)         | 1.47× (1.40–1.59)       | 1.38× (1.31–1.59)       |

Allocation removal has the strongest signal. The cursor's Node 24 process
variation also warrants caution about the size of the gain. Absolute timings vary
between isolated and paired runs, so these are optimization leads, not promised
application speedups. The single-lookup change is too small to prioritize on this
evidence. Label stripping does not reproduce the old per-call environment-read
speedup because that cost is already absent from the baseline.

In the Node 26 probe bundle, DEBUG removal changed minified size from 91,544 to
80,306 bytes (12.3% smaller), and gzip size from 26,066 to 23,735 bytes (8.9%
smaller). These include the workload harness; cold-start timing was not measured.

Validation: runtime type checking, formatting/lint, bundled strip verification,
and all 404 runtime tests in each of the retained, DEBUG-stripped, and
DEBUG+SAFETY-stripped configurations passed. Prototype bundles passed their
known-answer and context/growth checks; the full suite validates label removal,
not the allocation prototypes.
