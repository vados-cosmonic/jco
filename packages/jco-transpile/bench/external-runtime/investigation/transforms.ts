import ts from 'typescript-compiler-api';

/** AST edits deliberately affect only the diagnostic bundle, never runtime sources. */
function edit(code: string, select: (node: ts.Node, source: ts.SourceFile) => string | undefined) {
    const source = ts.createSourceFile('diagnostic.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits: { start: number; end: number; text: string }[] = [];
    function visit(node: ts.Node) {
        const text = select(node, source);
        if (text !== undefined) {
            edits.push({ start: node.getStart(source), end: node.end, text });
        } else {
            ts.forEachChild(node, visit);
        }
    }
    visit(source);
    for (const { start, end, text } of edits.toSorted((a, b) => b.start - a.start)) {
        code = code.slice(0, start) + text + code.slice(end);
    }
    return code;
}
export function requestedMembers(code: string) {
    const source = ts.createSourceFile('binding.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const members = new Set<string>();
    function visit(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node)) {
            const path = node.getText(source).replaceAll('?.', '.');
            const member = path.match(/^_jcoIntrinsics\.([a-zA-Z]+\.[a-zA-Z0-9]+)/)?.[1];
            if (member) {
                members.add(member);
            }
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'receiver' && node.initializer) {
            const namespace = node.initializer.getText(source).match(/^_jcoIntrinsics\?\.([a-zA-Z]+)$/)?.[1];
            // Each generated binding uses its own IIFE, with an intrinsic declaration.
            const block = node.parent.parent.parent;
            const member = block.getText(source).match(/const intrinsic = receiver\?\.([a-zA-Z0-9]+)/)?.[1];
            if (namespace && member) {
                members.add(namespace + '.' + member);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return [...members].toSorted();
}
export function omitUnusedNamespaces(code: string, needed: Set<string>) {
    return edit(code, (node, source) => {
        if (ts.isVariableStatement(node)) {
            const name = node.declarationList.declarations[0]?.name.getText(source);
            if (name === 'waitable' && !needed.has('waitable')) {
                return '';
            }
            if (name === 'host' && !needed.has('host') && !needed.has('waitable')) {
                return '';
            }
        }
        if (
            ts.isPropertyAssignment(node) &&
            node.name.getText(source) === 'intrinsics' &&
            ts.isObjectLiteralExpression(node.initializer)
        ) {
            const properties = node.initializer.properties.filter((p) => p.name && needed.has(p.name.getText(source)));
            return `intrinsics: { ${properties.map((p) => p.getText(source)).join(',')} }`;
        }
    });
}
export function omitBindingChecks(code: string) {
    return edit(code, (node, source) => {
        if (ts.isIfStatement(node)) {
            const block = node.thenStatement.getText(source);
            if (
                /throw new (TypeError|Error)\(['`](Jco Component Model runtime|incompatible Jco JavaScript Component Model runtime API)/.test(
                    block,
                )
            ) {
                return '';
            }
        }
    });
}
export function omitReceiverBinding(code: string) {
    return code.replaceAll('return intrinsic.bind(receiver);', 'return intrinsic;');
}

export function countFactoryCalls(code: string) {
    return edit(code, (node, source) => {
        if (
            ts.isFunctionDeclaration(node) &&
            node.name?.text.startsWith('create') &&
            node.body &&
            ts.isSourceFile(node.parent)
        ) {
            const body = node.body.getText(source);
            return node
                .getText(source)
                .replace(
                    body,
                    `{ globalThis.__jcoFactoryCounts?.(${JSON.stringify(node.name.text)}); ${body.slice(1, -1)} }`,
                );
        }
    });
}

/** Unminified top-level factory sizes explain retention, not transfer cost. */
export function factorySizes(code: string) {
    const source = ts.createSourceFile('bundle.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    return Object.fromEntries(
        source.statements
            .filter(ts.isFunctionDeclaration)
            .filter((node) => node.name?.text.startsWith('create'))
            .map((node) => [node.name!.text, Buffer.byteLength(node.getText(source))]),
    );
}
