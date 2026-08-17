/**
 * Desktop Web Host configuration - host half. Registers a settings card that
 * exposes the loopback bind host, the fixed port, and the extra authorities
 * the /api browser-trust fence accepts. The card's base layer is seeded from
 * the DSH_DESKTOP_WEB_* env vars the Electron shell publishes for the actual
 * spawn, so the row shows the host/port/trusted hosts the app runs with, not
 * schema defaults. On every committed setting change the plugin writes the
 * resolved values back to a small JSON config file that the Electron shell
 * reads when it spawns 'dsh web'. The target path comes from the
 * DSH_DESKTOP_HOST_CONFIG env var the shell passes; absent it, no file is
 * written and the card is configuration-only. Plain JSON keeps the Electron
 * read path dependency-free.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Stable cordis plugin name. */
export const name = 'desktop-host-config'

/**
 * Settings namespace: the top-level key this plugin's fields live under in the
 * settings document. The Electron shell reads the same spelling from that
 * document.
 */
export const DESKTOP_HOST_CONFIG_NAMESPACE = settingsNamespace('desktop-host-config')

/** Environment variable the Electron shell sets to the JSON config path. */
export const DESKTOP_CONFIG_ENV = 'DSH_DESKTOP_HOST_CONFIG'

/** Environment variable carrying the actual spawn bind host. */
export const DESKTOP_WEB_HOST_ENV = 'DSH_DESKTOP_WEB_HOST'

/** Environment variable carrying the actual spawn port ('0' means OS-assigned). */
export const DESKTOP_WEB_PORT_ENV = 'DSH_DESKTOP_WEB_PORT'

/** Environment variable carrying the spawn's extra /api trusted authorities, comma-separated. */
export const DESKTOP_TRUSTED_HOSTS_ENV = 'DSH_DESKTOP_TRUSTED_HOSTS'

/**
 * Plugin config. The harness CLI deliberately rejects an all-interfaces bind
 * (0.0.0.0) to avoid exposing the shell's remote code execution to the
 * network, so webHost is restricted to loopback.
 */
export interface Config {
  /** Loopback bind host passed to 'dsh web --host'. */
  webHost: '127.0.0.1' | 'localhost'
  /** Fixed loopback port; 0 asks the OS to assign one. */
  webPort: number
  /** Extra authorities the /api browser-trust fence accepts. */
  trustedHosts: string[]
}

export const Config: z<Config> = z.object({
  webHost: z.union([z.const('127.0.0.1'), z.const('localhost')]).default('127.0.0.1'),
  webPort: z.number().step(1).min(0).max(65535).default(0),
  trustedHosts: z.array(z.string()).default([]),
})

/** Fully resolved defaults, matching the schema's `.default` values. */
const DEFAULTS: Config = {
  webHost: '127.0.0.1',
  webPort: 0,
  trustedHosts: [],
}

/**
 * The settings base for the actually spawned host, parsed from the
 * DSH_DESKTOP_WEB_* env vars the desktop shell publishes. Invalid values are
 * ignored per field, exactly as the shell tolerates a bad config file, so a
 * stale or hand-set environment never strands the card. The spawn env wins
 * over any composition config: the Loader resolves an absent entry config to
 * schema defaults, and those must not mask the ports the host actually binds.
 * @returns the valid seed fields; fields absent or invalid stay undefined so
 * the explicit config or schema defaults can fill them.
 */
function envBase(): Partial<Config> {
  const host = process.env[DESKTOP_WEB_HOST_ENV]
  const port = process.env[DESKTOP_WEB_PORT_ENV]
  const trusted = process.env[DESKTOP_TRUSTED_HOSTS_ENV]
  const seed: Partial<Config> = {}
  if (host === '127.0.0.1' || host === 'localhost') seed.webHost = host
  if (port !== undefined && /^\d+$/.test(port)) {
    const numeric = Number(port)
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 65535) seed.webPort = numeric
  }
  if (trusted !== undefined && trusted !== '') {
    seed.trustedHosts = trusted.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
  }
  return seed
}

/**
 * Write the resolved config to the JSON path the Electron shell reads.
 * @param path - the JSON config file path (from DSH_DESKTOP_HOST_CONFIG).
 * @param value - the resolved config to persist.
 */
function persistConfig(path: string, value: Config): void {
  mkdirSync(dirname(path), { recursive: true })
  const payload: Record<string, unknown> = {
    webHost: value.webHost,
    webPort: value.webPort,
    trustedHosts: value.trustedHosts,
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/**
 * Mount the settings card and mirror committed values to the desktop config
 * file when DSH_DESKTOP_HOST_CONFIG is set.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (used as the settings base layer).
 * @remarks The settings base layers schema defaults, then the composition
 * entry, then the spawn env: the actual spawn facts win, because the Loader
 * resolves an absent entry config to schema defaults that would otherwise
 * mask the env (the ports the host actually binds).
 */
export function apply(ctx: Context, config?: Config): void {
  const seed = envBase()
  const base: Config = {
    webHost: seed.webHost ?? config?.webHost ?? DEFAULTS.webHost,
    webPort: seed.webPort ?? config?.webPort ?? DEFAULTS.webPort,
    trustedHosts: seed.trustedHosts ?? config?.trustedHosts ?? DEFAULTS.trustedHosts,
  }
  let current: () => Config = () => base
  const read = (): Config => ({
    webHost: current().webHost,
    webPort: current().webPort,
    trustedHosts: current().trustedHosts,
  })
  const sync = (): void => {
    const target = process.env[DESKTOP_CONFIG_ENV]
    if (target !== undefined && target !== '') persistConfig(target, read())
  }
  installSettingsSection(ctx, DESKTOP_HOST_CONFIG_NAMESPACE, Config, base, {
    setSource: (source) => {
      current = source
    },
    onChange: sync,
  })
}
