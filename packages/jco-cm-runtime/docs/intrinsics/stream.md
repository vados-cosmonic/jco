# Stream contract

Stream constructors preserve shared pending-buffer records, inherited copy state,
private brands and selected symbol keys. The queue keeps pending chunks and its
in-flight source read in the selected store. Nonempty transfers, host injection,
cancellation, transfer and drop use named operations. Host disposal preserves an
already-published event for an in-flight read through `allowPendingEvent`.

The public `intrinsics/stream` subpath and standalone `StreamModule` contract
cover all 26 variants. Inline remains the production default. Complete-build
integration and performance assessment follow the completed family conversions.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
