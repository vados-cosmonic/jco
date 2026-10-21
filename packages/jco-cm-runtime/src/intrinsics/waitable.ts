import type { RuntimeOptions } from '../types.js';
import type { CoreIntrinsics } from './core-types.js';
import type { ComponentIntrinsics, ComponentAsyncState, ComponentWaitable, WaitableEvent } from './component-types.js';
import type {
    WaitableIntrinsics,
    WaitableMemoryContext,
    WaitableStoreEventOptions,
    WaitableSet as WaitableSetType,
} from './waitable-types.js';

export function createWaitableIntrinsics(
    options: RuntimeOptions,
    core: CoreIntrinsics,
    component: ComponentIntrinsics,
    classes: Pick<WaitableIntrinsics, 'Waitable' | 'WaitableSet'>,
): WaitableIntrinsics {
    const { debugLog, RuntimeError, asyncEventCode } = core;
    const { WaitableSet } = classes;
    const getOrCreateAsyncState = component.getOrCreateAsyncState.bind(component);
    const getCurrentTask = (componentIdx: number) => {
        if (!options.waitableContext?.getCurrentTask) {
            throw new TypeError('waitable operations require waitableContext.getCurrentTask');
        }
        return options.waitableContext.getCurrentTask(componentIdx);
    };
    const storeEventInComponentMemory = (args: WaitableStoreEventOptions) => {
        if (!options.waitableContext?.storeEventInComponentMemory) {
            throw new TypeError('waitable operations require waitableContext.storeEventInComponentMemory');
        }
        return options.waitableContext.storeEventInComponentMemory(args);
    };

    function waitableSetNew(componentIdx: number) {
        debugLog('[waitableSetNew()] args', { componentIdx });

        const state = getOrCreateAsyncState(componentIdx);
        if (!state) {
            throw new Error(`missing async state for component idx [${componentIdx}]`);
        }

        const wset = new WaitableSet(componentIdx);
        const rep = state.handles.insert(wset);
        if (typeof rep !== 'number') {
            throw new Error(`invalid/missing waitable set rep [${rep}]`);
        }

        debugLog('[waitableSetNew()] created waitable set', { componentIdx, rep });
        return rep;
    }

    function waitableSetWait(ctx: WaitableMemoryContext, waitableSetRep: number, resultPtr: number, syncOnly = false) {
        debugLog('[waitableSetWait()] args', { ctx, waitableSetRep, resultPtr });
        const { componentIdx, memoryIdx, getMemoryFn } = ctx;

        const taskMeta = getCurrentTask(componentIdx);
        if (!taskMeta) {
            throw Error('invalid/missing async task meta');
        }

        const task = taskMeta.task;
        if (!task) {
            throw Error('invalid/missing async task');
        }

        if (task.componentIdx() !== componentIdx) {
            throw Error(`task component [${task.componentIdx()}] !== executing component [${componentIdx}]`);
        }

        const memory = getMemoryFn();

        const cstate = getOrCreateAsyncState(componentIdx);
        const wset = cstate.handles.get(waitableSetRep);
        if (!(wset instanceof WaitableSet)) {
            throw new RuntimeError(`non-waitable set returned from component state handles @ [${waitableSetRep}]`);
        }

        const storeEvent = (event: WaitableEvent | null) =>
            storeEventInComponentMemory({
                memory,
                ptr: resultPtr,
                event,
                componentIdx,
                task,
                memoryIdx,
            });
        // Built-in waits never deliver cancellation. Only the
        // callback event loop's wait is cancellable.
        const waitOpts = { readyFn: () => true, task, cancellable: false };
        const event = syncOnly ? wset.tryWait(waitOpts) : wset.waitUntil(waitOpts);
        if (event === null) {
            return -1;
        }
        if (event && 'then' in event) {
            return event.then(storeEvent);
        }
        return storeEvent(event);
    }

    function waitableSetPoll(ctx: WaitableMemoryContext, waitableSetRep: number, resultPtr: number) {
        const { componentIdx, memoryIdx, getMemoryFn } = ctx;
        debugLog('[waitableSetPoll()] args', {
            componentIdx,
            memoryIdx,
            waitableSetRep,
            resultPtr,
        });

        const taskMeta = getCurrentTask(componentIdx);
        if (!taskMeta) {
            throw Error('invalid/missing current task meta');
        }
        if (taskMeta.componentIdx !== componentIdx) {
            throw Error(
                'task component idx [' + taskMeta.componentIdx + '] != component instance ID [' + componentIdx + ']',
            );
        }

        const task = taskMeta.task;
        if (!task) {
            throw Error('invalid/missing async task in task meta');
        }

        if (task.componentIdx() !== componentIdx) {
            throw Error(`task component idx [${task.componentIdx()}] does not match generated [${componentIdx}]`);
        }

        const cstate = getOrCreateAsyncState(task.componentIdx());
        // (the index must name a waitable set, as for `waitable-set.wait`)
        const wset = waitableSetRep === 0 ? undefined : cstate.handles.get(waitableSetRep);
        if (!(wset instanceof WaitableSet)) {
            throw new RuntimeError(`unknown handle index ${waitableSetRep}`);
        }

        let event;
        if (!wset.hasPendingEvent()) {
            debugLog('[waitableSetPoll()] no pending event', {
                componentIdx,
                waitableSetRep,
            });
            event = { code: asyncEventCode.NONE, payload0: 0, payload1: 0 };
        } else {
            debugLog('[waitableSetPoll()] retrieving waiting pending event', {
                componentIdx,
                waitableSetRep,
            });
            event = wset.getPendingEvent();
        }

        const eventCode = storeEventInComponentMemory({
            event,
            ptr: resultPtr,
            memory: getMemoryFn(),
            componentIdx,
            task,
            memoryIdx,
        });

        return eventCode;
    }

    function waitableSetDrop(componentIdx: number, waitableSetRep: number) {
        debugLog('[waitableSetDrop()] args', { componentIdx, waitableSetRep });
        const task = getCurrentTask(componentIdx);

        if (!task) {
            throw new Error('invalid/missing async task');
        }
        if (task.componentIdx !== componentIdx) {
            throw Error(
                'task component idx [' + task.componentIdx + '] != component instance ID [' + componentIdx + ']',
            );
        }

        const state = getOrCreateAsyncState(componentIdx);
        if (!state.mayLeave) {
            throw new Error('component instance is not marked as may leave, cannot be cancelled');
        }

        removeWaitableSet({ state, waitableSetRep });
    }

    function removeWaitableSet(args: { state: ComponentAsyncState; waitableSetRep: number }) {
        debugLog('[removeWaitableSet()] args', args);
        const { state, waitableSetRep } = args;
        if (!state) {
            throw new TypeError('missing component state');
        }
        if (!waitableSetRep) {
            throw new TypeError('missing component waitableSetRep');
        }

        const ws = state.handles.get(waitableSetRep) as WaitableSetType | undefined;
        if (!ws) {
            throw new RuntimeError('cannot remove waitable set: no set present with rep [' + waitableSetRep + ']');
        }
        if (ws.hasPendingEvent()) {
            throw new Error('waitable set cannot be removed with pending items remaining');
        }

        if (ws.numWaitables() > 0) {
            throw new Error('waitable set still contains waitables');
        }
        if (ws.numWaiting() > 0) {
            throw new Error('cannot drop waitable set with waiters');
        }

        state.handles.remove(waitableSetRep);
    }

    function waitableJoin(componentIdx: number, waitableRep: number, waitableSetRep: number) {
        debugLog('[waitableJoin()] args', {
            componentIdx,
            waitableSetRep,
            isRemoval: waitableSetRep === 0,
            waitableRep,
        });

        const state = getOrCreateAsyncState(componentIdx);
        if (!state) {
            throw new Error(`invalid/missing async state for component instance [${componentIdx}]`);
        }

        if (!state.mayLeave) {
            throw new Error('component instance is not marked as may leave, cannot join waitable');
        }

        const waitableObj = state.handles.get(waitableRep) as
            | (Partial<ComponentWaitable> & { getWaitable?(): Partial<ComponentWaitable> })
            | undefined;
        if (!waitableObj) {
            throw new Error(`missing waitable obj (rep [${waitableRep}]), component idx [${componentIdx}])`);
        }
        const waitable = waitableObj.getWaitable ? waitableObj.getWaitable() : waitableObj;
        if (!waitable.join) {
            throw new Error('invalid waitable object, does not have join()');
        }

        const waitableSet =
            waitableSetRep === 0 ? null : (state.handles.get(waitableSetRep) as WaitableSetType | undefined);
        if (waitableSetRep !== 0 && !waitableSet) {
            throw new RuntimeError(`missing waitable set [${waitableSetRep}] in component idx [${componentIdx}]`);
        }

        waitable.join(waitableSet ?? null);
    }

    return {
        ...classes,
        waitableSetNew,
        waitableSetWait,
        waitableSetPoll,
        waitableSetDrop,
        removeWaitableSet,
        waitableJoin,
    };
}
