import { createHostIntrinsics } from './intrinsics/host.js';
import { createResourceIntrinsics } from './intrinsics/resource.js';
import { createConversionIntrinsics } from './intrinsics/conversion.js';
import { createJsHelperIntrinsics } from './intrinsics/js-helper.js';
import { createStringIntrinsics } from './intrinsics/string.js';
import { createWebIdlIntrinsics } from './intrinsics/webidl.js';
import { createCoreIntrinsics } from './intrinsics/core.js';
import { createComponentIntrinsics } from './intrinsics/component.js';
import { createWaitableClasses } from './intrinsics/waitable-classes.js';
import { createWaitableIntrinsics } from './intrinsics/waitable.js';
import { createErrorContextIntrinsics } from './intrinsics/error-context.js';
import { createAsyncTaskIntrinsics } from './intrinsics/async-task.js';
import type { AsyncTaskIntrinsics } from './intrinsics/async-task-types.js';
import type { CoreIntrinsics } from './intrinsics/core-types.js';
import {
    CM_RUNTIME_API_VERSION,
    type ComponentModelRuntime,
    type ComponentModelRuntimeProvider,
    type RuntimeOptions,
    type RuntimePlatform,
} from './types.js';

function createRuntime(options: RuntimeOptions): ComponentModelRuntime {
    if (options.requestedApiVersion !== CM_RUNTIME_API_VERSION) {
        throw new Error(
            `incompatible Jco JavaScript Component Model runtime API: requested ${options.requestedApiVersion}, ` +
                `supported ${CM_RUNTIME_API_VERSION}`,
        );
    }

    const platform: RuntimePlatform = {
        WebAssembly: options.platform?.WebAssembly ?? globalThis.WebAssembly,
    };

    if (typeof platform.WebAssembly?.RuntimeError !== 'function') {
        throw new TypeError('Jco Component Model runtime requires WebAssembly.RuntimeError');
    }

    let asyncTask: AsyncTaskIntrinsics;
    let core: CoreIntrinsics;
    // Resolve these only when an operation runs, after every namespace is ready.
    // Older bindings' callbacks still take precedence over the shared runtime tasks.
    const resource = createResourceIntrinsics(
        platform.WebAssembly.RuntimeError,
        options.resourceTasks ?? {
            getCurrentTask(componentIdx) {
                const meta = core.getCurrentTaskMeta(componentIdx);
                return meta ? asyncTask.getCurrentTask(componentIdx, meta.taskID)?.task : undefined;
            },
            createTask: (args) => asyncTask.createNewCurrentTask(args)[0],
            withTask: (args) => core.withCurrentTaskMeta(args),
        },
    );
    core = createCoreIntrinsics(
        {
            ...options,
            coreContext: options.coreContext ?? {
                checkMayLeave: (idx) => component.checkMayLeave(idx),
                recordTrap: (idx, err, converts) => component.recordTrap(idx, err, converts),
                throwIfInterrupted: (idx) => component.getOrCreateAsyncState(idx).throwIfInterrupted(),
                getCurrentTask: (idx, id) => asyncTask.getCurrentTask(idx, id)?.task,
                currentTaskMayBlock: () => asyncTask.currentTaskMayBlock.value,
            },
        },
        platform,
        resource,
    );
    const waitableClasses = createWaitableClasses(core);
    const component = createComponentIntrinsics(options, core, resource, waitableClasses.Waitable);
    const conversion = createConversionIntrinsics(options.strict);
    asyncTask = createAsyncTaskIntrinsics(options, platform, core, component, resource, waitableClasses, conversion);
    const host = createHostIntrinsics(platform, core, component, asyncTask);
    const waitable = createWaitableIntrinsics(
        {
            ...options,
            waitableContext: options.waitableContext ?? {
                getCurrentTask: (idx) => asyncTask.getCurrentTask(idx),
                storeEventInComponentMemory: (args) => host.storeEventInComponentMemory(args),
            },
        },
        core,
        component,
        waitableClasses,
    );
    return {
        apiVersion: CM_RUNTIME_API_VERSION,
        intrinsics: {
            core,
            asyncTask,
            host,
            component,
            errorContext: createErrorContextIntrinsics(core, component),
            waitable,
            webidl: createWebIdlIntrinsics(),
            string: createStringIntrinsics(),
            jsHelper: createJsHelperIntrinsics(),
            conversion,
            resource,
        },
    };
}

export const runtime = {
    apiVersion: CM_RUNTIME_API_VERSION,
    create: createRuntime,
} satisfies ComponentModelRuntimeProvider;
