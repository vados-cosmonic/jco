import { fileURLToPath } from 'node:url';

/** Existing fixtures have independent functional suites; these workloads also check bundled results. */
export const components = [
    { id: 'adder', path: 'adder.component.wasm', features: ['u32', 'minimal export'] },
    {
        id: 'numbers',
        path: 'runtime/numbers.component.wasm',
        features: ['integer widths', 'i64', 'floats', 'char', 'imports'],
    },
    { id: 'strings', path: 'runtime/strings.component.wasm', features: ['UTF-8', 'Unicode', 'realloc', 'post-return'] },
    {
        id: 'lists',
        path: 'runtime/lists.component.wasm',
        features: ['typed lists', 'list/string ownership', 'subarray offsets'],
    },
    { id: 'records', path: 'runtime/records.component.wasm', features: ['records', 'tuples', 'flags'] },
    { id: 'variants', path: 'runtime/variants.component.wasm', features: ['variants', 'options', 'results', 'enums'] },
    {
        id: 'flavorful',
        path: 'runtime/flavorful.component.wasm',
        features: ['nested records/lists/variants', 'results', 'imports'],
    },
    { id: 'resources', path: 'p3/context-resource-drop.wat', features: ['own', 'drop', 'destructors', 'context'] },
    {
        id: 'events',
        path: 'p3/waitable-set-poll-non-set.wat',
        features: ['waitable sets', 'poll', 'guest event memory'],
    },
    {
        id: 'async',
        path: 'p3/sync-lowered-async-callee.wat',
        features: ['guest-to-guest', 'sync lower', 'async lift', 'yield', 'task.return'],
    },
    {
        id: 'streams',
        path: 'p3/zero-length-same-component-stream.wat',
        features: ['stream handles', 'read/write', 'zero-length payload'],
    },
    {
        id: 'futures',
        path: 'local/future-lower.wasm',
        features: ['future lift/lower', 'promises', 'resource payload types'],
    },
] as const;
export type ComponentId = (typeof components)[number]['id'];
export const scenarios: { id: string; components: readonly ComponentId[] }[] = [
    ...components.map(({ id }) => ({ id, components: [id] })),
    {
        id: 'portfolio',
        components: ['adder', 'numbers', 'strings', 'lists', 'records', 'variants', 'flavorful', 'resources'],
    },
];
export const bundlers = ['rolldown', 'rollup'] as const;
export type Bundler = (typeof bundlers)[number];
export function componentPath(id: ComponentId) {
    const { path } = components.find((component) => component.id === id)!;
    // Rust P3 artifacts are produced by the normal in-repo build, like other P3 tests.
    return fileURLToPath(
        new URL(
            path.startsWith('local/')
                ? `../../test/fixtures/generated/rust-test-components/${path.slice(6)}`
                : `../../test/fixtures/components/${path}`,
            import.meta.url,
        ),
    );
}
