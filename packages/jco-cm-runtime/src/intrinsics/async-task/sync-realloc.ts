import type { StringRealloc } from '../../runtime.js';

/** Guard a synchronous core realloc in an instance with no Canonical ABI context-slot accessors. */
export function guardSyncRealloc(flags: { value: number }, realloc: StringRealloc): StringRealloc {
    return (oldPtr, oldSize, alignment, newSize) => {
        const previous = flags.value;
        flags.value = 0;
        try {
            return realloc(oldPtr, oldSize, alignment, newSize) >>> 0;
        } finally {
            flags.value = previous;
        }
    };
}
