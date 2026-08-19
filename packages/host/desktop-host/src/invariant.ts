/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-desktop-host`.
 * @module @deepseek-ai/dsh-desktop-host/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-desktop-host'

/** Cordis companion plugin name. */
export const name = 'desktop-host-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: every service this package publishes
 * (desktopProfiles, desktopPnpm, desktopPlugins, desktopActions) is
 * generation-scoped and only registers when the Electron launcher provides a
 * bootstrap, so an ordinary in-process boot never observes the state those
 * services own. The state relations (profile selection stays restart-safe,
 * the install-recovery WAL rejects a second protected add while pending, the
 * disable-state file stays bounded and consistent with the bundle inventory)
 * are asserted by the owning package tests against the real on-disk formats.
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
