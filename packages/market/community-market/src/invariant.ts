/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-community-market`.
 * @module @deepseek-ai/dsh-community-market/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { MarketSettingsDocument } from './catalog/source-store.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-community-market'
const MARKET_NAMESPACE = settingsNamespace('dsh-community-market')

/** Cordis companion plugin name. */
export const name = 'community-market-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Owned relationship: the market's settings document must never publish
 * duplicate install-receipt or catalog-source identities. Both write paths
 * enforce uniqueness before committing — `MarketInstallService.saveReceipts`
 * rejects duplicate `receiptId`s/package ownership and
 * `SettingsCatalogSourceStore.save` rejects duplicate `sourceRecordId`s via
 * `validateLocalSourceRecords`. The invariant re-checks the authoritative
 * publication so a divergence between a write path and the settings seam is
 * caught instead of silently published to the renderer.
 */
const install: InvariantInstaller = (ctx: Context, fail: InvariantFailure) => {
  ctx.on('settings/updated', (ns, next) => {
    if (ns !== MARKET_NAMESPACE) return
    const doc = next as MarketSettingsDocument | undefined
    if (doc === undefined) return
    const receipts = doc.installReceipts
    if (receipts !== undefined) {
      const seenReceipt = new Set<string>()
      for (const receipt of receipts) {
        if (seenReceipt.has(receipt.receiptId)) {
          fail(`community-market settings published a duplicate receiptId "${receipt.receiptId}"`)
        }
        seenReceipt.add(receipt.receiptId)
      }
    }
    const seenSource = new Set<string>()
    for (const source of doc.sources) {
      if (seenSource.has(source.sourceRecordId)) {
        fail(`community-market settings published a duplicate sourceRecordId "${source.sourceRecordId}"`)
      }
      seenSource.add(source.sourceRecordId)
    }
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
