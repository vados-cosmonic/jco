# Initial bundled runtime findings

Measured on Linux x64, Node v24.21.0, Rolldown 1.2.13,
Rollup 4.64.1 and Oxc 0.151.0.
The runtime is the implementation stacked on host-intrinsics commit 678ac430
(166/274 variants externalized), not a completed future implementation.
See [baseline.json](baseline.json) for all 50 size/performance observations and
[README.md](README.md) for methodology, budgets, workload coverage and limitations.

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
