import type {
    ComponentModule,
    ComponentDeadlockDetail,
    ComponentAsyncStateConstructor,
    ComponentAsyncStateContext,
    ComponentAsyncStates,
    ComponentNormalizeTrapContext,
    ComponentDeadlockContext,
    ComponentHostOperationContext,
    ComponentMayLeaveContext,
    ComponentRecordTrapContext,
    ComponentStateLookupContext,
    AdmissionTicket,
    SuspendedTask,
    SuspendTaskOptions,
    ComponentTask,
    RepTable as RepTableType,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { promiseWithResolvers } from './core-promises.js';
import { getHandleIndexSpace } from './resource.js';

export const initializeInstanceFlags: ComponentModule['initializeInstanceFlags'] = () => new Map();
export const initializeStoreTrap: ComponentModule['initializeStoreTrap'] = () => ({ error: null });
export const initializeStoreAsyncState: ComponentModule['initializeStoreAsyncState'] = () => ({
    deadlockCheck: null,
    pendingHostOperations: 0,
});
export const initializeComponentAsyncStates: ComponentModule['initializeComponentAsyncStates'] = () => new Map();
export const initializeCoreTrapMessages: ComponentModule['initializeCoreTrapMessages'] = (messages) =>
    new Map(Object.entries(messages));

export function normalizeCoreTrap<T>(context: ComponentNormalizeTrapContext, err: T): T {
    const { RuntimeError, messages: trapMessages } = context;
    if (!(err instanceof RuntimeError)) {
        return err;
    }
    const message = trapMessages.get(err.message);
    if (message !== undefined) {
        err.message = message;
    }
    return err;
}

export function checkForDeadlock(context: ComponentDeadlockContext) {
    const { RuntimeError, storeAsyncState, storeTrap, asyncState } = context;
    if (storeAsyncState.deadlockCheck !== null || storeTrap.error !== null) {
        return;
    }
    storeAsyncState.deadlockCheck = setTimeout(() => {
        storeAsyncState.deadlockCheck = null;
        if (storeTrap.error !== null || storeAsyncState.pendingHostOperations > 0) {
            return;
        }

        const suspendedTasks = new Set<ComponentTask>();
        for (const state of asyncState.values()) {
            if (state.hasPendingSchedulerWork()) {
                state.runTickLoop();
                return;
            }
            for (const meta of state.suspendedTaskMetas()) {
                suspendedTasks.add(meta.task);
            }
        }

        const unresolvedRoots = new Set<ComponentTask>();
        for (const task of suspendedTasks) {
            const root = task.getRootTask();
            if (!root.isResolvedState()) {
                unresolvedRoots.add(root);
            }
        }
        if (unresolvedRoots.size === 0) {
            return;
        }

        const err = new RuntimeError('wasm trap: deadlock detected: event loop cannot make further progress');
        // Which tasks were waiting, and on whose behalf. The message stays
        // exactly what the Canonical ABI calls for, so this rides alongside
        // it: a deadlock reported from a real program is otherwise a bare
        // sentence, and the state that produced it is gone by the time
        // anyone reads the failure.
        (err as Error & { deadlockDetail: ComponentDeadlockDetail }).deadlockDetail = {
            pendingHostOperations: storeAsyncState.pendingHostOperations,
            suspendedTasks: [...suspendedTasks].map((task) => ({
                taskID: task.id(),
                componentIdx: task.componentIdx(),
                state: task.taskState(),
                rootTaskID: task.getRootTask().id(),
            })),
            unresolvedRootTaskIDs: [...unresolvedRoots].map((root) => root.id()),
        };
        storeTrap.error = err;
        for (const root of unresolvedRoots) {
            root.setErrored(err);
            root.reject(err);
        }
        for (const task of suspendedTasks) {
            if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {
                task.setErrored(err);
                task.reject(err);
            }
        }
        // A deadlock is a trap of the whole store: no instance may be entered again.
        for (const state of asyncState.values()) {
            state.markTrapped(err);
        }
        for (const state of asyncState.values()) {
            state.abandonLockWaiters();
        }
        for (const state of asyncState.values()) {
            state.abandonAdmissionWaiters();
        }
        for (const state of asyncState.values()) {
            state.runTickLoop();
        }
    }, 0);
}

export function trackHostOperation<T>(
    context: ComponentHostOperationContext,
    operation: () => T,
): T | Promise<Awaited<T>> {
    const { storeAsyncState, asyncState, symbolDispose } = context;
    const result = operation();
    if (
        result === null ||
        (typeof result !== 'object' && typeof result !== 'function') ||
        typeof (result as { then?: unknown }).then !== 'function'
    ) {
        return result;
    }

    storeAsyncState.pendingHostOperations++;
    const tracked = Promise.resolve(result).finally(() => {
        storeAsyncState.pendingHostOperations--;
        if (storeAsyncState.pendingHostOperations < 0) {
            throw new Error('negative pending host operation count');
        }
        for (const state of asyncState.values()) {
            state.runTickLoop();
        }
        checkForDeadlock(context);
    });

    // Forward disposal to the host's value, so it is notified if a guest
    // discards the value (e.g. a future) produced from this operation
    for (const sym of [Symbol.asyncDispose, symbolDispose]) {
        if (typeof sym === 'symbol' && typeof (result as Record<symbol, unknown>)[sym] === 'function') {
            (tracked as unknown as Record<symbol, unknown>)[sym] = () =>
                (result as Record<symbol, () => unknown>)[sym]();
        }
    }

    return tracked;
}

export function checkMayLeave(context: ComponentMayLeaveContext, componentIdx: number) {
    const { RuntimeError, instanceFlags } = context;
    if (instanceFlags.get(componentIdx)?.value !== 1) {
        throw new RuntimeError('cannot leave component instance');
    }
}

export function guardMayLeave<A extends unknown[], T, R>(
    context: ComponentMayLeaveContext,
    componentIdx: number,
    fn: (this: R, ...args: A) => T,
) {
    return function (this: R, ...args: A) {
        checkMayLeave(context, componentIdx);
        return fn.apply(this, args);
    };
}

export function recordTrap(
    context: ComponentRecordTrapContext,
    componentIdx: number | null | undefined,
    err: unknown,
    convertsRangeErrors = false,
) {
    const { RuntimeError, registers: currentTaskMeta } = context;
    // A built-in reading or writing guest memory past its end fails with a
    // DataView RangeError: that is the Canonical ABI's out-of-bounds trap.
    if (convertsRangeErrors && err instanceof RangeError) {
        err = new RuntimeError('out of bounds memory access');
    }
    if (err instanceof RuntimeError) {
        // (a trampoline without a static instance records against the
        // component whose guest code is running)
        const idx = componentIdx ?? currentTaskMeta.current?.componentIdx;
        if (idx !== undefined && idx !== null) {
            getOrCreateAsyncState(context.lookup, idx).markTrapped(err);
        }
    }
    return err;
}

export function guardTrap<A extends unknown[], T, R>(
    context: ComponentRecordTrapContext,
    componentIdx: number | null | undefined,
    fn: (this: R, ...args: A) => T,
    convertsRangeErrors = false,
) {
    return function (this: R, ...args: A) {
        try {
            return fn.apply(this, args);
        } catch (err) {
            throw recordTrap(context, componentIdx, err, convertsRangeErrors);
        }
    };
}

export function backpressureInc(context: ComponentStateLookupContext, componentIdx: number) {
    debugLog('[backpressureInc()] args', { componentIdx });
    const state = getOrCreateAsyncState(context, componentIdx);
    if (!state) {
        throw new Error(`missing component state for component [${componentIdx}]`);
    }
    const newValue = state.incrementBackpressure();
    debugLog('[backpressureInc()] incremented', { componentIdx, newValue });
}

export function backpressureDec(context: ComponentStateLookupContext, componentIdx: number) {
    debugLog('[backpressureDec()] args', { componentIdx });
    const state = getOrCreateAsyncState(context, componentIdx);
    const newValue = state.decrementBackpressure();
    debugLog('[backpressureDec()] decremented', { componentIdx, newValue });
}

export function getOrCreateAsyncState(context: ComponentStateLookupContext, componentIdx: number) {
    const { asyncState, ComponentAsyncState } = context;
    if (!asyncState.has(componentIdx)) {
        const newState = new ComponentAsyncState({ componentIdx });
        asyncState.set(componentIdx, newState);
    }
    return asyncState.get(componentIdx)!;
}

export function setAllError(states: Pick<ComponentAsyncStates, 'values'>) {
    debugLog('[setAllError()]');
    for (const state of states.values()) {
        state.setErrored();
    }
}

export function initializeComponentAsyncStateClass(
    context: ComponentAsyncStateContext,
): ComponentAsyncStateConstructor {
    const { RuntimeError, RepTable, indexSpaces, instanceFlags, storeTrap, normalization, cannotEnter, deadlock } =
        context;
    class ComponentAsyncState {
        static EVENT_HANDLER_EVENTS = ['backpressure-change'];

        static TickResult = {
            // no suspended tasks remain
            DONE: 'done',
            // a suspended task was resumed (more may be ready)
            RESUMED: 'resumed',
            // suspended tasks remain but none were ready
            IDLE: 'idle',
        } as const;

        #componentIdx: number;
        #callingAsyncImport = false;
        #syncImportWait = promiseWithResolvers<void>();
        #lockHolderTaskID: bigint | null = null;
        #lockWaiters: { taskID: bigint; resolve(): void }[] = [];
        #admissionQueue: AdmissionTicket[] = [];
        #lockHandoffScheduled = false;
        #pendingTaskStarts = 0;

        #suspendedTasksByTaskID = new Map<bigint, SuspendedTask>();
        #suspendedTaskIDs: (bigint | null)[] = [];
        #errored: unknown = null;
        #trapped = false;
        #trapError: unknown = null;
        #backpressure = 0;
        #backpressureWaiters = 0n;

        #handlerMap = new Map<string, { id: bigint; fn(value: number): void; event: string }[]>();
        #nextHandlerID = 0n;

        #tickLoop: number | null = null;

        #onExclusiveReleaseHandlers: ((() => void) | null)[] = [];

        #mayLeave = true;

        handles: RepTableType;
        subtasks: RepTableType;

        constructor(args: { componentIdx: number }) {
            this.#componentIdx = args.componentIdx;
            this.handles = new RepTable({
                target: `component [${this.#componentIdx}] handles (waitable objects)`,
                space: getHandleIndexSpace(indexSpaces, this.#componentIdx),
            });
            this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
        }

        componentIdx() {
            return this.#componentIdx;
        }

        get mayLeave() {
            const flags = instanceFlags.get(this.#componentIdx);
            return flags === undefined ? this.#mayLeave : flags.value === 1;
        }
        set mayLeave(value: boolean) {
            if (typeof value !== 'boolean') {
                throw new TypeError('mayLeave must be a boolean');
            }
            this.#mayLeave = value;
            const flags = instanceFlags.get(this.#componentIdx);
            if (flags !== undefined) {
                flags.value = value ? 1 : 0;
            }
        }

        errored() {
            return this.#errored !== null;
        }
        setErrored(err?: unknown) {
            debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
            if (this.#errored) {
                return;
            }
            if (!err) {
                err = Object.assign(new Error('error elswehere (see other component instance error)'), {
                    componentIdx: this.#componentIdx,
                });
            }
            this.#errored = err;
        }

        markTrapped(err: unknown) {
            if (!(err instanceof RuntimeError)) {
                return false;
            }
            const trap = normalizeCoreTrap(normalization, err);
            this.#trapped = true;
            if (this.#trapError === null) {
                this.#trapError = trap;
            }
            debugLog('[ComponentAsyncState#markTrapped()] component trapped', {
                err,
                componentIdx: this.#componentIdx,
            });
            if (storeTrap.error === null) {
                storeTrap.error = trap;
            }
            return true;
        }

        isTrapped() {
            return this.#trapped;
        }
        // For work that was already under way or queued when the instance
        // trapped: it fails with that trap (nothing runs after a trap).
        throwIfInterrupted() {
            if (this.#trapped) {
                throw this.#trapError ?? new RuntimeError(cannotEnter);
            }
        }
        throwIfTrapped() {
            if (this.#trapped) {
                throw new RuntimeError(cannotEnter);
            }
        }

        callingSyncImport(): boolean;
        callingSyncImport(val: boolean): void;
        callingSyncImport(val?: boolean) {
            if (val === undefined) {
                return this.#callingAsyncImport;
            }
            if (typeof val !== 'boolean') {
                throw new TypeError('invalid setting for async import');
            }
            const prev = this.#callingAsyncImport;
            this.#callingAsyncImport = val;
            if (prev === true && this.#callingAsyncImport === false) {
                this.#notifySyncImportEnd();
            }
        }

        #notifySyncImportEnd() {
            const existing = this.#syncImportWait;
            this.#syncImportWait = promiseWithResolvers<void>();
            existing.resolve();
        }

        async waitForSyncImportCallEnd() {
            await this.#syncImportWait.promise;
        }

        setBackpressure(v: number) {
            this.#backpressure = v;
            for (const handler of [...(this.#handlerMap.get('backpressure-change') ?? [])]) {
                handler.fn(v);
            }
            return this.#backpressure;
        }
        getBackpressure() {
            return this.#backpressure;
        }

        incrementBackpressure() {
            const current = this.#backpressure;
            if (current < 0 || current > 2 ** 16) {
                throw new Error(`invalid current backpressure value [${current}]`);
            }
            const newValue = this.getBackpressure() + 1;
            if (newValue >= 2 ** 16) {
                throw new Error(`invalid new backpressure value [${newValue}], overflow`);
            }
            return this.setBackpressure(newValue);
        }

        decrementBackpressure() {
            const current = this.#backpressure;
            if (current < 0 || current > 2 ** 16) {
                throw new Error(`invalid current backpressure value [${current}]`);
            }
            // Canonical ABI `backpressure.dec`: trap if the counter would go
            // below zero.
            const newValue = current - 1;
            if (newValue < 0) {
                throw new RuntimeError('backpressure counter underflow');
            }
            return this.setBackpressure(newValue);
        }
        hasBackpressure() {
            return this.#backpressure > 0;
        }

        waitForBackpressure() {
            if (!this.hasBackpressure()) {
                return Promise.resolve(null);
            }
            this.addBackpressureWaiter();
            return new Promise<null>((resolve) => {
                let pending = true;
                const handlerID = this.registerHandler({
                    event: 'backpressure-change',
                    fn: (bp) => {
                        if (bp !== 0 || !pending) {
                            return;
                        }
                        pending = false;
                        this.removeHandler({ event: 'backpressure-change', handlerID });
                        this.removeBackpressureWaiter();
                        resolve(null);
                    },
                });
            });
        }

        registerHandler(args: { event: string; fn(value: number): void }) {
            const { event, fn } = args;
            if (!event) {
                throw new Error('missing handler event');
            }
            if (!fn) {
                throw new Error('missing handler fn');
            }

            if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
                throw new Error(`unrecognized event handler [${event}]`);
            }

            const handlerID = this.#nextHandlerID++;
            let handlers = this.#handlerMap.get(event);
            if (!handlers) {
                handlers = [];
                this.#handlerMap.set(event, handlers);
            }

            handlers.push({ id: handlerID, fn, event });
            return handlerID;
        }

        removeHandler(args: { event: string; handlerID: bigint }) {
            const { event, handlerID } = args;
            const registeredHandlers = this.#handlerMap.get(event);
            if (!registeredHandlers) {
                return;
            }
            const found = registeredHandlers.find((h) => h.id === handlerID);
            if (!found) {
                return;
            }
            this.#handlerMap.set(
                event,
                registeredHandlers.filter((h) => h.id !== handlerID),
            );
        }

        getBackpressureWaiters() {
            return this.#backpressureWaiters;
        }
        addBackpressureWaiter() {
            this.#backpressureWaiters++;
        }
        removeBackpressureWaiter() {
            this.#backpressureWaiters--;
            if (this.#backpressureWaiters < 0) {
                throw new Error('unexepctedly negative number of backpressure waiters');
            }
        }

        // The per-slice mutual-exclusion lock for guest execution in this
        // component instance. Guest slices (callback invocations and
        // sync-lifted bodies) must be atomic per component even across the
        // JSPI suspensions jco introduces for host imports: wit-bindgen's
        // executors publish per-task state in single linear-memory cells
        // (the wasip3-task pointer, context-local storage discipline) that
        // an interleaved slice of the same component corrupts
        //
        // The lock is *owned*: acquisition records the holder task and
        // release is a no-op for anyone else, so a task exiting can no
        // longer drop a hold it does not own (blind acquire/release-any
        // was the previous discipline). Contended acquisition queues
        // FIFO; release hands the lock to the next waiter directly.
        isExclusivelyLocked() {
            return this.#lockHolderTaskID !== null;
        }
        exclusivelyLockedBy(taskID: bigint) {
            return this.#lockHolderTaskID === taskID;
        }

        exclusiveLock(taskID: bigint) {
            debugLog('[ComponentAsyncState#exclusiveLock()]', {
                holder: this.#lockHolderTaskID,
                requester: taskID,
                componentIdx: this.#componentIdx,
            });
            if (taskID === undefined || taskID === null) {
                throw new Error('exclusive lock requires the acquiring task id');
            }
            if (this.#lockHolderTaskID !== null) {
                throw new Error(
                    `component [${this.#componentIdx}] exclusive lock held by task [${this.#lockHolderTaskID}], requested by [${taskID}]`,
                );
            }
            this.#lockHolderTaskID = taskID;
        }

        // Awaitable acquisition: takes the lock immediately when free,
        // otherwise queues FIFO behind the current holder and earlier
        // waiters. The resolved promise implies ownership.
        acquireExclusiveLock(taskID: bigint) {
            if (taskID === undefined || taskID === null) {
                throw new Error('exclusive lock requires the acquiring task id');
            }
            if (this.#lockHolderTaskID === null) {
                this.#lockHolderTaskID = taskID;
                debugLog('[ComponentAsyncState#acquireExclusiveLock()] acquired', {
                    holder: taskID,
                    componentIdx: this.#componentIdx,
                });
                return;
            }
            if (this.#lockHolderTaskID === taskID) {
                throw new Error(`task [${taskID}] already holds the lock for component [${this.#componentIdx}]`);
            }
            debugLog('[ComponentAsyncState#acquireExclusiveLock()] waiting', {
                holder: this.#lockHolderTaskID,
                requester: taskID,
                componentIdx: this.#componentIdx,
                queued: this.#lockWaiters.length,
            });
            return new Promise<void>((resolve) => {
                this.#lockWaiters.push({ taskID, resolve });
            });
        }

        // Release every queued entry without granting ownership, so that
        // calls waiting to enter a trapped store fail instead of hanging.
        // FIFO admission of tasks entering this instance (Canonical ABI
        // `inst.pending`): a task enters only after every task that asked to
        // enter before it has entered or given up, so calls enter in the order
        // they were made, whatever each waits for on the way.
        takeAdmissionTicket(taskID: bigint) {
            const ticket = { taskID, ...promiseWithResolvers<void>() };
            this.#admissionQueue.push(ticket);
            return ticket;
        }
        hasPendingAdmissions() {
            return this.#admissionQueue.length > 0;
        }
        waitForAdmissionTurn(ticket: AdmissionTicket) {
            if (this.#admissionQueue[0] === ticket) {
                return;
            }
            return ticket.promise;
        }
        releaseAdmissionTicket(ticket: AdmissionTicket) {
            const idx = this.#admissionQueue.indexOf(ticket);
            if (idx === -1) {
                return;
            }
            this.#admissionQueue.splice(idx, 1);
            if (idx === 0 && this.#admissionQueue.length > 0) {
                this.#admissionQueue[0].resolve();
            }
        }
        // Release every queued entry (the instance trapped): each then fails
        // in `enter()` instead of waiting forever.
        abandonAdmissionWaiters() {
            const tickets = this.#admissionQueue.splice(0);
            for (const ticket of tickets) {
                ticket.resolve();
            }
        }

        abandonLockWaiters() {
            const waiters = this.#lockWaiters.splice(0);
            for (const waiter of waiters) {
                waiter.resolve();
            }
        }

        cancelExclusiveLockWaiter(taskID: bigint) {
            const idx = this.#lockWaiters.findIndex((waiter) => waiter.taskID === taskID);
            if (idx === -1) {
                return false;
            }
            const [waiter] = this.#lockWaiters.splice(idx, 1);
            // Release the awaiting `enter()` continuation without granting
            // ownership. It observes the task's resolved cancellation state
            // before attempting to execute guest code.
            waiter.resolve();
            return true;
        }

        exclusiveRelease(taskID: bigint) {
            debugLog('[ComponentAsyncState#exclusiveRelease()] args', {
                holder: this.#lockHolderTaskID,
                releaser: taskID,
                componentIdx: this.#componentIdx,
            });
            if (this.#lockHolderTaskID !== taskID) {
                // Ownerless releases were the historical behavior; a foreign
                // release now leaves the hold intact
                debugLog('[ComponentAsyncState#exclusiveRelease()] ignoring foreign release', {
                    holder: this.#lockHolderTaskID,
                    releaser: taskID,
                    componentIdx: this.#componentIdx,
                });
                return false;
            }

            // Make the release observable before handing the lock to the next
            // asynchronous guest slice.
            //
            // Release handlers may expose a lifted value whose consumer immediately
            // performs a synchronous call on the same component; that call must run
            // while the instance is genuinely unlocked, not via enterSync's
            // lock-free fallback code.
            this.#lockHolderTaskID = null;

            this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter((v) => !!v);
            for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {
                try {
                    this.#onExclusiveReleaseHandlers[idx] = null;
                    f!();
                } catch (err) {
                    debugLog('error while executing handler for next exclusive release', err);
                    throw err;
                }
            }
            this.#scheduleLockHandoff();
            return true;
        }

        #scheduleLockHandoff() {
            if (this.#lockHandoffScheduled || this.#lockWaiters.length === 0) {
                return;
            }
            this.#lockHandoffScheduled = true;
            queueMicrotask(() => {
                this.#lockHandoffScheduled = false;
                // A synchronous call triggered by a release handler gets the
                // first opportunity to use the unlocked component. Its own
                // release schedules the next handoff; re-queueing one here
                // would spin the microtask queue for as long as the holder
                // stays blocked (e.g. in a synchronous wait), starving every
                // timer, the deadlock detector included.
                if (this.#lockHolderTaskID !== null) {
                    return;
                }
                const next = this.#lockWaiters.shift();
                if (!next) {
                    return;
                }
                this.#lockHolderTaskID = next.taskID;
                next.resolve();
            });
        }

        onNextExclusiveRelease(fn: () => void) {
            debugLog('[ComponentAsyncState#()onNextExclusiveRelease] registering');
            this.#onExclusiveReleaseHandlers.push(fn);
        }

        async waitForExclusiveRelease() {
            while (this.isExclusivelyLocked()) {
                await new Promise<void>((resolve) => this.onNextExclusiveRelease(resolve));
            }
        }

        #getSuspendedTaskMeta(taskID: bigint) {
            return this.#suspendedTasksByTaskID.get(taskID);
        }

        #removeSuspendedTaskMeta(taskID: bigint) {
            debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', {
                taskID,
                componentIdx: this.#componentIdx,
            });
            const idx = this.#suspendedTaskIDs.findIndex((t) => t === taskID);
            const meta = this.#suspendedTasksByTaskID.get(taskID);
            this.#suspendedTaskIDs[idx] = null;
            this.#suspendedTasksByTaskID.delete(taskID);
            return meta;
        }

        #addSuspendedTaskMeta(meta: SuspendedTask) {
            if (!meta) {
                throw new Error('missing task meta');
            }
            const taskID = meta.taskID;
            this.#suspendedTasksByTaskID.set(taskID, meta);
            this.#suspendedTaskIDs.push(taskID);
            if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
                this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter((t) => t !== null);
            }
        }

        // TODO(threads): readyFn is normally on the thread
        suspendTask(args: SuspendTaskOptions) {
            const { task, readyFn, cancellable, onResume } = args;
            const taskID = task.id();
            const componentIdx = task.componentIdx();
            // (a blocked task ended its first slice)
            task.endFirstSlice();
            debugLog('[ComponentAsyncState#suspendTask()]', {
                taskID,
                componentIdx: this.#componentIdx,
                taskEntryFnName: task.entryFnName(),
                subtask: task.getParentSubtask(),
            });

            if (componentIdx !== this.#componentIdx) {
                throw new Error('assert: task component idx should match async state');
            }

            if (this.#getSuspendedTaskMeta(taskID)) {
                throw new Error(`task [${taskID}] already suspended`);
            }

            let promise: Promise<boolean> | undefined;
            let resume;
            if (onResume) {
                resume = () => onResume(!task.isCancelled());
            } else {
                const resolvers = promiseWithResolvers<boolean>();
                promise = resolvers.promise;
                resume = () => resolvers.resolve(!task.isCancelled());
            }
            this.#addSuspendedTaskMeta({
                task,
                taskID,
                cancellable,
                readyFn,
                resume: () => {
                    debugLog('[ComponentAsyncState] resuming suspended task', {
                        taskID,
                        componentIdx: this.#componentIdx,
                    });
                    // TODO(threads): it's thread cancellation we should be checking for below, not task
                    resume();
                },
            });

            // A caller synchronously driving one task quantum (for
            // example, subtask.cancel) waits for the resumed task to
            // either resolve or suspend again.
            task.notifyProgress();

            this.runTickLoop();
            checkForDeadlock(deadlock);

            return promise;
        }

        resumeTaskByID(taskID: bigint) {
            const meta = this.#removeSuspendedTaskMeta(taskID);
            if (!meta) {
                return false;
            }
            if (meta.taskID !== taskID) {
                throw new Error('task ID does not match');
            }
            meta.resume();
            return true;
        }

        suspendedTaskReady(taskID: bigint) {
            const meta = this.#getSuspendedTaskMeta(taskID);
            if (!meta) {
                return false;
            }
            if (!meta.readyFn) {
                throw new Error(`suspended task [${taskID}] is missing a readiness function`);
            }
            if (meta.task.isRejected()) {
                return true;
            }
            if (!meta.readyFn()) {
                return false;
            }
            return !meta.task.needsExclusiveLock() || !this.isExclusivelyLocked() || this.exclusivelyLockedBy(taskID);
        }

        suspendedTaskCancellable(taskID: bigint) {
            return !!this.#getSuspendedTaskMeta(taskID)?.cancellable;
        }

        isTaskSuspended(taskID: bigint) {
            return this.#suspendedTasksByTaskID.has(taskID);
        }

        suspendedTaskMetas() {
            return this.#suspendedTasksByTaskID.values();
        }

        addPendingTaskStart() {
            this.#pendingTaskStarts++;
        }
        removePendingTaskStart() {
            this.#pendingTaskStarts--;
        }

        hasPendingSchedulerWork() {
            if (this.#pendingTaskStarts > 0) {
                return true;
            }
            if (this.#lockHandoffScheduled) {
                return true;
            }
            for (const meta of this.#suspendedTasksByTaskID.values()) {
                if (meta.task.isRejected() || meta.readyFn()) {
                    return true;
                }
            }
            return false;
        }

        async runTickLoop() {
            if (this.#tickLoop !== null) {
                return;
            }
            this.#tickLoop = 1;
            setTimeout(async () => {
                let result = this.tick();
                while (result !== ComponentAsyncState.TickResult.DONE) {
                    if (result === ComponentAsyncState.TickResult.IDLE) {
                        checkForDeadlock(deadlock);
                    }
                    // After resuming a task, re-tick as soon as the resumed
                    // slice's microtask continuations have drained (timeout 0)
                    // so queued sibling resumptions aren't charged the idle
                    // polling interval; otherwise poll at the idle cadence.
                    const delay = result === ComponentAsyncState.TickResult.RESUMED ? 0 : 10;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    result = this.tick();
                }
                this.#tickLoop = null;
            }, 10);
        }

        tick() {
            // debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });

            const resumableTasks = this.#suspendedTaskIDs.filter((t) => t !== null);
            for (const taskID of resumableTasks) {
                const meta = this.#suspendedTasksByTaskID.get(taskID);
                if (!meta || !meta.readyFn) {
                    throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
                }

                // If the task failed via any means, allow the task to resume because
                // it's been cancelled -- the callback should immediately exit as well
                if (meta.task.isRejected()) {
                    debugLog('[ComponentAsyncState#tick()] detected task rejection, leaving early', { meta });
                    this.resumeTaskByID(taskID);
                    return ComponentAsyncState.TickResult.RESUMED;
                }

                const isReady = this.suspendedTaskReady(taskID);
                if (!isReady) {
                    continue;
                }

                debugLog('[ComponentAsyncState#tick()] resuming task via tick', {
                    taskID,
                    componentIdx: this.#componentIdx,
                });
                this.resumeTaskByID(taskID);

                // NOTE: during single-flight resumption, we should resume at most one task per
                // tick so that the resumed slice (a microtask continuation)
                // runs -- and its current-task register window opens and
                // closes -- before any sibling task of this component is
                // resumed.
                //
                // Resuming multiple suspended tasks in one synchronous
                // cascade interleaves their register save/restore windows
                // ([restoreA, restoreB, resumeA, resumeB]), re-entering wasm
                // with the register naming the wrong task, and the
                // 'known residual' of the JSPI current-task register
                // fix); with concurrent task lifetimes per component this
                // corrupts guest context-local storage.
                return ComponentAsyncState.TickResult.RESUMED;
            }

            const idle = this.#suspendedTaskIDs.filter((t) => t !== null).length > 0;
            return idle ? ComponentAsyncState.TickResult.IDLE : ComponentAsyncState.TickResult.DONE;
        }

        createWaitable(args?: { target?: unknown }) {
            if (!context.createWaitable) {
                throw new TypeError('creating waitables requires createWaitable');
            }
            return context.createWaitable({ target: args?.target });
        }
    }
    return ComponentAsyncState;
}
