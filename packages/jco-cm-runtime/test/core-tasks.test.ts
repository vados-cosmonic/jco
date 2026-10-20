import { expect, test } from 'vitest';
import { runtime, type CoreContext } from '../src/index.js';
function create(coreContext?: CoreContext) {
    return runtime.create({
        requestedApiVersion: 1,
        strict: false,
        flagsAsBigInt: false,
        nodejsCompat: true,
        asyncDeterminism: 'random',
        coreContext,
    }).intrinsics.core;
}

test.concurrent('nested synchronous task scopes restore both registers after success and failure', () => {
    const core = create();
    const outer = { componentIdx: 0, taskID: 1n };
    core.setCurrentTaskMeta(outer);
    const copy = core.getCurrentTaskMeta(0)!;
    copy.taskID = 99n;
    expect(core.getCurrentTaskMeta()).toEqual(outer);
    const failure = new Error('inner');
    expect(() =>
        core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: 2n,
            fn() {
                expect(core.getCurrentTaskMeta(0)?.taskID).toBe(2n);
                expect(
                    core.withCurrentTaskMeta({
                        componentIdx: 1,
                        taskID: 3n,
                        fn: () => core.getCurrentTaskMeta()?.taskID,
                    }),
                ).toBe(3n);
                expect(core.getCurrentTaskMeta()).toEqual({ componentIdx: 0, taskID: 2n });
                expect(core.getCurrentTaskMeta(1)).toBeUndefined();
                throw failure;
            },
        }),
    ).toThrow(failure);
    expect(core.getCurrentTaskMeta(null)).toEqual(outer);
    expect(core.getCurrentTaskMeta(0)).toEqual(outer);
});

test.concurrent('finishing an async task preserves another component’s executing task', async () => {
    const core = create();
    const first = core.promiseWithResolvers<void>();
    const second = core.promiseWithResolvers<number>();
    const a = core.withCurrentTaskMetaAsync({ componentIdx: 0, taskID: 1n, fn: () => first.promise });
    const b = core.withCurrentTaskMetaAsync({ componentIdx: 1, taskID: 2n, fn: () => second.promise });
    expect(core.getCurrentTaskMeta()).toEqual({ componentIdx: 1, taskID: 2n });
    first.resolve();
    await a;
    expect(core.getCurrentTaskMeta(0)).toBeUndefined();
    expect(core.getCurrentTaskMeta()).toEqual({ componentIdx: 1, taskID: 2n });
    second.resolve(42);
    expect(await b).toBe(42);
    expect(core.getCurrentTaskMeta()).toBeUndefined();
    await expect(
        core.withCurrentTaskMetaAsync({
            componentIdx: 0,
            taskID: 3n,
            fn: () => {
                throw new Error('fail');
            },
        }),
    ).rejects.toThrow('fail');
    expect(core.getCurrentTaskMeta(0)).toBeUndefined();
});

test.concurrent('clear validates the task identity before changing state', async () => {
    const core = create();
    core.setCurrentTaskMeta({ componentIdx: 0, taskID: 1n });
    await expect(core.clearCurrentTaskMeta({ componentIdx: 0, taskID: 2n })).rejects.toThrow('!= requested ID');
    expect(core.getCurrentTaskMeta()?.taskID).toBe(1n);
    await core.clearCurrentTaskMeta({ componentIdx: 0, taskID: 1n });
    expect(core.getCurrentTaskMeta()).toBeUndefined();
    await expect(core.clearCurrentTaskMeta({ componentIdx: 0, taskID: 1n })).rejects.toThrow(
        'missing current task meta',
    );
    // @ts-expect-error Validate JS calls lacking a required task ID.
    expect(() => core.setCurrentTaskMeta({ componentIdx: 0 })).toThrow('missing task ID');
});

function bridge(mayBlock: boolean) {
    const traps: unknown[] = [];
    const checks: string[] = [];
    const context: CoreContext = {
        checkMayLeave: () => {
            checks.push('leave');
        },
        getCurrentTask: () => ({ mayBlock: () => mayBlock }),
        currentTaskMayBlock: () => 0,
        recordTrap: (_componentIdx, error) => {
            traps.push(error);
            return error;
        },
        throwIfInterrupted: () => {
            checks.push('interrupted');
        },
    };
    return { context, traps, checks };
}

test.concurrent('suspending imports reject blocking synchronous tasks and observe rejected thenables', async () => {
    const { context, traps, checks } = bridge(false);
    const core = create(context);
    const fn = core.suspendingImport(0, (x: number) => x + 1);
    expect(() => fn(1)).toThrow('cannot block a synchronous task before returning');
    core.setCurrentTaskMeta({ componentIdx: 0, taskID: 1n });
    expect(fn(1)).toBe(2);
    const rejected = core.suspendingImport(0, () => Promise.reject(new Error('already rejected')));
    expect(rejected).toThrow('cannot block a synchronous task before returning');
    await Promise.resolve();
    expect(traps).toEqual([]);
    expect(checks).toEqual(['leave', 'leave', 'leave']);
});

test.concurrent.each([false, true])(
    'suspending imports restore registers and record traps (switchesTask=%s)',
    async (switchesTask) => {
        const { context, traps, checks } = bridge(true);
        const core = create(context);
        const saved = { componentIdx: 0, taskID: 1n };
        const callee = { componentIdx: 1, taskID: 2n };
        core.setCurrentTaskMeta(saved);
        const fn = core.suspendingImport(
            0,
            async (fail: boolean) => {
                core.setCurrentTaskMeta(callee);
                await Promise.resolve();
                if (fail) {
                    throw new Error('guest trapped');
                }
                return 42;
            },
            false,
            switchesTask,
        );
        expect(await fn(false)).toBe(42);
        expect(core.getCurrentTaskMeta(0)).toEqual(saved);
        expect(core.getCurrentTaskMeta()).toEqual(switchesTask ? callee : saved);
        await expect(fn(true)).rejects.toThrow('guest trapped');
        expect(traps).toHaveLength(1);
        expect(checks).toEqual(['leave', 'interrupted', 'leave']);
        expect(core.getCurrentTaskMeta()).toEqual(switchesTask ? callee : saved);
    },
);

test.concurrent('suspending imports check interruptions before resuming guest code', async () => {
    const { context, traps } = bridge(true);
    context.throwIfInterrupted = () => {
        throw new Error('store trapped');
    };
    const core = create(context);
    core.setCurrentTaskMeta({ componentIdx: 0, taskID: 1n });
    await expect(core.suspendingImport(0, async () => 42)()).rejects.toThrow('store trapped');
    expect(traps).toHaveLength(1);
    expect(core.getCurrentTaskMeta()?.taskID).toBe(1n);
});
