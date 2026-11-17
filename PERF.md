# Performance options for generated bindings under Node.js + V8

> Working notes for the `perf/label-stripping` branch.
> Remove this file before opening the pull request.

Scope: the glue between JavaScript and core Wasm, for both P2 and P3.
Changes target the external runtime (`packages/jco-cm-runtime`) and the bindings that call it;
the inline intrinsics in `js-component-bindgen` are to be replaced by the bundled external runtime.

## Summary

- Implemented so far (options 1, 6, 8 and part of 7): 1.8–4.7× against the external runtime,
  1.3–1.8× with the runtime bundled. See Status.
- Defining runtime classes once, instead of per component instance, is the largest effect: 2–4×
  as soon as a process holds two instances.
- Stripping every debug log buys 5–17%.
- Three small runtime fixes plus debug stripping give 1.2–1.9×.
- Per-call task bookkeeping costs roughly 100× a direct call on scalar exports,
  and about 17× on sync host imports. Sync fast paths are where the headroom is.

## Status

Implemented on this branch: options 1, 6 and 8, and the per-element costs found under option 7.
Not started: options 2 and 3. Deferred: options 4 and 5.

Nanoseconds per call against the external runtime, fastest of 5 interleaved process runs,
all four fixtures loaded in one process:

| Case | main | + option 1 | + option 8 | + option 6 | + option 7 | total |
| --- | --- | --- | --- | --- | --- | --- |
| export `u32 -> u32` | 1325 | 868 | 875 | 766 | 712 | 1.86× |
| export `f64 -> f64` | 1362 | 906 | 917 | 786 | 744 | 1.83× |
| export `string -> string` | 6530 | 6071 | 2860 | 2631 | 2154 | 3.03× |
| export `list<u8> -> list<u8>` | 7361 | 6392 | 3076 | 2914 | 2766 | 2.66× |
| export record round trip | 4759 | 3979 | 1163 | 997 | 1013 | 4.70× |
| export tuple swap | 4189 | 4117 | 972 | 983 | 963 | 4.35× |
| guest makes 39 numeric host imports | 226042 | 183548 | 71010 | 77538 | 76970 | 2.94× |
| guest makes 2 string host imports | 22365 | 18677 | 6445 | 6445 | 6030 | 3.71× |

With the runtime bundled into each module (the default), main to this branch is 1.28–1.79×:
there every module already had a runtime of its own, so option 8 changes nothing for it.

Option 8 is what the large factors come from, and it only shows when a process holds
more than one component instance. The first two rows are the cases least affected by it.

Verification:

- `packages/jco-cm-runtime`: type check, lint, format and all 404 tests pass.
- `js-component-bindgen` unit tests: 168 pass.
  `shipped_runtime_uses_only_reserved_globals` fails on `MessageChannel`;
  that use and the reserved list are unchanged from main, so the failure is not from this branch
  (established by diff, the test was not run on main).
- `jco-transpile` suite, embedded and external runtime: 800 pass, 218 fail, 330 skipped.
  Every failure is a missing file under `test/fixtures/generated/rust-test-components`
  (not built on the machine used) or a missing browser.
  **Most P3 async tests are among those that could not run.**
  That run predates the last list-lowering change, which was checked by hand only.

To review before a pull request:

- `packages/jco-cm-runtime/test/async-task.ts`: the test of store-local classes was rewritten.
  It asserted distinct method identities and a `TypeError` when a method of one store's class
  is applied to another store's instance. Both are gone by design; it now asserts `instanceof`
  in both directions, per-store statics and per-store state.
- A lone instance pays 7–10% for option 8 (one more call per construction).
- Bindings that export `instantiate` now share at most two bundled runtimes per module,
  one per debug setting, instead of one per instance.
- About 20 other class factories (streams, futures, waitable sets, buffers, error contexts)
  still define a class per store. They are not on the sync path measured here.

## Measurements

The tables below are the original experiments, made on copies of the built runtime before any source change.

Node 26.13, Linux x86_64.
Sync P2 fixtures (`numbers`, `strings`, `lists`, `records`) transpiled against the external runtime.
Nanoseconds per call, fastest of 4 interleaved process runs on an idle machine.

| Case | main | no debug logs | + three small fixes | hand-written floor |
| --- | --- | --- | --- | --- |
| export `u32 -> u32` | 1492 | 1334 (1.12×) | 797 (1.87×) | 13 |
| export `f64 -> f64` | 1563 | 1492 (1.05×) | 858 (1.82×) | — |
| export `string -> string` | 7720 | 6927 (1.11×) | 6382 (1.21×) | — |
| export `list<u8> -> list<u8>` | 8428 | 7832 (1.08×) | 6772 (1.24×) | — |
| export record round trip | 5764 | 5004 (1.15×) | 4396 (1.31×) | — |
| export tuple swap | 5597 | 4926 (1.14×) | 4262 (1.31×) | — |
| guest makes 39 numeric host imports | 265810 | 244057 (1.09×) | 183950 (1.45×) | 4636 (case run alone) |
| guest makes 2 string host imports | 26602 | 22664 (1.17×) | 19929 (1.33×) | — |

Notes on the columns:

- **main** is 54a3df51.
- **no debug logs** removes all 278 `debugLog` statements from the runtime
  and 420 `_debugLog` statements from the bindings, which is what a `DEBUG:` label pass would do.
- **three small fixes** are the measured items of option 1, on top of debug stripping.
- **floor** is a hand-edited wrapper that calls the core export directly with only the numeric conversion.
  It drops trap, reentrance and borrow checks, so it is an upper bound, not a target.
- The import floor was measured with that case run alone,
  where the comparable baseline is about 78,000 ns rather than 184,000. The real gap is about 17×.

Caveats:

- The experiments were edits to copies of the runtime's built `dist`, not source changes.
  They passed the fixtures' guest-side assertions; the runtime's vitest suite was not run against them.
- Only sync P2 calls were measured. No P3 async, stream, future or resource cases yet.
- Timings vary 2–3× when the machine is loaded; all numbers above are from idle runs.

### Where a scalar export spends its time

A sync `u32 -> u32` export called from the host currently does, per call:

- allocate an `AsyncTask` (about 45 private fields, 5 arrays, 2 promises plus a `.then`);
- allocate an `AsyncThread` and insert it into the component's thread table;
- register the task in the resource-scope map and the per-component task lists;
- allocate an options object, a `getCallbackFn` closure,
  and two nested `_withGlobalCurrentThreadMeta` argument objects with closures;
- write a `WebAssembly.Global` (`CURRENT_TASK_MAY_BLOCK`);
- tear all of it down again, with three `Array.splice` calls and a `filter`.

Self time in a long profile after the lazy-promise change:
the wrapper itself 20%, `clearCurrentThread` 18%, `AsyncTask` constructor 13%,
`createNewCurrentImplicitThread` 9%, `validateResourceBorrowScope` 8%, garbage collection 8%.

A sync host import goes through `lowerImportBackwardsCompat`
(rest parameters, a subtask, call metadata), then a second trampoline
that creates a host task and thread before reaching the host function.

## Options

Ordered roughly by payoff per effort.

### 1. Small runtime fixes

Implemented, except the BigInt item: 1.02–1.53× on their own (see Status).
In the experiments: 1.2–1.9× combined with debug stripping. Each is a few lines.

- **Pop instead of splice in `clearCurrentThread`.**
  The task being cleared is almost always the last entry of `tasks`, `taskIds` and `componentIdxs`.
  Measured 1.5× on scalar exports, 1.16–1.27× on the others, nothing on imports.
- **Create task promises on demand.**
  `AsyncTask` builds the completion and exit promises eagerly; sync tasks never read them.
  Measured 1.26× on scalar exports, 1.02–1.13× elsewhere.
  Needs care around unhandled-rejection marking and `stop()`.
- **A dedicated register slot for host tasks.**
  Host tasks index the registers object with `-1`, which is not an array index.
  Measured about 1.1× on imports, close to noise.
- **Number task IDs instead of BigInt.** Measured: no gain. Not worth doing for speed.

Not measured, same flavour: skip the `{ ...value }` copy in `getCurrentTaskMeta`,
allocate the task's arrays lazily, call `validateResourceBorrowScope` once instead of in both
`resolve` and `exit`, register in the resource-scope map only when a borrow is taken.

### 2. `DEBUG:` label stripping

Measured: 1.05–1.17×.

- Label debug statements in the runtime source (`DEBUG: debugLog(...)`);
  TypeScript needs `allowUnusedLabels`.
- Strip in the existing oxc pass in `embedded_runtime.rs`, driven by a transpile option.
- The `_debugLog` calls that `js-component-bindgen` emits into bindings need labels too (420 in the four fixtures).
- For external-runtime users, a `production` export condition pointing at a pre-stripped `dist`
  avoids needing a bundler plugin at all; `rolldown-plugin-jco` could offer the same pass.

V8 already removes most of the cost of a disabled logger in optimized code,
which is why the gain is modest. It also shrinks output.

### 3. `SAFETY:` labels for invariant checks

Not measured. Expected: a few percent.

Candidates: `validate(args)` in `task-context.ts`, `typeof` checks in setters,
`#checkThreadExit`, the repeated `validateResourceBorrowScope`, argument presence checks.
Scalar calls are dominated by allocation and teardown rather than checks,
so this matters more once options 4 and 5 land.

### 4. Sync fast path for exports

Not prototyped. Floor: 13 ns against 797 ns after the small fixes, so up to about 60×.

A sync-lifted export called from the host only needs what is observable:
the trap and reentrance checks, a current-task identity for nested imports and context slots,
and borrow-scope accounting when the signature has borrows.
A lightweight sync task record would replace the full task, thread, promises and list bookkeeping.
This is a design change and the largest single lever for P2 components.

### 5. Sync fast path for host imports

Not prototyped. Floor: about 17× (case run alone).

A sync-lowered call to a sync host function needs a `may_leave` check, the call, and lift/lower.
The subtask, the host task and thread, and the second trampoline can all go for that case.

### 6. Leaner generated wrappers

Implemented in part. 1.07–1.20× on exports, nothing on imports.

Done:

- A sync export calls its core function directly.
  It had installed its task a second time around that call,
  although nothing can suspend between the body's own install and the call.
- No `getCallbackFn: () => null` closure for functions without a callback.
- No `if (null !== null)` return-memory block where there is no memory.
- A result is converted once for both the task and the caller.

Not done:

- Hoisting the static options object out of the call.
- The same single install for async exports, which can suspend during argument lowering.
- Slimming the import path: `lowerImportBackwardsCompat` and the second trampoline
  still create a subtask, a host task and a thread for each sync host call.
  That is the import side of options 4 and 5.

Moving the per-call protocol into one runtime helper would also shrink bindings:
`strings.js` is 141 KB before the runtime.

### 7. Straight-line lift and lower

The premise was wrong for sync calls, and the real costs were elsewhere.

Sync exports and sync host imports already lift and lower with straight-line generated code.
`paramLiftFns` and `resultLowerFns` are built once when the module loads.
`resultLowerFns` is called only when an async-lowered import writes its result through a pointer;
`paramLiftFns` is not read by the runtime at all.
Replacing them is P3 work that the fixtures available here cannot measure.

What profiles of the string and list cases did show, now fixed:

- **UTF-16 string lowering** called a closure per code unit
  and spread the string into an array to count code points. 1.27× on the string export.
- **List lowering from a plain array** emitted `check.bind(null, 'u8')(v)` inside the element loop.
  About 1.2–1.4× for a 64-element array (`list-array.mjs`; a `Uint8Array` takes the copy path and is unaffected).

Still open, small: `memory.buffer` and a fresh `DataView` per access,
the `mayLeave` setter around realloc, the redundant `(() => memory0)()`.

### 8. Share classes across component instances

Implemented. Confirmed as the largest single effect: 2–4× once a process holds two instances.

`initialize*Class(context)` defined a class per store.
V8 shares feedback between the closures made from one function body,
but each class had its own private names, so with two stores alive
no `#private` access in the shared methods could be cached.
Constructing and reading a field was about 80× slower in a microbenchmark.

Nanoseconds per call on the first instance as further instances are created (`sharing.mjs`):

| | 1 instance | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| export, before | 1142 | 5218 | — | — |
| export, after | 864 | 903 | 816 | 863 |
| 39 imports, before | 85000 | 311000 | — | — |
| 39 imports, after | 77098 | 83224 | 72833 | 74050 |

The task, thread, subtask, rep-table, waitable and component-state classes are now defined once
and take their context as a constructor argument; each store gets a small constructor function
that keeps its own statics and `instanceof`.

Bundled runtimes had the same problem in `instantiate` mode, where the linker wrapped
the whole runtime in a function called per instance (853 ns, then 4614 ns from the second instance).
The linker now keeps one runtime per debug setting (835–970 ns across five instances).

## Suggested order

1. Build the Rust test components and run the P3 tests against this branch.
2. Land the `DEBUG:` pass (option 2).
3. Hoist the remaining per-store class factories (rest of option 8).
4. Design options 4 and 5 together, with the import half of option 6 as the bindings side.
5. Revisit option 3 with fresh profiles once the fast paths exist.

## Open decisions

- Label names, and whether the strip pass lives in `js-component-bindgen`, `jco-transpile`, or both.
- Whether to ship a pre-stripped runtime behind an export condition.
- Semantics of on-demand task promises.
- How much of the task model a sync fast path may skip while staying faithful to the Canonical ABI.

## Reproducing

The harness is in `packages/jco-transpile/bench/perf-experiments/`; see its `README.md`.
`crates/js-component-bindgen/examples/transpile.rs` transpiles natively,
without building the Wasm bindgen component.
