//! Built-in intrinsic renderer implementation
use std::fmt::Write;

use crate::source::Source;
use crate::{uwrite, uwriteln};

use super::{Intrinsic, IntrinsicRender, RenderIntrinsicsArgs};

pub(crate) mod async_future;
pub(crate) mod async_stream;
pub(crate) mod async_task;
pub(crate) mod component;
pub(crate) mod conversion;
pub(crate) mod err_ctx;
pub(crate) mod host;
pub(crate) mod js_helper;
pub(crate) mod lift;
pub(crate) mod lower;
pub(crate) mod resource;
pub(crate) mod string;
pub(crate) mod waitable;

/// Built-in (default) intrinsic renderer
pub struct BuiltinIntrinsicRenderer;

impl BuiltinIntrinsicRenderer {}

impl IntrinsicRender for BuiltinIntrinsicRenderer {
    type SingleIntrinsic = Intrinsic;

    fn render(&self, intrinsic: &Intrinsic, output: &mut Source, args: &RenderIntrinsicsArgs) {
        match intrinsic {
            Intrinsic::JsHelper(i) => self.render_js_helper(i, output, args),
            Intrinsic::Conversion(i) => self.render_conversion(i, output, args),
            Intrinsic::String(i) => self.render_string(i, output, args),
            Intrinsic::ErrCtx(i) => self.render_err_ctx(i, output, args),
            Intrinsic::Resource(i) => self.render_resource(i, output, args),
            Intrinsic::AsyncTask(i) => self.render_async_task(i, output, args),
            Intrinsic::Waitable(i) => self.render_waitable(i, output, args),
            Intrinsic::Lift(i) => self.render_lift(i, output, args),
            Intrinsic::Lower(i) => self.render_lower(i, output, args),
            Intrinsic::AsyncStream(i) => self.render_async_stream(i, output, args),
            Intrinsic::AsyncFuture(i) => self.render_async_future(i, output, args),
            Intrinsic::Component(i) => self.render_component(i, output, args),
            Intrinsic::Host(i) => self.render_host(i, output, args),

            Intrinsic::GlobalAsyncDeterminism => {
                uwriteln!(
                    output,
                    "const {var_name} = '{determinism}';",
                    var_name = intrinsic.name(),
                    determinism = args.determinism_profile,
                );
            }

            Intrinsic::CoinFlip => {
                uwriteln!(
                    output,
                    "const {var_name} = () => {{ return Math.random() > 0.5; }};",
                    var_name = intrinsic.name(),
                );
            }

            Intrinsic::ConstantI32Min => output.push_str(&format!(
                "const {const_name} = -2_147_483_648;\n",
                const_name = intrinsic.name()
            )),

            Intrinsic::ConstantI32Max => {
                uwriteln!(
                    output,
                    r#"
                      const {const_name} = 2_147_483_647;
                    "#,
                    const_name = intrinsic.name()
                )
            }

            Intrinsic::TypeCheckValidI32 => {
                let i32_const_min = Intrinsic::ConstantI32Min.name();
                let i32_const_max = Intrinsic::ConstantI32Max.name();

                uwriteln!(
                    output,
                    r#"
                      const {fn_name} = (n) => typeof n === 'number' && n >= {i32_const_min} && n <= {i32_const_max};
                    "#,
                    fn_name = intrinsic.name()
                );
            }

            Intrinsic::AsyncFunctionCtor => {
                let async_fn_type = Intrinsic::AsyncFunctionCtor.name();
                uwriteln!(
                    output,
                    "const {async_fn_type} = (async () => {{}}).constructor;"
                );
            }

            Intrinsic::TypeCheckAsyncFn => {
                let async_fn_check = Intrinsic::TypeCheckAsyncFn.name();
                let async_fn_ctor = Intrinsic::AsyncFunctionCtor.name();
                uwriteln!(
                    output,
                    r#"
                    const {async_fn_check} = (f) => {{
                        return f instanceof {async_fn_ctor};
                    }};
                    "#,
                );
            }

            Intrinsic::Base64Compile => {
                if !args.transpile_opts.nodejs_compat_disabled {
                    uwriteln!(
                        output,
                        r#"
                          const base64Compile = str => WebAssembly.compile(
                              typeof Buffer !== 'undefined'
                                  ? Buffer.from(str, 'base64')
                                  : Uint8Array.from(atob(str), b => b.charCodeAt(0))
                          );
                        "#
                    );
                } else {
                    uwriteln!(
                        output,
                        r#"
                          const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                        "#
                    );
                }
            }

            Intrinsic::ClampGuest => {
                uwriteln!(
                    output,
                    r#"
                      function clampGuest(i, min, max) {{
                          if (i < min || i > max) {{
                              throw new TypeError(`must be between ${{min}} and ${{max}}`);
                          }}
                          return i;
                      }}
                    "#
                );
            }

            Intrinsic::ComponentError => output.push_str(
                "
                class ComponentError extends Error {
                    constructor (value) {
                        const enumerable = typeof value !== 'string';
                        super(enumerable ? `${String(value)} (see error.payload)` : value);
                        Object.defineProperty(this, 'payload', { value, enumerable });
                    }
                }
            ",
            ),

            Intrinsic::FinalizationRegistryCreate => output.push_str(
                "
                function finalizationRegistryCreate (unregister) {
                    if (typeof FinalizationRegistry === 'undefined') {
                        return { unregister () {} };
                    }
                    return new FinalizationRegistry(unregister);
                }
            ",
            ),

            Intrinsic::FetchCompile => {
                if !args.transpile_opts.nodejs_compat_disabled {
                    output.push_str("
                    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
                    let _fs;
                    async function fetchCompile (url) {
                        if (isNode) {
                            _fs = _fs || await import('node:fs/promises');
                            return WebAssembly.compile(await _fs.readFile(url));
                        }
                        return fetch(url).then(WebAssembly.compileStreaming);
                    }
                ")
                } else {
                    output.push_str(
                        "
                    const fetchCompile = url => fetch(url).then(WebAssembly.compileStreaming);
                ",
                    )
                }
            }

            Intrinsic::GetErrorPayload => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(
                    output,
                    "
                    function getErrorPayload(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) throw e;
                        return e;
                    }}
                "
                )
            }

            Intrinsic::GetErrorPayloadString => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(
                    output,
                    "
                    function getErrorPayloadString(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) return e.message;
                        return e;
                    }}
                "
                )
            }

            Intrinsic::WebIdl(w) => w.render(output),

            Intrinsic::HandleTables => {
                let var_name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                      const {var_name} = [];
                    "#,
                );
            }

            Intrinsic::HasOwnProperty => output.push_str(
                "
                const hasOwnProperty = Object.prototype.hasOwnProperty;
            ",
            ),

            Intrinsic::InstantiateCore => {
                if !args.instantiation_occurred {
                    output.push_str(
                        "
                    const instantiateCore = WebAssembly.instantiate;
                ",
                    )
                }
            }

            Intrinsic::IsLE => output.push_str(
                "
                const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
            ",
            ),

            Intrinsic::SymbolCabiDispose => output.push_str(
                "
                const symbolCabiDispose = Symbol.for('cabiDispose');
            ",
            ),

            Intrinsic::SymbolCabiLower => output.push_str(
                "
                const symbolCabiLower = Symbol.for('cabiLower');
            ",
            ),

            Intrinsic::ScopeId => {
                let name = intrinsic.name();
                uwriteln!(output, "let {name} = 0;");
            }

            Intrinsic::SymbolResourceHandle => output.push_str(
                "
                const symbolRscHandle = Symbol('handle');
            ",
            ),

            Intrinsic::SymbolResourceRep => output.push_str(
                "
                const symbolRscRep = Symbol.for('cabiRep');
            ",
            ),

            Intrinsic::SymbolDispose => {
                let var_name = intrinsic.name();
                uwriteln!(
                    output,
                    "const {var_name} = Symbol.dispose || Symbol.for('dispose');"
                );
            }

            Intrinsic::SymbolAsyncIterator => {
                let var_name = intrinsic.name();
                uwriteln!(output, "const {var_name} = Symbol.asyncIterator;");
            }

            Intrinsic::SymbolIterator => {
                let var_name = intrinsic.name();
                uwriteln!(output, "const {var_name} = Symbol.iterator;");
            }

            Intrinsic::ThrowInvalidBool => output.push_str(
                "
                function throwInvalidBool() {
                    throw new TypeError('invalid variant discriminant for bool');
                }
            ",
            ),

            Intrinsic::ThrowUninitialized => output.push_str(
                "
                function throwUninitialized() {
                    throw new TypeError('Wasm uninitialized use `await $init` first');
                }
            ",
            ),

            Intrinsic::DebugLog => {
                let fn_name = Intrinsic::DebugLog.name();
                output.push_str(&format!(
                    "
                    const {fn_name} = (...args) => {{
                        if (!globalThis?.process?.env?.JCO_DEBUG) {{ return; }}
                        console.debug(...args);
                    }};
                "
                ));
            }

            Intrinsic::PromiseWithResolversPonyfill => {
                let fn_name = intrinsic.name();
                output.push_str(&format!(
                    r#"
                    function {fn_name}() {{
                        if (Promise.withResolvers) {{
                            return Promise.withResolvers();
                        }} else {{
                            let resolve;
                            let reject;
                            const promise = new Promise((res, rej) => {{
                                resolve = res;
                                reject = rej;
                            }});
                            return {{ promise, resolve, reject }};
                        }}
                    }}
                "#
                ));
            }

            Intrinsic::AsyncEventCodeEnum => {
                let name = Intrinsic::AsyncEventCodeEnum.name();
                output.push_str(&format!(
                    "
                    const {name} = {{
                        NONE: 0,
                        SUBTASK: 1,
                        STREAM_READ: 2,
                        STREAM_WRITE: 3,
                        FUTURE_READ: 4,
                        FUTURE_WRITE: 5,
                        TASK_CANCELLED: 6,
                    }};
                "
                ));
            }

            Intrinsic::ManagedBufferClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                output.push_str(&format!(
                    r#"
                    class {managed_buffer_class} {{
                        static MAX_LENGTH = 2**28 - 1;
                        #componentIdx;
                        #memory;

                        #elemMeta = null;

                        #start;
                        #ptr;
                        capacity;
                        processed = 0;

                        #hostOnlyData; // initial data (only filled out for host-owned)

                        target;

                        constructor(args) {{
                            if (args.capacity > {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error(`buffer size [${{args.capacity}}] greater than max length`);
                            }}
                            if (args.componentIdx === undefined) {{ throw new TypeError('missing/invalid component idx'); }}
                            if (args.capacity === undefined) {{ throw new TypeError('missing/invalid capacity'); }}
                            if (!args.elemMeta || typeof args.elemMeta.align32 !== 'number') {{
                                throw new TypeError('missing/invalid element metadata');
                            }}

                            if (!args.memory && args.start === undefined && args.data === undefined) {{
                                throw new TypeError('either memory and start ptr or data must be provided for managed buffers');
                            }}

                            if (args.memory && args.start == undefined) {{
                                throw new TypeError('missing/invalid start ptr, depsite memory being present');
                            }}

                            if (!args.elemMeta.isNone && args.capacity > 0) {{
                                if (args.start && args.start % args.elemMeta.align32 !== 0) {{
                                    throw new Error(`invalid alignment: type with 32bit alignment [${{args.elemMeta.align32}}] at starting pointer [${{args.start}}]`);
                                }}
                                // TODO: memory lenght bounds check
                            }}

                            this.#componentIdx = args.componentIdx;
                            this.#memory = args.memory;
                            this.#start = args.start;
                            this.#ptr = this.#start;
                            this.capacity = args.capacity;
                            this.#elemMeta = args.elemMeta;

                            if (args.data !== undefined && !Array.isArray(args.data)) {{
                                throw new TypeError('host-only data must be an array');
                            }}
                            this.#hostOnlyData = args.data;

                            this.target = args.target;
                        }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        remaining() {{
                            return this.capacity - this.processed;
                        }}

                        componentIdx() {{ return this.#componentIdx; }}

                        getElemMeta() {{ return this.#elemMeta; }}

                        isHostOwned() {{ return !this.#memory; }}

                        read(count) {{
                            {debug_log_fn}('[{managed_buffer_class}#read()] args', {{ count }});
                            if (count === undefined || count <= 0) {{
                                throw new TypeError(`missing/invalid count [${{count}}]`);
                            }}

                            const cap = this.capacity;
                            if (count > cap) {{
                                throw new Error(`cannot read [${{count}}] elements from buffer with capacity [${{cap}}]`);
                            }}

                            let values = [];
                            if (this.#elemMeta.isNone) {{
                                values = [...new Array(count)].map(() => null);
                            }} else {{
                                if (this.isHostOwned()) {{
                                    values = this.#hostOnlyData.slice(0, count);
                                    this.#hostOnlyData = this.#hostOnlyData.slice(count);
                                }} else if (this.#elemMeta.payloadTypeName === 'U8') {{
                                    values = Array.from(new Uint8Array(this.#memory.buffer, this.#ptr, count));
                                    this.#ptr += count;
                                }} else {{
                                    let currentCount = count;
                                    let startPtr = this.#ptr;
                                    if (this.#elemMeta.stringEncoding === undefined) {{
                                        throw new Error('string encoding unknown during read');
                                    }}
                                    let liftCtx = {{
                                        storagePtr: startPtr,
                                        memory: this.#memory,
                                        componentIdx: this.#componentIdx,
                                        stringEncoding: this.#elemMeta.stringEncoding,
                                    }};
                                    if (currentCount < 0) {{ throw new Error('unexpectedly invalid count'); }}
                                    while (currentCount > 0) {{
                                        const [value, _ctx] = this.#elemMeta.liftFn(liftCtx);
                                        values.push(value);
                                        currentCount -= 1;
                                    }}
                                    this.#ptr = liftCtx.storagePtr;
                                }}
                            }}

                            this.processed += count;
                            return values;
                        }}

                        write(values) {{
                            {debug_log_fn}('[{managed_buffer_class}#write()] args', {{ values }});

                            if (!Array.isArray(values)) {{ throw new TypeError('values input to write() must be an array'); }}
                            let rc = this.remaining();
                            if (values.length > rc) {{
                                throw new Error(`cannot write [${{values.length}}] elements to managed buffer with remaining capacity [${{rc}}]`);
                            }}

                            if (this.#elemMeta.isNone) {{
                                if (!values.every(v => v === null)) {{
                                    throw new Error('non-null values in write() to unit managed buffer');
                                }}
                            }} else {{
                                if (this.isHostOwned()) {{
                                    this.#hostOnlyData = this.#hostOnlyData.concat(values);
                                }} else if (this.#elemMeta.payloadTypeName === 'U8') {{
                                    new Uint8Array(this.#memory.buffer, this.#ptr, values.length).set(values);
                                    this.#ptr += values.length;
                                }} else {{
                                    let startPtr = this.#ptr;
                                    if (this.#elemMeta.stringEncoding === undefined) {{
                                        throw new Error('string encoding unknown during write');
                                    }}

                                    const lowerCtx = {{
                                        memory: this.#memory,
                                        storagePtr: startPtr,
                                        componentIdx: this.#componentIdx,
                                        stringEncoding: this.#elemMeta.stringEncoding,
                                        realloc: this.#elemMeta.getReallocFn?.(),
                                        getReallocFn: this.#elemMeta.getReallocFn,
                                    }}
                                    for (const v of values) {{
                                        lowerCtx.vals = [v];
                                        this.#elemMeta.lowerFn(lowerCtx);
                                    }}

                                    this.#ptr = lowerCtx.storagePtr;
                                }}
                            }}

                            this.processed += values.length;
                        }}

                    }}
                "#
                ));
            }

            Intrinsic::BufferManagerClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();

                output.push_str(&format!(r#"
                    class {buffer_manager_class} {{
                        #buffers = new Map();
                        #bufferIDs = new Map();

                        // NOTE: componentIdx === -1 indicates the host
                        getNextBufferID(componentIdx) {{
                            const current = this.#bufferIDs.get(componentIdx);
                            if (current === undefined) {{
                                this.#bufferIDs.set(componentIdx, 1n);
                                return 1n;
                            }}
                            const next = current + 1n;
                            this.#bufferIDs.set(componentIdx, next);
                            return next;
                        }}

                        getBuffer(componentIdx, bufferID) {{
                            {debug_log_fn}('[{buffer_manager_class}#getBuffer()] args', {{ componentIdx, bufferID }});
                            return this.#buffers.get(componentIdx)?.get(bufferID);
                        }}

                        createBuffer(args) {{
                            {debug_log_fn}('[{buffer_manager_class}#createBuffer()] args', args);
                            if (!args || typeof args !== 'object') {{ throw new TypeError('missing/invalid argument object'); }}

                            if (args.start === undefined && args.data === undefined) {{
                                throw new  TypeError('either a starting pointer or initial values must be provided');
                            }}

                            if (args.start !== undefined && args.componentIdx === undefined) {{ throw new TypeError('missing/invalid component idx'); }}
                            if (args.count === undefined) {{ throw new TypeError('missing/invalid obj count'); }}
                            if (!args.elemMeta) {{ throw new TypeError('missing/invalid element metadata for use with managed buffer'); }}

                            const {{ componentIdx, data, start, count }} = args;

                            if (!this.#buffers.has(componentIdx)) {{ this.#buffers.set(componentIdx, new Map()); }}
                            const instanceBuffers = this.#buffers.get(componentIdx);

                            const nextBufID = this.getNextBufferID(componentIdx);

                            const buffer = new {managed_buffer_class}({{
                                componentIdx,
                                memory: args.memory,
                                start: args.start,
                                capacity: args.count,
                                elemMeta: args.elemMeta,
                                data: args.data,
                                target: args.target,
                                stringEncoding: args.stringEncoding,
                            }});

                            if (instanceBuffers.has(nextBufID)) {{
                                throw new Error(`managed buffer with ID [${{nextBufID}}] already exists`);
                            }}
                            instanceBuffers.set(nextBufID, buffer);

                            return {{ id: nextBufID, buffer }};
                        }}

                        deleteBuffer(componentIdx, bufferID) {{
                            {debug_log_fn}('[{buffer_manager_class}#deleteBuffer()] args', {{ componentIdx, bufferID }});
                            return this.#buffers.get(componentIdx)?.delete(bufferID);
                        }}

                    }}
                "#));
            }

            Intrinsic::GlobalBufferManager => {
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                output.push_str(&format!(
                    "const {global_buffer_manager} = new {buffer_manager_class}();"
                ));
            }

            Intrinsic::RepTableClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(r#"
                    class {rep_table_class} {{
                        #data = [0, null];
                        #target;

                        constructor(args) {{
                            this.target = args?.target;
                        }}

                        data() {{ return this.#data; }}

                        insert(val) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ val, target: this.target }});
                            const freeIdx = this.#data[0];
                            if (freeIdx === 0) {{
                                this.#data.push(val);
                                this.#data.push(null);
                                const rep = (this.#data.length >> 1) - 1;
                                {debug_log_fn}('[{rep_table_class}#insert()] inserted', {{ val, target: this.target, rep }});
                                return rep;
                            }}
                            this.#data[0] = this.#data[freeIdx << 1];
                            const placementIdx = freeIdx << 1;
                            this.#data[placementIdx] = val;
                            this.#data[placementIdx + 1] = null;
                            {debug_log_fn}('[{rep_table_class}#insert()] inserted', {{ val, target: this.target, rep: freeIdx }});
                            return freeIdx;
                        }}

                        get(rep) {{
                            {debug_log_fn}('[{rep_table_class}#get()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during get, (cannot be 0)'); }}

                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];
                            return val;
                        }}

                        contains(rep) {{
                            {debug_log_fn}('[{rep_table_class}#contains()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during contains, (cannot be 0)'); }}

                            const baseIdx = rep << 1;
                            return !!this.#data[baseIdx];
                        }}

                        remove(rep) {{
                            {debug_log_fn}('[{rep_table_class}#remove()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during remove, (cannot be 0)'); }}
                            if (this.#data.length === 2) {{ throw new Error('invalid'); }}

                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];

                            this.#data[baseIdx] = this.#data[0];
                            this.#data[0] = rep;

                            return val;
                        }}

                        clear() {{
                            {debug_log_fn}('[{rep_table_class}#clear()] args', {{ rep, target: this.target }});
                            this.#data = [0, null];
                        }}
                    }}
                "#));
            }

            Intrinsic::GlobalComponentMemoryMap => {
                let global_component_memory_map = Intrinsic::GlobalComponentMemoryMap.name();
                output.push_str(&format!(
                    "const {global_component_memory_map} = new Map();\n"
                ));
            }

            Intrinsic::RegisterGlobalMemoryForComponent => {
                let global_component_memory_map = Intrinsic::GlobalComponentMemoryMap.name();
                let register_global_component_memory =
                    Intrinsic::RegisterGlobalMemoryForComponent.name();
                output.push_str(&format!(
                    r#"
                      function {register_global_component_memory}(args) {{
                          const {{ componentIdx, memory, memoryIdx }} = args ?? {{}};
                          if (componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (memory === undefined && memoryIdx === undefined) {{ throw new TypeError('missing both memory & memory idx'); }}
                          let inner = {global_component_memory_map}.get(componentIdx);
                          if (!inner) {{
                              inner = {{}};
                              {global_component_memory_map}.set(componentIdx, inner);
                          }}

                          inner[memoryIdx] = {{ memory, memoryIdx, componentIdx }};
                      }}
                    "#)
                );
            }

            Intrinsic::LookupMemoriesForComponent => {
                let global_component_memory_map = Intrinsic::GlobalComponentMemoryMap.name();
                let lookup_global_memories_for_component =
                    Intrinsic::LookupMemoriesForComponent.name();
                output.push_str(&format!(
                    r#"
                      function {lookup_global_memories_for_component}(args) {{
                          const {{ componentIdx }} = args ?? {{}};
                          if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}

                          const metas = {global_component_memory_map}.get(componentIdx);
                          if (!metas) {{ return []; }}

                          if (args.memoryIdx === undefined) {{
                              return Object.values(metas);
                          }}

                          const meta = metas[args.memoryIdx];
                          return meta?.memory;
                      }}
                    "#)
                );
            }

            Intrinsic::GlobalCurrentTaskMeta => {
                let name = intrinsic.name();
                output.push_str(&format!("const {name} = {{}};\n"));
            }

            Intrinsic::GetGlobalCurrentTaskMetaFn => {
                let get_current_global_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();
                let global_current_task_meta_obj = Intrinsic::GlobalCurrentTaskMeta.name();

                uwriteln!(
                    output,
                    r#"
                      function {get_current_global_task_meta_fn}(componentIdx) {{
                          if (componentIdx === null || componentIdx === undefined) {{
                              throw new Error("missing/invalid component idx");
                          }}
                          const v = {global_current_task_meta_obj}[componentIdx];
                          if (v === undefined || v === null) {{
                              return undefined;
                          }}
                          return {{ ...v }};
                      }}
                    "#,
                );
            }

            Intrinsic::SetGlobalCurrentTaskMetaFn => {
                let set_global_current_task_meta_fn = intrinsic.name();
                let global_current_task_meta_obj = Intrinsic::GlobalCurrentTaskMeta.name();

                uwriteln!(
                    output,
                    r#"
                      function {set_global_current_task_meta_fn}(args) {{
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          const {{ taskID, componentIdx }} = args;
                          return {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                      }}
                    "#,
                );
            }

            Intrinsic::WithGlobalCurrentTaskMetaFn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let with_global_current_task_meta_fn =
                    Intrinsic::WithGlobalCurrentTaskMetaFn.name();
                let global_current_task_meta_obj = Intrinsic::GlobalCurrentTaskMeta.name();

                output.push_str(&format!(
                    r#"
                      function {with_global_current_task_meta_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_task_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}
                          const {{ taskID, componentIdx, fn }} = args;

                          try {{
                              {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                              return fn();
                          }} catch (err) {{
                              {debug_log_fn}("error while executing sync callee/callback", {{
                                  ...args,
                                  err,
                              }});
                              throw err;
                          }} finally {{
                              {global_current_task_meta_obj}[componentIdx] = null;
                          }}
                      }}
                    "#,
                ));
            }

            // NOTE: this function wrapper/closure intrinsic essentially acts as a
            // defactor task queue, ensuring that the right "current task" is set when
            // callees and/or callbacks (WebAssembly functions) run.
            //
            // The idea here is to avoid creating *our own* centralized task queue/event loop,
            // and allow the underlying JS runtime (NodeJS, Browser) to do it's normal scheduling.
            //
            // This costs us complexity -- an `await`/`.then()`/etc anywhere else could park a
            // runtime task and bring us here, in which case we'd be executing *right* before a completely
            // unrelated task (this matters most when it's multiple tasks in the same component idx)
            //
            // e.g.:
            // 1. [componentIdx 1, task 2] entered -- it's async so this is an `await task.enter()`
            // 2. JS runtime switches away from that task
            // 3. [componentIdx 1, task 1] already running, and is about to run it's callee or a callback
            //
            // At (3), we must be careful because the "current" thread is *not* [componentIdx 1, task 1] which
            // is about to try to run it's callback.
            //
            // This is complicated because when two tasks run at the same time, we have to ensure that the component
            // is not exclusively locked by one task. This generally happens @ task.enter(), but an interleaving
            // of events in which this check happens, then *another* task attempts to exclusively lock could happen.
            //
            // In the future, this mechanism may be replaced with a simple event loop that necessarily executes
            // all pending work serially, with this intrinsic becoming simply queueing work onto that event loop.
            //
            Intrinsic::WithGlobalCurrentTaskMetaFnAsync => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let with_global_current_task_meta_async_fn =
                    Intrinsic::WithGlobalCurrentTaskMetaFnAsync.name();
                let global_current_task_meta_obj = Intrinsic::GlobalCurrentTaskMeta.name();

                output.push_str(&format!(
                    r#"
                      async function {with_global_current_task_meta_async_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_task_meta_async_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}

                          const {{ taskID, componentIdx, fn }} = args;

                          try {{
                              {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                              return await fn();
                          }} catch (err) {{
                              {debug_log_fn}("error while executing async callee/callback", {{
                                  ...args,
                                  err,
                              }});
                              throw err;
                          }} finally {{
                              {global_current_task_meta_obj}[componentIdx] = null;
                          }}
                      }}
                    "#,
                ));
            }

            Intrinsic::ClearGlobalCurrentTaskMetaFn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let clear_global_current_task_meta_fn =
                    Intrinsic::ClearGlobalCurrentTaskMetaFn.name();
                let global_current_task_meta_obj = Intrinsic::GlobalCurrentTaskMeta.name();

                output.push_str(&format!(
                    r#"
                      async function {clear_global_current_task_meta_fn}(args) {{
                          {debug_log_fn}('[{clear_global_current_task_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          const {{ taskID, componentIdx }} = args;

                          const meta = {global_current_task_meta_obj}[componentIdx];
                          if (!meta) {{ throw new Error(`missing current task meta for component idx [${{componentIdx}}]`); }}

                          if (meta.taskID !== taskID) {{
                              throw new Error(`task ID [${{meta.taskID}}] != requested ID [${{taskID}}]`);
                          }}
                          if (meta.componentIdx !== componentIdx) {{
                              throw new Error(`component idx [${{meta.componentIdx}}] != requested idx [${{componentIdx}}]`);
                          }}

                          {global_current_task_meta_obj}[componentIdx] = null;
                      }}
                    "#,
                ));
            }

            // TODO(feat): customizable stream classes
            Intrinsic::PlatformReadableStreamClass => {
                let name = intrinsic.name();
                uwriteln!(
                    output,
                    r#"
                        if (!ReadableStream) {{
                            throw new Error('builtin stream class [ReadableStream] is not available');
                        }}
                        const {name} = ReadableStream;
                    "#
                );
            }
        }
    }
}
