import { CatalogContractError, semanticIssue } from './errors.js'
import type { CatalogQuery } from './generated/catalog-query.js'
import type { CatalogSourceManifest } from './generated/catalog-source.js'
import type { ScopedCatalogCursor } from './types.js'
import { parseCatalogQuery, parseCatalogSource } from './validate.js'

type QueryField = CatalogSourceManifest['query']['supported'][number]

function queryWithoutCursor(query: CatalogQuery): Omit<CatalogQuery, 'cursor'> {
  const { cursor: _cursor, ...rest } = query
  return rest
}

function queryKey(query: CatalogQuery): string {
  const normalized = queryWithoutCursor(query)
  return JSON.stringify({
    q: normalized.q,
    category: normalized.category,
    capability: normalized.capability,
    limit: normalized.limit,
    sort: normalized.sort,
    locale: normalized.locale,
  })
}

/** Normalize and validate a raw catalog query value, trimming the text query and defaulting the limit before schema parsing.
 * @param value - the raw query value to normalize.
 * @returns a validated CatalogQuery, or a schema-rejected CatalogQuery when non-object input was passed through.
 */
export function normalizeCatalogQuery(value: unknown): CatalogQuery {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return parseCatalogQuery(value)
  }

  const input = value as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...input }
  if (typeof normalized.q === 'string') {
    const q = normalized.q.trim()
    if (q) normalized.q = q
    else delete normalized.q
  }
  if (normalized.limit === undefined) normalized.limit = 50
  if (Array.isArray(normalized.category)) normalized.category = [...(normalized.category as unknown[])]
  if (Array.isArray(normalized.capability)) normalized.capability = [...(normalized.capability as unknown[])]
  return parseCatalogQuery(normalized)
}

function supports(source: CatalogSourceManifest, field: QueryField): boolean {
  return source.query.supported.includes(field)
}

/** Serialize a validated catalog query into a request URL for a provider, honoring the source's supported query fields and limits.
 * @param sourceValue - the catalog source manifest describing the provider's transport and supported query fields.
 * @param queryValue - the catalog query to serialize.
 * @returns the provider request URL carrying the applicable query parameters.
 */
export function serializeCatalogQuery(
  sourceValue: CatalogSourceManifest,
  queryValue: CatalogQuery,
): URL {
  const source = parseCatalogSource(sourceValue)
  const query = normalizeCatalogQuery(queryValue)
  const url = new URL(source.transport.endpoint)

  if (supports(source, 'q') && query.q !== undefined) url.searchParams.set('q', query.q)
  if (supports(source, 'category')) {
    for (const category of query.category ?? []) url.searchParams.append('category', category)
  }
  if (supports(source, 'capability')) {
    for (const capability of query.capability ?? []) url.searchParams.append('capability', capability)
  }
  if (supports(source, 'cursor') && query.cursor !== undefined) url.searchParams.set('cursor', query.cursor)
  if (supports(source, 'limit')) {
    url.searchParams.set('limit', String(Math.min(query.limit ?? 50, source.query.maxLimit)))
  }
  if (supports(source, 'sort') && query.sort !== undefined) {
    const supportedSorts = source.query.sorts as readonly NonNullable<CatalogQuery['sort']>[]
    if (!supportedSorts.includes(query.sort)) {
      throw new CatalogContractError('query', [
        semanticIssue('/sort', `is not supported by provider ${source.providerId}`),
      ])
    }
    url.searchParams.set('sort', query.sort)
  }
  if (supports(source, 'locale') && query.locale !== undefined) url.searchParams.set('locale', query.locale)

  return url
}

/** Bind a pagination cursor to a source and its effective query so it cannot be reused across unrelated requests.
 * @param value - the provider's raw cursor value.
 * @param sourceRecordId - the local source record that produced the cursor.
 * @param queryValue - the catalog query the cursor advances.
 * @returns the scoped cursor carrying the source identity and query key.
 */
export function scopeCatalogCursor(
  value: string,
  sourceRecordId: string,
  queryValue: CatalogQuery,
): ScopedCatalogCursor {
  if (!value || !sourceRecordId) {
    throw new CatalogContractError('query', [semanticIssue('/cursor', 'cursor value and source identity are required')])
  }
  const query = normalizeCatalogQuery(queryValue)
  return { value, sourceRecordId, queryKey: queryKey(query) }
}

/** Reattach a scoped cursor to its catalog query, rejecting it when the source or effective query no longer match.
 * @param cursor - the scoped cursor to apply.
 * @param sourceRecordId - the expected source record identity.
 * @param queryValue - the catalog query the cursor must advance.
 * @returns the original query with the bound cursor value restored.
 */
export function applyScopedCatalogCursor(
  cursor: ScopedCatalogCursor,
  sourceRecordId: string,
  queryValue: CatalogQuery,
): CatalogQuery {
  const query = normalizeCatalogQuery(queryValue)
  if (cursor.sourceRecordId !== sourceRecordId || cursor.queryKey !== queryKey(query)) {
    throw new CatalogContractError('query', [
      semanticIssue('/cursor', 'does not belong to this source and effective query'),
    ])
  }
  return parseCatalogQuery({ ...queryWithoutCursor(query), cursor: cursor.value })
}
