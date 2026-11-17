# External runtime performance experiments

These benchmarks compare the implemented external runtime with `d7e296bed`,
which contains labels but predates the allocation and scheduling changes.
Both sides strip `DEBUG`. The `retained` and `lean` variants use the current
implementation and respectively retain all labels or strip `DEBUG` and `SAFETY`.
No inline runtime or Rust generator code is changed.

## Implemented opportunities

Each opportunity has its own commit on `perf/glue-labels`:

| Opportunity               | Implementation                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Removable diagnostics     | `DEBUG` labels and audited internal `SAFETY` labels; canonical validation stays unconditional.                      |
| Actual label stripping    | `build:release` and `build:lean` bundle public package entries with shared chunks.                                  |
| UTF-16 counting           | Count code points during the existing surrogate-aware write.                                                        |
| Context slots             | Resolve and validate thread storage without allocating thread metadata. No Wasm-side slots.                         |
| Component lookup          | One `Map.get` for an existing component state.                                                                      |
| Memory views              | Cache scalar `DataView`s and refresh after buffer replacement, including growth.                                    |
| Flat arguments            | Long or explicitly reused runtime-owned contexts use lazy cursors; short and caller-created contexts retain arrays. |
| Scalar return pairs       | Built-in composite lifts use private scalar functions; custom lifts keep their public pair API.                     |
| Shapes and specialization | Consistent runtime call-context fields and separate direct/memory scalar leaves.                                    |
| Queues                    | Head cursors, amortized compaction, and release of consumed chunks; preserve prepend snapshots.                     |
| Bulk bytes                | Typed guest-to-guest and guest-to-host copies, owned host chunks, array fallback for custom providers.              |
| Ready streams             | Optional synchronous read capability while retaining the public Promise-returning API.                              |
| Batching                  | Coalesce host-completion wakeups and yield after 64 synchronous source reads.                                       |
| Native UTF-8              | Node byte primitives for large ASCII strings; portable/custom codec fallback and exact single allocation.           |

Wasm-side context slots are intentionally deferred to the separate PR. No gain
from these runtime changes should be interpreted as faster V8 Wasm execution.

## Reproduce

Install workspace dependencies, then run from the repository root:

```sh
node packages/jco-cm-runtime/bench/labels/verify.mjs
node packages/jco-cm-runtime/bench/labels/run.mjs
node packages/jco-cm-runtime/bench/labels/confirm.mjs packages/jco-cm-runtime/bench/output/labels
```

`run.mjs` builds all variants before timing, using `git show` to read baseline
sources without changing the checkout. The baseline's context factory is its
original plain object construction; all other baseline implementation modules
come from the recorded commit. It runs five fresh processes per variant with
nine samples per workload. `JCO_LABEL_BENCH_PROCESSES=1` is a useful smoke run.
`JCO_LABEL_BENCH_OUTPUT` chooses an output directory relative to this package.

`confirm.mjs` alternates baseline/candidate samples, with twelve pairs in each
of five fresh processes. It constructs each module's runtime classes once to
avoid creating more receiver shapes for one variant. Raw samples, process
ranges, Node/V8/CPU information, source snapshots and bundle hashes are saved
under the ignored output directory. `results.json` contains isolated runs;
`paired.json` contains confirmation. Run functional tests separately from timing.

The context-Wasm test is a real core Wasm loop calling a bound runtime import,
with actual task/thread owners. It is not a compiled P3/JSPI application. Other
cases invoke the runtime from JavaScript. Flat record tests include complete
fresh caller and runtime-owned contexts; scalar tests also exercise reused
contexts. Buffer tests include constructors and validate the last copied byte.
The 4 KiB bulk-copy test replaces boxed byte iteration, so its large ratio is
specific to that operation, not overall I/O throughput. String allocation uses
a fixed output address to exclude allocator cost. Setup and compilation are
outside timing; per-operation objects remain inside it.

Known-answer checks cover context switching, stale identities, fresh realloc
slots, invalid slots, resource traps, memory growth and surrogate repair. Tests
also cover shared memory, custom callbacks/codecs, retained arrays, cancellation,
late disposal, fairness, minimal-capability imports and mixed public entrypoints.

## Regression checks and builds

From this package directory:

```sh
pnpm types:check
pnpm test
pnpm exec vitest run -c bench/labels/vitest.config.mjs
JCO_RUNTIME_DROP_LABELS=DEBUG,SAFETY pnpm exec vitest run -c bench/labels/vitest.config.mjs
pnpm build:release
pnpm build:lean
```

The full suite includes release/lean package builds and standalone runtime
conformance checks. Normal `build` and `prepack` retain diagnostics. The alternate
Vitest configurations strip labels in runtime sources before running tests.

## Earlier prototypes

The initial source-substitution probes and their measurements are preserved at
`d7e296bed` (including `prototypes.mjs`). They are historical leads, not results
for the implementations on this branch. In particular, applying accessors to
arbitrary caller-created contexts proved too expensive in the fresh-record
benchmark, despite the earlier reused-context cursor probe looking promising. Cursor setup
is now limited to vectors of at least 64 arguments, or explicit reuse by an
internal caller. The reused 16-field record probe explicitly opts in; the fresh
16-field probes do not. The 128-field test explores a generic helper beyond the
usual Canonical ABI flat-argument limit; it is not a typical generated call.
The current harness measures complete implementations instead of substitutions.

## Implemented measurements

Results are microbenchmarks, not application-level throughput or latency claims.
Small differences whose process ranges overlap one are inconclusive. Bundle
sizes include the benchmark harness and are not application bundle sizes.
