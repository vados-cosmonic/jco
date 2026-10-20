import type {
    ResourceIntrinsics,
    ResourceState,
    ResourceTable,
    ResourceTaskContext,
    RuntimeErrorConstructor,
} from '../types.js';

const RESOURCE_TABLE_FLAG = 1 << 30;

export function createResourceIntrinsics(
    RuntimeError: RuntimeErrorConstructor,
    tasks?: ResourceTaskContext,
): ResourceIntrinsics {
    const state: ResourceState = {
        handleIndexSpaces: new Map(),
        handleTables: [],
        scopeId: 0,
        scopeCounter: 0,
        scopeTasks: new Map(),
        callBorrows: [],
        currentBorrows: [],
    };
    const transferBorrow: ResourceIntrinsics['transferBorrow'] = (handle, fromTid, toTid) => {
        const fromTable = state.handleTables[fromTid];
        const { rep, own } = resource.tableGet(fromTable, handle);
        const toTable = getOrCreateTable(toTid);
        const componentIdx = toTable._componentIdx;
        const borrowTask = componentIdx === undefined ? undefined : tasks?.getCurrentTask?.(componentIdx);
        if (borrowTask && own) {
            fromTable[handle << 1]++;
            borrowTask.addResourceLender(fromTable, handle);
        }
        if (toTable._createdReps.has(rep)) {
            return rep;
        }
        const newHandle = resource.tableCreateBorrow(toTable, rep, borrowTask?.resourceScopeId() ?? state.scopeId);
        if (borrowTask) {
            borrowTask.addBorrowedHandle();
        } else {
            state.callBorrows.push({ rid: toTid, handle: newHandle });
        }
        return newHandle;
    };
    const resource: ResourceIntrinsics = {
        tableFlag: RESOURCE_TABLE_FLAG,
        state,
        getHandleIndexSpace(key) {
            let space = state.handleIndexSpaces.get(key);
            if (space === undefined) {
                // Every handle kind of an instance shares this space. Index 0
                // is reserved; freed indices are reused in LIFO order.
                space = {
                    next: 1,
                    free: [],
                    alloc() {
                        return this.free.length > 0 ? this.free.pop()! : this.next++;
                    },
                    release(index) {
                        this.free.push(index);
                    },
                };
                state.handleIndexSpaces.set(key, space);
            }
            return space;
        },
        tableCreateBorrow(table, rep, scopeId) {
            if (scopeId === undefined) {
                throw new Error('missing scopeId');
            }
            const handle = resource.getHandleIndexSpace(table._componentIdx ?? table).alloc();
            table[handle << 1] = scopeId;
            table[(handle << 1) + 1] = rep;
            return handle;
        },
        tableCreateOwn(table, rep) {
            table._createdReps.add(rep);
            const handle = resource.getHandleIndexSpace(table._componentIdx ?? table).alloc();
            table[handle << 1] = 0;
            table[(handle << 1) + 1] = rep | RESOURCE_TABLE_FLAG;
            return handle;
        },
        tableGet(table, handle) {
            const scope = table[handle << 1];
            const value = table[(handle << 1) + 1];
            const own = (value & RESOURCE_TABLE_FLAG) !== 0;
            const rep = value & ~RESOURCE_TABLE_FLAG;
            // A freed or never allocated index has no entry in this table: its index may
            // belong to another handle kind of the instance, and `value` is undefined
            // past the end of the table.
            if (value === undefined || rep === 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) {
                throw new RuntimeError(`unknown handle index ${handle}`);
            }
            return { rep, scope, own };
        },
        tableEnsureBorrowDrop(table, handle, scope) {
            if (table[handle << 1] === scope) {
                throw new TypeError('Resource borrow was not dropped at end of call');
            }
        },
        tableRemove(table, handle) {
            const scope = table[handle << 1];
            const value = table[(handle << 1) + 1];
            const own = (value & RESOURCE_TABLE_FLAG) !== 0;
            const rep = value & ~RESOURCE_TABLE_FLAG;
            if (value === undefined || value === 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) {
                throw new RuntimeError(`unknown handle index ${handle}`);
            }
            if (own && scope !== 0) {
                throw new RuntimeError('cannot remove owned resource while borrowed');
            }
            const borrowTask = own ? undefined : state.scopeTasks.get(scope);
            table[handle << 1] = RESOURCE_TABLE_FLAG;
            table[(handle << 1) + 1] = 0;
            resource.getHandleIndexSpace(table._componentIdx ?? table).release(handle);
            borrowTask?.removeBorrowedHandle();
            return { rep, scope, own };
        },
        transferBorrow,
        transferBorrowValidLifting: transferBorrow,
        transferOwn(handle, fromTid, toTid) {
            const { rep } = resource.tableRemove(state.handleTables[fromTid], handle);
            return resource.tableCreateOwn(getOrCreateTable(toTid), rep);
        },
        callDestructor({ componentIdx, dtor, rep }) {
            if (!tasks?.createTask || !tasks.withTask) {
                throw new TypeError('resource destructors require resourceTasks.createTask and resourceTasks.withTask');
            }
            // A destructor gets fresh context slots, even when it is invoked
            // from its own component. withTask restores the enclosing register.
            const task = tasks.createTask({
                componentIdx,
                isAsync: false,
                callingWasmExport: true,
                entryFnName: '<resource-drop>',
            });
            task.enterSync();
            return tasks.withTask({
                taskID: task.id(),
                componentIdx,
                fn: () => {
                    try {
                        const result = dtor(rep);
                        task.resolve([]);
                        task.exit();
                        return result;
                    } catch (error) {
                        if (!task.isResolvedState()) {
                            task.setErrored(error);
                            task.reject(error);
                        }
                        if (!task.isExited()) {
                            task.exit({ skipExclusiveLockCheck: true });
                        }
                        throw error;
                    }
                },
            });
        },
    };
    return resource;

    function getOrCreateTable(tid: number): ResourceTable {
        let table = state.handleTables[tid];
        if (!table) {
            table = Object.assign([RESOURCE_TABLE_FLAG, 0], { _createdReps: new Set<number>() });
            state.handleTables[tid] = table;
        }
        return table;
    }
}
