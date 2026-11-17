import { debugLog } from './core/debug.js';
import { hasParamCursor } from './flat-params.js';
import type { TaskLiftContext, TaskLiftFn } from '../runtime.js';

type ScalarLift = (context: TaskLiftContext) => unknown;
const scalarLifts = /* @__PURE__ */ new WeakMap<TaskLiftFn, { direct: ScalarLift; memory: ScalarLift }>();

/** Keep the public pair-returning ABI while making internal scalar calls allocation-free. */
export function defineScalarLift(direct: ScalarLift, memory: ScalarLift, directIdentity = false): TaskLiftFn {
    const lift: TaskLiftFn = (context) => {
        // Keep the short, ordinary integer path in this public function so V8
        // can inline it into composite loops without several dispatch layers.
        if (directIdentity && context.useDirectParams && !hasParamCursor(context)) {
            DEBUG: debugLog('[_liftFlatInteger()] args', { ctx: context });
            if (context.params.length === 0) {
                throw new Error('expected at least a single i32 argument');
            }
            const value = context.params[0];
            context.params = context.params.slice(1);
            return [value, context];
        }
        return [context.useDirectParams ? direct(context) : memory(context), context];
    };
    scalarLifts.set(lift, { direct, memory });
    return lift;
}

/** Custom lifts still use the public ABI, including replacement contexts. */
export function scalarLiftValue(lift: TaskLiftFn, direct?: boolean): ScalarLift | undefined {
    const scalar = scalarLifts.get(lift);
    return direct ? scalar?.direct : scalar?.memory;
}
