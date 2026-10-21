import assert from 'node:assert/strict';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

export function importsFor(id) {
    const imports = new WASIShim().getImportObject();
    // These fixtures require their host interface at instantiation. Export
    // workloads don't run testImports; that remains covered by the runtime suite.
    for (const name of [
        'numbers/test',
        'records/test',
        'variants/test',
        'lists/test',
        'flavorful/test',
        'strings/imports',
    ]) {
        imports[`test:${name}`] = new Proxy({}, { get: () => (value) => value });
    }
    if (id === 'futures') {
        imports['jco:test-components/resources'] = {
            ExampleResource: class {
                getId() {
                    return 1;
                }
            },
        };
    }
    return imports;
}

/** Checks known answers, not merely agreement between two possibly broken bundles. */
export async function workload(id, instance) {
    switch (id) {
        case 'adder': {
            assert.equal(instance.add.add(17, 25), 42);
            return { call: (i) => instance.add.add(i & 255, 1), async: false };
        }
        case 'numbers': {
            assert.equal(instance.test.roundtripU64(2n ** 64n - 1n), 2n ** 64n - 1n);
            assert.equal(instance.test.roundtripS64(-(2n ** 63n)), -(2n ** 63n));
            assert.equal(instance.test.roundtripF32(1.25), 1.25);
            assert.equal(instance.test.roundtripF64(-Math.PI), -Math.PI);
            assert.equal(instance.test.roundtripChar('🚀'), '🚀');
            return { call: (i) => Number(instance.test.roundtripU64(BigInt(i & 255))), async: false };
        }
        case 'strings': {
            const input = '🚀🚀🚀 𠈄𓀀';
            assert.equal(instance.roundtrip(input), input);
            assert.equal(instance.roundtrip('str'), 'str');
            return { call: () => instance.roundtrip(input).length, async: false };
        }
        case 'lists': {
            const input = new Uint8Array(260).subarray(2, 258);
            input.fill(17);
            assert.deepEqual(instance.test.listRoundtrip(input), input);
            const bytes = instance.allocatedBytes();
            const call = () => instance.test.listRoundtrip(input)[255];
            for (let i = 0; i < 10; i++) {
                assert.equal(call(), 17);
            }
            assert.equal(instance.allocatedBytes(), bytes, 'list roundtrips must release guest allocations');
            return { call, async: false };
        }
        case 'records': {
            const input = { a: 42, b: { a: true, b: false } };
            assert.deepEqual(instance.test.roundtripRecord1(input), input);
            assert.deepEqual(instance.test.tuple1([17]), [17]);
            assert.deepEqual(instance.test.roundtripFlags2({ c: true }), { c: true, d: false, e: false });
            return { call: () => instance.test.roundtripRecord1(input).a, async: false };
        }
        case 'variants': {
            assert.equal(instance.test.roundtripOption(undefined), undefined);
            assert.equal(instance.test.roundtripOption(42), 42);
            assert.equal(instance.test.roundtripResult({ tag: 'ok', val: 4 }), 4);
            assert.throws(
                () => instance.test.roundtripResult({ tag: 'err', val: 5.2 }),
                (error) => error === 5,
            );
            assert.equal(instance.test.roundtripEnum('a'), 'a');
            const input = [
                { tag: 'a', val: 1 },
                { tag: 'a', val: 2 },
                { tag: 'a', val: 3 },
                { tag: 'a', val: 4n },
                { tag: 'a', val: 5n },
                { tag: 'a', val: 6 },
            ];
            assert.deepEqual(instance.test.variantCasts(input), input);
            return { call: () => instance.test.variantCasts(input)[5].val, async: false };
        }
        case 'flavorful': {
            const input = { a: 'list_in_record3 input' };
            assert.deepEqual(instance.test.fListInRecord3(input), { a: 'list_in_record3 output' });
            assert.equal(instance.test.fListInVariant3('input3'), 'output3');
            assert.deepEqual(instance.test.listTypedefs('typedef1', ['typedef2']), [
                new TextEncoder().encode('typedef3'),
                ['typedef4'],
            ]);
            return { call: () => instance.test.fListInRecord3(input).a.length, async: false };
        }
        case 'resources': {
            const call = () => {
                instance.run();
                const resource = instance.api.make();
                resource[Symbol.dispose]();
                return 2;
            };
            const before = instance.drops();
            assert.equal(call(), 2);
            assert.equal(instance.drops(), before + 2);
            return { call, async: false };
        }
        case 'events': {
            assert.equal(await instance.pollEmptySet(), 0);
            return { call: async () => instance.pollEmptySet(), async: true };
        }
        case 'async': {
            assert.equal(await instance.run(), 42);
            return { call: async () => instance.run(), async: true };
        }
        case 'futures': {
            const fn = instance['jco:test-components/future-lower-sync'].futurePassthrough;
            assert.equal(await fn(Promise.resolve(42)), 42);
            return { call: async (i) => fn(Promise.resolve(i & 255)), async: true };
        }
        case 'streams': {
            assert.equal(await instance.zeroLengthWrite(), 0xffff0000);
            // This fixture deliberately leaves a read pending. Don't reuse the
            // instance for throughput: doing so would measure accumulating handles.
            return { call: undefined, async: true };
        }
        default:
            throw new Error(`Missing workload for ${id}`);
    }
}

// Independent expected values validate every timed block outside the clock.
export function expectedResult(id, i) {
    switch (id) {
        case 'adder':
            return (i & 255) + 1;
        case 'numbers':
        case 'futures':
            return i & 255;
        case 'strings':
            return '🚀🚀🚀 𠈄𓀀'.length;
        case 'lists':
            return 17;
        case 'records':
        case 'async':
            return 42;
        case 'variants':
            return 6;
        case 'flavorful':
            return 'list_in_record3 output'.length;
        case 'resources':
            return 2;
        case 'events':
            return 0;
        default:
            throw new Error(`No timed result for ${id}`);
    }
}
