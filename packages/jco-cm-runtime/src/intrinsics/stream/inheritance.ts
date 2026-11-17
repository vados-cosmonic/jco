import type { StreamEndConstructor, StreamEndOptions, StreamPayloadEnd } from '../../runtime.js';
import type { StreamEndStore } from './end.js';

/** Type-only view of the stream end class, leaving the direction for the subclass to define. */
export type StreamEndSuperclass = Pick<StreamEndConstructor, 'CopyState' | 'CopyResult'> & {
    new (
        store: StreamEndStore,
        args: StreamEndOptions,
    ): Omit<StreamPayloadEnd, 'isReadable' | 'isWritable' | '_transfer'>;
};
