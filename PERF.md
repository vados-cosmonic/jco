# Performance options for generated bindings under Node.js + V8

> Working notes for the `perf/label-stripping` branch.
> Remove this file before opening the pull request.

Scope: the glue between JavaScript and core Wasm, for both P2 and P3.
Changes target the external runtime (`packages/jco-cm-runtime`) and the bindings that call it;
the inline intrinsics in `js-component-bindgen` are to be replaced by the bundled external runtime.

## Summary

- Stripping every debug log buys 5–17%.
- Three small runtime fixes plus debug stripping give 1.2–1.9×.
- Per-call task bookkeeping costs roughly 100× a direct call on scalar exports,
  and about 17× on sync host imports. Sync fast paths are where the headroom is.

## Measurements

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

Measured: 1.2–1.9× combined with debug stripping. Each is a few lines.

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

Measured: 1.11× on one hand-edited export.

- Hoist the static options object out of the call.
- Drop the `getCallbackFn: () => null` closure.
- Replace the two nested `_withGlobalCurrentThreadMeta` closures with one inlined register window.
- Drop dead code such as `if (null !== null) { ... }` and the duplicated result conversion in import trampolines.

Moving the per-call protocol into one runtime helper would also shrink bindings:
`strings.js` is 141 KB before the runtime.

### 7. Straight-line lift and lower

Not measured in isolation.

Record and string round trips cost 3.5–5.5 µs beyond the scalar path.
Imports pass `paramLiftFns` and `resultLowerFns` arrays of bound functions that are interpreted per call;
generated straight-line code would let V8 inline them.
Related small items seen in profiles: `memory.buffer` read per call, the `mayLeave` setter around realloc.

### 8. Share classes across component instances

Inferred, not confirmed. Up to about 2.7×.

The same import case ran in 78 µs alone and 210 µs after the other three fixtures had run in the process.
The likely cause is that `initialize*Class(context)` creates a distinct `AsyncTask` class per component,
so shared runtime functions become megamorphic. Not confirmed with inline-cache traces.

## Suggested order

1. Land the fixes in option 1; they are tiny and give more than stripping.
2. Land the `DEBUG:` pass (option 2).
3. Design options 4 and 5 together, with option 6 as the bindings side of the same work.
4. Revisit options 3, 7 and 8 with fresh profiles once the fast paths exist.

## Open decisions

- Label names, and whether the strip pass lives in `js-component-bindgen`, `jco-transpile`, or both.
- Whether to ship a pre-stripped runtime behind an export condition.
- Semantics of on-demand task promises.
- How much of the task model a sync fast path may skip while staying faithful to the Canonical ABI.

## Reproducing

The harness is in `packages/jco-transpile/bench/perf-experiments/`; see its `README.md`.
`crates/js-component-bindgen/examples/transpile.rs` transpiles natively,
without building the Wasm bindgen component.
