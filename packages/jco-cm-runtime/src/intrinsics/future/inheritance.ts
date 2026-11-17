import type { FutureEndBase, FutureEndConstructor, FutureEndOptions } from '../../runtime.js';
import type { FutureEndStore } from './end.js';

// Model the prototype override as a method while the public structural contract
// exposes readonly function capabilities.
export type FutureEndSuperclass = Pick<FutureEndConstructor, 'CopyResult' | 'CopyState'> & {
    new (
        store: FutureEndStore,
        options: FutureEndOptions,
    ): Omit<FutureEndBase, 'drop' | 'onInstanceStop'> & { drop(): void; onInstanceStop(): void };
};
