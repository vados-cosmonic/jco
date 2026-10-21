import type { CoreModule, TaskMeta, TaskRegisters } from '../runtime.js';
import { debugLog } from './core-debug.js';

export const initializeTaskRegisters: CoreModule['initializeTaskRegisters'] = () => ({});

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

export const getCurrentTaskMeta: CoreModule['getCurrentTaskMeta'] = (registers, componentIdx) => {
    const value = componentIdx === undefined || componentIdx === null ? registers.current : registers[componentIdx];
    return value === undefined || value === null ? undefined : { ...value };
};

export const setCurrentTaskMeta: CoreModule['setCurrentTaskMeta'] = (registers, args) => {
    validate(args);
    const { taskID, componentIdx } = args;
    return (registers.current = registers[componentIdx] = { taskID, componentIdx });
};

export function withCurrentTaskMeta<T>(registers: TaskRegisters, args: TaskMeta & { fn: () => T }): T {
    debugLog('[_withGlobalCurrentTaskMeta()] args', args);
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, componentIdx, fn } = args;
    const previous = registers[componentIdx] ?? null;
    const previousCurrent = registers.current ?? null;
    try {
        registers.current = registers[componentIdx] = { taskID, componentIdx };
        return fn();
    } catch (error) {
        debugLog('error while executing sync callee/callback', { ...args, err: error });
        throw error;
    } finally {
        registers[componentIdx] = previous;
        registers.current = previousCurrent;
    }
}

export async function withCurrentTaskMetaAsync<T>(
    registers: TaskRegisters,
    args: TaskMeta & { fn: () => T | PromiseLike<T> },
): Promise<T> {
    debugLog('[_withGlobalCurrentTaskMetaAsync()] args', args);
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, componentIdx, fn } = args;
    try {
        registers.current = registers[componentIdx] = { taskID, componentIdx };
        return await fn();
    } catch (error) {
        debugLog('error while executing async callee/callback', { ...args, err: error });
        throw error;
    } finally {
        registers[componentIdx] = null;
        if (registers.current?.taskID === taskID) {
            registers.current = null;
        }
    }
}

export const clearCurrentTaskMeta: CoreModule['clearCurrentTaskMeta'] = async (registers, args) => {
    debugLog('[_clearCurrentTask()] args', args);
    validate(args);
    const { taskID, componentIdx } = args;
    const meta = registers[componentIdx];
    if (!meta) {
        throw new Error(`missing current task meta for component idx [${componentIdx}]`);
    }
    if (meta.taskID !== taskID) {
        throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
    }
    if (meta.componentIdx !== componentIdx) {
        throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
    }
    registers[componentIdx] = null;
    if (registers.current?.taskID === taskID) {
        registers.current = null;
    }
};
