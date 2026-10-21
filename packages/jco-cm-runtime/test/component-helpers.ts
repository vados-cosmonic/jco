import { runtime, type ComponentTask, type RuntimeOptions, type ComponentIntrinsics } from '../src/index.js';

export function create(options: Partial<RuntimeOptions> = {}) {
    return runtime.create({
        requestedApiVersion: 1,
        strict: false,
        flagsAsBigInt: false,
        nodejsCompat: true,
        asyncDeterminism: 'random',
        ...options,
    }).intrinsics;
}

export function clearDeadlockCheck(component: ComponentIntrinsics) {
    if (component.storeAsyncState.deadlockCheck !== null) {
        clearTimeout(component.storeAsyncState.deadlockCheck as ReturnType<typeof setTimeout>);
        component.storeAsyncState.deadlockCheck = null;
    }
}

export function task(id: bigint, componentIdx = 0, root?: ComponentTask) {
    let rejected = false;
    let cancelled = false;
    let locked = true;
    const errors: unknown[] = [];
    let slices = 0;
    let progress = 0;
    const value: ComponentTask = {
        id: () => id,
        componentIdx: () => componentIdx,
        taskState: () => (rejected ? 'rejected' : 'pending'),
        entryFnName: () => 'test',
        getParentSubtask: () => undefined,
        getRootTask: () => root ?? value,
        isResolvedState: () => rejected,
        isRejected: () => rejected,
        isCancelled: () => cancelled,
        needsExclusiveLock: () => locked,
        endFirstSlice: () => {
            slices++;
        },
        notifyProgress: () => {
            progress++;
        },
        setErrored: (error) => {
            errors.push(error);
        },
        reject: () => {
            rejected = true;
        },
    };
    return {
        value,
        errors,
        get slices() {
            return slices;
        },
        get progress() {
            return progress;
        },
        cancel() {
            cancelled = true;
        },
        unlock() {
            locked = false;
        },
    };
}
