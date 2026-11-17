/** Encode an unsigned Wasm LEB128 integer. */
function leb(value) {
    const bytes = [];
    do {
        const byte = value & 127;
        value >>>= 7;
        bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
}

/** Encode a Wasm UTF-8 name. */
function name(value) {
    const bytes = [...new TextEncoder().encode(value)];
    return [...leb(bytes.length), ...bytes];
}

/** Encode a counted vector. */
function vector(items) {
    return [...leb(items.length), ...items.flat()];
}

/** Build a core module from ordered sections. */
function moduleBytes(sections) {
    return new Uint8Array([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        ...sections.flatMap(([id, bytes]) => [id, ...leb(bytes.length), ...bytes]),
    ]);
}

/** Compile accessors with private cached values and a shared active-binding selector. */
function accessorModule() {
    const functions = [];
    for (let slot = 0; slot < 2; slot++) {
        const check = [0x23, 0, 0x23, 1, 0x47, 0x04, 0x40, 0x10, 0, 0x0b];
        functions.push([0, ...check, 0x23, slot + 2, 0x0b]);
        functions.push([0, ...check, 0x20, 0, 0x24, slot + 2, 0x41, 1, 0x24, 4, 0x0b]);
    }
    return new WebAssembly.Module(
        moduleBytes([
            [
                1,
                vector([
                    [0x60, 0, 0],
                    [0x60, 0, 1, 0x7f],
                    [0x60, 1, 0x7f, 0],
                ]),
            ],
            [
                2,
                vector([
                    [...name(''), ...name('refresh'), 0, 0],
                    [...name(''), ...name('active'), 3, 0x7f, 1],
                    [...name(''), ...name('tag'), 3, 0x7f, 0],
                ]),
            ],
            [3, vector([[1], [2], [1], [2]])],
            [6, vector(Array.from({ length: 3 }, () => [0x7f, 1, 0x41, 0, 0x0b]))],
            [
                7,
                vector([
                    ...['get0', 'set0', 'get1', 'set1'].map((key, index) => [...name(key), 0, index + 1]),
                    ...['value0', 'value1', 'dirty'].map((key, index) => [...name(key), 3, index + 2]),
                ]),
            ],
            [10, vector(functions.map((body) => [...leb(body.length), ...body]))],
        ]),
    );
}

const valueTypes = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c, funcref: 0x70, externref: 0x6f };
const guards = new Map();
let accessors;

/** Compile a native boundary guard; its post-call hook runs on the resumed Wasm stack. */
function guardModule(signature) {
    const key = JSON.stringify(signature);
    if (guards.has(key)) return guards.get(key);
    const encodeType = (type) => {
        if (!(type in valueTypes)) throw new Error(`Unsupported native-context value type: ${type}`);
        return valueTypes[type];
    };
    const params = signature.params.map(encodeType);
    const results = signature.results.map(encodeType);
    const body = [
        ...vector(results.map((type) => [1, type])),
        0x10,
        0, // Flush before calling across the boundary.
        0x06,
        0x40, // try
        ...params.flatMap((_, index) => [0x20, ...leb(index)]),
        0x10,
        1,
        ...results.flatMap((_, index) => [0x21, ...leb(params.length + results.length - index - 1)]),
        0x19, // catch_all: preserve the original exception identity.
        0x10,
        0,
        0x09,
        0,
        0x0b,
        0x10,
        0, // This executes AFTER JSPI resumption, before the caller continues.
        ...results.flatMap((_, index) => [0x20, ...leb(params.length + index)]),
        0x0b,
    ];
    const module = new WebAssembly.Module(
        moduleBytes([
            [
                1,
                vector([
                    [0x60, 0, 0],
                    [0x60, ...vector(params.map((type) => [type])), ...vector(results.map((type) => [type]))],
                ]),
            ],
            [
                2,
                vector([
                    [...name(''), ...name('invalidate'), 0, 0],
                    [...name(''), ...name('target'), 0, 1],
                ]),
            ],
            [3, [1, 1]],
            [7, [1, ...name('call'), 0, 2]],
            [10, [1, ...leb(body.length), ...body]],
        ]),
    );
    guards.set(key, module);
    return module;
}

/**
 * Create an experimental, instance-private context cache. Thread.storage remains the
 * durable store. No guest receives the selector, cached globals, or lifecycle hooks.
 * This requires the generated-runtime instrumentation in transform.mjs.
 */
export function createNativeContextManager() {
    const active = new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
    const bindings = new Map();
    const native = new WeakSet();
    const guardedSignatures = new WeakMap();
    const modules = new WeakMap();
    let current;
    let nextTag = 1;
    const stats = { refreshes: 0, flushes: 0, bindings: 0, guards: 0 };

    /** Flush to the captured thread's slots before changing any selection or storage. */
    function invalidate() {
        if (!current) return;
        if (current.exports.dirty.value) {
            current.storage[0] = current.exports.value0.value;
            current.storage[1] = current.exports.value1.value;
            current.exports.dirty.value = 0;
            stats.flushes++;
        }
        active.value = 0;
        current = undefined;
    }

    /** Resolve a live thread, rejecting recycled handles belonging to another task. */
    function resolve(context, meta) {
        if (!meta || meta.componentIdx === -1 || !meta.threadID) return;
        const thread = context.lookup.asyncState.get(meta.componentIdx)?.threads.get(meta.threadID);
        if (thread && thread.taskID() === meta.taskID) return thread;
    }

    /** Bind a compile-time context slot to native functions, sharing cache state per component. */
    function bind(context, ctx, operation) {
        if (![0, 1].includes(ctx.slot) || !['get', 'set'].includes(operation))
            throw new Error('Invalid native context binding');
        let binding = bindings.get(ctx.componentIdx);
        if (!binding) {
            const tag = nextTag++;
            binding = { context, exports: undefined, storage: undefined };
            bindings.set(ctx.componentIdx, binding);
            /** Refresh on the first access after a runtime boundary. */
            const refresh = () => {
                invalidate();
                const meta = ctx.componentIdx == null ? context.registers.current : context.registers[ctx.componentIdx];
                const thread = resolve(context, meta) || resolve(context, context.registers.current);
                if (!thread) throw new Error('missing current thread');
                const storage = thread.storage;
                if (storage.length !== 2) throw new Error('invalid context storage');
                binding.storage = storage;
                binding.exports.value0.value = storage[0];
                binding.exports.value1.value = storage[1];
                current = binding;
                active.value = tag;
                stats.refreshes++;
            };
            accessors ??= accessorModule();
            binding.exports = new WebAssembly.Instance(accessors, { '': { refresh, active, tag } }).exports;
            for (const key of ['get0', 'set0', 'get1', 'set1']) native.add(binding.exports[key]);
            stats.bindings++;
        } else if (binding.context !== context) {
            throw new Error('Native context lookup changed within an instance');
        }
        return binding.exports[operation + ctx.slot];
    }

    /** Wrap an ordinary core call without converting a native accessor back into JS. */
    function guard(target, signature) {
        if (native.has(target)) return target;
        const key = JSON.stringify(signature);
        if (guardedSignatures.get(target) === key) return target;
        const wrapped = new WebAssembly.Instance(guardModule(signature), { '': { invalidate, target } }).exports.call;
        guardedSignatures.set(wrapped, key);
        if (target?._jcoMaySuspend !== undefined) wrapped._jcoMaySuspend = target._jcoMaySuspend;
        stats.guards++;
        return wrapped;
    }

    /** Associate generated signature metadata with its compiled core module. */
    function registerModule(module, signatures) {
        if (module?.then) return module.then((compiled) => registerModule(compiled, signatures));
        modules.set(module, signatures);
        return module;
    }

    /** Guard every ordinary import/export, including imports that suspend via JSPI. */
    function wrapInstantiator(instantiate) {
        return async (module, imports = {}) => {
            const metadata = modules.get(module);
            if (!metadata) throw new Error('Missing native-context core signatures');
            const guarded = Object.fromEntries(Object.entries(imports).map(([key, value]) => [key, { ...value }]));
            for (const entry of metadata.imports) {
                guarded[entry.module][entry.name] = guard(
                    imports[entry.module][entry.name],
                    metadata.types[entry.type],
                );
            }
            invalidate();
            try {
                const instance = await instantiate(module, guarded);
                const exports = { ...instance.exports };
                for (const entry of metadata.exports)
                    exports[entry.name] = guard(exports[entry.name], metadata.types[entry.type]);
                return { exports };
            } finally {
                invalidate();
            }
        };
    }

    /** Invalidate before register updates, including save/restore and clearing a thread. */
    function registers() {
        return new Proxy(
            {},
            {
                set(target, key, value) {
                    invalidate();
                    target[key] = value;
                    return true;
                },
                deleteProperty(target, key) {
                    invalidate();
                    return Reflect.deleteProperty(target, key);
                },
                defineProperty(target, key, descriptor) {
                    invalidate();
                    return Reflect.defineProperty(target, key, descriptor);
                },
            },
        );
    }
    return { bind, invalidate, registers, module: registerModule, wrapInstantiator, guard, stats };
}
