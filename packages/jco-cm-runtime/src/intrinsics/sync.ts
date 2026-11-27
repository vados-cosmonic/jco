// A synchronous leaf borrows the export task for the duration of a host call.
// Detached lowers must still create and retire an implicit task. Keep the
// task and resource operations shared by external and embedded bindings.
export { lowerSyncImport } from './async-task/lower-import-backwards-compat.js';
export { tableRep } from './resource-entry.js';
export { IndexedResourceCaptures } from './resource-captures.js';
