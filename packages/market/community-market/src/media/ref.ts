/** Pattern matching an opaque Host-issued media asset reference. */
export const MARKET_MEDIA_ASSET_REF_PATTERN = /^mktimg_[A-Za-z0-9_-]{32}$/u

/**
 * Convert an opaque Host-issued reference into the only renderer-facing asset URL.
 * @param assetRef opaque media asset reference to convert
 * @returns relative URL that resolves the media asset through the community-market API
 */
export function marketMediaAssetUrl(assetRef: string): string {
  return `/api/community-market/assets?ref=${encodeURIComponent(assetRef)}`
}
