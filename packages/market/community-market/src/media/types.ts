/** The supported roles a market image may serve. */
export type MarketMediaRole = 'plugin-icon' | 'publisher-avatar'

/**
 * A reviewed image candidate produced inside a catalog adapter.
 *
 * This type must never be accepted directly from a renderer request. The Host
 * registers it and exposes only the returned opaque asset reference.
 */
export interface MarketMediaCandidate {
  readonly remoteUrl: string
  readonly role: MarketMediaRole
  readonly alt?: string
  readonly sourceRecordId: string
  readonly itemId: string
  /** Exact redirect hostnames reviewed by the adapter; wildcards are forbidden. */
  readonly allowedHostnames: readonly string[]
}

/** A fetched, normalized market image ready for the renderer. */
export interface ResolvedMarketMediaAsset {
  readonly body: Buffer
  readonly contentType: 'image/png'
  readonly etag: string
}

/**
 * Registers reviewed candidates so restricted fetches can run later.
 * @param candidate - The reviewed image candidate to register.
 * @returns an opaque asset reference for later resolution.
 */
export interface MarketMediaRegistrar {
  register(candidate: MarketMediaCandidate): string
}

/**
 * The market media service: registers candidates, resolves restricted fetches,
 * and owns the bounded cache and disposal.
 * @param assetRef - The opaque asset reference from {@link MarketMediaRegistrar.register}.
 * @param signal - Abort signal for an in-flight resolution.
 * @returns the resolved asset, or undefined when the reference is unknown or disposed.
 */
export interface MarketMediaService extends MarketMediaRegistrar {
  resolve(assetRef: string, signal: AbortSignal): Promise<ResolvedMarketMediaAsset | undefined>
  /** Drop every registered asset whose candidate belongs to `sourceRecordId`. */
  unregisterSource(sourceRecordId: string): void
  /** Release all caches, in-flight resolutions, and waiters. */
  dispose(): void
}
