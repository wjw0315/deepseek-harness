import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { MarketInstallReceipt } from '../api-types.js'
import type { CatalogSnapshot } from '../contracts/generated/catalog-snapshot.js'
import { validateLocalSourceRecords } from '../contracts/validate.js'
import type { CatalogSourceStore, LocalSourceRecord } from '../contracts/types.js'

/**
 * A persisted catalog cache entry for one source, recording when it was saved
 * and scanned so a subsequent load can reuse recent provider data.
 */
export interface MarketCatalogCache {
  readonly version: 1
  readonly sourceRecordId: string
  readonly locale: string
  readonly savedAt: string
  readonly snapshot: CatalogSnapshot
  readonly categories: readonly string[]
  readonly scannedAt: string
  readonly expiresAt: string
  readonly providerRevision?: string
}

/**
 * The persisted settings document for the community market: the source
 * registry, optional install receipts, and an optional catalog cache.
 */
export interface MarketSettingsDocument {
  readonly sources: readonly LocalSourceRecord[]
  readonly installReceipts?: readonly MarketInstallReceipt[]
  readonly catalogCache?: MarketCatalogCache
}

/**
 * Reconcile legacy multi-enabled settings into the single active-source model.
 * The first enabled record by user order wins. An all-disabled registry keeps
 * its explicit no-selection state.
 * @param records - the source records to normalize.
 * @returns a copy with only the first enabled record still active.
 */
export function normalizeActiveSourceRecords(
  records: readonly LocalSourceRecord[],
): readonly LocalSourceRecord[] {
  const ordered = [...records].sort((left, right) => left.order - right.order)
  const activeSourceRecordId = ordered.find(record => record.enabled)?.sourceRecordId
  return ordered.map(record => ({
    ...record,
    enabled: record.sourceRecordId === activeSourceRecordId,
  }))
}

/**
 * CatalogSourceStore that persists the source registry in a settings scope,
 * validating and normalizing records on every load and save.
 */
export class SettingsCatalogSourceStore implements CatalogSourceStore {
  constructor(private readonly scope: SettingsScope<MarketSettingsDocument>) {}

  load(): Promise<readonly LocalSourceRecord[]> {
    const records = [...this.scope.get().sources]
    validateLocalSourceRecords(records)
    return Promise.resolve(normalizeActiveSourceRecords(records))
  }

  async save(records: readonly LocalSourceRecord[]): Promise<void> {
    const normalized = normalizeActiveSourceRecords(records)
    validateLocalSourceRecords(normalized)
    await this.scope.update({ sources: normalized })
  }
}

/**
 * In-memory CatalogSourceStore that validates and normalizes records on save,
 * keeping a defensive copy for later loads.
 */
export class MemoryCatalogSourceStore implements CatalogSourceStore {
  private records: readonly LocalSourceRecord[] = []

  load(): Promise<readonly LocalSourceRecord[]> {
    return Promise.resolve(this.records)
  }

  save(records: readonly LocalSourceRecord[]): Promise<void> {
    const normalized = normalizeActiveSourceRecords(records)
    validateLocalSourceRecords(normalized)
    this.records = normalized.map(record => ({ ...record }))
    return Promise.resolve()
  }
}
