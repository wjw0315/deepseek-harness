import type { CatalogSnapshot } from './contracts/generated/catalog-snapshot.js'
import type { CatalogSourceManifest } from './contracts/generated/catalog-source.js'
import type { LocalSourceRecord } from './contracts/types.js'

/** A built-in catalog provider bundled with the Market, shown without a stored source record. */
export interface MarketBuiltInProvider {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly providerId: string
  readonly adapterId: string
  readonly endpoint: string
  readonly attribution: {
    readonly name: string
    readonly url: string
    readonly notice?: string
  }
  readonly partnership: boolean
}

/** Renderer-facing view of one registered Market source with its relation to a built-in adapter. */
export interface MarketSourceView extends LocalSourceRecord {
  readonly name: string
  readonly description?: string
  readonly endpoint: string
  readonly homepage?: string
  readonly attribution?: {
    readonly name: string
    readonly url: string
    readonly notice?: string
  }
  readonly partnership: boolean
}

/** Full Market state: registered sources, available built-ins, and current desktop actions. */
export interface MarketStateResponse {
  readonly sources: readonly MarketSourceView[]
  readonly builtIns: readonly MarketBuiltInProvider[]
  readonly desktopActions: {
    readonly openTerminal: boolean
    readonly requestRestart: boolean
  }
}

/** Display-only instruction reconstructed by the Host from normalized identity. */
export interface MarketManualInstallHint {
  readonly sourceRecordId: string
  readonly providerId: string
  readonly itemId: string
  readonly kind: 'npm' | 'github'
  /** GitHub instructions resolve a moving repository HEAD; exact npm targets do not. */
  readonly mutable: boolean
  readonly desktopVerification: 'not-verified'
  readonly displayCommand: string
}

/** The snapshot (or scan error) produced by one source for a catalog query. */
export interface MarketCatalogSourceResult {
  readonly source: MarketSourceView
  readonly snapshot?: CatalogSnapshot
  readonly error?: string
  readonly stale: boolean
}

/** Response of a catalog search across every active source for one query. */
export interface MarketCatalogResponse {
  readonly query: Record<string, unknown>
  readonly results: readonly MarketCatalogSourceResult[]
  /** Categories derived from the complete active-source index, not only this page. */
  readonly categories: readonly string[]
  /** Display-only hints for items in this response page; never executable targets. */
  readonly manualInstall: readonly MarketManualInstallHint[]
  readonly metadata?: MarketCatalogMetadata
  readonly fetchedAt: string
}

/** Timestamps and cache status describing when a catalog snapshot was scanned. */
export interface MarketCatalogMetadata {
  readonly scannedAt: string
  readonly expiresAt: string
  readonly providerRevision?: string
  readonly cacheStatus: 'fresh' | 'cached'
}

/** The transport and query contract of one registered standard catalog source. */
export interface MarketSourceManifestResponse {
  readonly source: CatalogSourceManifest
}

/** One user-driven mutation the Market can apply to its registered sources. */
export type MarketSourceMutation =
  | { readonly action: 'add-builtin'; readonly key: string }
  | { readonly action: 'add-standard'; readonly manifestUrl: string }
  | { readonly action: 'select'; readonly sourceRecordId: string }
  | { readonly action: 'move'; readonly sourceRecordId: string; readonly direction: 'up' | 'down' }
  | { readonly action: 'remove'; readonly sourceRecordId: string }

/** Durable proof that the Market installed one exact npm package into one profile. */
export interface MarketInstallReceipt {
  readonly receiptId: string
  readonly profileName: string
  readonly packageName: string
  readonly version: string
  readonly integrity: string
  readonly bundlePatch: string
  readonly sourceRecordId: string
  readonly providerId: string
  readonly itemId: string
  readonly displayName: string
  readonly installedAt: string
}

/** One installed package rendered by install ownership kind and bundle mutability. */
export type MarketInstallationView =
  | {
    readonly kind: 'managed'
    readonly status: 'active' | 'disabled'
    readonly action: 'uninstall'
    /** An active mutable bundle can be disabled without surrendering uninstall ownership. */
    readonly disableBundleId?: string
    /** A disabled mutable bundle can be enabled without surrendering uninstall ownership. */
    readonly enableBundleId?: string
    readonly receipt: MarketInstallReceipt
  }
  | {
    readonly kind: 'external'
    readonly status: 'active'
    readonly action: 'disable'
    /** Generation-scoped Host capability; never a path or package argument. */
    readonly bundleId: string
    readonly packageName: string
  }
  | {
    readonly kind: 'external'
    readonly status: 'disabled'
    readonly action: 'enable'
    /** Generation-scoped Host capability; never a path or package argument. */
    readonly bundleId: string
    readonly packageName: string
  }
  | {
    readonly kind: 'immutable'
    readonly status: 'active' | 'disabled'
    readonly action: 'none'
    readonly packageName: string
  }

/** The Host-reconciled set of installed bundles for the active profile. */
export interface MarketInstallationsResponse {
  /** Host-reconciled direct bundles for the active profile. */
  readonly installations: readonly MarketInstallationView[]
}

/** Complete Host-derived structural subset; local install state never changes catalog membership. */
export interface MarketInstallableResponse {
  readonly source: MarketSourceView
  readonly items: CatalogSnapshot['items']
  readonly manualInstall: readonly MarketManualInstallHint[]
  readonly metadata: MarketCatalogMetadata
}

/** Renderer input for the non-mutating verification stage. */
export type MarketOperationPreviewRequest =
  | {
    readonly action: 'install'
    readonly sourceRecordId: string
    readonly itemId: string
  }
  | {
    readonly action: 'uninstall'
    readonly receiptId: string
  }
  | {
    readonly action: 'disable'
    /** Opaque exact target obtained from the current Host inventory. */
    readonly bundleId: string
  }
  | {
    readonly action: 'enable'
    /** Opaque exact target obtained from the current Host inventory. */
    readonly bundleId: string
  }

/** Host-verified facts shown before the user confirms a package mutation. */
export interface MarketOperationPreviewResponse {
  readonly action: 'install' | 'uninstall' | 'disable' | 'enable'
  readonly profileName: string
  readonly packageName: string
  readonly version?: string
  readonly displayName: string
  readonly expiresAt: string
  readonly previewId: string
}

/** The verified result a package mutation returns after the Host applies it. */
export type MarketOperationExecuteResponse =
  | {
    readonly action: 'install'
    readonly receipt: MarketInstallReceipt
    readonly restartToken: string
  }
  | {
    readonly action: 'uninstall'
    readonly receiptId: string
    readonly packageName: string
    readonly restartToken: string
  }
  | {
    readonly action: 'disable'
    readonly packageName: string
    readonly restartToken: string
  }
  | {
    readonly action: 'enable'
    readonly packageName: string
    readonly restartToken: string
  }

/** Acknowledgment that the Market relayed the requested desktop action to the Host. */
export interface MarketDesktopActionResponse {
  readonly ok: true
}
