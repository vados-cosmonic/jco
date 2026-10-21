import type { CoreIntrinsics } from './core-types.js';
import type { ComponentWaitable, ComponentWaitableSet, WaitableEvent } from './component-types.js';
import type { Waitable as WaitableType, WaitableIntrinsics, WaitableWaitOptions } from './waitable-types.js';

/** One pair of constructors per store, also used by component state. */
export function createWaitableClasses(core: CoreIntrinsics): Pick<WaitableIntrinsics, 'Waitable' | 'WaitableSet'> {
    const { debugLog, asyncEventCode, promiseWithResolvers } = core;

    class WaitableSet {
        #componentIdx: number;
        #waitables: ComponentWaitable[] = [];

        #waiting = 0;

        target: unknown;

        constructor(componentIdx: number) {
            if (componentIdx === undefined) {
                throw new TypeError('missing/invalid component idx');
            }
            this.#componentIdx = componentIdx;
            this.target = `component [${this.#componentIdx}] waitable set`;
        }

        componentIdx() {
            return this.#componentIdx;
        }

        numWaitables() {
            return this.#waitables.length;
        }
        numWaiting() {
            return this.#waiting;
        }

        incrementNumWaiting(n?: number) {
            this.#waiting += n ?? 1;
        }
        decrementNumWaiting(n?: number) {
            this.#waiting -= n ?? 1;
        }

        targets() {
            return this.#waitables.map((w) => w.target);
        }

        setTarget(tgt: unknown) {
            this.target = tgt;
        }

        shuffleWaitables() {
            this.#waitables = this.#waitables
                .map((value) => ({ value, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ value }) => value);
        }

        removeWaitable(waitable: ComponentWaitable) {
            const existing = this.#waitables.find((w) => w === waitable);
            if (!existing) {
                return undefined;
            }
            this.#waitables = this.#waitables.filter((w) => w !== waitable);
            return waitable;
        }

        addWaitable(waitable: ComponentWaitable) {
            this.removeWaitable(waitable);
            this.#waitables.push(waitable);
        }

        hasPendingEvent() {
            debugLog('[WaitableSet#hasPendingEvent()] args', {
                componentIdx: this.#componentIdx,
                waitableSet: this,
                waitableSetTargets: this.targets(),
            });
            const waitable = this.#waitables.find((w) => w.hasPendingEvent());
            return waitable !== undefined;
        }

        getPendingEvent() {
            debugLog('[WaitableSet#getPendingEvent()] args', {
                componentIdx: this.#componentIdx,
                waitableSet: this,
            });
            for (const waitable of this.#waitables) {
                if (!waitable.hasPendingEvent()) {
                    continue;
                }
                const event = waitable.getPendingEvent();
                debugLog('[WaitableSet#getPendingEvent()] found pending event', {
                    waitable,
                    event,
                });
                return event;
            }
            throw new Error('no waitables had a pending event');
        }

        tryWait(opts: WaitableWaitOptions) {
            debugLog('[WaitableSet#tryWait()] args', { opts });
            // TODO(threads): this task should be the thread
            const { readyFn, task, cancellable } = opts;

            const isReady = () => {
                const hasPendingEvent = this.hasPendingEvent();
                const ready = readyFn();
                return ready && hasPendingEvent;
            };
            const finishWait = (keepGoing: boolean) => {
                const event = keepGoing
                    ? this.getPendingEvent()
                    : {
                          code: asyncEventCode.TASK_CANCELLED,
                          payload0: 0,
                          payload1: 0,
                      };
                return event;
            };

            if (task.deliverPendingCancel({ cancellable })) {
                return finishWait(false);
            }
            if (isReady()) {
                return finishWait(true);
            }
            return null;
        }

        waitUntil(opts: WaitableWaitOptions) {
            debugLog('[WaitableSet#waitUntil()] args', { opts });
            const event = this.tryWait(opts);
            if (event !== null) {
                return event;
            }

            const { readyFn, task, cancellable } = opts;
            const isReady = () => readyFn() && this.hasPendingEvent();
            this.incrementNumWaiting();

            return task.suspendUntil({ readyFn: isReady, cancellable }).then(
                (keepGoing) => {
                    // Resumed without an event because the task was torn down
                    // (e.g. the store trapped): that is not a cancellation the
                    // guest may observe and act on.
                    if (!keepGoing && task.isErrored()) {
                        this.decrementNumWaiting();
                        throw task.isErrored();
                    }
                    const readyEvent = keepGoing
                        ? this.getPendingEvent()
                        : {
                              code: asyncEventCode.TASK_CANCELLED,
                              payload0: 0,
                              payload1: 0,
                          };
                    this.decrementNumWaiting();
                    return readyEvent;
                },
                (err) => {
                    this.decrementNumWaiting();
                    throw err;
                },
            );
        }

        waitUntilCallback(opts: WaitableWaitOptions, onEvent: (event: WaitableEvent | null) => void) {
            debugLog('[WaitableSet#waitUntilCallback()] args', { opts });
            const event = this.tryWait(opts);
            if (event !== null) {
                onEvent(event);
                return;
            }

            const { readyFn, task, cancellable } = opts;
            this.incrementNumWaiting();
            task.suspendUntilCallback(
                {
                    readyFn: () => readyFn() && this.hasPendingEvent(),
                    cancellable,
                },
                (keepGoing) => {
                    const resumedEvent = keepGoing
                        ? this.getPendingEvent()
                        : {
                              code: asyncEventCode.TASK_CANCELLED,
                              payload0: 0,
                              payload1: 0,
                          };
                    this.decrementNumWaiting();
                    onEvent(resumedEvent);
                },
            );
        }
    }

    class Waitable {
        #componentIdx: number | undefined;

        #pendingEventFn: (() => WaitableEvent) | null = null;

        #promise!: Promise<void>;
        #resolve!: () => void;
        #reject!: (error: unknown) => void;

        #waitableSet: ComponentWaitableSet | null = null;

        #hasSyncWaiter = false;

        #idx: number | null = null; // to component-global waitables

        target: unknown;

        constructor(args: { componentIdx?: number; target?: unknown }) {
            const { componentIdx } = args;
            this.#componentIdx = componentIdx;
            this.target = args.target;
            this.#resetPromise();
        }

        componentIdx() {
            return this.#componentIdx;
        }
        isInSet() {
            return this.#waitableSet !== null;
        }

        idx() {
            return this.#idx;
        }
        setIdx(idx: number) {
            if (idx === 0) {
                throw new Error('waitable idx cannot be zero');
            }
            this.#idx = idx;
        }

        setTarget(tgt: unknown) {
            this.target = tgt;
        }

        #resetPromise() {
            const { promise, resolve, reject } = promiseWithResolvers<void>();
            this.#promise = promise;
            this.#resolve = resolve;
            this.#reject = reject;
        }

        resolve() {
            this.#resolve();
        }
        reject(err: unknown) {
            this.#reject(err);
        }
        promise() {
            return this.#promise;
        }

        hasPendingEvent() {
            // debugLog('[Waitable#hasPendingEvent()]', {
            //     componentIdx: this.#componentIdx,
            //     waitable: this,
            //     waitableSet: this.#waitableSet,
            //     hasPendingEvent: this.#pendingEventFn !== null,
            // });
            return this.#pendingEventFn !== null;
        }

        setPendingEvent(fn: () => WaitableEvent) {
            debugLog('[Waitable#setPendingEvent()] args', {
                waitable: this,
                inSet: this.#waitableSet,
            });
            this.#pendingEventFn = fn;
        }

        getPendingEvent() {
            debugLog('[Waitable#getPendingEvent()] args', {
                waitable: this,
                inSet: this.#waitableSet,
                hasPendingEvent: this.#pendingEventFn !== null,
            });
            if (this.#pendingEventFn === null) {
                return null;
            }
            const eventFn = this.#pendingEventFn;
            this.#pendingEventFn = null;
            const e = eventFn();
            this.#resetPromise();
            return e;
        }

        join(waitableSet: ComponentWaitableSet | null) {
            debugLog('[Waitable#join()] args', {
                waitable: this,
                waitableSet: waitableSet,
                isRemoval: waitableSet === null,
            });

            if (waitableSet === undefined) {
                throw new TypeError('waitable set must be not be undefined');
            }

            if (this.#waitableSet) {
                this.#waitableSet.removeWaitable(this);
            }

            this.#waitableSet = waitableSet;

            if (waitableSet) {
                waitableSet.addWaitable(this);
            }
        }

        drop() {
            debugLog('[Waitable#drop()] args', {
                componentIdx: this.#componentIdx,
                waitable: this,
            });
            this.join(null);
        }

        async waitForPendingEvent(args: Parameters<WaitableType['waitForPendingEvent']>[0]) {
            const { cstate } = args;
            if (!cstate) {
                throw new TypeError('missing component state');
            }

            if (this.#waitableSet !== null || this.#hasSyncWaiter) {
                throw new Error('waitable is already in a set/has a sync waiter');
            }
            this.#hasSyncWaiter = true;
            try {
                await cstate.waitUntil({
                    cancellable: false,
                    readyFn: () => this.hasPendingEvent(),
                });
            } finally {
                this.#hasSyncWaiter = false;
            }
        }
    }

    return { Waitable, WaitableSet };
}
