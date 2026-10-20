import type { CoreIntrinsics, TaskMeta, TaskRegisters } from './core-types.js';

export function createTaskContext(debugLog: (...args: unknown[]) => void) {
    const currentTaskMeta: TaskRegisters = {};
    function validate(args: TaskMeta) {
        if (!args) {
            throw new TypeError('args missing');
        }
        if (args.taskID === undefined) {
            throw new TypeError('missing task ID');
        }
        if (args.componentIdx === undefined) {
            throw new TypeError('missing component idx');
        }
    }
    const context: Pick<
        CoreIntrinsics,
        | 'currentTaskMeta'
        | 'getCurrentTaskMeta'
        | 'setCurrentTaskMeta'
        | 'withCurrentTaskMeta'
        | 'withCurrentTaskMetaAsync'
        | 'clearCurrentTaskMeta'
    > = {
        currentTaskMeta,
        getCurrentTaskMeta(componentIdx) {
            const value =
                componentIdx === undefined || componentIdx === null
                    ? currentTaskMeta.current
                    : currentTaskMeta[componentIdx];
            return value === undefined || value === null ? undefined : { ...value };
        },
        setCurrentTaskMeta(args) {
            validate(args);
            const { taskID, componentIdx } = args;
            return (currentTaskMeta.current = currentTaskMeta[componentIdx] = { taskID, componentIdx });
        },
        withCurrentTaskMeta(args) {
            debugLog('[_withGlobalCurrentTaskMeta()] args', args);
            validate(args);
            if (!args.fn) {
                throw new TypeError('missing fn');
            }
            const { taskID, componentIdx, fn } = args;
            const previous = currentTaskMeta[componentIdx] ?? null;
            const previousCurrent = currentTaskMeta.current ?? null;
            try {
                currentTaskMeta.current = currentTaskMeta[componentIdx] = { taskID, componentIdx };
                return fn();
            } catch (err) {
                debugLog('error while executing sync callee/callback', { ...args, err });
                throw err;
            } finally {
                currentTaskMeta[componentIdx] = previous;
                currentTaskMeta.current = previousCurrent;
            }
        },
        async withCurrentTaskMetaAsync(args) {
            debugLog('[_withGlobalCurrentTaskMetaAsync()] args', args);
            validate(args);
            if (!args.fn) {
                throw new TypeError('missing fn');
            }
            const { taskID, componentIdx, fn } = args;
            try {
                currentTaskMeta.current = currentTaskMeta[componentIdx] = { taskID, componentIdx };
                return await fn();
            } catch (err) {
                debugLog('error while executing async callee/callback', { ...args, err });
                throw err;
            } finally {
                currentTaskMeta[componentIdx] = null;
                if (currentTaskMeta.current?.taskID === taskID) {
                    currentTaskMeta.current = null;
                }
            }
        },
        async clearCurrentTaskMeta(args) {
            debugLog('[_clearCurrentTask()] args', args);
            validate(args);
            const { taskID, componentIdx } = args;
            const meta = currentTaskMeta[componentIdx];
            if (!meta) {
                throw new Error(`missing current task meta for component idx [${componentIdx}]`);
            }
            if (meta.taskID !== taskID) {
                throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
            }
            if (meta.componentIdx !== componentIdx) {
                throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
            }
            currentTaskMeta[componentIdx] = null;
            if (currentTaskMeta.current?.taskID === taskID) {
                currentTaskMeta.current = null;
            }
        },
    };
    return context;
}
