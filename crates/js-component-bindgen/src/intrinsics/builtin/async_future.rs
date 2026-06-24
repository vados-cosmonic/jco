use std::fmt::Write;

use crate::intrinsics::{
    AsyncFutureIntrinsic, AsyncTaskIntrinsic, ComponentIntrinsic, Intrinsic, RenderIntrinsicsArgs,
};
use crate::source::Source;
use crate::uwriteln;

impl super::BuiltinIntrinsicRenderer {
    /// Render a [`AsyncFutureIntrinsic`]
    pub(crate) fn render_async_future(
        &self,
        intrinsic: &AsyncFutureIntrinsic,
        output: &mut Source,
        _args: &RenderIntrinsicsArgs,
    ) {
        match intrinsic {
            AsyncFutureIntrinsic::GlobalFutureMap => {
                let global_future_map = AsyncFutureIntrinsic::GlobalFutureMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    r#"
                    const {global_future_map} = new {rep_table_class}({{ target: 'global future map' }});
                    "#
                ));
            }

            AsyncFutureIntrinsic::NestedFutureSymbol => {
                let nested_future_symbol = intrinsic.name();
                output.push_str(&format!(
                    r#"
                    const {nested_future_symbol} = Symbol.for('nested-future');
                    "#
                ));
            }

            AsyncFutureIntrinsic::GlobalFutureTableMap => {
                let global_future_table_map = AsyncFutureIntrinsic::GlobalFutureTableMap.name();
                output.push_str(&format!(
                    r#"
                    const {global_future_table_map} = {{}};
                    "#
                ));
            }

            // The host future class is used exclusively *inside* the host implementation,
            // to represent future that have been lifted (or originated) external to a given
            // component.
            //
            // For example, after a component-internal future is lifted from a component (normally
            // by way of returning it from a function), that future will have been made into a host
            // future, and *may* give actual end users access via the `createUserFuture()` function.
            //
            // At present since futures can only give away the read-end, this usually means that the
            // host future will be used to often give away the *read* end.
            //
            AsyncFutureIntrinsic::HostFutureClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let host_future_class_name = intrinsic.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(
                    r#"
                    class {host_future_class_name} {{
                        #componentIdx;
                        #futureEndWaitableIdx;
                        #futureTableIdx;

                        #payloadLiftFn;
                        #payloadLowerFn;

                        #userFuture;

                        #rep = null;

                        constructor(args) {{
                            {debug_log_fn}('[{host_future_class_name}#constructor()] args', args);
                            if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.payloadLiftFn) {{ throw new TypeError("missing payload lift fn"); }}
                            this.#payloadLiftFn = args.payloadLiftFn;

                            if (!args.payloadLowerFn) {{ throw new TypeError("missing payload lower fn"); }}
                            this.#payloadLowerFn = args.payloadLowerFn;

                            if (args.futureEndWaitableIdx === undefined) {{ throw new Error("missing future idx"); }}
                            if (args.futureTableIdx === undefined) {{ throw new Error("missing future table idx"); }}
                            this.#futureEndWaitableIdx = args.futureEndWaitableIdx;
                            this.#futureTableIdx = args.futureTableIdx;
                        }}

                        setRep(rep) {{ this.#rep = rep; }}
                        getFutureEndWaitableIdx() {{ return this.#futureEndWaitableIdx; }}

                        createUserFuture() {{
                           if (this.#userFuture) {{ return this.#userFuture; }}
                           if (this.#rep === null) {{ throw new Error("unexpectedly missing rep for host future"); }}

                           const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                           if (!cstate) {{ throw new Error(`missing async state for component [${{this.#componentIdx}}]`); }}

                           const futureEnd = cstate.getFutureEnd({{
                               tableIdx: this.#futureTableIdx,
                               futureEndWaitableIdx: this.#futureEndWaitableIdx
                           }});
                           if (!futureEnd) {{
                               throw new Error(`missing future [${{this.#futureEndWaitableIdx}}] (table [${{this.#futureTableIdx}}], component [${{this.#componentIdx}}]`);
                           }}
                           if (futureEnd.isInSet()) {{ throw new Error('trap: futures in waitable sets cannot be lifted'); }}

                            return futureEnd.promise();
                        }}
                    }}
                    "#
                ));
            }

            AsyncFutureIntrinsic::FutureEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_end_class = AsyncFutureIntrinsic::FutureEndClass.name();

                uwriteln!(
                    output,
                    r#"
                    class {future_end_class} {{
                        static CopyResult = {{
                            COMPLETED: 0,
                            DROPPED: 1,
                            CANCELLED: 2,
                        }};

                        static CopyState = {{
                            IDLE: 1,
                            SYNC_COPYING: 2,
                            ASYNC_COPYING: 3,
                            CANCELLING_COPY: 4,
                            DONE: 5,
                        }};

                        #pendingBufferMeta;
                        #waitable;
                        #copyState = {future_end_class}.CopyState.IDLE;

                        #dropped = false;

                        constructor(args) {{
                            {debug_log_fn}('[{future_end_class}#constructor()] args', args);

                            if (!args.pendingBufferMeta) {{ throw new Error("missing pending buffer"); }}
                            this.#pendingBufferMeta = args.pendingBufferMeta;

                            if (!args.waitable) {{ throw new Error("missing pending buffer"); }}
                            this.#waitable = args.waitable;
                        }}

                        getWaitable() {{ return this.#waitable; }}
                        setWaitable(w) {{ this.#waitable = w; }}

                        setCopyState(state) {{ this.#copyState = state; }}
                        getCopyState() {{ return this.#copyState; }}

                        isDoneState() {{ return this.getCopyState() === {future_end_class}.CopyState.DONE; }}
                        isCancelledState() {{ return this.getCopyState() === {future_end_class}.CopyState.CANCELLED; }}
                        isIdleState() {{ return this.getCopyState() === {future_end_class}.CopyState.IDLE; }}

                        isCopying() {{
                            switch (this.#copyState) {{
                                case {future_end_class}.CopyState.IDLE:
                                case {future_end_class}.CopyState.DONE:
                                    return false;
                                    break;
                                case {future_end_class}.CopyState.SYNC_COPYING:
                                case {future_end_class}.CopyState.ASYNC_COPYING:
                                case {future_end_class}.CopyState.CANCELLING_COPY:
                                    return true;
                                    break;
                                default:
                                    throw new Error('invalid/unknown copying state');
                            }}
                        }}

                        setPendingBufferMeta(args) {{
                            const {{ componentIdx, buffer, onCopyDoneFn }} = args;
                            this.#pendingBufferMeta.componentIdx = componentIdx;
                            this.#pendingBufferMeta.buffer = buffer;
                            this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
                        }}

                        resetPendingBufferMeta() {{
                            this.setPendingBufferMeta({{ componentIdx: null, buffer: null, onCopyDoneFn: null }});
                        }}

                        getPendingBufferMeta() {{ return this.#pendingBufferMeta; }}

                        resetAndNotifyPending(result) {{
                            const f = this.#pendingBufferMeta.onCopyDoneFn;
                            this.resetPendingBufferMeta();
                            if (f) {{ f(result); }}
                        }}

                        setPendingEvent(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{future_end_class}#setPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            this.#waitable.setPendingEvent(fn);
                        }}

                        hasPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitable.hasPendingEvent();
                        }}

                        isInSet() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitable.isInSet();
                        }}

                        getPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{future_end_class}#getPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            const event = this.#waitable.getPendingEvent();
                            return event;
                        }}

                        isDropped() {{ return this.#dropped; }}

                        drop() {{
                            if (this.#dropped) {{ throw new Error('future already dropped'); }}

                            if (this.#pendingBufferMeta.buffer) {{
                                if (!pendingBufferMeta.buffer.isWritable()) {{
                                    throw new Error('non-writable pending buffer during drop (reader blocked)');
                                }}
                                this.resetAndNotifyPending({future_end_class}.CopyResult.DROPPED);
                            }}

                            this.#dropped = true;
                        }}

                    }}
                "#
                );
            }

            AsyncFutureIntrinsic::FutureReadableEndClass
            | AsyncFutureIntrinsic::FutureWritableEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let (class_name, _future_var_name, _js_future_var_type) = match intrinsic {
                    AsyncFutureIntrinsic::FutureReadableEndClass => {
                        (intrinsic.name(), "promise", "Promise")
                    }
                    AsyncFutureIntrinsic::FutureWritableEndClass => {
                        (intrinsic.name(), "resolve", "Function")
                    }
                    _ => unreachable!(),
                };
                let future_end_class = AsyncFutureIntrinsic::FutureEndClass.name();
                let global_buffer_mgr = Intrinsic::GlobalBufferManager.name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();

                // Generate the inner read/write logic necessary for eitther kind of write end
                // this will be called internally (usually during guest reads), via places like
                // `Instruction::FutureRead`/`Instruction::FutureWrite`
                let (_inner_rw_fn_name, inner_rw_fn) = match intrinsic {
                    AsyncFutureIntrinsic::FutureReadableEndClass => (
                        "_read",
                        format!(
                            r#"
                          async _read(args) {{
                              const {{ buffer, onCopyDoneFn, componentIdx }} = args;
                              if (!buffer) {{ throw new Error('missing buffer for future read'); }}

                              if (this.isDropped()) {{ throw new Error('cannot read from dropped future'); }}
                              if (buffer.remaining() !== 1) {{
                                  throw new Error(`invalid remaining values in buffer (expecetd one, received [${{buffer.remaining()}}]`);
                              }}

                              const meta = this.getPendingBufferMeta();
                              if (!meta) {{ throw new Error("missing pending buffer metadata"); }}
                              if (!meta.buffer) {{
                                  this.setPendingBufferMeta({{
                                      buffer,
                                      componentIdx,
                                      onCopyDoneFn,
                                  }});
                                  return;
                              }}

                              if (componentIdx === meta.componentIdx && componentIdx !== -1 && !this.#elemMeta.isNoneOrNumberType) {{
                                  throw new Error('same-component future reads not allowed for non-numeric types');
                              }}

                              buffer.write(meta.buffer.read(1));
                              this.resetAndNotifyPending({future_end_class}.CopyResult.COMPLETED);
                              onCopyDoneFn({future_end_class}.CopyResult.COMPLETED);
                          }}
                        "#,
                        ),
                    ),

                    AsyncFutureIntrinsic::FutureWritableEndClass => (
                        "_write",
                        format!(
                            r#"
                          async _write(args) {{
                              const {{ buffer, onCopyDoneFn, componentIdx }} = args;
                              if (!buffer) {{ throw new Error('missing buffer for future write'); }}

                              if (buffer.remaining() !== 1) {{
                                  throw new Error("invalid remaining capacity for pending buffer");
                              }}

                              if (this.isDropped()) {{
                                  onCopyDoneFn({future_end_class}.CopyResult.DROPPED);
                                  return;
                              }}

                              const meta = this.getPendingBufferMeta();
                              if (!meta) {{ throw new Error("missing pending buffer metadata"); }}
                              if (!meta.buffer) {{
                                  this.setPendingBufferMeta({{
                                      buffer,
                                      onCopyDoneFn,
                                  }});
                                  return;
                              }}

                              if (componentIdx === meta.componentIdx && componentIdx !== -1 && !this.#elemMeta.isNoneOrNumberType) {{
                                  throw new Error('same-component future writes not allowed for non-numeric types');
                              }}

                              meta.buffer.write(buffer.read(1));
                              this.resetAndNotifyPending({future_end_class}.CopyResult.COMPLETED);
                              onCopyDoneFn({future_end_class}.CopyResult.COMPLETED);
                          }}
                        "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                // Read/Write function that is called when a component (guest) is performing the read/write
                let (_guest_rw_fn_name, guest_rw_fn) = match intrinsic {
                    AsyncFutureIntrinsic::FutureReadableEndClass => (
                        "guestRead",
                        format!(
                            r#"
                              // TODO: rename, guestRead also handles host reads (when data is present)...
                              async guestRead(args) {{
                                  {debug_log_fn}('[{class_name}#guestRead()] args', args);
                                  const {{
                                      componentIdx,
                                      stringEncoding,
                                      memory,
                                      realloc,
                                      ptr,
                                      data,
                                  }} = args;

                                  if (this.#elemMeta.stringEncoding === undefined && stringEncoding) {{
                                      this.#elemMeta.stringEncoding = stringEncoding;
                                  }}

                                  if (args.getReallocFn && this.#elemMeta.getReallocFn === undefined) {{
                                     this.#elemMeta.getReallocFn = args.getReallocFn;
                                  }}

                                  const elemMeta = this.#elemMeta;

                                  if (this.#elemMeta.isBorrowed) {{
                                      throw new Error('cannot call future.read on a borrow');
                                  }}

                                  let buffer = args.buffer;
                                  if (!buffer) {{
                                      const createBufferRes = {global_buffer_mgr}.createBuffer({{
                                          componentIdx,
                                          memory,
                                          realloc,
                                          start: ptr,
                                          data,
                                          count: 1,
                                          isReadable: this.isWritable(),
                                          isWritable: this.isReadable(),
                                          elemMeta: this.#elemMeta,
                                      }});
                                      buffer = createBufferRes.buffer;
                                  }}

                                  const futureEvent = (res) => {{
                                      if (buffer.remaining() === 0) {{
                                          if (res !== {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected zero remaining post-completion');
                                          }}
                                      }} else {{
                                          if (res === {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected 1 remaining post-completion');
                                          }}
                                      }}
                                      if (res === {future_end_class}.CopyResult.DROPPED || res === {future_end_class}.CopyResult.COMPLETED) {{
                                          this.setCopyState({future_end_class}.CopyState.DONE);
                                      }} else {{
                                          this.setCopyState({future_end_class}.CopyState.IDLE);
                                      }}
                                      return {{ code: {async_event_code_enum}.FUTURE_READ, payload0: this.waitableIdx(), payload1: res }};
                                  }};

                                  const isReadableEnd = this.isReadable();
                                  const onCopyDoneFn = (res) => {{
                                      if (res === {future_end_class}.CopyResult.DROPPED && isReadableEnd) {{
                                          throw new Error('cannot read from a dropped future');
                                      }}
                                      this.setPendingEvent(() => futureEvent(res));
                                  }};


                                  // Before performing this read, if we're dealing with a host-controlled
                                  // future, start injecting the write. The injection may depend on sibling
                                  // guest work running, so cleanup is attached without awaiting here; the
                                  // canonical read must be able to return BLOCKED first.
                                  let injectedWritePromise;
                                  if (this.#hostInjectFn) {{
                                      injectedWritePromise = this.#hostInjectFn({{ count: 1 }});
                                  }}

                                  await this._read({{
                                      buffer,
                                      onCopyDoneFn,
                                      componentIdx,
                                  }});

                                  if (injectedWritePromise) {{
                                      injectedWritePromise.then(
                                          cleanupFn => cleanupFn(),
                                          err => this.setPendingEvent(() => {{ throw err; }}),
                                      );
                                  }}

                                  return {{ buffer }};
                              }}
                            "#
                        ),
                    ),
                    AsyncFutureIntrinsic::FutureWritableEndClass => (
                        "guestWrite",
                        format!(
                            r#"
                              async guestWrite(args) {{
                                  {debug_log_fn}('[{class_name}#guestWrite()] args', args);
                                  const {{
                                      componentIdx,
                                      stringEncoding,
                                      getReallocFn,
                                      isAsync,
                                      memory,
                                      realloc,
                                      ptr,
                                      data,
                                  }} = args;

                                  if (this.#elemMeta.stringEncoding === undefined && stringEncoding) {{
                                      this.#elemMeta.stringEncoding = stringEncoding;
                                  }}

                                  if (args.getReallocFn && this.#elemMeta.getReallocFn === undefined) {{
                                      this.#elemMeta.getReallocFn = getReallocFn;
                                  }}

                                  const elemMeta = this.#elemMeta;

                                  if (this.#elemMeta.isBorrowed) {{
                                      throw new Error('cannot call future.read on a borrow');
                                  }}

                                  let buffer = args.buffer;
                                  if (!buffer) {{
                                      const createBufferRes = {global_buffer_mgr}.createBuffer({{
                                          componentIdx,
                                          memory,
                                          realloc,
                                          start: ptr,
                                          data,
                                          count: 1,
                                          isReadable: this.isWritable(),
                                          isWritable: this.isReadable(),
                                          elemMeta: this.#elemMeta,
                                      }});
                                      buffer = createBufferRes.buffer;
                                  }}

                                  const futureEvent = (res) => {{
                                      if (buffer.remaining() === 0) {{
                                          if (res !== {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected zero remaining post-completion');
                                          }}
                                      }} else {{
                                          if (res === {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected 1 remaining post-completion');
                                          }}
                                      }}
                                      if (res === {future_end_class}.CopyResult.DROPPED || res === {future_end_class}.CopyResult.COMPLETED) {{
                                          this.setCopyState({future_end_class}.CopyState.DONE);
                                      }} else {{
                                          this.setCopyState({future_end_class}.CopyState.IDLE);
                                      }}
                                      return {{ code: {async_event_code_enum}.FUTURE_WRITE, payload0: this.waitableIdx(), payload1: res }};
                                  }};

                                  const onCopyDoneFn = (res) => {{
                                      this.setPendingEvent(() => futureEvent(res));
                                  }};

                                  await this._write({{
                                      buffer,
                                      onCopyDoneFn,
                                      componentIdx,
                                  }});

                                  return {{ buffer }};
                              }}
                            "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                // Read/Write function that is called when the host is performing the read/write
                let (_host_rw_fn_name, host_rw_fn) = match intrinsic {
                    AsyncFutureIntrinsic::FutureReadableEndClass => (
                        "hostRead",
                        format!(
                            r#"
                              async hostRead(args) {{
                                  const {{ stringEncoding }} = args;

                                  const {{ buffer }} = await this.guestRead({{
                                      stringEncoding,
                                      isAsync: true,
                                      data: [],
                                      componentIdx: -1,
                                  }});

                                  if (!this.hasPendingEvent()) {{
                                      this.setCopyState({future_end_class}.CopyState.ASYNC_COPYING);

                                       // Wait for the write to complete
                                       await new Promise((resolve) => {{
                                           let waitInterval = setInterval(() => {{
                                               if (!this.hasPendingEvent()) {{ return; }}
                                               clearInterval(waitInterval);
                                               resolve();
                                           }});
                                       }});

                                       if (!this.hasPendingEvent()) {{
                                           throw new Error("missing pending event after blocked future read");
                                       }}
                                  }}

                                  const {{ code, payload0: index, payload1: payload }} = this.getPendingEvent();
                                  if (code !== {async_event_code_enum}.FUTURE_READ) {{
                                      throw new Error(`mismatched event code [${{code}}] for host future read`);
                                  }}
                                  if (index !== this.waitableIdx()) {{ throw new Error('mismatched future end index'); }}

                                  const vs = buffer.read(1);
                                  if (vs.length !== 1) {{ throw new Error('multiple results from future'); }}

                                  return vs[0];
                              }}
                            "#
                        ),
                    ),
                    AsyncFutureIntrinsic::FutureWritableEndClass => (
                        "hostWrite",
                        format!(
                            r#"
                              async hostWrite(args) {{
                                  const {{ stringEncoding, value, getReallocFn }} = args;

                                  const {{ buffer }} = await this.guestWrite({{
                                      stringEncoding,
                                      getReallocFn,
                                      // TODO: support sync host writes
                                      isAsync: true,
                                      data: [value],
                                      componentIdx: -1,
                                      componentIdx: -1,
                                  }});

                                  if (!this.hasPendingEvent()) {{
                                      this.setCopyState({future_end_class}.CopyState.ASYNC_COPYING);

                                       // Wait for the write to complete
                                       await new Promise((resolve) => {{
                                           let waitInterval = setInterval(() => {{
                                               if (!this.hasPendingEvent()) {{ return; }}
                                               clearInterval(waitInterval);
                                               resolve();
                                           }});
                                       }});

                                       if (!this.hasPendingEvent()) {{
                                           throw new Error("missing pending event after blocked future write");
                                       }}
                                  }}

                                  const {{ code, payload0: index, payload1: payload }} = this.getPendingEvent();
                                  if (code !== {async_event_code_enum}.FUTURE_WRITE) {{
                                      throw new Error(`mismatched event code [${{code}}] for host future write`);
                                  }}
                                  if (index !== this.waitableIdx()) {{ throw new Error('mismatched future end index'); }}
                              }}
                            "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                let type_getters = match intrinsic {
                    AsyncFutureIntrinsic::FutureWritableEndClass => "
                         isReadable() { return false; }
                         isWritable() { return true; }
                    "
                    .to_string(),
                    AsyncFutureIntrinsic::FutureReadableEndClass => "
                         isReadable() { return true; }
                         isWritable() { return false; }
                    "
                    .to_string(),
                    _ => unreachable!(),
                };

                let drop_check = match intrinsic {
                    AsyncFutureIntrinsic::FutureReadableEndClass => "",
                    AsyncFutureIntrinsic::FutureWritableEndClass => {
                        r#"
                          if (this.isWritable() && !this.isDoneState()) {{
                              throw new Error('trap: futures must not be dropped before being completed');
                          }}
                        "#
                    }
                    _ => unreachable!(),
                };

                uwriteln!(
                    output,
                    r#"
                    class {class_name} extends {future_end_class} {{
                        #globalFutureMapRep;
                        #futureTableIdx;
                        #isHostOwned;
                        #hostInjectFn;
                        #elemMeta;
                        #handle;
                        #promise;

                        target;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            super(args);

                            if (!args.elemMeta) {{ throw new Error('missing/invalid element meta'); }}
                            this.#elemMeta = args.elemMeta;

                            if (args.tableIdx === undefined) {{ throw new Error('missing index for future table idx'); }}
                            this.#futureTableIdx = args.tableIdx;

                            this.#hostInjectFn = args.hostInjectFn;
                            this.#isHostOwned = args.hostOwned;
                        }}

                        {type_getters}

                        setTarget(tgt) {{ this.target = tgt; }}

                        getElemMeta() {{ return {{...this.#elemMeta}}; }}
                        futureTableIdx() {{ return this.#futureTableIdx; }}

                        globalFutureMapRep() {{ return this.#globalFutureMapRep; }}
                        setGlobalFutureMapRep(rep) {{ this.#globalFutureMapRep = rep; }}

                        waitableIdx() {{ return this.getWaitable().idx(); }}
                        setWaitableIdx(idx) {{
                            const w = this.getWaitable();
                            w.setIdx(idx);
                            w.setTarget(`waitable for {class_name} (waitable [${{idx}}])`);
                        }}

                        handle() {{ return this.#handle; }}
                        setHandle(h) {{ this.#handle = h; }}

                        setHostInjectFn(f) {{
                            if (this.#hostInjectFn) {{ throw new Error('host injection fn is already set'); }}
                            this.#hostInjectFn = f;
                        }}

                        promise() {{
                            if (this.#promise) {{ return this.#promise; }}
                            // NOTE: we return a "thenable" here to ensure that simply lifting the future does
                            // not trigger a host read.

                            let readPromise = null;
                            this.#promise = {{
                                then: (resolve, reject) => {{
                                    if (readPromise) {{
                                        readPromise.then(resolve, reject);
                                        return;
                                    }}
                                    readPromise = this.hostRead({{ stringEncoding: 'utf8' }});
                                    readPromise.then(resolve, reject);
                                 }}
                             }};
                            return this.#promise;
                        }}

                        cancel() {{
                            {debug_log_fn}('[{future_end_class}#cancel()]');
                            this.resetAndNotifyPending({future_end_class}.CopyResult.CANCELLED);
                        }}

                        {inner_rw_fn}
                        {guest_rw_fn}
                        {host_rw_fn}

                        drop() {{
                            {drop_check}
                            super.drop();
                        }}
                    }}
                "#
                );
            }

            AsyncFutureIntrinsic::InternalFutureClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let internal_future_class = AsyncFutureIntrinsic::InternalFutureClass.name();
                let write_end_class = AsyncFutureIntrinsic::FutureWritableEndClass.name();
                let read_end_class = AsyncFutureIntrinsic::FutureReadableEndClass.name();

                uwriteln!(
                    output,
                    r#"
                    class {internal_future_class} {{
                        #globalFutureMapRep;
                        #pendingBufferMeta = {{}}; // Shared between read and write ends
                        #elemMeta;

                        #readEnd;
                        #writeEnd;

                        constructor(args) {{
                            {debug_log_fn}('[{internal_future_class}#constructor()] args', args);
                            if (!args.elemMeta) {{ throw new Error('missing/invalid future element metadata'); }}
                            if (args.tableIdx === undefined) {{ throw new Error('missing/invalid future table idx'); }}
                            if (!args.readWaitable) {{ throw new Error('missing/invalid read waitable'); }}
                            if (!args.writeWaitable) {{ throw new Error('missing/invalid write waitable'); }}
                            const {{
                                tableIdx,
                                elemMeta,
                                readWaitable,
                                writeWaitable,
                            }} = args;

                            this.#elemMeta = args.elemMeta;

                            let dropped = false;
                            const setDroppedFn = () => {{ dropped = true }};
                            const isDroppedFn = () => dropped;

                            this.#readEnd = new {read_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "future read end (@ init)",
                                waitable: readWaitable,
                                // Only in-component read-ends need the host inject fn if provided,
                                // as that function will *inject* a write when the future is checked
                                // from inside the guest.
                                hostInjectFn: args.hostInjectFn,
                                setDroppedFn,
                                isDroppedFn,
                            }});

                            this.#writeEnd = new {write_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "future write end (@ init)",
                                waitable: writeWaitable,
                                hostOwned: true,
                                setDroppedFn,
                                isDroppedFn,
                            }});
                        }}

                        elemMeta() {{ return this.#elemMeta; }}
                        readEnd() {{ return this.#readEnd; }}
                        writeEnd() {{ return this.#writeEnd; }}

                        globalFutureMapRep() {{ return this.#globalFutureMapRep; }}
                        setGlobalFutureMapRep(rep) {{
                            this.#globalFutureMapRep = rep;
                            this.#readEnd.setGlobalFutureMapRep(rep);
                            this.#writeEnd.setGlobalFutureMapRep(rep);
                        }}
                    }}
                "#
                );
            }

            AsyncFutureIntrinsic::FutureNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_new_fn = AsyncFutureIntrinsic::FutureNew.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                uwriteln!(
                    output,
                    r#"
                    function {future_new_fn}(ctx) {{
                        {debug_log_fn}('[{future_new_fn}()] args', {{ ctx }});
                        const {{ componentIdx, futureTableIdx, elemMeta }} = ctx;

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const {{ readEnd, writeEnd }} = cstate.createFuture({{
                            tableIdx: futureTableIdx,
                            elemMeta,
                        }});

                        let writeEndWaitableIdx = writeEnd.waitableIdx();
                        let readEndWaitableIdx = readEnd.waitableIdx();

                        return BigInt(writeEndWaitableIdx) << 32n | BigInt(readEndWaitableIdx);
                    }}
                "#
                );
            }

            AsyncFutureIntrinsic::FutureNewFromLift => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_new_from_lift_fn = intrinsic.name();
                let global_future_map =
                    Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GlobalFutureMap).name();
                let host_future_class =
                    Intrinsic::AsyncFuture(AsyncFutureIntrinsic::HostFutureClass).name();

                output.push_str(&format!(
                    r#"
                    function {future_new_from_lift_fn}(ctx) {{
                        {debug_log_fn}('[{future_new_from_lift_fn}()] args', {{ ctx }});
                        const {{
                            componentIdx,
                            futureEndWaitableIdx,
                            futureTableIdx,
                            payloadLiftFn,
                            payloadTypeSize32,
                            payloadLowerFn,
                        }} = ctx;

                        const future = new {host_future_class}({{
                            componentIdx,
                            futureEndWaitableIdx,
                            futureTableIdx,
                            payloadLiftFn: payloadLiftFn,
                            payloadLowerFn: payloadLowerFn,
                        }});

                        const rep = {global_future_map}.insert(future);
                        future.setRep(rep);

                        return future.createUserFuture();
                    }}
                "#
                ));
            }

            AsyncFutureIntrinsic::FutureWrite | AsyncFutureIntrinsic::FutureRead => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();

                let future_op_fn = intrinsic.name();
                let (guest_op_fn, future_end_class) = match intrinsic {
                    AsyncFutureIntrinsic::FutureWrite => (
                        "guestWrite",
                        AsyncFutureIntrinsic::FutureWritableEndClass.name(),
                    ),
                    AsyncFutureIntrinsic::FutureRead => (
                        "guestRead",
                        AsyncFutureIntrinsic::FutureReadableEndClass.name(),
                    ),
                    _ => unreachable!(),
                };
                let future_end_base_class = AsyncFutureIntrinsic::FutureEndClass.name();

                let event_code = match intrinsic {
                    AsyncFutureIntrinsic::FutureWrite => format!("{event_code_enum}.FUTURE_WRITE"),
                    AsyncFutureIntrinsic::FutureRead => format!("{event_code_enum}.FUTURE_READ"),
                    _ => unreachable!(),
                };

                uwriteln!(
                    output,
                    r#"
                    async function {future_op_fn}(
                        ctx,
                        futureEndWaitableIdx,
                        ptr,
                    ) {{
                        {debug_log_fn}('[{future_op_fn}()] args', {{
                            ctx,
                            futureEndWaitableIdx,
                            ptr,
                        }});
                        const {{
                            componentIdx,
                            futureTableIdx,
                            memoryIdx,
                            getMemoryFn,
                            reallocIdx,
                            getReallocFn,
                            stringEncoding,
                            isAsync,
                        }} = ctx;

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('missing task metadata during future operation'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing task in metadata during future operation'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        if (!task.mayBlock() && !isAsync) {{
                            throw new Error('only tasks that may block may call future.{future_op_fn}');
                        }}

                        const futureEnd = cstate.getFutureEnd({{ tableIdx: futureTableIdx, futureEndWaitableIdx }});
                        if (!futureEnd) {{
                            throw new Error(`missing future with waitable idx [${{futureEndWaitableIdx}}] (component [${{componentIdx}}])`);
                        }}
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected [{future_end_class}]');
                        }}
                        if (!futureEnd.isIdleState()) {{
                            throw new Error('future state must be idle before {future_op_fn}');
                        }}

                        await futureEnd.{guest_op_fn}({{
                            componentIdx,
                            stringEncoding,
                            memory: getMemoryFn(),
                            realloc: getReallocFn?.(),
                            getReallocFn,
                            ptr,
                        }});

                        if (!futureEnd.hasPendingEvent()) {{
                            if (isAsync) {{
                                futureEnd.setCopyState({future_end_base_class}.CopyState.ASYNC_COPYING);
                                return {async_blocked_const};
                            }} else {{
                                futureEnd.setCopyState({future_end_base_class}.CopyState.SYNC_COPYING);
                                await task.suspendUntil({{
                                    readyFn: () => futureEnd.hasPendingEvent(),
                                }});
                            }}
                        }}

                        const {{ code, payload0: index, payload1: payload }} = futureEnd.getPendingEvent();
                        if (code !== {event_code}) {{
                             throw new Error(`mismatched event code [${{code}}] (expected {event_code})`);
                         }}
                        if (index !== futureEnd.waitableIdx()) {{ throw new Error('mismatched future end index'); }}

                        return payload;
                    }}
                "#
                );
            }

            AsyncFutureIntrinsic::FutureCancelRead | AsyncFutureIntrinsic::FutureCancelWrite => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let is_cancel_write = matches!(intrinsic, AsyncFutureIntrinsic::FutureCancelWrite);
                let future_end_class = if is_cancel_write {
                    AsyncFutureIntrinsic::FutureWritableEndClass.name()
                } else {
                    AsyncFutureIntrinsic::FutureReadableEndClass.name()
                };
                let future_cancel_fn = intrinsic.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();

                output.push_str(&format!(r#"
                    async function {future_cancel_fn}(
                        ctx,
                        futureEndIdx,
                    ) {{
                        {debug_log_fn}('[{future_cancel_fn}()] args', {{
                            ctx,
                            futureEndWaitableIdx,
                        }});
                        const {{ componentIdx, futureTableIdx, isAsync }} = ctx;

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        let futureEnd = cstate.getFutureEnd({{ tableIdx: futureTableIdx, futureEndWaitableIdx }});
                        if (!futureEnd) {{ throw new Error(`missing future end with idx [${{futureEndWaitableIdx}}]`); }}
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected value of type [{future_end_class}]');
                        }}

                        futureEnd = cstate.removeFutureEndFromTable({{
                            tableIdx: futureTableIdx,
                            futureWaitableIdx: futureEndWaitableIdx,
                        }});
                        if (!futureEnd) {{ throw new Error(`missing future with idx [${{futureEndWaitableIdx}}]`); }}

                        if (!futureEnd.isCopying()) {{ throw new Error('future end is not copying, cannot cancel'); }}

                        if (!futureEnd.hasPendingEvent()) {{
                          // TODO: cancel the shared thing (waitable?)
                          if (!futureEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              // TODO: repalce with what task.blockOn used to do
                              // await task.blockOn({{ promise: futureEnd.waitable, isAsync: false }});
                              throw new Error('not implemented');
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, payload0: index, payload1: payload }} = futureEnd.getPendingEvent();
                        if (futureEnd.isCopying()) {{ throw new Error('future end is still in copying state'); }}
                        if (code !== {async_event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {async_event_code_enum} + ']'); }}
                        if (index !== futureEndIdx) {{ throw new Error('index does not match future end'); }}

                        return payload;
                    }}
                "#));
            }

            AsyncFutureIntrinsic::FutureDropReadable | AsyncFutureIntrinsic::FutureDropWritable => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_drop_fn = intrinsic.name();
                let is_writable = matches!(intrinsic, AsyncFutureIntrinsic::FutureDropWritable);
                let future_end_class = if is_writable {
                    AsyncFutureIntrinsic::FutureWritableEndClass.name()
                } else {
                    AsyncFutureIntrinsic::FutureReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    function {future_drop_fn}(ctx, futureEndWaitableIdx) {{
                        {debug_log_fn}('[{future_drop_fn}()] args', {{ ctx }});
                        const {{ componentIdx, futureTableIdx }} = ctx;

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const futureEnd = cstate.removeFutureEndFromTable({{
                            tableIdx: futureTableIdx,
                            futureWaitableIdx: futureEndWaitableIdx
                        }});
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected [{future_end_class}]');
                        }}

                        futureEnd.drop();
                    }}
                "#));
            }

            AsyncFutureIntrinsic::FutureTransfer => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_transfer_fn = intrinsic.name();
                output.push_str(&format!(
                    r#"
                      function {future_transfer_fn}(ctx) {{
                        const params = [...arguments];
                        {debug_log_fn}('[{future_transfer_fn}()] args', {{
                            ctx,
                            params,
                        }});
                    }}
                    "#
                ));
            }

            AsyncFutureIntrinsic::GenFutureHostInjectFn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let gen_host_inject_fn = intrinsic.name();
                let nested_future_symbol = AsyncFutureIntrinsic::NestedFutureSymbol.name();
                let get_error_payload = Intrinsic::GetErrorPayload.name();

                uwriteln!(
                    output,
                    r#"
                      function {gen_host_inject_fn}(genArgs) {{
                          const {{ promise, hostWriteEnd, stringEncoding, getReallocFn }} = genArgs;
                          if (promise instanceof Promise) {{
                              promise.catch(() => {{}});
                          }}
                          let done;

                          return async function generateFutureHostInject(args) {{
                              let {{ count }} = args;
                              if (count !== 1) {{ throw new Error('invalid count'); }}

                              // Futures should only be completed once
                              if (done) {{
                                  return () => {{ throw new Error('cannot inject write: future already completed'); }}
                              }}

                              // The host *must* write something to this channel before closing it
                              if (hostWriteEnd.isDoneState()) {{
                                  return () => {{ throw new Error('cannot inject write: host must write to future before closing'); }}
                              }}

                              let value;
                              try {{
                                  value = await promise;
                              }} catch (err) {{
                                  const elemMeta = hostWriteEnd.getElemMeta();
                                  if (!elemMeta.payloadTypeName?.startsWith('Result(')) {{
                                      {debug_log_fn}("failed to inject host write", err);
                                      throw new Error("cannot inject write: promise failed");
                                  }}
                                  value = {{ tag: 'err', val: {get_error_payload}(err) }};
                              }}

                              try {{
                                  // If we've read a nested promise from the outside,
                                  // we must convert the value that we get back into a future,
                                  // because we are not at the lowest level yet.
                                  if (value && typeof value === 'object' && value[{nested_future_symbol}]) {{
                                      value = Promise.resolve(value);
                                  }}

                                  await hostWriteEnd.hostWrite({{ stringEncoding, value, getReallocFn }});
                              }} catch (err) {{
                                  {debug_log_fn}("failed to inject host write", err);
                                  throw new Error("cannot inject write: promise failed");
                              }}

                              hostWriteEnd.getPendingEvent();
                              hostWriteEnd.drop();

                              return () => {{
                                  // After the write is finished, we consume the event that was generated
                                  // by the just-in-time write (and the subsequent read), if one was generated
                                  if (hostWriteEnd.hasPendingEvent()) {{ hostWriteEnd.getPendingEvent(); }}
                              }};
                          }};
                      }}
                    "#
                );
            }

            AsyncFutureIntrinsic::IsFutureLowerableObject => {
                let is_future_lowerable_object = intrinsic.name();
                output.push_str(&format!(
                    r#"
                      function {is_future_lowerable_object}(obj) {{
                          if (typeof obj !== 'object') {{ return false; }}
                          return obj instanceof Promise
                               || 'then' in obj && typeof obj.then === 'function';
                      }}
                    "#
                ));
            }
        }
    }
}
