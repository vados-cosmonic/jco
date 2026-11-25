import type { ResourceTable } from '../runtime.js';
import { tableOwn } from './resource.js';

/** Captures for a synchronous leaf with a single handle table for this resource. */
export class IndexedResourceCaptures {
    slots: (object | undefined)[] | undefined = [];
    readonly #handles: ResourceTable;
    readonly #reps = new Map<number, object>();

    constructor(handles: ResourceTable) {
        this.#handles = handles;
    }

    /** Switch permanently to rep lookup before a host rep can alias an existing capture. */
    byRep(): Map<number, object> {
        if (this.slots) {
            for (let handle = 1; handle < this.slots.length; handle++) {
                const value = this.slots[handle];
                if (value !== undefined) {
                    this.#reps.set(this.#handles[handle * 2 + 1] - tableOwn, value);
                }
            }
            this.slots = undefined;
        }
        return this.#reps;
    }

    get(rep: number) {
        return this.byRep().get(rep);
    }

    set(rep: number, value: object) {
        this.byRep().set(rep, value);
    }

    delete(rep: number) {
        this.byRep().delete(rep);
    }
}
