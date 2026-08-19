import type { CatalogQuery } from './generated/catalog-query.js'
import type { CatalogSnapshot } from './generated/catalog-snapshot.js'
import type { CatalogSourceManifest } from './generated/catalog-source.js'

/** How a local catalog source was registered. */
export type SourceRegistrationKind = 'user-added' | 'built-in'

/** A persisted catalog source registration the user owns. */
export interface LocalSourceRecord {
  readonly sourceRecordId: string
  readonly registrationKind: SourceRegistrationKind
  readonly adapterId: string
  readonly providerId: string
  readonly manifestUrl?: string
  /** Registration-time disclosure retained for user-added standard sources. */
  readonly manifest?: CatalogSourceManifest
  readonly builtInProviderKey?: string
  readonly enabled: boolean
  readonly order: number
}

/** Persists and reloads the local catalog source registrations. */
export interface CatalogSourceStore {
  load(): Promise<readonly LocalSourceRecord[]>
  save(records: readonly LocalSourceRecord[]): Promise<void>
}

/** Per-request context an adapter receives while fetching catalog data. */
export interface CatalogFetchContext {
  readonly signal: AbortSignal
  readonly source: LocalSourceRecord
  readonly http: CatalogHttpClient
  readonly media: CatalogMediaRegistrar
}

/** The supported role a catalog media candidate may serve. */
export type CatalogMediaRole = 'plugin-icon' | 'publisher-avatar'

/** A reviewed media candidate produced by a catalog adapter. */
export interface CatalogMediaCandidate {
  /** Credential-free HTTPS URL retained only by the Host. */
  readonly remoteUrl: string
  readonly role: CatalogMediaRole
  readonly alt?: string
  readonly sourceRecordId: string
  readonly itemId: string
  /** Exact reviewed hostnames allowed for the initial request and every redirect. */
  readonly allowedHostnames: readonly string[]
}

/** Registers a reviewed media candidate for later resolution. */
export interface CatalogMediaRegistrar {
  /** Register one candidate and return an opaque Host-managed reference. */
  register(candidate: CatalogMediaCandidate): string
}

/** Registers and revokes catalog media candidates by owning source. */
export interface CatalogMediaRegistry extends CatalogMediaRegistrar {
  /** Revoke every reference and in-flight media read owned by one source. */
  unregisterSource(sourceRecordId: string): void
}

/** An SSRF-restricted catalog HTTP client with bounded fetch. */
export interface CatalogHttpClient {
  getJson(url: string, signal: AbortSignal, policy?: CatalogHttpRequestPolicy): Promise<CatalogHttpResponse>
}

/** Per-request policy for a catalog HTTP fetch. */
export interface CatalogHttpRequestPolicy {
  /** Reject a cross-origin redirect before the destination is contacted. */
  readonly allowedOrigin?: string
  /** Bypass and replace any completed or in-flight catalog response cache entry. */
  readonly cacheMode?: 'default' | 'reload'
}

/** A completed catalog HTTP JSON response. */
export interface CatalogHttpResponse {
  readonly value: unknown
  readonly finalUrl: string
}

/** An adapter that normalizes provider data into a catalog snapshot. */
export interface CatalogAdapter {
  readonly adapterId: string
  fetch(query: CatalogQuery, context: CatalogFetchContext): Promise<CatalogSnapshot>
  /**
   * Optionally scan the adapter's complete normalized catalog independently
   * of the discovery query and page cursor.
   */
  scanCatalog?(query: CatalogQuery, context: CatalogFetchContext): Promise<readonly CatalogSnapshot[]>
}

/** An opaque page cursor, scoped to a source and effective query. */
export interface ScopedCatalogCursor {
  readonly value: string
  readonly sourceRecordId: string
  readonly queryKey: string
}

/** A normalized repository identity for a catalog item. */
export interface NormalizedRepositoryIdentity {
  readonly url: string
  readonly subdirectory?: string
}

/** A normalized package identity for a catalog item. */
export interface NormalizedPackageIdentity {
  readonly registry: 'npm'
  readonly name: string
}

/** The normalized identity a catalog item may declare. */
export type CatalogIdentityChoice =
  | { readonly kind: 'repository'; readonly repository: NormalizedRepositoryIdentity }
  | { readonly kind: 'package'; readonly package: NormalizedPackageIdentity }
