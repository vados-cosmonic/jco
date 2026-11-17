import type {
    PendingValueQueueConstructor,
    ComponentHostOperationContext,
    StreamReadFn,
    StreamElementMetadata,
    StreamChunk,
} from '../../runtime.js';
import { trackHostOperation } from '../component.js';
import { disposeHostValue } from '../core.js';
export function initializePendingValueQueueClass(
    tracking: ComponentHostOperationContext,
): PendingValueQueueConstructor {
    class PendingValueQueue {
        #readFn: StreamReadFn;
        #elemMeta: StreamElementMetadata;
        #done = false;
        #sourceReadPromise: Promise<number> | null = null;
        #chunks: ({ data: StreamChunk; offset: number } | undefined)[] = [];
        #head = 0;
        #prepended: { data: StreamChunk; offset: number }[] = [];
        #length = 0;

        constructor(readFn: StreamReadFn, elemMeta: StreamElementMetadata) {
            this.#readFn = readFn;
            this.#elemMeta = elemMeta;
        }

        get length() {
            return this.#length;
        }
        get done() {
            return this.#done;
        }
        get sourceIsSync() {
            return !!this.#readFn.sourceIsSync;
        }

        push(source: StreamChunk) {
            if (source.length === 0) {
                return 0;
            }
            this.#chunks.push({ data: source, offset: 0 });
            this.#length += source.length;
            return source.length;
        }

        appendReadValue(value: unknown) {
            if (value === undefined) {
                return 0;
            }
            if (this.#elemMeta.isNumeric) {
                if (value instanceof ArrayBuffer) {
                    value = new Uint8Array(value);
                }
                if (
                    Array.isArray(value) ||
                    (ArrayBuffer.isView(value) && 'length' in value && typeof value.length === 'number')
                ) {
                    return this.push(value as StreamChunk);
                }
            }
            return this.push([value]);
        }

        async readSource() {
            if (!this.#sourceReadPromise) {
                this.#sourceReadPromise = (async () => {
                    let hostRead: ReturnType<StreamReadFn> | undefined;
                    let res: IteratorResult<unknown>;
                    try {
                        res = await trackHostOperation(tracking, () => (hostRead = this.#readFn()));
                    } catch (err) {
                        if (!tracking.storeTrap.stopped) {
                            throw err;
                        }
                        // Stopping settled this wait, but not the host's read.
                        Promise.resolve(hostRead).then(
                            (late) => disposeHostValue(tracking.symbolDispose, late?.value),
                            () => {},
                        );
                        this.#done = true;
                        return 0;
                    }
                    // Nothing will take what arrives after the stream was dropped.
                    if (this.#readFn.dropped) {
                        disposeHostValue(tracking.symbolDispose, res.value);
                        this.#done = true;
                        return 0;
                    }
                    const appended = this.appendReadValue(res.value);
                    this.#done = !!res.done;
                    return appended;
                })().finally(() => {
                    this.#sourceReadPromise = null;
                });
            }
            return this.#sourceReadPromise;
        }

        prepend(source: StreamChunk) {
            if (source.length === 0) {
                return;
            }
            this.#prepended.push({ data: source, offset: 0 });
            this.#length += source.length;
        }

        drainInto(target: unknown[], maxCount: number) {
            let transferred = 0;
            let remaining = Math.min(maxCount, this.#length);
            while (remaining > 0) {
                const front = this.#prepended.length > 0;
                const cursor = front ? this.#prepended[this.#prepended.length - 1] : this.#chunks[this.#head]!;
                const chunk = cursor.data;
                const transfer = Math.min(remaining, chunk.length - cursor.offset);
                for (let i = 0; i < transfer; i++) {
                    target.push(chunk[cursor.offset + i]);
                }
                cursor.offset += transfer;
                this.#length -= transfer;
                transferred += transfer;
                remaining -= transfer;
                if (cursor.offset === chunk.length) {
                    if (front) {
                        this.#prepended.pop();
                    } else {
                        this.#chunks[this.#head++] = undefined;
                        if (this.#head === this.#chunks.length) {
                            this.#chunks = [];
                            this.#head = 0;
                        } else if (this.#head >= 1024 && this.#head * 2 >= this.#chunks.length) {
                            this.#chunks = this.#chunks.slice(this.#head);
                            this.#head = 0;
                        }
                    }
                }
            }
            return transferred;
        }
    }

    return PendingValueQueue;
}
