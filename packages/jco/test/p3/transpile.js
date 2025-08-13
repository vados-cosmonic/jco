import { join, basename } from 'node:path';
import { readFile } from 'node:fs/promises';

import { suite, test, assert } from 'vitest';

import { transpile } from '../../src/api';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

const P3_FIXTURE_COMPONENTS = [
    'backpressure/async_backpressure_callee.component.wasm',
    'backpressure/async_backpressure_caller.component.wasm',
];

suite('Transpile (WASI P3)', () => {
    for (const componentRelPath of P3_FIXTURE_COMPONENTS) {
        const componentPath = join(P3_COMPONENT_FIXTURES_DIR, componentRelPath);
        const componentName = basename(componentPath);
        test.concurrent(`transpile [${componentName}]`, async () => {
            await transpile(await readFile(componentPath));
        });
    }
});
