/** Bootstrap file contract between the Electron launcher and the Host plugin. */

import { readFileSync } from 'node:fs'
import type { DesktopPnpmBootstrap } from './pnpm.ts'

/** Environment variable carrying the bootstrap file path published by the launcher. */
export const DESKTOP_BOOTSTRAP_ENV = 'DSH_DESKTOP_BOOTSTRAP'

/** Launcher-published pnpm runtime values, minus profile identity supplied by the profile block. */
export type DesktopBootstrapPnpm = Omit<DesktopPnpmBootstrap, 'activeProfileName' | 'activeProfileDir' | 'homeDir' | 'generationId'>

/** Parsed and validated contents of the launcher's bootstrap file. */
export interface DesktopBootstrap {
  /** Opaque identity shared by every install surface in this Electron generation. */
  readonly generationId: string
  /** Active profile identity and its desktop-private selection state. */
  readonly profile: {
    readonly name: string
    readonly dir: string
    readonly homeDir: string
    readonly statePath: string
  }
  /** Packaged package-manager runtime owned by the launcher. */
  readonly pnpm: DesktopBootstrapPnpm
  /** Direct-bundle disable-state inputs owned by the launcher. */
  readonly plugins: {
    readonly statePath: string
    readonly installAnchor: string
  }
  /** Loopback control channel back to the Electron shell. */
  readonly actions: {
    readonly controlUrl: string
    readonly controlToken: string
  }
}

const STRING_FIELDS = [
  ['generationId', ''],
  ['profile.name', 'profile.'],
  ['profile.dir', 'profile.'],
  ['profile.homeDir', 'profile.'],
  ['profile.statePath', 'profile.'],
  ['pnpm.appExecutable', 'pnpm.'],
  ['pnpm.pnpmBinPath', 'pnpm.'],
  ['pnpm.electronVersion', 'pnpm.'],
  ['pnpm.nodeBinDir', 'pnpm.'],
  ['pnpm.nodeShimPath', 'pnpm.'],
  ['pnpm.clearEnvironmentPath', 'pnpm.'],
  ['pnpm.dshBootstrapPath', 'pnpm.'],
  ['pnpm.installRecoveryStatePath', 'pnpm.'],
  ['plugins.statePath', 'plugins.'],
  ['plugins.installAnchor', 'plugins.'],
  ['actions.controlUrl', 'actions.'],
  ['actions.controlToken', 'actions.'],
] as const

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

function readString(source: Record<string, unknown>, dotted: string): unknown {
  let value: unknown = source
  for (const segment of dotted.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in (value as Record<string, unknown>))) {
      return undefined
    }
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

/**
 * Read, parse, and validate the launcher bootstrap file.
 * @param path - absolute path published through {@link DESKTOP_BOOTSTRAP_ENV}.
 * @returns the validated bootstrap values for this generation.
 * @throws a descriptive error naming the env var when the file is missing, not JSON, or malformed.
 */
export function readDesktopBootstrap(path: string): DesktopBootstrap {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (cause) {
    throw new Error(`dsh-desktop-host: cannot read ${DESKTOP_BOOTSTRAP_ENV} file ${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(`dsh-desktop-host: ${DESKTOP_BOOTSTRAP_ENV} file is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`dsh-desktop-host: ${DESKTOP_BOOTSTRAP_ENV} file must contain a JSON object`)
  }
  const source = parsed as Record<string, unknown>
  for (const [field] of STRING_FIELDS) {
    const value = readString(source, field)
    if (typeof value !== 'string' || value === '') {
      throw new Error(`dsh-desktop-host: ${DESKTOP_BOOTSTRAP_ENV} file is missing non-empty string field '${field}'`)
    }
  }
  let controlUrl: URL
  try {
    controlUrl = new URL(source.actions === undefined ? '' : readString(source, 'actions.controlUrl') as string)
  } catch {
    throw new Error(`dsh-desktop-host: ${DESKTOP_BOOTSTRAP_ENV} file field 'actions.controlUrl' is not a valid URL`)
  }
  if (controlUrl.protocol !== 'http:' || !LOOPBACK_HOSTS.has(controlUrl.hostname)) {
    throw new Error(`dsh-desktop-host: ${DESKTOP_BOOTSTRAP_ENV} file field 'actions.controlUrl' must be a loopback http URL`)
  }
  const block = (key: string): unknown => source[key]
  return {
    generationId: source.generationId as string,
    profile: block('profile') as DesktopBootstrap['profile'],
    pnpm: block('pnpm') as DesktopBootstrapPnpm,
    plugins: block('plugins') as DesktopBootstrap['plugins'],
    actions: block('actions') as DesktopBootstrap['actions'],
  }
}
