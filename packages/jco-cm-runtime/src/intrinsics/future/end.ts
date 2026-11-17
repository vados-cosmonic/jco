import type {
    AsyncEventCodes,
    FutureEndConstructor,
    FutureEndOptions,
    FuturePendingBufferMeta,
    FutureCopyResults,
    FutureCopyStates,
    ComponentWaitable,
    WaitableEvent,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { asConstructorOf } from '../core/shared-class.js';

/** What one `initializeFutureEndClass` call shares between the ends it constructs. */
export interface FutureEndStore {
    readonly events: Pick<AsyncEventCodes, 'FUTURE_READ' | 'FUTURE_WRITE'>;
}

const stores = new WeakMap<object, FutureEndStore>();

/**
 * The store of a class that `initializeFutureEndClass` returned, for a subclass to construct with.
 *
 * @param FutureEnd - the class
 * @returns its store
 */
export function futureEndStore(FutureEnd: object): FutureEndStore {
    const store = stores.get(FutureEnd);
    if (store === undefined) {
        throw new TypeError('future end class does not come from initializeFutureEndClass');
    }
    return store;
}

export class FutureEnd {
    #store: FutureEndStore;

    /**
     * Whether a value was constructed through one `initializeFutureEndClass` call.
     *
     * @param value - any value
     * @param store - the store of that call
     * @returns whether the value is an end, of either direction, belonging to that store
     */
    static constructedIn(value: unknown, store: object): boolean {
        return typeof value === 'object' && value !== null && #store in value && value.#store === store;
    }

    // Supplied by readable/writable subclasses; declarations emit no properties.
    declare isReadable: () => boolean;
    declare waitableIdx: () => number | null;
    static CopyResult: FutureCopyResults = {
        COMPLETED: 0,
        DROPPED: 1,
        CANCELLED: 2,
    };

    static CopyState: FutureCopyStates = {
        IDLE: 1,
        SYNC_COPYING: 2,
        ASYNC_COPYING: 3,
        CANCELLING_COPY: 4,
        DONE: 5,
    };

    #pendingBufferMeta: FuturePendingBufferMeta;
    #waitable: ComponentWaitable;
    #copyState = FutureEnd.CopyState.IDLE;

    #dropped = false;
    #isPeerDroppedFn: () => boolean;
    #notifyPeerDroppedFn: () => void;

    constructor(store: FutureEndStore, args: FutureEndOptions) {
        DEBUG: debugLog('[FutureEnd#constructor()] args', args);
        this.#store = store;

        if (!args.pendingBufferMeta) {
            throw new Error('missing pending buffer');
        }
        this.#pendingBufferMeta = args.pendingBufferMeta;

        if (!args.waitable) {
            throw new Error('missing pending buffer');
        }
        this.#waitable = args.waitable;

        if (args.isPeerDroppedFn !== undefined && typeof args.isPeerDroppedFn !== 'function') {
            throw new TypeError('isPeerDroppedFn must be a function');
        }
        this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
        if (args.notifyPeerDroppedFn !== undefined && typeof args.notifyPeerDroppedFn !== 'function') {
            throw new TypeError('notifyPeerDroppedFn must be a function');
        }
        this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});
    }

    getWaitable() {
        return this.#waitable;
    }
    setWaitable(w: ComponentWaitable) {
        this.#waitable = w;
    }

    setCopyState(state: number) {
        this.#copyState = state;
    }
    getCopyState() {
        return this.#copyState;
    }

    isDoneState() {
        return this.getCopyState() === FutureEnd.CopyState.DONE;
    }
    isCancelledState() {
        return this.getCopyState() === FutureEnd.CopyState.CANCELLED;
    }
    isIdleState() {
        return this.getCopyState() === FutureEnd.CopyState.IDLE;
    }

    isCopying() {
        switch (this.#copyState) {
            case FutureEnd.CopyState.IDLE:
            case FutureEnd.CopyState.DONE:
                return false;
                break;
            case FutureEnd.CopyState.SYNC_COPYING:
            case FutureEnd.CopyState.ASYNC_COPYING:
            case FutureEnd.CopyState.CANCELLING_COPY:
                return true;
                break;
            default:
                throw new Error('invalid/unknown copying state');
        }
    }

    setPendingBufferMeta(args: FuturePendingBufferMeta) {
        const { componentIdx, buffer, isWrite, onCopyDoneFn } = args;
        this.#pendingBufferMeta.componentIdx = componentIdx;
        this.#pendingBufferMeta.buffer = buffer;
        this.#pendingBufferMeta.isWrite = isWrite;
        this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
    }

    resetPendingBufferMeta() {
        this.setPendingBufferMeta({ componentIdx: null, buffer: null, isWrite: null, onCopyDoneFn: null });
    }

    getPendingBufferMeta() {
        return this.#pendingBufferMeta;
    }

    resetAndNotifyPending(result: number) {
        const f = this.#pendingBufferMeta.onCopyDoneFn;
        this.resetPendingBufferMeta();
        if (f) {
            f(result);
        }
    }

    setPendingEvent(fn: () => WaitableEvent) {
        if (!this.#waitable) {
            throw new Error('missing/invalid waitable');
        }
        DEBUG: debugLog('[FutureEnd#setPendingEvent()]', {
            waitable: this.#waitable,
            waitableinSet: this.#waitable.isInSet(),
            componentIdx: this.#waitable.componentIdx(),
        });
        this.#waitable.setPendingEvent(fn);
    }

    hasPendingEvent() {
        if (!this.#waitable) {
            throw new Error('missing/invalid waitable');
        }
        return this.#waitable.hasPendingEvent();
    }

    isInSet() {
        if (!this.#waitable) {
            throw new Error('missing/invalid waitable');
        }
        return this.#waitable.isInSet();
    }

    getPendingEvent() {
        if (!this.#waitable) {
            throw new Error('missing/invalid waitable');
        }
        DEBUG: debugLog('[FutureEnd#getPendingEvent()]', {
            waitable: this.#waitable,
            waitableinSet: this.#waitable.isInSet(),
            componentIdx: this.#waitable.componentIdx(),
        });
        const event = this.#waitable.getPendingEvent();
        return event;
    }

    isDropped() {
        return this.#dropped;
    }
    isPeerDropped() {
        return this.#isPeerDroppedFn();
    }

    notifyDropped() {
        if (this.isDropped() || this.isDoneState() || this.hasPendingEvent()) {
            return;
        }
        const eventCode = this.isReadable() ? this.#store.events.FUTURE_READ : this.#store.events.FUTURE_WRITE;
        this.setPendingEvent(() => {
            this.setCopyState(FutureEnd.CopyState.DONE);
            return {
                code: eventCode,
                payload0: this.waitableIdx()!,
                payload1: FutureEnd.CopyResult.DROPPED,
            };
        });
    }

    /** Stop the endpoint without enforcing the running guest's drop protocol. */
    onInstanceStop() {
        if (this.#dropped) {
            return;
        }
        this.resetPendingBufferMeta();
        this.notifyDropped();
        this.#dropped = true;
        this.#notifyPeerDroppedFn();
        this.#waitable.drop();
    }

    drop() {
        if (this.isDropped()) {
            throw new Error('future already dropped');
        }

        if (this.#pendingBufferMeta.buffer) {
            if (!this.#pendingBufferMeta.isWrite) {
                throw new Error('non-writable pending buffer during drop (reader blocked)');
            }
            this.resetAndNotifyPending(FutureEnd.CopyResult.DROPPED);
        }

        this.#dropped = true;
        this.#notifyPeerDroppedFn();
        this.#waitable.drop();
    }
}

/** Create a base endpoint constructor using the selected event codes. */
export function initializeFutureEndClass(
    events: Pick<AsyncEventCodes, 'FUTURE_READ' | 'FUTURE_WRITE'>,
): FutureEndConstructor {
    const store: FutureEndStore = { events };

    /**
     * Construct a future end that uses the event codes, or the base of a subclass instance.
     *
     * @param args - options of the future end
     * @returns the future end
     */
    function StoreFutureEnd(args: FutureEndOptions): FutureEnd {
        return Reflect.construct(FutureEnd, [store, args], new.target ?? StoreFutureEnd);
    }
    const bound = asConstructorOf<FutureEndConstructor>(
        StoreFutureEnd,
        FutureEnd,
        (value) => FutureEnd.constructedIn(value, store),
        {
            CopyResult: { value: { ...FutureEnd.CopyResult }, enumerable: true },
            CopyState: { value: { ...FutureEnd.CopyState }, enumerable: true },
        },
    );
    stores.set(bound, store);
    return bound;
}
