import type { CoreModule } from '../../runtime.js';

/**
 * Log runtime diagnostics when enabled at module load. Snapshot the environment
 * so hot runtime operations never read process.env.
 *
 * A logger which logs says so with `enabled`, so that operations can skip
 * collecting diagnostics, and stay out of JS entirely, when nothing is logged.
 * @param args Values to log.
 */
export const debugLog: CoreModule['debugLog'] = (
    globalThis as typeof globalThis & { process?: { env?: { JCO_DEBUG?: unknown } } }
)?.process?.env?.JCO_DEBUG
    ? Object.assign((...args: unknown[]) => console.debug(...args), { enabled: true })
    : () => {};
