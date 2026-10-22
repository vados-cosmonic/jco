# Runtime investigations

N14 is in progress. The matched factory/named assessment, browser measurements,
retention/context traces and remaining diagnostic experiments are not complete.
The implementation at this point adds clean replay of frozen historical inputs.
Inline remains the production default.

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
