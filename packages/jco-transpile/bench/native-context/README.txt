ISOLATED NATIVE CONTEXT ACCESSOR PROTOTYPE
=======================================

This is an opt-in research adapter for js-component-bindgen output. It does not
change the default transpiler or publish a new runtime API. It builds on the
context benchmark in scripts/context-access (Jco issue #2481 and PR #2483).

Design
------

Every AsyncThread retains its own two-element storage array. That remains the
durable store, including temporary storage used for realloc and fused adapters.
A small Wasm helper caches those two values during uninterrupted guest execution.
Its context.get/context.set functions are genuine Wasm exports, imported directly
by the guest. A cache hit reads or writes a private i32 global without entering JS.

Each component binding has a helper; all helpers in one instantiated component
graph share a private active-binding selector. Switching bindings first flushes
the previous helper to the captured storage array, then resolves a live thread
and loads its slots. Resolution preserves component-specific lookup, fallback to
the executing thread, and task-ID checks against recycled thread handles.
Separate instantiate() calls have separate managers, selectors, and stores.
Only immutable compiled helper modules are shared between instances.

The adapter instruments the embedded runtime to invalidate before:
  * Task-register assignment, deletion, or definition (including save/restore).
  * RepTable insertion, removal, or clearing.
  * Reading or replacing AsyncThread.storage.
  * Calling the original JS context operations.

Ordinary core imports and exports also receive native Wasm wrappers. A function
already guarded by this manager for the same signature is not wrapped twice. They flush
before a call and invalidate after it returns. Crucially, the post-call hook is a
Wasm instruction following the imported call: after JSPI suspension it executes
on the actual resumed stack, before guest instructions can use a cached value.
It is not a JS Promise.finally hook. Exception handlers invalidate and rethrow the
same exception. Wasm traps are not caught by catch_all; runtime register cleanup,
storage access, and the next guarded entry invalidate before further use.
Instantiation also invalidates in a finally block, including failed core starts.

Native context imports themselves bypass these wrappers. The guest cannot name
or obtain the selector, storage globals, manager, or lifecycle hooks. Native
functions have fixed i32 signatures and fixed slot indices. The original checked
JS operations remain available to runtime code.

Testing
-------

From packages/jco-transpile, with workspace JS dependencies installed:

  pnpm test:native-context

This tests and builds the pinned native transpile driver, then runs Node's test runner with
JSPI enabled. Node 24.13.0 was used for the recorded tests and measurements. Test
process isolation is disabled so the engine's experimental JSPI flag is retained.
The suite uses actual component transpilation and execution, not just extracted
runtime functions. It exercises baseline, checked-cache, and native output,
including generated-JS minification. The baseline and checked-cache executions
establish that the fixtures test legal behavior independent of the adapter.

Coverage includes both slots, signed i32 endpoints, fresh tasks, cooperative
threads sharing one task, concurrent callback tasks, reversed same-turn host
promise settlements across independent instances, realloc, start functions,
FACT/post-return, nested resource destructors, cancellation before entry and
delivery to a started callee, rejection/traps, and recycled handles. Native
helper tests additionally check reference/multi-value signatures, exception
identity, and invalidation at the actual JSPI resume point. A negative control
shares thread storage deliberately and must fail the guest's isolation checks;
it is not an eligible benchmark implementation.

Benchmark reproduction
----------------------

The fixture directory is the Rust reproduction described in
scripts/context-access/README.txt. It must contain the P2 artifacts, P3 component,
runner scripts, and installed preview2/preview3 shims. Build the native driver as
above, then from the repository root:

  node packages/jco-transpile/bench/native-context/prepare.mjs FIXTURE OUTPUT
  node packages/jco-transpile/bench/native-context/measure.mjs OUTPUT

Use the same Node executable for preparation, testing, and measurement. The
measurement script starts fresh processes with --experimental-wasm-jspi. It
validates every Rust checksum and boundary-loop result. Nine rounds are used by
default; REPETITIONS overrides this. Processes are serial, with variant order
shuffled per round. Do not build or test concurrently with measurements.

The Rust baseline is byte-identical to the PR #2483 baseline used by the earlier
experiments. Every P3 variant uses the same core Wasm files. The boundary fixture
adds a host call between context operations on every iteration and has separate
synchronous and JSPI modes, exposing costs hidden by an uninterrupted Rust loop.
Raw observations, environment metadata, and a report are under results/.

Limits and production work
--------------------------

This demonstrates isolation for the covered embedded-runtime paths; it is not a
complete sandbox audit or a production-ready transpiler option. The adapter
recognizes generated AST shapes and rejects unfamiliar ones. External runtimes,
WebAssembly shims, and unsupported function signatures are rejected. Wrappers
support numeric types, nullable funcref/externref, and multiple results; GC types,
SIMD signatures and exact function imports are rejected; shared-everything
threads and other engines are unvalidated.

The implementation relies on register metadata being replaced rather than
mutated in place, as the instrumented runtime does today. Runtime changes that
retain and mutate a storage-array reference without a boundary require review.
A production implementation should express these lifecycle hooks explicitly in
the runtime and emit native functions/signatures from bindgen, replacing this
AST adapter and its broad RepTable instrumentation. The native-driver signature
sidecar is experimental tooling, not a stable generated-output contract.

The design adds private globals and helper instances, an active-binding check on
each native access, JS work at invalidation/refresh boundaries, and wrappers around
ordinary imports/exports. This can cost more than checked caching in code with
frequent host calls. Startup, generated bytes, and boundary-heavy throughput must
be considered alongside the context-intensive Rust result.
