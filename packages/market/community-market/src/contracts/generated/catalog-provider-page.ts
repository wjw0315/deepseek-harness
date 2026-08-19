/* Generated from docs/schemas by scripts/generate-contract-types.mjs. Do not edit. */

/** A catalog item carried by a provider page or normalized snapshot. */
export type Item = Item1 & {
  id: Identifier
  name: PlainText
  displayName: PlainText
  summary: PlainText
  description?: PlainText
  homepage?: HttpsUri
  latestVersion?: string
  license?: string
  /**
   * @maxItems 32
   */
  categories?: CategoryId[]
  /**
   * @maxItems 64
   */
  keywords?: string[]
  repository?: Repository
  package?: Package
  publisher?: Publisher
  media?: Media
  capabilities?: Capabilities
  compatibility?: Compatibility
  updatedAt?: string
}
/** The tag discriminator union that distinguishes an item by its owning registry shape. */
export type Item1 =
  | {
      repository: unknown
      [k: string]: unknown
    }
  | {
      package: unknown
      [k: string]: unknown
    }
/** An opaque identifier for one catalog item. */
export type Identifier = string
/** A plain-text string value. */
export type PlainText = string
/** An absolute HTTPS URI. */
export type HttpsUri = string
/** An opaque category identifier used by the current adapter. */
export type CategoryId = string
/** A short alt-text string for an image. */
export type MediaAlt = PlainText
/**
 * A list of capability identifiers.
 * @maxItems 64
 */
export type CapabilityList = string[]

/**
 * The untrusted page JSON returned by one standard HTTPS catalog endpoint. Only schemaVersion, items, and page are required. A page may contain at most 100 items and must also respect the effective requested or declared default limit. Host-observed provenance is intentionally absent and is injected only after validation.
 */
export interface CatalogProviderPage {
  schemaVersion: '1.0.0'
  generatedAt?: string
  revision?: string
  /**
   * @maxItems 100
   */
  items: Item[]
  page: Page
}
/** The upstream repository a catalog item is distributed from. */
export interface Repository {
  url: HttpsUri
  subdirectory?: string
}
/** The package registry coordinates a catalog item is installed from. */
export interface Package {
  registry: 'npm'
  name: string
}
/** The publisher claiming a catalog item. */
export interface Publisher {
  name: PlainText
  url?: HttpsUri
}
/**
 * Optional provider-declared plugin media. In v1, only a direct plugin icon is standardized.
 */
export interface Media {
  icon: RemoteIconCandidate
}
/**
 * A provider-declared remote plugin-icon candidate. The URL must share the final provider-page response origin. The Host resolves and validates it before it can enter a normalized snapshot; the Renderer never receives this URL.
 */
export interface RemoteIconCandidate {
  url: HttpsUri
  alt?: MediaAlt
}
/** The declared capability identifiers a catalog item requires or optionally supports. */
export interface Capabilities {
  required?: CapabilityList
  optional?: CapabilityList
}
/** The declared host and catalog API compatibility surface of a catalog item. */
export interface Compatibility {
  apiVersion?: string
  /**
   * @maxItems 32
   */
  hosts?: string[]
}
/**
 * Use an empty object when there is no next page. nextCursor is opaque and belongs only to this source and effective query.
 */
export interface Page {
  nextCursor?: string
  total?: number
}
