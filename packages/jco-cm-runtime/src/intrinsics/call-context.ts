import type { TaskLiftContext, TaskLowerContext, BufferElementContext } from '../runtime.js';

/** Initialize optional fields consistently for direct and memory-based calls. */
export function createLiftContext(options: TaskLiftContext): TaskLiftContext {
    return {
        componentIdx: options.componentIdx,
        params: options.params,
        memory: options.memory,
        memoryView: undefined,
        useDirectParams: options.useDirectParams,
        stringEncoding: options.stringEncoding,
        storagePtr: options.storagePtr,
        storageLen: options.storageLen,
        isBorrowed: options.isBorrowed,
        liftResource: options.liftResource,
    };
}

/** Keep list and scalar lowering contexts on the same field layout. */
export function createLowerContext(options: TaskLowerContext): TaskLowerContext {
    return {
        componentIdx: options.componentIdx,
        params: options.params,
        vals: options.vals,
        memory: options.memory,
        memoryView: undefined,
        useDirectParams: options.useDirectParams,
        stringEncoding: options.stringEncoding,
        storagePtr: options.storagePtr,
        storageLen: options.storageLen,
        realloc: options.realloc,
        lowerResource: options.lowerResource,
    };
}

/** Give element callbacks the same layout for both read and write buffers. */
export function createBufferContext(options: BufferElementContext): BufferElementContext {
    return {
        componentIdx: options.componentIdx,
        memory: options.memory,
        memoryView: undefined,
        storagePtr: options.storagePtr,
        stringEncoding: options.stringEncoding,
        realloc: options.realloc,
        getReallocFn: options.getReallocFn,
        vals: options.vals,
        liftResource: options.liftResource,
        lowerResource: options.lowerResource,
    };
}
