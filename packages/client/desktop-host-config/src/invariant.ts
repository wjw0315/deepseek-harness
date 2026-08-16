/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-desktop-host-config`.
 * @module @deepseek-ai/dsh-client-desktop-host-config/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-desktop-host-config'

/** Cordis companion plugin name. */
export const name = 'client-desktop-host-config-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this browser-side surface only registers a General
 * settings row over the host `desktop-host-config` settings namespace; the
 * settings write path and HMR slot lifecycle are proven by package tests and
 * owned by the settings and slot systems.
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
