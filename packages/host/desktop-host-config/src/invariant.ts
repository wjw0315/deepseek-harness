/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-desktop-host-config`.
 * @module @deepseek-ai/dsh-desktop-host-config/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-desktop-host-config'

/** Cordis companion plugin name. */
export const name = 'desktop-host-config-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package only registers a settings section whose
 * values the Electron shell re-reads from the settings document on the next
 * host spawn. The schema/validate contract is proven by package tests; the
 * spawn CLI args this config feeds are owned by the desktop app (apps/desktop)
 * and its process-boundary tests. No in-process state commits here that a
 * runtime check could observe diverging.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
