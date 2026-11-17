import { expect, test } from 'vitest';
import { create } from './stream-helpers.js';

test.concurrent('queued chunks survive partial reads and repeated prepends without copying tails', () => {
    const s = create();
    const queue = new s.PendingValueQueue(() => ({ done: true, value: undefined }), { isNumeric: true, align32: 1 });
    for (let i = 0; i < 4096; i++) {
        queue.push([i]);
    }
    const first: unknown[] = [];
    expect(queue.drainInto(first, 2049)).toBe(2049);
    expect(first).toEqual(Array.from({ length: 2049 }, (_, i) => i));
    queue.prepend([7, 8]);
    queue.prepend([5, 6]);
    const second: unknown[] = [];
    queue.drainInto(second, 3);
    expect(second).toEqual([5, 6, 7]);
    queue.prepend([0]);
    const rest: unknown[] = [];
    queue.drainInto(rest, 5000);
    expect(rest).toEqual([0, 8, ...Array.from({ length: 2047 }, (_, i) => i + 2049)]);
    expect(queue.length).toBe(0);
    queue.push(new Uint8Array([1, 2]));
    queue.drainInto([], 1);
    queue.prepend([3]);
    const tail: unknown[] = [];
    queue.drainInto(tail, 3);
    expect(tail).toEqual([3, 2]);
});
