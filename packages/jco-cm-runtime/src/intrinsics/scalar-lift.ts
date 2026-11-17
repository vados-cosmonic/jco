import type { TaskLiftContext, TaskLiftFn } from '../runtime.js';

const scalarValue = Symbol('scalar lift');
type ScalarLift = (context: TaskLiftContext) => unknown;
type ScalarLiftFn = TaskLiftFn & { [scalarValue]?: { direct: ScalarLift; memory: ScalarLift } };

/** Keep the public pair-returning ABI while making internal scalar calls allocation-free. */
export function defineScalarLift(value: ScalarLift, direct: ScalarLift, memory: ScalarLift): TaskLiftFn {
    const lift: ScalarLiftFn = (context) => [value(context), context];
    lift[scalarValue] = { direct, memory };
    return lift;
}

/** Custom lifts still use the public ABI, including replacement contexts. */
export function scalarLiftValue(lift: TaskLiftFn, direct?: boolean): ScalarLift | undefined {
    const scalar = (lift as ScalarLiftFn)[scalarValue];
    return direct ? scalar?.direct : scalar?.memory;
}
