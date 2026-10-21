# Why external runtime bundles are larger and slower to start

The measured gap is primarily a difference in the code retained and the work
performed at store creation. Rolldown already combines the runtime's ESM modules
into one chunk. It does not turn `runtime.create(options).intrinsics` into the
same small selection of declarations emitted by inline bindgen.

The relevant distinction is **startup versus warm calls**. Repeated call
throughput remains close for these workloads. Larger source raises parsing cost;
eager factories, namespace objects, closures and scratch storage add startup
work. This investigation does not show that the canonical ABI operations are
uniformly slower when implemented in TypeScript.

## Reproduce

Use the same transpiler/runtime/fixture build prerequisites as the
[parent benchmark](../README.md), then run from the repository root:

```sh
pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:investigate
```

The command runs separately from the regression gate and normal CI suites.
It writes `summary.md`, `summary.json`, all raw samples, readable and minified
bundles, module/factory retention reports, and the minimal reproducer's output
under `packages/jco-transpile/bench/output/external-runtime-investigation`.
`JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT` overrides that directory.
Vitest filters are supported; filtered runs write individual reports and do not
publish a complete summary. Failed runs also leave no complete summary.

Seven experiments run on each of adder, flavorful, and an async component. Each
uses three fresh child processes, each taking nine alternating inline/external
sample pairs. The experiments all verify known workload answers and timed
checksums. Both modes use each experiment's bundler settings. Allocation traces
run in separate instrumented processes and are excluded from timing samples.

These are diagnostic experiments, **not production optimizations**. Omitting
namespace exports, validation, or receivers changes the general provider
contract; assuming pure property/global reads can change getter/error behavior.
Those transformations exist only in the diagnostic bundler plugin. Production
runtime code, defaults, and the reviewed regression baseline remain unchanged.

## Bundler configuration is not the main cause

The default benchmark resolves the full runtime, honors its published
`sideEffects: false`, enables tree shaking and minification, and requires one
complete ESM chunk. An unused runtime import disappears. The readable adder
bundle contains ordinary adjacent factory declarations: there are no CommonJS
wrappers or unresolved CM-runtime imports accounting for its extra weight.

For adder:

| Experiment                         | Inline JS bytes | External JS bytes | What it isolates                    |
| ---------------------------------- | --------------: | ----------------: | ----------------------------------- |
| Current settings                   |          40,671 |           102,064 | Complete bundled implementations    |
| Assume pure property/global reads  |          40,671 |           102,064 | Aggressive tree-shaking assumptions |
| Three more Oxc minification passes |          40,495 |           101,664 | Additional whole-chunk compression  |
| Omit unused namespaces             |          40,671 |            78,524 | Closed-world namespace selection    |
| Omit generated provider checks     |          40,671 |           100,876 | Validation branches and diagnostics |
| Omit generated receiver binding    |          40,671 |           102,004 | Generated `.bind(receiver)` calls   |
| Define `JCO_DEBUG` as false        |          35,738 |           102,008 | Constant-folded debug logging       |

Extra compression saves under 0.5%; pure-read assumptions produce identical
adder output. Dropping validation saves 1,188 bytes; dropping generated receiver
binding saves 60 bytes. Neither explains the 61,393-byte default size gap.
These controls do not establish that every possible optimizer setting is
ineffective, but they rule out these straightforward configuration explanations.

## The factory boundary prevents property elimination

[shapes.test.ts](shapes.test.ts) reduces the problem to a tiny imported module:

```js
export function used(x) {
    return x + 1;
}
export function unused() {
    throw new Error('UNUSED_INTRINSIC');
}
export function make() {
    return { used, unused };
}
```

An entry importing only `used` can discard `unused`. An entry importing `make`
and returning `make().used` retains the unused member with the measured
optimizers. Binding that member to its namespace is not required to reproduce
the retention. The probe records emitted code and verifies equivalent results;
it does not fail if a future optimizer learns to eliminate the unused member.

The real runtime repeats this pattern across interconnected factories. Bindgen
selects **six direct members in four namespaces** for adder, but
[runtime.ts](../../../../jco-cm-runtime/src/runtime.ts) constructs and returns
all eleven namespaces. Those factories return entire method tables and capture
other tables/options in closures. Removing an ESM import boundary does not
remove these function calls or specialize their returned objects.

The unused-namespace experiment preserves dependencies needed by the selected
namespaces, including resource state and waitable classes. It removes unrequested
public namespaces and the unused host/waitable factory calls. It saves 23,540 raw
bytes, 6,416 gzip bytes and 5,417 Brotli bytes for adder. The remaining 78,524 bytes
are still far above inline's 40,671: the retained factories continue to expose
broad method tables and generic option handling. Namespace-level selection alone
is insufficient.

The unminified adder bundle's largest factory is `createAsyncTaskIntrinsics`
(67,648 bytes), followed by `createHostIntrinsics` (21,847) and
`createComponentIntrinsics` (20,700). These are readable-source spans for
attribution, not additive compressed-size estimates. Host intrinsics are present
even though adder never requests them.

## Startup does additional work

Separate instrumented adder instantiations recorded:

| Operation during one store's initialization | Inline | External | External with unused namespaces omitted |
| ------------------------------------------- | -----: | -------: | --------------------------------------: |
| Factories beneath `createRuntime`           |      0 |       15 |                                       9 |
| `Map` construction                          |      7 |       10 |                                       9 |
| `TextDecoder` construction                  |      0 |        2 |                                       0 |
| `TextEncoder` construction                  |      0 |        1 |                                       0 |
| Bitcast typed arrays (i32/f32/i64/f64)      |      0 |        4 |                                       4 |
| Endianness-check typed arrays (u16/u8)      |      0 |        4 |                                       2 |
| `DataView` construction                     |      0 |        1 |                                       0 |
| `Function.prototype.bind` calls             |      0 |       13 |                                      11 |
| `WebAssembly.Global` construction           |      1 |        1 |                                       1 |

The string codecs and bitcast storage are unnecessary for a u32 adder. Factory
and method-table construction also creates classes, functions and objects that
this constructor counter does not enumerate. These counts demonstrate actual
extra work; they are not a complete allocation profile or a per-operation time
attribution. Wasm compilation and host import setup happen before the trace.

## Debug logging is a separate optimization opportunity

The explicit Rolldown define used here is:

```js
export default {
    transform: { define: { 'globalThis.process.env.JCO_DEBUG': 'false' } },
};
```

It reduces inline adder by 4,933 bytes but external adder by only 56 bytes.
The external log function becomes empty, yet calls to callbacks passed through
factories, their arguments and debug strings remain in the bundle. Inline's
local no-op calls are much easier to eliminate. For adder and flavorful,
disabling the runtime environment lookup reduced measured warm-call time in both modes by
about 40%; the timer-heavy async case changed little. This does not close the
startup or transfer-size gap. This setting intentionally removes the
ability to enable debug logging dynamically.

## Measured comparisons

Recorded on Linux x64, Node v24.21.0, Rolldown 1.2.13, Rollup 4.64.1 and
Oxc 0.151.0. The runtime is unchanged from host-intrinsics commit `678ac430`
(166/274 intrinsic variants externalized); the parent benchmark relocation is
`11f17e35`. The full component experiments use Rolldown; both bundlers run
the small factory-property reproducer. Numbers below are external / inline.

| Case      | Experiment             | Inline JS | External JS | Parse | Instantiate |  Call |
| --------- | ---------------------- | --------: | ----------: | ----: | ----------: | ----: |
| adder     | default                |     40671 |      102064 | 2.02× |       2.32× | 1.02× |
| adder     | pure-reads             |     40671 |      102064 | 2.10× |       2.33× | 0.98× |
| adder     | extra-minification     |     40495 |      101664 | 2.24× |       2.41× | 1.04× |
| adder     | debug-disabled         |     35738 |      102008 | 2.08× |       2.15× | 1.02× |
| adder     | omit-unused-namespaces |     40671 |       78524 | 1.67× |       1.92× | 0.99× |
| adder     | omit-binding-checks    |     40671 |      100876 | 2.13× |       2.41× | 0.99× |
| adder     | omit-receiver-binding  |     40671 |      102004 | 2.20× |       2.30× | 1.02× |
| flavorful | default                |    182293 |      242156 | 1.26× |       1.21× | 1.01× |
| flavorful | pure-reads             |    181824 |      241690 | 1.33× |       1.24× | 1.02× |
| flavorful | extra-minification     |    181605 |      241276 | 1.24× |       1.23× | 0.99× |
| flavorful | debug-disabled         |    162886 |      242100 | 1.36× |       1.24× | 1.02× |
| flavorful | omit-unused-namespaces |    182293 |      220765 | 1.19× |       1.17× | 0.98× |
| flavorful | omit-binding-checks    |    182293 |      236877 | 1.29× |       1.23× | 1.00× |
| flavorful | omit-receiver-binding  |    182293 |      241880 | 1.23× |       1.20× | 0.96× |
| async     | default                |     58067 |      107969 | 1.53× |       1.80× | 1.04× |
| async     | pure-reads             |     58067 |      107969 | 1.73× |       1.80× | 1.00× |
| async     | extra-minification     |     57875 |      107553 | 1.66× |       1.80× | 0.96× |
| async     | debug-disabled         |     50413 |      107913 | 1.63× |       1.79× | 1.01× |
| async     | omit-unused-namespaces |     58067 |       96622 | 1.41× |       1.56× | 0.97× |
| async     | omit-binding-checks    |     58067 |      105254 | 1.61× |       1.76× | 1.00× |
| async     | omit-receiver-binding  |     58067 |      107777 | 1.55× |       1.72× | 0.99× |

The table reports medians of three independent median paired ratios. Per-run
ranges and all raw samples are in the generated JSON. Small differences in warm
calls are noisy; ratios near 1 should not be read as precise speedup claims.
Evaluation remains a small, noisy part of the total and is included in JSON.
No browser-engine or end-to-end network/cold-process claim is made.

## Next implementation steps

1. Prototype static linking for the built-in provider: expose selectable ESM
   operations with explicit per-store state, and have codegen import the required
   dependency set. Keep the general `runtime.create` API and custom-provider
   semantics. Named ESM exports give the optimizers a demonstrably effective
   elimination boundary; moving whole factories into more files would not.
2. Defer codecs, scratch buffers and unrelated namespace initialization. Check
   store isolation, getter/override behavior and constructor identity. Laziness
   can reduce startup work even if it does not reduce downloaded code.
3. Make production debug removal visible across intrinsic calls. Validate both
   disabled logging and dynamically enabled logging rather than assuming every
   exported callback can safely be marked pure.
4. Run the unchanged baseline and parity gates, including the multi-component
   portfolio and Brotli, for each candidate. More inlining/specialization may
   trade away sharing; a small standalone improvement is not the whole result.

Removing provider validation or receiver semantics is not justified by the
measured savings. No tested bundler configuration brings the current default
provider to parity; the next experiment should change the shape of the runtime's
static dependency graph while preserving its public contract.
