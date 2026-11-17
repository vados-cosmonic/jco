import type { TaskLiftContext, TaskLiftFn } from '../runtime.js';

const scalarValue = Symbol('scalar lift');
type ScalarLift = (context: TaskLiftContext) => unknown;
type ScalarLiftFn = TaskLiftFn & { [scalarValue]?: ScalarLift };

/** Keep the public pair-returning ABI while making internal scalar calls allocation-free. */
export function defineScalarLift(value: ScalarLift): TaskLiftFn {
    const lift: ScalarLiftFn = (context) => [value(context), context];
    lift[scalarValue] = value;
    return lift;
}

/** Custom lifts still use the public ABI, including replacement contexts. */
export function scalarLiftValue(lift: TaskLiftFn): ScalarLift | undefined {
    return (lift as ScalarLiftFn)[scalarValue];
}
