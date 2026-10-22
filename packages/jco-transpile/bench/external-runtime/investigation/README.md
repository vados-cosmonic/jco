# Runtime investigations

N14 is in progress. The matched factory/named assessment, browser measurements,
retention/context traces and remaining diagnostic experiments are not complete.
Clean historical repair evidence is now [published separately](../checkpoints/n14-historical-repair.md).
The complete four-mode [input verification](../checkpoints/n14-matched-inputs.md)
also passed; accepted matched timing and the remaining investigations are pending.
Inline remains the production default.

## Matched input preparation

`vitest.config.ts` runs only the complete four-mode build/correctness phase.
It collects no accepted timing data. The modes are old inline, current inline,
frozen factory and current named. All 17 scenarios, both bundlers and both
resolutions are required: 68 entries and 272 complete bundles. Every mode must
match the reference fixtures and actual core Wasm. Current named/inline source
parts and complete bundles must also reproduce the production Node API reference
byte for byte. Each entry runs all four bundles in a fresh verification process,
checks exported component names and 32 varying inputs for callable workloads.
The stream lifecycle control still has no reusable payload-throughput call.

Prepare the frozen source in a separate directory, retaining its exact ref:

```sh
git archive --output=/path/to/factory-source.tar \
  b5931a41f6222359628b451e647078ab2e04d536 \
  Cargo.toml Cargo.lock README.md crates packages/jco-node-fs packages/jco-cm-runtime
mkdir /path/to/factory-source
tar -xf /path/to/factory-source.tar -C /path/to/factory-source
```

Compile the frozen runtime into its own `dist`, with the same installed
TypeScript as the current runtime. Its isolated `node_modules` may link to the
current runtime's installed dependencies. Keep current `dist` and vendor outputs
untouched. `prepare-producer.mjs` emits isolated native-driver manifests,
the common `producer.rs` and the appropriate frozen Cargo lockfile:

```sh
node packages/jco-transpile/bench/external-runtime/investigation/prepare-producer.mjs \
  factory /path/to/factory-source /path/to/fresh-factory-driver
node packages/jco-transpile/bench/external-runtime/investigation/prepare-producer.mjs \
  named /path/to/current-repo /path/to/fresh-named-driver
CARGO_INCREMENTAL=0 RUSTUP_TOOLCHAIN=stable-x86_64-unknown-linux-gnu \
  cargo build --locked --offline --manifest-path /path/to/fresh-factory-driver/Cargo.toml
CARGO_INCREMENTAL=0 RUSTUP_TOOLCHAIN=stable-x86_64-unknown-linux-gnu \
  cargo build --locked --offline --manifest-path /path/to/fresh-named-driver/Cargo.toml
```

Use `--target-dir` to select an appropriate build cache while no consumers use
its outputs. The native drivers are unmeasured transpilers; all generated Wasm
and JavaScript bytes are validated before measurement. They use the production
Node API options, including conditional-suspending Wasm emission and disabled
component-error wrapping. The current production compiler/runtime must already
be built. Supply a full production reference `manifest.json` from those exact
artifacts; stale compiler/runtime fingerprints are rejected.

Create an input JSON with absolute paths and actual SHA-256 binary digests:

```json
{
  "factoryRef": "b5931a41f6222359628b451e647078ab2e04d536",
  "factory": {
    "binary": "/path/to/jco-matched-factory-producer",
    "sha256": "actual SHA-256 digest",
    "runtimePackage": "/path/to/factory-source/packages/jco-cm-runtime"
  },
  "named": {
    "binary": "/path/to/jco-matched-named-producer",
    "sha256": "actual SHA-256 digest",
    "runtimePackage": "/path/to/current-repo/packages/jco-cm-runtime"
  },
  "productionManifest": "/path/to/full-production-reference/manifest.json"
}
```

From `packages/jco-transpile`, prepare a fresh matrix directory:

```sh
JCO_EXTERNAL_RUNTIME_MATCHED_INPUTS=/path/to/inputs.json \
JCO_EXTERNAL_RUNTIME_MATCHED_BUILD=/path/to/fresh-matrix-directory \
  pnpm exec vitest run -c bench/external-runtime/investigation/vitest.config.ts
```

The matrix records producer digests, complete runtime package metadata/dist
hashes, coverage, retained-module graphs, original/compressed bundle sizes,
verification outputs and failures. It refuses an existing output directory.
Within its own attempt, completed byte-identical regular files can share inodes;
package symlinks are skipped and every path, byte and mode is preserved. Treat
these archives as immutable; diagnostic rewrites need their own output files.

`matched-runner.mjs` provides the four-mode worker for the forthcoming standalone
collector. Williams orders balance each position and each directed adjacent pair
over four samples. All modes use common warmup/calibration and independent timed
checksums. Raw paired results include named/factory, named/current-inline,
factory/old-inline, current-inline/old-inline and the ratio of external/inline
overheads. The inline comparison must remain visible when interpreting compiler
differences. Building inputs or passing verification does not establish accepted
timing results, browser coverage or complete N14 assessment.

## Factory shape and AST diagnostics

The functional configuration also runs the minimal property-boundary reproducer
through Rolldown and Rollup. It verifies varying known answers and records whether
an unused member survives a direct named import, a factory property read, or a
factory property bound to its namespace. It requires direct named elimination;
it records future factory-elimination improvements without failing them. Each
probe writes a fresh archive and cleans its own temporary inputs.

`transforms.ts` keeps old-factory namespace/check/receiver omissions separate from
the named API. Factory binding transforms reject named-import input. Every edit
reports its changed-node count, so a no-op is visible. Namespace omission remains
an unsafe closed-world diagnostic, not a general provider or production change.
Factory call hooks run only in separate instrumented diagnostics; readable source
spans describe retention and are not additive compressed-size estimates. AST span
edits preserve unrelated source, including array elisions.

The bundler's `runtimePackageDirectory` diagnostic option selects the isolated
runtime package and reads its own side-effects metadata. Bare root imports,
named subpaths and file URLs use that selection. Package imports resolving
outside the selected runtime are rejected. Functional checks exercise both
bundlers, metadata with and without side effects, real module execution and
accidental links to the current runtime; the default suite keeps its current
runtime selection.

## Recollect a frozen smoke matrix

From the repository root, using the original archived absolute artifact paths:

```sh
node packages/jco-transpile/bench/external-runtime/investigation/frozen-replay.mjs \
  --source packages/jco-transpile/bench/output/external-runtime-named/run-ORIGINAL \
  --anchor /path/to/recorded-bundle-hashes.json \
  --processes 5
```

Select the corresponding original ten-process archive with `--processes 10`.
The anchor contains `bundleHashes`, mapping all 64 `report-id/mode` keys to
SHA-256 digests. Preserve when the anchor was captured and its source evidence;
an anchor created during repair is not a previously published checksum.
`--verify-only` checks every input, control and known answer without collecting
accepted timing data. `--output` selects a new archive root outside the original
archives. No scenario filters or baseline-recording options are accepted.

The collector requires the complete 32-report smoke catalog and both modes. It
checks the recorded raw/gzip/Brotli sizes, core Wasm digests, Node/CPU/platform,
lockfile and shim hashes. It copies the exact archived runner, workload, report
and trace sources; the native report import must reproduce all original
process-cluster estimates. No old compiler/runtime reconstruction is needed:
the worker's native ESM and vm probes load the saved complete bundles and core
Wasm, rather than an unbundled provider graph.

Every used/unused control and bundled known answer runs before timing. Linux
process audits reject competing fixture, Vitest, compiler, browser and benchmark
workers. Five or ten fresh processes per report retain at least 15 alternating
paired samples with the original deterministic scenario rotation, calibration,
checksums, budgets and process-cluster/noise rules. The recorded whole-matrix
deadline and two-minute child deadline remain enforced. Timeout/abort handling
waits for child termination; it never leaves an owned worker running.

`--controls-source /path/to/other/archive` supports a proved equivalent input
matrix with additional controls. All original controls must remain present with
identical bundle bytes and allocation counts. Timed sources, bundle/core-Wasm
inputs and component selections must match. Shared collection results are one
sample population, never independent repetitions for each historical checkpoint.

Each invocation creates a separate archive under
`bench/output/external-runtime-frozen-replay`, including copied sources,
controller source hashes, configurations, raw observations, control traces,
process audits and progress/failure metadata. Original paths, samples and
baselines remain unchanged. Complete results report strict parity losses without
relaxing gates or replacing the original checkpoint. Memory stays diagnostic;
negative GC deltas are excluded, counters overlap, and external accounting may
include Wasm linear memory.

The historical N08–N11 background-load limitation remains part of the original
evidence. Publish repaired observations separately, identifying any transparent
reuse of existing clean samples and the exact consumed-input equivalence proof.

Run the process lifecycle checks separately from timing:

```sh
pnpm --filter @bytecodealliance/jco-transpile exec vitest run \
  -c bench/external-runtime/investigation/vitest.functional.config.ts
```
