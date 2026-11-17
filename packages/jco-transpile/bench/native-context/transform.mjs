import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript-compiler-api');
const prefix = '__jcoEmbeddedRuntime$';

/**
 * Instrument unminified, embedded-runtime async-instantiation output. This research
 * adapter intentionally fails on unfamiliar output instead of leaving partial hooks.
 */
export function nativeContext(source, metadata, runtimeURL = './native-context-runtime.mjs') {
    const tree = ts.createSourceFile('component.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const patches = [];
    const counts = { registers: 0, storage: 0, table: 0, context: 0, bindings: 0, modules: 0, instantiator: 0 };
    /** Add a replacement and avoid overlapping descendants. */
    function replace(node, text) {
        patches.push([node.getStart(tree), node.end, text]);
    }
    /** Insert an invalidation before an existing function or method body. */
    function invalidate(node) {
        const start = node.body.getStart(tree) - node.getStart(tree);
        const text = node.getText(tree);
        replace(node, text.slice(0, start + 1) + '\n__nativeContext.invalidate();\n' + text.slice(start + 1));
    }
    /** Visit only supported runtime declarations and core binding sites. */
    function visit(node) {
        if (ts.isIfStatement(node) && node.expression.getText(tree) === 'instantiateCore === void 0') {
            replace(
                node,
                node.getText(tree) + '\ninstantiateCore = __nativeContext.wrapInstantiator(instantiateCore);',
            );
            counts.instantiator++;
            return;
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === prefix + 'initializeTaskRegisters') {
            replace(node.initializer, '() => __nativeContext.registers()');
            counts.registers++;
            return;
        }
        if (
            ts.isPropertyDeclaration(node) &&
            node.parent.name?.text === 'AsyncThread' &&
            node.name.getText(tree) === 'storage'
        ) {
            replace(
                node,
                `#nativeContextStorage = [0, 0];
                get storage() { __nativeContext.invalidate(); return this.#nativeContextStorage; }
                set storage(value) { __nativeContext.invalidate(); this.#nativeContextStorage = value; }`,
            );
            counts.storage++;
            return;
        }
        if (
            ts.isMethodDeclaration(node) &&
            node.parent.name?.text === 'RepTable' &&
            ['insert', 'remove', 'clear'].includes(node.name.getText(tree))
        ) {
            invalidate(node);
            counts.table++;
            return;
        }
        if (
            ts.isFunctionDeclaration(node) &&
            [prefix + 'contextGet', prefix + 'contextSet'].includes(node.name?.text)
        ) {
            invalidate(node);
            counts.context++;
            return;
        }
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(tree);
            if (['contextGet.bind', 'contextSet.bind'].includes(callee)) {
                if (node.arguments.length !== 3 || node.arguments[0].getText(tree) !== 'null')
                    throw new Error('Unsupported context binding');
                replace(
                    node,
                    `__nativeContext.bind(${node.arguments[1].getText(tree)}, ${node.arguments[2].getText(tree)}, '${callee === 'contextGet.bind' ? 'get' : 'set'}')`,
                );
                counts.bindings++;
                return;
            }
            if (callee === 'getCoreModule') {
                const filename = node.arguments[0]?.text;
                if (!metadata[filename]) throw new Error(`Missing signatures for ${filename}`);
                replace(node, `__nativeContext.module(${node.getText(tree)}, ${JSON.stringify(metadata[filename])})`);
                counts.modules++;
                return;
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    if (
        counts.registers !== 1 ||
        counts.storage !== 1 ||
        counts.table !== 3 ||
        counts.context !== 2 ||
        !counts.bindings ||
        !counts.modules ||
        counts.instantiator !== 1
    ) {
        throw new Error(`Unsupported embedded runtime: ${JSON.stringify(counts)}`);
    }
    for (const [start, end, replacement] of patches.sort((left, right) => right[0] - left[0])) {
        source = source.slice(0, start) + replacement + source.slice(end);
    }
    const entry = 'export function instantiate(getCoreModule, imports, instantiateCore, options) {';
    if (!source.includes(entry)) throw new Error('Unsupported instantiation shape');
    source = source.replace(
        entry,
        `${entry}
        if (options?.shim?.globals?.WebAssembly) throw new Error('Native context requires the engine WebAssembly implementation');
        const __nativeContext = createNativeContextManager();`,
    );
    return `import { createNativeContextManager } from ${JSON.stringify(runtimeURL)};\n` + source;
}
