import { defineConfig } from 'vitest/config';
import benchmarks from '../vitest.config.js';

export default defineConfig({
    ...benchmarks,
    test: {
        ...benchmarks.test,
        include: ['bench/external-runtime/investigation/*.test.ts'],
    },
});
