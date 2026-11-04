# Preview 3 component fixtures

The CLI and HTTP handler fixtures in `cli`, `clocks`, `fs`, `http`, `random`, and
`sockets` are built from Wasmtime's `crates/test-programs` at the repository's
pinned revision, `90fed3c6adf53f112c4dea56851728557bb73799`.
The IP name lookup program uses its earlier source revision,
`f10f708c0412b94faadfcf8d9594acd8156d68e6`, to preserve the existing fixture's
assertions and imports. The later source adds DNS timeouts and clock imports.

Their pinned `wit-bindgen` 0.58 runtime cancels its internal wakeup stream before
removing that stream from its waitable set. The current Canonical ABI traps when
synchronous cancellation uses an endpoint that belongs to a waitable set.
The fixture build backports the ordering fix present in `wit-bindgen` 0.63:
remove the wakeup stream from its set before cancelling its pending read.
This preserves the fixtures' original WIT interfaces and test program behavior.

The TCP stream cancellation test also handles EOF reported by its zero-length
readiness read. It validates the empty buffer and readiness status before
continuing or stopping at EOF, while retaining the byte-by-byte data checks,
cancellation bound, and final expected byte count. Issuing another read after
that EOF notification would correctly trap.

Regenerate the refreshed binaries with `scripts/refresh-p3-sdk-fixtures.py`.
The script pins the upstream sources and applies the SDK patch before building
and componentizing the fixtures. These programs use the Preview 1 reactor
adapter in `packages/jco/lib`, retaining their WASI 0.2.12 imports. The build
checks the public WIT interface against the existing fixture, ignoring only
declaration order and preserving ordered type members.

The recipe also refreshes 17 ported async components under `backpressure`,
`general`, `round-trip`, and `streams`. Historical backpressure source and WIT
pins retain the original exports. Each component keeps its original WASI version:
0.2.6 uses the pinned adapter provider 40.0.2, while 0.2.12 uses the repository
adapters. Source hashes, historical file overrides, compiler/tool versions, and
all 61 output mappings are recorded in `scripts/fixtures/p3_sdk/manifest.json`.
The checked-in dependency lock retains the original upstream crate versions.

Runtime waitable exclusion checks remain
unchanged; the component-model WAST suite independently tests their traps.

Test the recipe's WIT surface comparison with:

```sh
python3 -m unittest discover -s scripts/fixtures/p3_sdk/test -p '*.py'
```
