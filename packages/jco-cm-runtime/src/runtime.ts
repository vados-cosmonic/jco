import { createResourceIntrinsics } from './intrinsics/resource.js';
import { createConversionIntrinsics } from './intrinsics/conversion.js';
import { createJsHelperIntrinsics } from './intrinsics/js-helper.js';
import { createStringIntrinsics } from './intrinsics/string.js';
import { createWebIdlIntrinsics } from './intrinsics/webidl.js';
import { createCoreIntrinsics } from './intrinsics/core.js';
import { createComponentIntrinsics } from './intrinsics/component.js';
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

    const resource = createResourceIntrinsics(platform.WebAssembly.RuntimeError, options.resourceTasks);
    const core = createCoreIntrinsics(options, platform, resource);
    return {
        apiVersion: CM_RUNTIME_API_VERSION,
        intrinsics: {
            core,
            component: createComponentIntrinsics(options, core, resource),
            webidl: createWebIdlIntrinsics(),
            string: createStringIntrinsics(),
            jsHelper: createJsHelperIntrinsics(),
            conversion: createConversionIntrinsics(options.strict),
            resource,
        },
    };
}

export const runtime = {
    apiVersion: CM_RUNTIME_API_VERSION,
    create: createRuntime,
} satisfies ComponentModelRuntimeProvider;
