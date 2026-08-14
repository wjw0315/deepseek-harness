/**
 * Runtime port row in General settings.
 *
 * Registers a single synthetic `settings.general.item` row that reports the
 * dsh host's actual bound HTTP port, read from window.desktopRuntime (the
 * Electron preload bridge) — "—" outside the desktop shell. Read-only, so no
 * store and no write path.
 *
 * @module @deepseek-ai/dsh-client-ui-runtime/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'
import { RuntimePortRow } from './RuntimePortRow.tsx'

/** Required client services: slot registration plus the locale service (so `ctx.locale` is a declared property injection). */
export const inject = ['slots', 'locale']

/** Register the General-settings runtime port row. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-runtime: dictionaries')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'runtime-port',
    order: -10,
    locale: NS,
  }, RuntimePortRow))
}
