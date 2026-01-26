//! Intrinsics that represent helpers that enable Stream integration

use crate::{
    intrinsics::{Intrinsic, component::ComponentIntrinsic},
    source::Source,
};

use super::async_task::AsyncTaskIntrinsic;

/// This enum contains intrinsics that enable Stream
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncStreamIntrinsic {
    /// Global that stores streams
    ///
    /// ```ts
    /// type i32 = number;
    /// type StreamEnd = StreamWritableEndClass | StreamReadableEndClass;
    /// type GlobalStreamMap<T> = Map<i32, StreamEnd>;
    /// ```
    GlobalStreamMap,

    /// The definition of the `StreamWritableEnd` JS class
    ///
    /// This class serves as a shared implementation used by writable and readable ends
    StreamEndClass,

    /// The definition of the `StreamWritableEnd` JS class
    StreamWritableEndClass,

    /// The definition of the `StreamReadableEnd` JS class
    StreamReadableEndClass,

    /// The definition of the `HostStream` JS class
    ///
    /// This class serves as an implementation for top level host-managed streams,
    /// internal to the bindgen generated logic.
    ///
    /// External code is no expected to work in terms of `HostStream`, but rather deal with `Stream`s
    ///
    HostStreamClass,

    /// The definition of the `Stream` JS class
    ///
    /// This class serves as an user-facign implementation of a Preview3 `stream`.
    /// Usually this class is created via `HostStream#createStream()`.
    ///
    StreamClass,

    /// Create a new stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturenew
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >= 0
    /// type u64 = bigint; // >= 0
    /// function streamNew(typeRep: u32): u64;
    /// ```
    StreamNew,

    /// Create a new stream during a lift (`Instruction::StreamLift`).
    ///
    /// This is distinct from plain stream creation, because we are provided more information,
    /// particularly the relevant types to teh stream and lift/lower fns for the stream.
    ///
    /// ```ts
    /// type params = {
    ///     componentIdx: number,
    ///     streamTypeRep: number,
    ///     payloadLiftFn: Array<Function>,
    ///     payloadLowerFn: Array<Function>,
    ///     isUnitStream: boolean,
    /// }
    /// function streamNewFromLift(p: params);
    /// ```
    ///
    StreamNewFromLift,

    /// Read from a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamRead(
    ///     componentInstanceID: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamRead,

    /// Write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamWrite(
    ///     componentInstanceID: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamWrite,

    /// Cancel a read to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelRead(streamRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    StreamCancelRead,

    /// Cancel a write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-writewrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelWrite(streamRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    StreamCancelWrite,

    /// Drop a the readable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropReadable(streamRep: u32, readerRep: u32): bool;
    /// ```
    StreamDropReadable,

    /// Drop a the writable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropWritable(streamRep: u32, writerRep: u32): bool;
    /// ```
    StreamDropWritable,

    /// Transfer a given stream from one component to another
    ///
    /// Note that all arguments for a stream transfer are provided via arguments at runtime,
    /// and is generally called from the *guest* component (or at least the guest component idx is
    /// discernable via the current task).
    ///
    /// ```ts
    /// type u32 = number;
    ///
    /// function streamTransfer(srcComponentIdx: u32, srcTableIdx: u32, destTableIdx: u32): bool;
    /// ```
    StreamTransfer,
}

impl AsyncStreamIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalStreamMap => "STREAMS",
            Self::StreamEndClass => "StreamEnd",
            Self::StreamWritableEndClass => "StreamWritableEnd",
            Self::StreamReadableEndClass => "StreamReadableEnd",
            Self::HostStreamClass => "HostStream",
            Self::StreamClass => "Stream",
            Self::StreamNew => "streamNew",
            Self::StreamNewFromLift => "streamNewFromLift",
            Self::StreamRead => "streamRead",
            Self::StreamWrite => "streamWrite",
            Self::StreamDropReadable => "streamDropReadable",
            Self::StreamDropWritable => "streamDropWritable",
            Self::StreamTransfer => "streamTransfer",
            Self::StreamCancelRead => "streamCancelRead",
            Self::StreamCancelWrite => "streamCancelWrite",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::StreamEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_end_class = Self::StreamEndClass.name();
                output.push_str(&format!(
                    r#"
                    class {stream_end_class} {{
                        static CopyResult = {{
                            COMPLETED: 0,
                            DROPPED: 1,
                            CANCELLED: 1,
                        }};

                        static CopyState = {{
                            IDLE: 1,
                            SYNC_COPYING: 2,
                            ASYNC_COPYING: 3,
                            CANCELLING_COPY: 4,
                            DONE: 5,
                        }};

                        #waitable = null;
                        #tableIdx = null;
                        #componentInstanceID = null;
                        #dropped = false;
                        #copyState = {stream_end_class}.CopyState.IDLE;

                        constructor(args) {{
                            {debug_log_fn}('[{stream_end_class}#constructor()] args', args);
                            const {{ tableIdx, componentIdx }} = args;
                            if (tableIdx === undefined || typeof tableIdx !== 'number') {{
                                throw new TypeError(`missing element type rep [${{tableIdx}}]`);
                            }}
                            if (tableIdx < 0 || tableIdx > 2_147_483_647) {{
                                throw new TypeError(`invalid  tableIdx [${{tableIdx}}]`);
                            }}
                            this.#tableIdx = args.tableIdx;
                            this.#componentInstanceID = args.componentInstanceID ??= null;
                        }}

                        tableIdx() {{ return this.#tableIdx; }}
                        isHostOwned() {{ return this.#componentInstanceID === null; }}

                        setCopyState(state) {{ this.#copyState = state; }}
                        getCopyState() {{ this.#copyState; }}

                        setWaitableEventFn(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            this.#waitable.setEvent(fn);
                        }}

                        drop() {{
                            if (this.#dropped) {{ throw new Error('already dropped'); }}

                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            this.#waitable.drop();
                            this.#waitable = null;

                            this.#dropped = true;
                        }}
                    }}
                "#
                ));
            }

            Self::StreamReadableEndClass | Self::StreamWritableEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let (class_name, stream_var_name, js_stream_class_name) = match self {
                    Self::StreamReadableEndClass => (self.name(), "readable", "ReadableStream"),
                    Self::StreamWritableEndClass => (self.name(), "writable", "WritableStream"),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };
                let stream_end_class = Self::StreamEndClass.name();

                let copy_impl = match self {
                    Self::StreamWritableEndClass => "
                         copy() {
                             if (this.#done) { throw new Error('stream has completed'); }
                             if (!this.#writable) { throw new Error('missing/invalid writable'); }
                             throw new Error('{class_name}#copy() not implemented');
                         }
                    "
                    .to_string(),
                    Self::StreamReadableEndClass => "
                         copy() {
                             if (this.#done) { throw new Error('stream has completed'); }
                             if (!this.#readable) { throw new Error('missing/invalid readable'); }
                             throw new Error('{class_name}#copy() not implemented');
                         }
                    "
                    .to_string(),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                let type_getter_impl = match self {
                    Self::StreamWritableEndClass => "
                         isReadable() { return false; }
                         isWritable() { return true; }
                    "
                    .to_string(),
                    Self::StreamReadableEndClass => "
                         isReadable() { return true; }
                         isWritable() { return false; }
                    "
                    .to_string(),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                let action_impl = match self {
                    Self::StreamWritableEndClass => format!(
                        r#"
                         async write(v) {{
                            {debug_log_fn}('[{class_name}#write()] args', {{ v }});
                             if (this.#writePromise === null) {{
                                 const {{ promise, resolve, reject }} = Promise.withResolvers();
                                 this.#writePromise = promise;
                                 this.#writePromiseResolve = resolve;
                                 this.#writePromiseReject = reject;
                             }}
                             await this.#writePromise;
                         }}
                        "#
                    ),
                    Self::StreamReadableEndClass => format!(
                        r#"
                         async read() {{
                            {debug_log_fn}('[{class_name}#read()]');
                             if (this.#readPromise === null) {{
                                 const {{ promise, resolve, reject }} = Promise.withResolvers();
                                 this.#readPromise = promise;
                                 this.#readPromiseResolve = resolve;
                                 this.#readPromiseReject = reject;
                             }}
                             await this.#readPromise;
                         }}
                        "#
                    ),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                output.push_str(&format!("
                    class {class_name} extends {stream_end_class} {{
                        #copying = false;
                        #{stream_var_name} = null;
                        #dropped = false;
                        #done = false;

                        #writePromise = null;
                        #writePromiseResolve = null;
                        #writePromiseReject = null;

                        #readPromise = null;
                        #readPromiseResolve = null;
                        #readPromiseReject = null;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            super(args);
                            if (!args.{stream_var_name} || !(args.{stream_var_name} instanceof {js_stream_class_name})) {{
                                throw new TypeError('missing/invalid stream, expected {js_stream_class_name}');
                            }}
                            this.#{stream_var_name} = args.{stream_var_name};
                        }}

                        isCopying() {{ return this.#copying; }}
                        clearCopying() {{
                            if (!this.#copying) {{ throw new Error('attempt to clear while copying not in progress'); }}
                            this.#copying = false;
                        }}

                        {type_getter_impl}

                        isDone() {{ this.getState() === {stream_end_class}.DONE; }}
                        markDone() {{ this.setState({stream_end_class}.DONE); }}

                        {action_impl}
                        {copy_impl}

                        drop() {{
                            if (self.#dropped) {{ throw new Error('already dropped'); }}
                            if (self.#copying) {{ throw new Error('cannot drop while copying'); }}

                            if (!self.#{stream_var_name}) {{ throw new Error('missing/invalid stream'); }}
                            this.#{stream_var_name}.close();

                            super.drop();
                            self.#dropped = true;
                        }}
                    }}
                "));
            }

            Self::HostStreamClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let class_name = self.name();
                let stream_class = Self::StreamClass.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(
                    r#"
                    class {class_name} {{
                        #componentIdx;
                        #streamIdx;
                        #streamTableIdx;

                        #payloadLiftFn;
                        #payloadLowerFn;
                        #isUnitStream;

                        #userStream;

                        #rep = null;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.payloadLiftFn) {{ throw new TypeError("missing payload lift fn"); }}
                            this.#payloadLiftFn = args.payloadLiftFn;

                            if (!args.payloadLowerFn) {{ throw new TypeError("missing payload lower fn"); }}
                            this.#payloadLowerFn = args.payloadLowerFn;

                            if (args.streamIdx === undefined) {{ throw new Error("missing stream idx"); }}
                            if (args.streamTableIdx === undefined) {{ throw new Error("missing stream table idx"); }}
                            this.#streamIdx = args.streamIdx;
                            this.#streamTableIdx = args.streamTableIdx;

                            this.#isUnitStream = args.isUnitStream;
                        }}

                        setRep(rep) {{ this.#rep = rep; }}

                        createUserStream(args) {{
                           if (this.#userStream) {{ return this.#userStream; }}
                           if (this.#rep === null) {{ throw new Error("unexpectedly missing rep for host stream"); }}

                           const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                           if (!cstate) {{ throw new Error(`missing async state for component [${{this.#componentIdx}}]`); }}

                           const streamEnd = cstate.getStreamEnd({{ tableIdx: this.#streamTableIdx, streamIdx: this.#streamIdx }});
                           if (!streamEnd) {{
                               throw new Error(`missing stream [${{this.#streamIdx}}] (table [${{this.#streamTableIdx}}], component [${{this.#componentIdx}}]`);
                           }}

                            return new {stream_class}({{
                                isReadable: streamEnd.isReadable(),
                                isWritable: streamEnd.isWritable(),
                                hostStreamRep: this.#rep,
                                readFn: async () => {{
                                    return await streamEnd.read();
                                }},
                                writeFn: async (v) => {{
                                    await streamEnd.write(v);
                                }},
                            }});
                        }}

                    }}
                    "#
                ));
            }

            Self::StreamClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let class_name = self.name();
                output.push_str(&format!(
                    r#"
                    class {class_name} {{
                        #hostStreamRep;
                        #isReadable;
                        #isWritable;
                        #writeFn;
                        #readFn;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            if (args.hostStreamRep === undefined) {{ throw new TypeError("missing host stream rep"); }}
                            this.#hostStreamRep = args.hostStreamRep;

                            if (args.isReadable === undefined) {{ throw new TypeError("missing readable setting"); }}
                            this.#isReadable = args.isReadable;

                            if (args.isWritable === undefined) {{ throw new TypeError("missing writable setting"); }}
                            this.#isWritable = args.isWritable;

                            if (this.#isWritable && args.writeFn === undefined) {{ throw new TypeError("missing write fn"); }}
                            this.#writeFn = args.writeFn;

                            if (this.#isReadable && args.readFn === undefined) {{ throw new TypeError("missing read fn"); }}
                            this.#readFn = args.readFn;
                        }}

                        async next() {{
                            {debug_log_fn}('[{class_name}#next()]');
                            if (!this.#isReadable) {{ throw new Error("stream is not marked as readable and cannot be written from"); }}

                            return this.#readFn();
                        }}

                        async write() {{
                            {debug_log_fn}('[{class_name}#write()]');
                            if (!this.#isWritable) {{ throw new Error("stream is not marked as writable and cannot be written to"); }}

                            const objects = [...arguments];
                            if (!objects.length !== 1) {{
                                throw new Error("only single object writes are currently supported");
                            }}
                            const obj = objects[0];

                            this.#writeFn(obj);
                        }}
                    }}
                    "#
                ));
            }

            Self::GlobalStreamMap => {
                let global_stream_map = Self::GlobalStreamMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    "
                    const {global_stream_map} = new {rep_table_class}();
                "
                ));
            }

            // TODO: allow customizable stream functionality (user should be able to specify a lib/import for a 'stream()' function
            // (this will enable using p3-shim explicitly or any other implementation)
            //
            // TODO: Streams need a class
            //
            // NOTE: this intrinsic is also called from Instruction::StreamLift, in which case there
            // is not an active task, but the componentIdx will be supplied proactively.
            //
            // NOTE: Unit streams are represented with a streamTypeRep of null
            Self::StreamNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_new_fn = Self::StreamNew.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    function {stream_new_fn}(args) {{
                        {debug_log_fn}('[{stream_new_fn}()] args', args);
                        const {{ streamTableIdx, callerComponentIdx }} = args;
                        if (callerComponentIdx === undefined) {{ throw new Error("missing caller component idx during stream.new"); }}

                        const taskMeta = {current_task_get_fn}(callerComponentIdx);
                        if (!taskMeta) {{ throw new Error('missing async task metadata during stream.new'); }}

                        const task = taskMeta.task
                        if (!task) {{ throw new Error('invalid/missing async task during stream.new'); }}

                        if (task.componentIdx() !== callerComponentIdx) {{
                            throw new Error(`task component idx [${{task.componentIdx()}}] does not match stream new intrinsic component idx [${{callerComponentIdx}}]`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(callerComponentIdx);
                        if (!cstate.mayLeave) {{
                            throw new Error('component instance is not marked as may leave during stream.new');
                        }}

                        const {{ writableIdx, readableIdx }} = cstate.createStream({{ tableIdx: streamTableIdx }});

                        return BigInt(writableIdx) << 32n | BigInt(readableIdx);
                    }}
                "#));
            }

            Self::StreamNewFromLift => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_new_from_lift_fn = self.name();
                let global_stream_map =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap).name();
                let host_stream_class =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass).name();
                output.push_str(&format!(
                    r#"
                    function {stream_new_from_lift_fn}(args) {{
                        {debug_log_fn}('[{stream_new_from_lift_fn}()] args', args);
                        const {{
                            componentIdx,
                            streamIdx,
                            streamTableIdx,
                            payloadLiftFn,
                            payloadTypeSize32,
                            payloadLowerFn,
                            isUnitStream,
                        }} = args;

                        const stream = new {host_stream_class}({{
                            componentIdx,
                            streamIdx,
                            streamTableIdx,
                            payloadLiftFn: payloadLiftFn,
                            payloadLowerFn: payloadLowerFn,
                            isUnitStream,
                        }});

                        const rep = {global_stream_map}.insert(stream);
                        stream.setRep(rep);

                        return stream.createUserStream();
                    }}
                "#
                ));
            }

            Self::StreamWrite | Self::StreamRead => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_fn = self.name();
                let stream_end_class = Self::StreamEndClass.name();
                let is_write = matches!(self, Self::StreamWrite);
                // When performing a StreamWrite, we expect to deal with a stream end that is only guest-readable,
                // and when performing a stream read, we expect to deal with a stream end that is guest-writable
                let end_class = if is_write {
                    Self::StreamWritableEndClass.name()
                } else {
                    Self::StreamReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let is_borrowed_type_fn = Intrinsic::IsBorrowedType.name();
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                output.push_str(&format!(r#"
                    async function {stream_fn}(
                        args,
                        streamEndIdx,
                        ptr,
                        len,
                    ) {{
                        {debug_log_fn}('[{stream_fn}()] args', {{ args, streamEndIdx, ptr, len }});
                         const {{
                             componentIdx,
                             memoryIdx,
                             getMemoryFn,
                             reallocIdx,
                             getReallocFn,
                             stringEncoding,
                             isAsync,
                             streamTableIdx,
                         }} = args;

                        console.log("DOING {stream_fn}", args);

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}
                        // TODO(fix): check for may block & async

                        const streamEnd = cstate.getStreamEnd({{ tableIdx: streamTableIdx, streamIdx: streamEndIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream end [${{streamEndIdx}}] (table [${{streamTableIdx}}], component [${{componentIdx}}])`);
                        }}

                        if (!(streamEnd instanceof {end_class})) {{
                            throw new Error('invalid stream type, expected readable stream');
                        }}
                        if (streamEnd.isCopying()) {{
                            throw new Error('stream is currently undergoing a separate copy');
                        }}
                        if (streamEnd.getStreamTableIdx() !== streamTableIdx) {{
                            throw new Error(`stream end table idx [${{streamEnd.getStreamTableIdx()}}] != operation table idx [${{streamTableIdx}}]`);
                        }}
                        if (streamEnd.getCopyState() !== {stream_end_class}.CopyState.IDLE) {{
                            throw new Error(`stream [${{streamIdx}}] (tableIdx [${{streamTableIdx}}], component [${{componentIdx}}]) is not idle`);
                        }}

                        // TODO(fix): ensure type is not borrowed (should be doable at stream creation/trampoline setup Instruction::StreamLift?)
                        // if ({is_borrowed_type_fn}(componentIdx, typeIdx)) {{
                        //     throw new Error('borrowed types cannot be used as elements in a stream');
                        // }}

                        let bufID;
                        try {{
                            bufID = {global_buffer_manager}.createBuffer({{
                                componentIdx,
                                start: ptr,
                                len, // TODO(?): this is the # of lowers to perform, not the len in bytes?
                                //onCopy,
                                //onCopyDone,
                            }});
                        }} catch(err) {{
                            console.log("FAILED TO CREATE BUFFER", err);
                            throw err;
                        }}

                        console.log("CREATED BUFFER", {{ bufID }});
                        const processFn = (result, reclaimBufferFn) => {{
                            if (reclaimBufferFn) {{ reclaimBufferFn(); }}
                            streamEnd.clearCopying();

                            if (result === {stream_end_class}.CopyResult.DROPPED) {{
                                streamEnd.markDone();
                            }} else {{
                                streamEnd.setCopyState({stream_end_class}.CopyState.IDLE);
                            }}

                            if (result <= 0 || result >= 16) {{ throw new Error('unsupported stream copy result [' + result + ']'); }}
                            if (buf.length >= {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error('buffer size [' + buf.length + '] greater than max length [' + {managed_buffer_class}.MAX_LENGTH + ']');
                            }}
                            if (buf.length > 2**28) {{ throw new Error('buffer uses reserved space'); }}

                            let packedResult = result | (buffer.progress << 4);
                            return [eventCode, streamEndIdx, packedResult];
                        }}

                        try {{
                            streamEnd.copy({{
                                bufID,
                                onCopy: (reclaimBufferFn) => {{
                                    streamEnd.setWaitableEventFn(processFn.bind(null, {stream_end_class}.CopyResult.COMPLETED, reclaimBufferFn));
                                }},
                                onCopyDone: (result) => {{
                                    streamEnd.setWaitableEventFn(processFn.bind(null, result));
                                }},
                            }});
                        }} catch(err) {{
                            {debug_log_fn}('[{stream_fn}()] copy failed', {{ err }});
                            console.log("COPY failed", {{ err }});
                            throw err;console.log("COPY failed", err);
                        }}

                        // If sync, wait forever but allow task to do other things
                        if (!streamEnd.hasPendingEvent()) {{
                          if (isAsync) {{
                              streamEnd.setCopyState({stream_end_class}.CopyState.ASYNC_COPYING);

                              const taskMeta = {current_task_get_fn}(componentIdx);
                              if (!taskMeta) {{ throw new Error(`missing task meta for component idx [${{componentIdx}}]`); }}

                              const task = taskMeta.task;
                              if (!task) {{ throw new Error('missing task task from task meta'); }}

                              await task.blockOn({{ promise: streamEnd.waitable, isAsync }});
                          }} else {{
                              streamEnd.setCopyState({stream_end_class}.CopyState.SYNC_COPYING);
                              return [ {async_blocked_const} ];
                          }}
                        }}

                        const {{ code, index, payload }} = streamEnd.getEvent();
                        if (code !== eventCode  || index !== streamEndIdx || payload === {async_blocked_const}) {{
                            throw new Error('invalid event code/event idx/payload during stream operation');
                        }}

                        return [payload];
                    }}
                "#));
            }

            Self::StreamCancelRead | Self::StreamCancelWrite => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_cancel_fn = self.name();
                let global_stream_map = Self::GlobalStreamMap.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                let is_cancel_write = matches!(self, Self::StreamCancelWrite);
                let event_code_enum = format!(
                    "{}.STREAM_{}",
                    Intrinsic::AsyncEventCodeEnum.name(),
                    if is_cancel_write { "WRITE" } else { "READ" }
                );
                let stream_end_class = if is_cancel_write {
                    Self::StreamWritableEndClass.name()
                } else {
                    Self::StreamReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    async function {stream_cancel_fn}(
                        streamIdx,
                        isAsync,
                        streamEndIdx,
                    ) {{
                        {debug_log_fn}('[{stream_cancel_fn}()] args', {{
                            streamIdx,
                            isAsync,
                            streamEndIdx,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = {global_stream_map}.get(streamEndIdx);
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndIdx + ']'); }}
                        if (!(streamEnd instanceof {stream_end_class})) {{ throw new Error('invalid stream end, expected value of type [{stream_end_class}]'); }}

                        if (streamEnd.elementTypeRep() !== stream.elementTypeRep()) {{
                          throw new Error('stream type [' + stream.elementTypeRep() + '], does not match stream end type [' + streamEnd.elementTypeRep() + ']');
                        }}

                        if (!streamEnd.isCopying()) {{ throw new Error('stream end is not copying, cannot cancel'); }}

                        if (!streamEnd.hasPendingEvent()) {{
                          // TODO: cancel the shared thing (waitable?)
                          if (!streamEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              await task.blockOn({{ promise: streamEnd.waitable, isAsync: false }});
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, index, payload }} = e.getEvent();
                        if (streamEnd.isCopying()) {{ throw new Error('stream end is still in copying state'); }}
                        if (code !== {event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {event_code_enum} + ']'); }}
                        if (index !== 1) {{ throw new Error('unexpected index, should be 1'); }}

                        return payload;
                    }}
                "));
            }

            // TODO: update after stream map is present
            Self::StreamDropReadable | Self::StreamDropWritable => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_drop_fn = self.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let is_write = matches!(self, Self::StreamDropWritable);
                let stream_end_class = if is_write {
                    Self::StreamWritableEndClass.name()
                } else {
                    Self::StreamReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    function {stream_drop_fn}(ctx, streamIdx) {{
                        {debug_log_fn}('[{stream_drop_fn}()] args', {{ ctx, streamIdx }});
                        const {{ streamTableIdx, componentIdx }} = ctx;

                        const task = {current_task_get_fn}(componentIdx);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing component state for component idx [${{componentIdx}}]`); }}

                        const stream = cstate.removeStreamEnd({{ tableIdx: streamTableIdx, streamIdx }});
                        if (!stream) {{
                            throw new Error(`missing stream [${{streamIdx}}] (table [${{streamTableIdx}}], component [${{componentIdx}}])`);
                        }}
                        if (!(stream instanceof {stream_end_class})) {{
                          throw new Error('invalid stream end class, expected [{stream_end_class}]');
                        }}
                    }}
                "#));
            }

            Self::StreamTransfer => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_transfer_fn = self.name();
                let current_component_idx_globals =
                    AsyncTaskIntrinsic::GlobalAsyncCurrentComponentIdxs.name();
                let current_async_task_id_globals =
                    AsyncTaskIntrinsic::GlobalAsyncCurrentTaskIds.name();
                let current_task_get_fn = AsyncTaskIntrinsic::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(
                    r#"
                    function {stream_transfer_fn}(
                        srcStreamIdx,
                        srcTableIdx,
                        destTableIdx,
                    ) {{
                        {debug_log_fn}('[{stream_transfer_fn}()] args', {{
                            srcStreamIdx,
                            srcTableIdx,
                            destTableIdx,
                        }});

                        const taskMeta = {current_task_get_fn}(
                            {current_component_idx_globals}.at(-1),
                            {current_async_task_id_globals}.at(-1)
                        );
                        if (!taskMeta) {{ throw new Error('missing current task metadata while doing stream transfer'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing task while doing stream transfer'); }}

                        const componentIdx = task.componentIdx();
                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`unexpectedly missing async state for component [${{componentIdx}}]`); }}

                        const stream = cstate.removeStreamEnd({{ tableIdx: srcTableIdx, streamIdx: srcStreamIdx }});
                        if (!stream.isReadable()) {{ throw new Error("writable stream ends cannot be moved"); }}
                        if (stream.isDone()) {{
                            throw new Error('readable ends cannot be moved once writable ends are dropped');
                        }}

                        const streamIdx = cstate.addStreamEnd({{ tableIdx: destTableIdx, stream }});
                        return streamIdx;
                      }}
                "#
                ));
            }
        }
    }
}
