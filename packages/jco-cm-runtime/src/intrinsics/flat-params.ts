/** A private cursor leaves the public params property as the unconsumed array. */
interface ParamsContext {
    params?: unknown[];
}
interface ParamCursor {
    values: unknown[];
    offset: number;
    exposed: boolean;
}
const cursors = /* @__PURE__ */ new WeakMap<ParamsContext, ParamCursor>();

/** Materialize only when a consumer observes the public array. */
function getParams(this: ParamsContext): unknown[] {
    const cursor = cursors.get(this)!;
    if (cursor.offset !== 0) {
        cursor.values = cursor.values.slice(cursor.offset);
        cursor.offset = 0;
    }
    cursor.exposed = true;
    return cursor.values;
}

/** Replacing params starts a new argument sequence. */
function setParams(this: ParamsContext, values: unknown[]) {
    const cursor = cursors.get(this)!;
    cursor.values = values;
    cursor.offset = 0;
    cursor.exposed = true;
}

/** Use a cursor for ordinary contexts, preserving custom property accessors. */
function cursorFor(context: ParamsContext): ParamCursor | undefined {
    let cursor = cursors.get(context);
    if (cursor !== undefined) {
        return cursor;
    }
    const descriptor = Object.getOwnPropertyDescriptor(context, 'params');
    if (!descriptor?.configurable || !descriptor.writable || !Object.isExtensible(context)) {
        return undefined;
    }
    cursor = { values: descriptor.value, offset: 0, exposed: true };
    cursors.set(context, cursor);
    Object.defineProperty(context, 'params', {
        get: getParams,
        set: setParams,
        enumerable: descriptor.enumerable,
        configurable: true,
    });
    return cursor;
}

/** Count remaining flat arguments without allocating their suffix. */
export function remainingParams(context: ParamsContext): number {
    const cursor = cursorFor(context);
    return cursor ? cursor.values.length - cursor.offset : context.params!.length;
}

/** Read one argument relative to the current position. */
export function readParam(context: ParamsContext, index: number): unknown {
    const cursor = cursorFor(context);
    return cursor ? cursor.values[cursor.offset + index] : context.params![index];
}

/** Copy a fixed-size list without materializing the rest of the arguments. */
export function copyParams(context: ParamsContext, count: number): unknown[] {
    const cursor = cursorFor(context);
    return cursor ? cursor.values.slice(cursor.offset, cursor.offset + count) : context.params!.slice(0, count);
}

/** Advance, detaching from any array previously exposed to a caller. */
export function consumeParams(context: ParamsContext, count: number): void {
    const cursor = cursorFor(context);
    if (!cursor) {
        context.params = context.params!.slice(count);
    } else if (cursor.exposed) {
        // Retained input/params arrays must not alias subsequent consumption.
        cursor.values = cursor.values.slice(cursor.offset + count);
        cursor.offset = 0;
        cursor.exposed = false;
    } else {
        cursor.offset = Math.min(cursor.values.length, cursor.offset + count);
    }
}
