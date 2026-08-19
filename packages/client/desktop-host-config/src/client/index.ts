/**
 * Desktop Web Host configuration, browser half. Registers a General settings
 * row that edits the host `desktop-host-config` settings namespace via the
 * settings scope: bind host, fixed port, and trusted domains. The host plugin
 * (dsh-desktop-host-config) mirrors committed values back to the JSON file the
 * Electron shell reads on the next spawn.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings surface's Context merge (ctx.settingsScope) and
// the slot-system SlotMap merge (the 'settings.general.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { DesktopHostConfigRow, type DesktopHostConfigRowInjected } from './DesktopHostConfigRow.tsx'
import { DESKTOP_HOST_CONFIG_NS, HostConfigController, type HostConfig } from './settings-store.ts'
import { en, zh, type DesktopHostKey } from './locales.ts'

/** Registers our settings-row copy in the locale package's namespace map. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Desktop Web Host General row's copy. */
    'settings.desktopHost': DesktopHostKey
  }
}

/** Dictionary namespace owned by this row. */
export const NS = 'settings.desktopHost' as const

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Mount the Desktop Web Host General settings row.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-client-desktop-host-config: row dictionaries')

  const scope = ctx.settingsScope.bind<HostConfig>({ namespace: DESKTOP_HOST_CONFIG_NS })
  const controller = new HostConfigController(scope)

  const injected = (): DesktopHostConfigRowInjected => ({
    hooks: { desktopHostConfig: controller.store },
    setWebHost: value => controller.setWebHost(value),
    setWebPort: value => controller.setWebPort(value),
    setTrustedHosts: values => controller.setTrustedHosts(values),
    requestRestart: async () => {
      await fetch('/api/desktop-host-config/restart', { method: 'POST' })
    },
  })

  ctx.effect(() => {
    const disposers = [
      scope.subscribe(() => { /* snapshot flows through the controller store */ }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-client-desktop-host-config: scope subscription')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'desktop-host-config',
    order: -10,
    locale: NS,
    inject: injected,
  }, DesktopHostConfigRow))
}
