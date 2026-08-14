/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-runtime`.
 * @module @deepseek-ai/dsh-client-ui-runtime/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-runtime'

/** Cordis companion plugin name. */
export const name = 'client-ui-runtime-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the port row is a pure-presentation General-settings
 * registration; its only data source is the renderer-side desktopRuntime global
 * established by the Electron preload bridge, not a harness service relation.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
