/** Experimental JavaScript Component Model runtime contract, independent of package version. */
export const CM_RUNTIME_API_VERSION = 1 as const;

export type RuntimeApiVersion = number;
export type ResourceHandle = number;
export type ResourceRep = number;
export type ResourceScope = number;

export interface RuntimeErrorConstructor {
    new (message?: string): Error;
    readonly prototype: Error;
}

/** Trap capability from the WebAssembly implementation selected by the bindings. */
export interface TrapContext {
    readonly RuntimeError: RuntimeErrorConstructor;
}

/** Stable per-instantiation capability; the table and handle remain call operands. */
export type ResourceTableGetContext = TrapContext;

export interface ResourceTableEntry {
    readonly rep: ResourceRep;
    readonly scope: ResourceScope;
    readonly own: boolean;
}

/** Optional ownership metadata shared by the tables of a component instance. */
export interface ResourceTable extends ArrayLike<number> {
    readonly _resourceKind?: string;
    readonly _resourceOwners?: ReadonlyMap<number, ResourceTable>;
}

/** Exports required at the public intrinsics/resource subpath. */
export interface ResourceModule {
    readonly tableGet: (
        context: ResourceTableGetContext,
        table: ResourceTable,
        handle: ResourceHandle,
    ) => ResourceTableEntry;
}

/** Type-only conformance map. No runtime registry or factory is required. */
export interface RuntimeModuleContracts {
    readonly 'intrinsics/resource': ResourceModule;
}
