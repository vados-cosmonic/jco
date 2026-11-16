Context access experiments

These experiments compare generated code from PR #2483 on the Rust shadow-stack
workload in issue #2481. They deliberately patch generated JavaScript to isolate
individual costs. They do not change the production runtime or transpiler.

References:
https://github.com/bytecodealliance/jco/issues/2481
https://github.com/bytecodealliance/jco/pull/2483

Requirements

Use Node 24.13.0 with --experimental-wasm-jspi and Rust 1.100.0 with the
wasm32-wasip2 and wasm32-wasip3 targets installed. Install the repository's pnpm
dependencies; the AST patcher uses jco-transpile's typescript-compiler-api.
Wasmtime 50.0.1 is optional for the independent runtime comparison.

The following commands run from the repository root. Use an absolute output
directory outside the repository to keep generated artifacts out of version
control. Substitute the desired Node binary for node in measurement commands.

Build the unmodified Rust workload and generate both component bindings:

  cargo +1.100.0 build --release --target wasm32-wasip3 --manifest-path scripts/context-access/fixture/Cargo.toml
  cargo +1.100.0 build --release --target wasm32-wasip2 --manifest-path scripts/context-access/fixture/Cargo.toml
  cargo run --locked --manifest-path scripts/context-access/transpile/Cargo.toml -- scripts/context-access/fixture/target/wasm32-wasip3/release/stack-loop.wasm scripts/context-access/fixture/out-option
  cargo run --locked --manifest-path scripts/context-access/transpile/Cargo.toml -- scripts/context-access/fixture/target/wasm32-wasip2/release/stack-loop.wasm scripts/context-access/fixture/out2
  npm install --prefix scripts/context-access/fixture --ignore-scripts
  node scripts/context-access/prepare.mjs scripts/context-access/fixture /tmp/jco-context-access
  ln -s "$PWD/scripts/context-access/fixture/node_modules" /tmp/jco-context-access/node_modules

Preparation also accepts an existing issue reproduction directory containing
out-option/, out2/, run.mjs, run2.mjs, src/, and the compiled P3 component under
target/wasm32-wasip3/release/. The original experiment reused these artifacts to
avoid changing compiler or shim versions. manifest.json records the source hash.

Check isolation and measure serially, without concurrent builds or benchmarks:

  node scripts/context-access/check.mjs /tmp/jco-context-access
  COUNTS=1000000 node scripts/context-access/measure.mjs /tmp/jco-context-access
  node scripts/context-access/micro.mjs /tmp/jco-context-access
  node scripts/context-access/summarize.mjs /tmp/jco-context-access

measure.mjs defaults to 11 fresh processes per variant/count. COUNTS defaults to
1000,100000,1000000. REPETITIONS overrides the process count; VARIANTS selects a
comma-separated subset; RESULT_NAME changes the output stem. BENCH_WASMTIME adds
the executable at that path to the matrix. A process launch, module compilation,
and instantiation are outside the guest's timing interval. JIT compilation during
the loop remains inside it, matching the issue. Every checksum is verified.

micro.mjs defaults to seven fresh processes per variant. Each process measures
one million reads, and one million get/set/get iterations, after five 100,000-
iteration warmups per workload. Seven timed samples produce a per-process median;
the independent sample count is seven, not 49. All calls originate in core Wasm
and use actual generated context functions and the generated RepTable. The
synthetic workload has no async scheduling. Every checksum is verified.
The extracted functions share a fixed no-op logger; this isolates the access path
but does not reproduce the full component's closure layout or logger selection.

Variants

pr2483: Same embedded runtime with explicit debug:false at instantiation.
no-context-log: Remove only context.get/set diagnostic calls and arguments.
no-meta-copy: Read the task registers directly only in context.get/set.
no-log-no-copy: Combine the preceding two changes.
no-runtime-log: Remove all embedded runtime diagnostic calls and arguments.
direct-checked: Resolve the thread directly, removing metadata spreads, metadata
  result objects, redundant task() calls, and context diagnostics. Retain slot
  and i32 checks, task-ID validation, and fallback to the executing thread.
direct-no-runtime-log: Direct checked lookup plus removal of all diagnostics.
cache-checked: Cache the resolved thread and table on each task-register object.
  Validate membership and task ID on every access. Eliminate the component map
  lookup on cache hits; retain the thread-table lookup.
cache-epoch: Increment a table generation on insert/remove/clear. Cache the thread
  with the table generation and lookup owner; validate generation and thread,
  component, and task IDs on each hit. Avoid both lookups until the table changes.
  This relies on the runtime retaining the component state/table for its lifetime.
cache-unchecked: Cache without checking liveness. Incorrect for stale registers.
single-array: Use one per-instantiation array. Incorrect across tasks/threads.
wasm-globals: Supply native Wasm get/set exports backed by mutable Wasm globals
  directly as canonical imports. No JS entry for stack-pointer access. Missing
  task/thread save/restore; this is a single-task lower bound, not a usable fix.

The last three variants intentionally fail isolation checks. check.mjs verifies
those failures as well as the passing cases. Other variants pass focused checks
for both slots, nested/restored registers, component selection, fallback after
thread removal, handle recycling, independent stores, and invalid arguments.
These checks use extracted generated functions and real generated RepTable code.
They do not establish correctness under real JSPI suspension, resource destructor
reentry, realloc, or all fused adapter transitions. Those need integration tests
before adopting a runtime change. All diagnostic removal variants assume debug
is disabled; production code must preserve debug-enabled behavior.

The recorded generation-counter follow-up was measured separately, with fresh
controls, after the initial matrix and microbenchmarks:

  COUNTS=1000000 RESULT_NAME=epoch VARIANTS=pr2483,cache-checked,cache-epoch,direct-checked,wasm-globals,wasip2 node scripts/context-access/measure.mjs /tmp/jco-context-access

summarize.mjs includes epoch.jsonl when present. Ratios for that follow-up use its
own baseline. The broader archived microbenchmark matrix predates cache-epoch.
Fresh runs of prepare.mjs/micro.mjs also include cache-epoch.

Experiment results and raw samples are in results/. REPORT.txt explains the
comparison and its limitations. Preliminary/aborted samples are excluded.
