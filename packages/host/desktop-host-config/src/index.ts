/**
 * Desktop Web Host configuration - host half. Registers a settings card that
 * exposes the loopback bind host, the fixed port, and the extra authorities
 * the /api browser-trust fence accepts. On every committed setting change the
 * plugin writes the resolved values back to a small JSON config file that the
 * Electron shell reads when it spawns 'dsh web'. The target path comes from the
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
 */
export function apply(ctx: Context, config?: Config): void {
  const base = config ?? DEFAULTS
  let current: () => Config = () => base
  const read = (): Config => ({
    webHost: current().webHost ?? DEFAULTS.webHost,
    webPort: current().webPort ?? DEFAULTS.webPort,
    trustedHosts: current().trustedHosts ?? DEFAULTS.trustedHosts,
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
    validate: (value) => {
      if (value.webHost !== '127.0.0.1' && value.webHost !== 'localhost') {
        throw new Error('desktop-host-config: webHost must be loopback (127.0.0.1 or localhost)')
      }
    },
  })
}
