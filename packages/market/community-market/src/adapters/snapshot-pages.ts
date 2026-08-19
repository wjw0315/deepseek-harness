import type { CatalogSnapshot } from '../contracts/generated/catalog-snapshot.js'
import type { CatalogFetchContext } from '../contracts/types.js'
import { parseCatalogSnapshot } from '../contracts/validate.js'

/**
 * Options controlling how a catalog adapter's items are paginated into snapshots.
 * @param finalUrl - The provider URL the items were fetched from, recorded in provenance.
 * @param fetchedAt - The ISO timestamp when the fetch completed, recorded in provenance.
 * @param pageSize - The number of items per snapshot page.
 * @param providerGeneratedAt - The provider-reported catalog generation time, when present.
 * @param providerRevision - The provider-reported catalog revision, when present.
 */
export interface SnapshotPageOptions {
  readonly finalUrl: string
  readonly fetchedAt: string
  readonly pageSize: number
  readonly providerGeneratedAt?: string | undefined
  readonly providerRevision?: string | undefined
}

/**
 * Send an item collection through the shared snapshot-provenance shape.
 *
 * Both built-in adapters paginate a provider item array into bounded
 * {@link CatalogSnapshot} pages carrying the same Host-owned source identity
 * and optional provider generation facts; this helper keeps that publication
 * shape in one place.
 * @param context - The fetch context whose source identity stamps each snapshot.
 * @param items - The provider items to paginate.
 * @param options - Pagination size and provenance facts.
 * @returns one snapshot per page, with an empty single page when there are no items.
 */
export function buildSnapshotPages(
  context: CatalogFetchContext,
  items: readonly CatalogSnapshot['items'][number][],
  options: SnapshotPageOptions,
): readonly CatalogSnapshot[] {
  const snapshots: CatalogSnapshot[] = []
  const { finalUrl, fetchedAt, pageSize, providerGeneratedAt, providerRevision } = options
  const source = {
    sourceRecordId: context.source.sourceRecordId,
    providerId: context.source.providerId,
    adapterId: context.source.adapterId,
    registrationKind: context.source.registrationKind,
    fetchedAt,
    finalUrl,
    ...(providerGeneratedAt === undefined ? {} : { providerGeneratedAt }),
    ...(providerRevision === undefined ? {} : { providerRevision }),
  } as const
  for (let offset = 0; offset < items.length; offset += pageSize) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: '1.0.0',
      source,
      items: items.slice(offset, offset + pageSize),
      page: { total: items.length },
    }))
  }
  if (snapshots.length === 0) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: '1.0.0',
      source,
      items: [],
      page: { total: 0 },
    }))
  }
  return snapshots
}
