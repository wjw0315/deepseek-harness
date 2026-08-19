/** Desktop-owned inventory and persistent disable state for direct profile bundles. */

import { randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs'
import { chmod, lstat, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'
import {
  PROFILE_TEMPLATES,
  resolveProfileDir,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { assertDesktopProfileName } from './profile-manager.ts'

const BIN_NAME = 'dsh-desktop-host'
/** Node typings always declare `O_NOFOLLOW`, but it is undefined on some platforms; 0 keeps the open flags usable. */
const O_NOFOLLOW_BEST_EFFORT: number = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0
const STATE_VERSION = 1
const STATE_FILE_MODE = 0o600
const STATE_DIRECTORY_MODE = 0o700
const MAX_STATE_BYTES = 64 * 1024
const MAX_PROFILE_MANIFEST_BYTES = 1024 * 1024
const MAX_PROFILES = 64
const MAX_DISABLED_BUNDLES = 512
const MAX_DIRECT_BUNDLES = 1024
const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 256
const BUNDLE_ID_PATTERN = /^bundle_[A-Za-z0-9_-]{32}$/u
const DISABLE_PREVIEW_ID_PATTERN = /^disable_[A-Za-z0-9_-]{43}$/u
const ENABLE_PREVIEW_ID_PATTERN = /^enable_[A-Za-z0-9_-]{43}$/u
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const IMMUTABLE_BUNDLES = new Set([
  ...(PROFILE_TEMPLATES.web ?? []),
  '@deepseek-ai/dsh-desktop-host',
])

/** One direct bundle declared by the active profile. */
export interface DesktopPluginBundle {
  /** Generation-local opaque identifier; never a path or package name. */
  readonly bundleId: string
  /** Informational package name read from `dsh.profile.bundles`. */
  readonly packageName: string
  /** Whether Desktop will compose this bundle on the next generation. */
  readonly status: 'active' | 'disabled'
  /** Whether Desktop permits this exact bundle to be disabled. */
  readonly mutable: boolean
}

/** Short-lived confirmation minted for one exact direct bundle. */
export interface DesktopPluginDisablePreview {
  /** One-shot opaque authority accepted by {@link DesktopPlugins.executeDisable}. */
  readonly previewId: string
  /** Active profile bound to the preview. */
  readonly profileName: string
  /** Informational package name shown by the confirmation UI. */
  readonly packageName: string
  /** ISO timestamp after which the preview is rejected. */
  readonly expiresAt: string
}

/** Result of persisting a disable for the next Desktop generation. */
export interface DesktopPluginDisableResult {
  /** Informational package name whose bundle layer was disabled. */
  readonly packageName: string
}

/** Short-lived confirmation minted for one exact disabled direct bundle. */
export interface DesktopPluginEnablePreview {
  /** One-shot opaque authority accepted by {@link DesktopPlugins.executeEnable}. */
  readonly previewId: string
  /** Active profile bound to the preview. */
  readonly profileName: string
  /** Informational package name shown by the confirmation UI. */
  readonly packageName: string
  /** ISO timestamp after which the preview is rejected. */
  readonly expiresAt: string
}

/** Result of removing one persisted disable for the next Desktop generation. */
export interface DesktopPluginEnableResult {
  /** Informational package name whose direct bundle layer was re-enabled. */
  readonly packageName: string
}

/** Narrow profile-bundle capability available to trusted Host plugins. */
export interface DesktopPlugins {
  /** Re-scan direct bundle layers and return generation-local opaque identities. */
  list(): readonly DesktopPluginBundle[]
  /** Read all persisted package names once, including stale disables. */
  disabledPackageNames(): readonly string[]
  /** Read persisted state, including a stale disable for a package not currently installed. */
  isDisabled(packageName: string): boolean
  /** Validate one active mutable bundle and mint a short-lived confirmation. */
  previewDisable(bundleId: string): DesktopPluginDisablePreview
  /** Consume one confirmation, revalidate its target, and persist the disable. */
  executeDisable(previewId: string): Promise<DesktopPluginDisableResult>
  /** Validate one disabled mutable bundle and mint a short-lived confirmation. */
  previewEnable(bundleId: string): DesktopPluginEnablePreview
  /** Consume one confirmation, revalidate its target, and remove only its disable marker. */
  executeEnable(previewId: string): Promise<DesktopPluginEnableResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Desktop-owned direct profile-bundle inventory and disable capability. */
    desktopPlugins: DesktopPlugins
  }
}

/** Stable error codes a late-bound Host integration may translate. */
export type DesktopPluginsErrorCode =
  | 'invalid-target'
  | 'immutable-target'
  | 'already-disabled'
  | 'already-active'
  | 'preview-expired'
  | 'persistence-failed'

/** Error whose code is safe for a trusted Host integration to branch on. */
export class DesktopPluginsError extends Error {
  constructor(readonly code: DesktopPluginsErrorCode, message: string) {
    super(message)
    this.name = 'DesktopPluginsError'
  }
}

interface ProfileBundleState {
  readonly profileName: string
  readonly disabledBundles: readonly string[]
}

interface DesktopPluginStateV1 {
  readonly version: 1
  readonly profiles: readonly ProfileBundleState[]
}

interface DesktopPluginPreviewRecord {
  readonly previewId: string
  readonly action: 'disable' | 'enable'
  readonly profileName: string
  readonly packageName: string
  readonly expiresAt: number
}

/** Launcher-owned values fixed for one Cordis generation. */
export interface DesktopPluginsBootstrap {
  /** Active profile name for this generation. */
  readonly profileName: string
  /** Harness home containing the active profile. */
  readonly homeDir: string
  /** Desktop-private state file outside the user's profile manifests. */
  readonly statePath: string
  /** Package manifest inside this exact Desktop installation. */
  readonly installAnchor: string
  /** Injectable clock used only by focused tests. */
  readonly now?: () => number
}

/** Path-only inputs shared by the Host service and pre-Host recovery controller. */
export type DesktopPluginStateBootstrap = Pick<
  DesktopPluginsBootstrap,
  'profileName' | 'homeDir' | 'statePath'
>

/** One strictly parsed direct bundle without any resolved patch or filesystem path. */
export interface DesktopProfileManifestBundle {
  readonly packageName: string
  readonly status: 'active' | 'disabled'
  readonly mutable: boolean
}

function emptyState(): DesktopPluginStateV1 {
  return { version: STATE_VERSION, profiles: [] }
}

function safePackageName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 214
    && PACKAGE_NAME_PATTERN.test(value)
}

function assertStateBootstrap(bootstrap: DesktopPluginStateBootstrap): void {
  assertDesktopProfileName(bootstrap.profileName)
  for (const [label, value] of [
    ['Harness home', bootstrap.homeDir],
    ['state path', bootstrap.statePath],
  ] as const) {
    if (!isAbsolute(value) || value.includes('\0')) {
      throw new Error(`${BIN_NAME}: desktop plugins ${label} must be an absolute path without NUL`)
    }
  }
}

function readProfileManifestBytes(path: string): Buffer {
  const directory = dirname(path)
  const directoryInfo = lstatSync(directory)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error(`${BIN_NAME}: active profile directory must be a real directory`)
  }
  const pathInfo = lstatSync(path)
  if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) {
    throw new Error(`${BIN_NAME}: active profile manifest must be a regular file`)
  }
  if (pathInfo.size > MAX_PROFILE_MANIFEST_BYTES) {
    throw new Error(`${BIN_NAME}: active profile manifest is too large`)
  }
  const descriptor = openSync(path, constants.O_RDONLY | O_NOFOLLOW_BEST_EFFORT)
  try {
    const openedInfo = fstatSync(descriptor)
    if (!openedInfo.isFile() || openedInfo.size > MAX_PROFILE_MANIFEST_BYTES) {
      throw new Error(openedInfo.size > MAX_PROFILE_MANIFEST_BYTES
        ? `${BIN_NAME}: active profile manifest is too large`
        : `${BIN_NAME}: active profile manifest must be a regular file`)
    }
    const bytes = readFileSync(descriptor)
    if (bytes.byteLength > MAX_PROFILE_MANIFEST_BYTES) {
      throw new Error(`${BIN_NAME}: active profile manifest is too large`)
    }
    return bytes
  } finally {
    closeSync(descriptor)
  }
}

function readDesktopProfileBundleNames(
  bootstrap: DesktopPluginStateBootstrap,
): readonly string[] {
  assertStateBootstrap(bootstrap)
  const profileDir = resolveProfileDir(bootstrap.profileName, bootstrap.homeDir)
  const bytes = readProfileManifestBytes(join(profileDir, 'package.json'))
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (cause) {
    throw new Error(
      `${BIN_NAME}: invalid active profile manifest: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${BIN_NAME}: active profile manifest must hold a JSON object`)
  }
  const root = parsed as Record<string, unknown>
  const dsh = root.dsh
  if (dsh === undefined) return []
  if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh)) {
    throw new Error(`${BIN_NAME}: active profile manifest dsh field must be an object`)
  }
  const profile = (dsh as Record<string, unknown>).profile
  if (profile === undefined) return []
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${BIN_NAME}: active profile manifest dsh.profile field must be an object`)
  }
  const bundles = (profile as Record<string, unknown>).bundles
  if (bundles === undefined) return []
  if (!Array.isArray(bundles)
    || bundles.length > MAX_DIRECT_BUNDLES
    || bundles.some(bundle => !safePackageName(bundle))) {
    throw new Error(`${BIN_NAME}: active profile manifest dsh.profile.bundles is invalid`)
  }
  return bundles as string[]
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function parseState(value: unknown): DesktopPluginStateV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('state root must be an object')
  }
  const root = value as Record<string, unknown>
  if (root.version !== STATE_VERSION || !Array.isArray(root.profiles)) {
    throw new Error('state version or profiles list is invalid')
  }
  if (root.profiles.length > MAX_PROFILES) throw new Error('state contains too many profiles')
  const profileNames = new Set<string>()
  const profiles: ProfileBundleState[] = []
  for (const rawProfile of root.profiles) {
    if (rawProfile === null || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
      throw new Error('profile state must be an object')
    }
    const profile = rawProfile as Record<string, unknown>
    const profileName = profile.profileName
    if (typeof profileName !== 'string') throw new Error('profile state name is invalid')
    assertDesktopProfileName(profileName)
    if (profileNames.has(profileName)) throw new Error(`duplicate profile state ${JSON.stringify(profileName)}`)
    profileNames.add(profileName)
    const disabled = profile.disabledBundles
    if (!Array.isArray(disabled) || disabled.length > MAX_DISABLED_BUNDLES
      || disabled.some(name => !safePackageName(name))) {
      throw new Error(`disabledBundles for profile ${JSON.stringify(profileName)} is invalid`)
    }
    profiles.push({
      profileName,
      disabledBundles: [...new Set(disabled as string[])]
        .sort(stableCompare),
    })
  }
  profiles.sort((left, right) => stableCompare(left.profileName, right.profileName))
  return { version: STATE_VERSION, profiles }
}

function readState(statePath: string): DesktopPluginStateV1 {
  const directory = dirname(statePath)
  try {
    const directoryStat = lstatSync(directory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(`${BIN_NAME}: plugin-management state directory is not private`)
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
    throw cause
  }
  let stat
  try {
    stat = lstatSync(statePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
    throw cause
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${BIN_NAME}: plugin-management state must be a regular file`)
  }
  if (stat.size > MAX_STATE_BYTES) {
    throw new Error(`${BIN_NAME}: plugin-management state is too large`)
  }
  let parsed: unknown
  try {
    const content = readFileSync(statePath, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_STATE_BYTES) {
      throw new Error('plugin-management state is too large')
    }
    parsed = JSON.parse(content) as unknown
    return parseState(parsed)
  } catch (cause) {
    throw new Error(
      `${BIN_NAME}: invalid plugin-management state at ${statePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/**
 * Read disabled package names without changing Desktop-owned state.
 *
 * @param statePath Desktop-private plugin-management state file path.
 * @param profileName Profile whose disabled bundle set is returned.
 * @returns Disabled package names; empty when the profile has no state.
 */
export function readDesktopDisabledBundles(
  statePath: string,
  profileName: string,
): ReadonlySet<string> {
  assertDesktopProfileName(profileName)
  const profile = readState(statePath).profiles.find(candidate => candidate.profileName === profileName)
  return new Set(profile?.disabledBundles ?? [])
}

/**
 * Read the active profile's direct bundle declarations without resolving or
 * parsing any bundle patch. This remains available when a bundle itself is
 * what prevents the normal profile loader from starting.
 *
 * @param bootstrap Paths and profile identity locating the manifest and state.
 * @returns Manifest-declared bundles in declaration order, deduplicated, with disable status.
 */
export function readDesktopProfileBundleInventory(
  bootstrap: DesktopPluginStateBootstrap,
): readonly DesktopProfileManifestBundle[] {
  const disabled = readDesktopDisabledBundles(bootstrap.statePath, bootstrap.profileName)
  const seen = new Set<string>()
  const bundles: DesktopProfileManifestBundle[] = []
  for (const packageName of readDesktopProfileBundleNames(bootstrap)) {
    if (seen.has(packageName)) continue
    seen.add(packageName)
    const mutable = desktopPluginBundleMutable(packageName)
    bundles.push({
      packageName,
      status: mutable && disabled.has(packageName) ? 'disabled' : 'active',
      mutable,
    })
  }
  return bundles
}

/**
 * Only explicit product bundles are immutable; every other resolved direct layer is user-disableable.
 *
 * @param packageName Candidate bundle package name.
 * @returns Whether the bundle may be disabled by the user.
 */
export function desktopPluginBundleMutable(packageName: string): boolean {
  return safePackageName(packageName) && !IMMUTABLE_BUNDLES.has(packageName)
}

/**
 * Filter only mutable layers named in Desktop-private disable state.
 *
 * @param profile Loaded profile whose layers are filtered.
 * @param disabledBundles Disabled package names from Desktop-private state.
 * @returns Layers with disabled mutable bundles removed.
 */
export function activeDesktopProfileLayers(
  profile: Profile,
  disabledBundles: ReadonlySet<string>,
): Profile['layers'] {
  return profile.layers.filter(layer => !(
    desktopPluginBundleMutable(layer.packageName)
    && disabledBundles.has(layer.packageName)
  ))
}

async function ensurePrivateStateDirectory(statePath: string): Promise<void> {
  const directory = dirname(statePath)
  await mkdir(directory, { recursive: true, mode: STATE_DIRECTORY_MODE })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${BIN_NAME}: plugin-management state directory is not private`)
  }
  await chmod(directory, STATE_DIRECTORY_MODE)
}

/** Direction-specific messages and state mutation for one persisted bundle change. */
interface BundleStateChange {
  /** Outcome direction used in the immutable-target message. */
  readonly action: 'disable' | 'enable'
  /** Whether this direction can grow the persisted profile and disable-bundle limits. */
  readonly grows: boolean
  /** Apply this direction's marker change, throwing the duplicate-outcome error when already done. */
  readonly mutate: (disabled: Set<string>) => void
}

/**
 * Lock-held persistence shared by bundle disable and enable. The caller's
 * authorization callback runs while the state lock is held, immediately
 * before the manifest and state are re-read, and its exact thrown error is
 * re-raised instead of the persistence-failed mapping.
 *
 * @param bootstrap Paths and profile identity locating the manifest and state.
 * @param packageName Manifest-declared mutable bundle to change.
 * @param authorize Caller authorization, re-run under the state lock.
 * @param change Direction-specific messages and disable-set mutation.
 */
async function persistBundleStateChange(
  bootstrap: DesktopPluginStateBootstrap,
  packageName: string,
  authorize: () => void | Promise<void>,
  change: BundleStateChange,
): Promise<void> {
  let authorizationFailure: unknown
  try {
    assertStateBootstrap(bootstrap)
    if (!safePackageName(packageName)) {
      throw new DesktopPluginsError('invalid-target', 'The Desktop plugin target is no longer available.')
    }
    if (!desktopPluginBundleMutable(packageName)) {
      throw new DesktopPluginsError('immutable-target', `This Desktop bundle cannot be ${change.action}d.`)
    }
    await ensurePrivateStateDirectory(bootstrap.statePath)
    await withFileLock(bootstrap.statePath, async () => {
      try {
        await authorize()
      } catch (cause) {
        authorizationFailure = cause
        throw cause
      }
      if (!readDesktopProfileBundleNames(bootstrap).includes(packageName)
        || !desktopPluginBundleMutable(packageName)) {
        throw new DesktopPluginsError('invalid-target', 'The Desktop plugin target is no longer available.')
      }
      const state = readState(bootstrap.statePath)
      const existingProfile = state.profiles.find(candidate => candidate.profileName === bootstrap.profileName)
      const disabled = new Set(existingProfile?.disabledBundles ?? [])
      change.mutate(disabled)
      const profiles = state.profiles
        .filter(candidate => candidate.profileName !== bootstrap.profileName)
      if (change.grows) {
        if (existingProfile === undefined && profiles.length >= MAX_PROFILES) {
          throw new Error('plugin-management state contains too many profiles')
        }
        if (disabled.size > MAX_DISABLED_BUNDLES) {
          throw new Error('plugin-management state contains too many disabled bundles')
        }
      }
      if (disabled.size > 0) {
        profiles.push({
          profileName: bootstrap.profileName,
          disabledBundles: [...disabled].sort(stableCompare),
        })
      }
      profiles.sort((left, right) => stableCompare(left.profileName, right.profileName))
      const next = parseState({
        version: STATE_VERSION,
        profiles,
      })
      const rendered = renderState(next)
      if (Buffer.byteLength(rendered, 'utf8') > MAX_STATE_BYTES) {
        throw new Error('plugin-management state is too large')
      }
      await writeFileAtomic(bootstrap.statePath, rendered, {
        mode: STATE_FILE_MODE,
        dirMode: STATE_DIRECTORY_MODE,
      })
    })
  } catch (cause) {
    // The trusted caller owns authorization semantics; do not erase its
    // generation/ownership error while mapping storage failures below.
    if (cause === authorizationFailure) throw cause
    if (cause instanceof DesktopPluginsError) throw cause
    throw new DesktopPluginsError(
      'persistence-failed',
      'Unable to persist the Desktop plugin change.',
    )
  }
}

/**
 * Persist one manifest-declared mutable bundle disable for the next
 * generation. The caller's authorization callback runs while the state lock
 * is held, immediately before the manifest and state are re-read.
 *
 * @param bootstrap Paths and profile identity locating the manifest and state.
 * @param packageName Manifest-declared mutable bundle to disable.
 * @param authorize Caller authorization, re-run under the state lock.
 * @returns The persisted disable outcome.
 */
export async function disableDesktopProfileBundle(
  bootstrap: DesktopPluginStateBootstrap,
  packageName: string,
  authorize: () => void | Promise<void> = () => {},
): Promise<DesktopPluginDisableResult> {
  await persistBundleStateChange(bootstrap, packageName, authorize, {
    action: 'disable',
    grows: true,
    mutate: (disabled) => {
      if (disabled.has(packageName)) {
        throw new DesktopPluginsError('already-disabled', 'This Desktop bundle is already disabled.')
      }
      disabled.add(packageName)
    },
  })
  return { packageName }
}

/**
 * Remove one mutable manifest-declared bundle's disable marker for the next
 * generation. No profile manifest or package dependency is modified. The
 * caller's authorization callback and all target checks run under the state
 * lock so a disposed generation or concurrent state edit cannot be reused.
 *
 * @param bootstrap Paths and profile identity locating the manifest and state.
 * @param packageName Manifest-declared mutable bundle to re-enable.
 * @param authorize Caller authorization, re-run under the state lock.
 * @returns The persisted enable outcome.
 */
export async function enableDesktopProfileBundle(
  bootstrap: DesktopPluginStateBootstrap,
  packageName: string,
  authorize: () => void | Promise<void> = () => {},
): Promise<DesktopPluginEnableResult> {
  await persistBundleStateChange(bootstrap, packageName, authorize, {
    action: 'enable',
    grows: false,
    mutate: (disabled) => {
      if (!disabled.delete(packageName)) {
        throw new DesktopPluginsError('already-active', 'This Desktop bundle is already active.')
      }
    },
  })
  return { packageName }
}

function renderState(state: DesktopPluginStateV1): string {
  return `${JSON.stringify(state, undefined, 2)}\n`
}

function assertBootstrap(bootstrap: DesktopPluginsBootstrap): void {
  assertDesktopProfileName(bootstrap.profileName)
  for (const [label, value] of [
    ['Harness home', bootstrap.homeDir],
    ['state path', bootstrap.statePath],
    ['install anchor', bootstrap.installAnchor],
  ] as const) {
    if (!isAbsolute(value) || value.includes('\0')) {
      throw new Error(`${BIN_NAME}: desktop plugins ${label} must be an absolute path without NUL`)
    }
  }
}

/** Generation-scoped direct bundle inventory with two-phase persistent state changes. */
export class DesktopPluginsService extends Service implements DesktopPlugins {
  private readonly now: () => number
  private readonly bundleIds = new Map<string, string>()
  private readonly previews = new Map<string, DesktopPluginPreviewRecord>()
  private disposed = false
  private operation: Promise<unknown> | undefined

  constructor(ctx: Context, private readonly bootstrap: DesktopPluginsBootstrap) {
    assertBootstrap(bootstrap)
    super(ctx, 'desktopPlugins')
    this.now = bootstrap.now ?? Date.now
    ctx.effect(
      () => () => {
        this.disposed = true
        this.previews.clear()
        this.bundleIds.clear()
      },
      'dsh-desktop-host: desktop plugins lifetime',
    )
  }

  list(): readonly DesktopPluginBundle[] {
    this.assertActive()
    return readDesktopProfileBundleInventory(this.bootstrap).map(item => ({
      ...item,
      bundleId: this.bundleId(item.packageName),
    }))
  }

  isDisabled(packageName: string): boolean {
    this.assertActive()
    if (!safePackageName(packageName)) {
      throw new DesktopPluginsError('invalid-target', 'The Desktop plugin package name is invalid.')
    }
    return this.disabledPackageNames().includes(packageName)
  }

  disabledPackageNames(): readonly string[] {
    this.assertActive()
    return [...readDesktopDisabledBundles(this.bootstrap.statePath, this.bootstrap.profileName)]
  }

  previewDisable(bundleId: string): DesktopPluginDisablePreview {
    return this.previewChange('disable', bundleId, 'disabled')
  }

  previewEnable(bundleId: string): DesktopPluginEnablePreview {
    return this.previewChange('enable', bundleId, 'active')
  }

  executeDisable(previewId: string): Promise<DesktopPluginDisableResult> {
    return this.executePreview(previewId, DISABLE_PREVIEW_ID_PATTERN, 'disable',
      preview => this.persistDisable(preview))
  }

  executeEnable(previewId: string): Promise<DesktopPluginEnableResult> {
    return this.executePreview(previewId, ENABLE_PREVIEW_ID_PATTERN, 'enable',
      preview => this.persistEnable(preview))
  }

  /** Validate one target and mint its one-shot preview for either direction. */
  private previewChange(
    action: DesktopPluginPreviewRecord['action'],
    bundleId: string,
    blockedStatus: 'disabled' | 'active',
  ): DesktopPluginDisablePreview {
    this.assertActive()
    if (!BUNDLE_ID_PATTERN.test(bundleId)) throw this.invalidTarget()
    const target = this.list().find(item => item.bundleId === bundleId)
    if (target === undefined) throw this.invalidTarget()
    if (!target.mutable) {
      throw new DesktopPluginsError('immutable-target', `This Desktop bundle cannot be ${action}d.`)
    }
    if (target.status === blockedStatus) {
      throw new DesktopPluginsError(
        blockedStatus === 'disabled' ? 'already-disabled' : 'already-active',
        `This Desktop bundle is already ${blockedStatus}.`,
      )
    }
    const preview = this.mintPreview(action, target.packageName)
    return {
      previewId: preview.previewId,
      profileName: preview.profileName,
      packageName: preview.packageName,
      expiresAt: new Date(preview.expiresAt).toISOString(),
    }
  }

  /** Consume one one-shot preview and start its exclusive persisted operation. */
  private executePreview<T>(
    previewId: string,
    idPattern: RegExp,
    action: DesktopPluginPreviewRecord['action'],
    persist: (preview: DesktopPluginPreviewRecord) => Promise<T>,
  ): Promise<T> {
    try {
      this.assertActive()
      if (!idPattern.test(previewId)) return Promise.reject(this.expiredPreview())
      if (this.operation !== undefined) {
        return Promise.reject(new DesktopPluginsError('persistence-failed', 'Another Desktop plugin change is already running.'))
      }
      const preview = this.previews.get(previewId)
      this.previews.delete(previewId)
      if (preview === undefined || preview.expiresAt <= this.now()
        || preview.action !== action
        || preview.profileName !== this.bootstrap.profileName) {
        return Promise.reject(this.expiredPreview())
      }
      const operation = persist(preview)
      this.operation = operation
      void operation.then(
        () => { if (this.operation === operation) this.operation = undefined },
        () => { if (this.operation === operation) this.operation = undefined },
      )
      return operation
    } catch (cause) {
      return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }

  private bundleId(packageName: string): string {
    let id = this.bundleIds.get(packageName)
    if (id === undefined) {
      id = `bundle_${randomBytes(24).toString('base64url')}`
      this.bundleIds.set(packageName, id)
    }
    return id
  }

  private mintPreview(
    action: DesktopPluginPreviewRecord['action'],
    packageName: string,
  ): DesktopPluginPreviewRecord {
    this.prunePreviews()
    if (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value
      if (oldest !== undefined) this.previews.delete(oldest)
    }
    const previewId = `${action}_${randomBytes(32).toString('base64url')}`
    const preview: DesktopPluginPreviewRecord = {
      previewId,
      action,
      profileName: this.bootstrap.profileName,
      packageName,
      expiresAt: this.now() + PREVIEW_TTL_MS,
    }
    this.previews.set(previewId, preview)
    return preview
  }

  private async persistDisable(preview: DesktopPluginPreviewRecord): Promise<DesktopPluginDisableResult> {
    try {
      const current = this.list().find(item => item.packageName === preview.packageName)
      if (current === undefined) throw this.invalidTarget()
      if (!current.mutable) {
        throw new DesktopPluginsError('immutable-target', 'This Desktop bundle cannot be disabled.')
      }
      if (current.status === 'disabled') {
        throw new DesktopPluginsError('already-disabled', 'This Desktop bundle is already disabled.')
      }
      return await disableDesktopProfileBundle(
        this.bootstrap,
        preview.packageName,
        () => { this.assertActive() },
      )
    } catch (cause) {
      if (cause instanceof DesktopPluginsError) throw cause
      throw new DesktopPluginsError(
        'persistence-failed',
        'Unable to persist the Desktop plugin change.',
      )
    }
  }

  private async persistEnable(preview: DesktopPluginPreviewRecord): Promise<DesktopPluginEnableResult> {
    try {
      const current = this.list().find(item => item.packageName === preview.packageName)
      if (current === undefined) throw this.invalidTarget()
      if (!current.mutable) {
        throw new DesktopPluginsError('immutable-target', 'This Desktop bundle cannot be enabled.')
      }
      if (current.status === 'active') {
        throw new DesktopPluginsError('already-active', 'This Desktop bundle is already active.')
      }
      return await enableDesktopProfileBundle(
        this.bootstrap,
        preview.packageName,
        () => { this.assertActive() },
      )
    } catch (cause) {
      if (cause instanceof DesktopPluginsError) throw cause
      throw new DesktopPluginsError(
        'persistence-failed',
        'Unable to persist the Desktop plugin change.',
      )
    }
  }

  private prunePreviews(): void {
    const now = this.now()
    for (const [id, preview] of this.previews) {
      if (preview.expiresAt <= now) this.previews.delete(id)
    }
  }

  private invalidTarget(): DesktopPluginsError {
    return new DesktopPluginsError('invalid-target', 'The Desktop plugin target is no longer available.')
  }

  private expiredPreview(): DesktopPluginsError {
    return new DesktopPluginsError('preview-expired', 'The Desktop plugin confirmation expired or was already used.')
  }

  private assertActive(): void {
    if (this.disposed) throw new Error(`${BIN_NAME}: desktopPlugins service disposed`)
  }
}

export default DesktopPluginsService
