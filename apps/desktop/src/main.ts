/** Electron application shell for the loopback DeepSeek Harness Web Host. */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
  type Event,
  type MenuItemConstructorOptions,
} from 'electron'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DesktopInstallRecoveryStore,
  desktopInstallRecoveryStatePath,
  type DesktopInstallRecoveryTransaction,
} from '@deepseek-ai/dsh-desktop-host'
import { startDesktopControlServer, writeDesktopBootstrapFile, type DesktopControlServer } from './desktop-host-bridge.ts'
import { openDesktopTerminalWindow } from './desktop-terminal.ts'
import { installDesktopPnpmRuntime, type DesktopPnpmRuntimeInstallation } from './desktop-runtime-environment.ts'
import { createHostSupervisor, spawnDshWeb, type HostSupervisor } from './host-supervisor.ts'
import { createDesktopLifecycle, type DesktopLifecycle } from './window-lifecycle.ts'

const APP_NAME = 'DeepSeek Harness'
const WINDOW_WIDTH = 1440
const WINDOW_HEIGHT = 920
const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(DESKTOP_DIR, '../..')

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let host: HostSupervisor | undefined
let lifecycle: DesktopLifecycle | undefined
let hostOrigin: string | undefined
let bootQuitPromise: Promise<void> | undefined
let quitReleased = false
/** True while an auto-relaunch of the Host and window is in flight. */
let restarting = false
/** Consecutive rapid auto-restarts, bounded so a crashing Host ends in a quit, not a loop. */
let restartAttempts = 0
let firstRestartAttemptAt = 0
const MAX_RAPID_RESTARTS = 3
const RAPID_RESTART_WINDOW_MS = 30_000

/** Resolve artifacts from the checkout in development and resourcesPath when packaged. */
function hostPaths(): { nodeExecutable: string; cliEntry: string; cwd: string; electronRunAsNode: boolean } {
  if (!app.isPackaged) {
    return {
      nodeExecutable: process.env.DSH_DESKTOP_NODE_EXECUTABLE ?? 'node',
      cliEntry: join(REPOSITORY_ROOT, 'apps/cli/lib/bin.js'),
      cwd: process.cwd(),
      electronRunAsNode: false,
    }
  }
  return {
    nodeExecutable: process.execPath,
    cliEntry: join(process.resourcesPath, 'host/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    cwd: app.getPath('home'),
    electronRunAsNode: true,
  }
}

/**
 * The fixed Web Host port from the desktop config file, when present.
 * Read from desktop.config.json beside the app in dev, or from the
 * bundled desktop-resources when packaged. Falls back to '0' (OS-assigned).
 * @returns a string port ('0' means the OS assigns one).
 */
/**
 * Desktop Web Host config read from JSON. The writable per-user copy (under
 * Electron's userData) is read first so the settings card's changes apply on
 * the next spawn; the bundled copy (or the repo copy in development) provides
 * defaults. Values that fail to parse are ignored, never fatal.
 */
interface DesktopHostConfig {
  webHost?: '127.0.0.1' | 'localhost'
  webPort?: number
  trustedHosts?: string[]
}

/** The writable per-user config path the settings card writes to and we read. */
function userDesktopConfigPath(): string {
  return join(app.getPath('userData'), 'desktop.config.json')
}

/** Precedence of candidate config files, most specific first. */
function desktopConfigCandidates(): string[] {
  return [userDesktopConfigPath(), app.isPackaged
    ? join(process.resourcesPath, 'desktop-resources', 'desktop.config.json')
    : join(DESKTOP_DIR, 'desktop.config.json')]
}

function readDesktopConfig(): DesktopHostConfig {
  const config: DesktopHostConfig = {}
  for (const file of desktopConfigCandidates()) {
    if (!existsSync(file)) continue
    try {
      const record = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      if (typeof record.webHost === 'string' && (record.webHost === '127.0.0.1' || record.webHost === 'localhost')) {
        config.webHost = record.webHost
      }
      if (typeof record.webPort === 'number' && Number.isInteger(record.webPort) && record.webPort >= 0 && record.webPort <= 65535) {
        config.webPort = record.webPort
      }
      if (Array.isArray(record.trustedHosts)) {
        config.trustedHosts = record.trustedHosts.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
      }
    } catch {
      // A malformed config file must not stop the app from booting.
    }
  }
  return config
}

/** The bind host passed to 'dsh web --host'. Env var beats the config file. */
function resolveWebHost(): string {
  return process.env.DSH_DESKTOP_WEB_HOST === '0.0.0.0'
    ? '127.0.0.1' // the harness rejects an all-interfaces bind; clamp to loopback
    : process.env.DSH_DESKTOP_WEB_HOST ?? readDesktopConfig().webHost ?? '127.0.0.1'
}

/**
 * The fixed Web Host port: env var beats the config file; '0' means
 * OS-assigned.
 */
function resolveWebPort(): string {
  const fromEnv = process.env.DSH_DESKTOP_WEB_PORT
  if (fromEnv !== undefined && /^\d+$/.test(fromEnv)) return fromEnv
  return readDesktopConfig().webPort === undefined ? '0' : String(readDesktopConfig().webPort)
}

/**
 * The extra authorities the /api browser-trust fence accepts. A
 * comma-separated DSH_DESKTOP_TRUSTED_HOSTS env var beats the config file, so
 * a deployed app can be repointed to a new public host without a rebuild.
 */
function resolveTrustedHosts(): string[] {
  const fromEnv = process.env.DSH_DESKTOP_TRUSTED_HOSTS
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
  }
  return readDesktopConfig().trustedHosts ?? []
}

function assertHostArtifacts(paths: ReturnType<typeof hostPaths>): void {
  if (paths.nodeExecutable.includes('/') && !existsSync(paths.nodeExecutable)) {
    throw new Error(`desktop Node runtime is missing: ${paths.nodeExecutable}`)
  }
  if (!existsSync(paths.cliEntry)) {
    throw new Error(`desktop Host entry is missing: ${paths.cliEntry}; run pnpm run build first`)
  }
}

/** Load the app-local tray template, with an empty fallback for incomplete staging. */
function trayImage(): Electron.NativeImage {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'desktop-resources/trayTemplate.png')]
    : [join(DESKTOP_DIR, 'resources/trayTemplate.png')]
  const path = candidates.find(candidate => existsSync(candidate))
  const image = path === undefined ? nativeImage.createEmpty() : nativeImage.createFromPath(path)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function isExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasOrigin(raw: string, expected: string): boolean {
  try {
    return new URL(raw).origin === expected
  } catch {
    return false
  }
}

/** Install navigation and permission policy before the first renderer loads. */
function hardenSession(): void {
  const desktopSession = session.defaultSession
  desktopSession.setPermissionCheckHandler(() => false)
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
}

async function createMainWindow(): Promise<BrowserWindow> {
  const origin = hostOrigin
  if (origin === undefined) throw new Error('desktop Host is not ready')
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: process.platform === 'win32',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: 44,
      },
    }),
    ...(process.platform === 'darwin' ? {
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      visualEffectState: 'followWindow' as const,
    } : {}),
    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic' as const,
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    } : {
      transparent: true,
      backgroundColor: '#00000000',
    }),
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow = window
  window.on('close', (event) => { lifecycle?.onWindowClose(event) })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (hasOrigin(url, origin)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const rendererUrl = new URL(origin)
  rendererUrl.searchParams.set('dsh-desktop-platform', process.platform)
  await window.loadURL(rendererUrl.href)
  if (!lifecycle?.isQuitting) window.show()
  return window
}

/**
 * Tear down the current window and create a replacement pointed at the
 * current {@link hostOrigin}. Used when a fresh Host binds a new loopback
 * URL (OS-assigned port) after an auto-restart.
 */
async function recreateWindow(): Promise<void> {
  const current = mainWindow
  if (current !== undefined && !current.isDestroyed()) current.destroy()
  await createMainWindow()
}

function createTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip(APP_NAME)
  const template: MenuItemConstructorOptions[] = [
    { label: '打开主窗口', click: () => { void lifecycle?.showWindow() } },
    { type: 'separator' },
    { label: '退出', click: () => { void requestAppQuit() } },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.on('click', () => { void lifecycle?.showWindow() })
}

function releaseAppQuit(): void {
  quitReleased = true
  tray?.destroy()
  tray = undefined
  app.quit()
}

/** Join explicit quit requests even while the Host or window is still starting. */
function requestAppQuit(): Promise<void> {
  if (lifecycle !== undefined) return lifecycle.requestQuit()
  bootQuitPromise ??= (host?.shutdown() ?? Promise.resolve()).catch((error: unknown) => {
    console.error('desktop shutdown failed:', error)
  }).then(() => {
    releaseAppQuit()
  })
  return bootQuitPromise
}

/**
 * Relaunch the Web Host and rebuild the window, so a plugin-market "restart"
 * (which tears the Host process down under the desktop supervisor) brings the
 * application back instead of leaving it exited. Bounded against a Host that
 * crashes on every start so a broken configuration ends in a quit, not a loop.
 */
function restartApp(): void {
  if (restarting || quitReleased || lifecycle?.isQuitting) return
  const now = Date.now()
  if (firstRestartAttemptAt === 0 || now - firstRestartAttemptAt > RAPID_RESTART_WINDOW_MS) {
    firstRestartAttemptAt = now
    restartAttempts = 0
  }
  restartAttempts += 1
  if (restartAttempts > MAX_RAPID_RESTARTS) {
    console.error('desktop Host keeps exiting; giving up and quitting')
    void requestAppQuit()
    return
  }
  restarting = true
  void (async () => {
    try {
      if (host === undefined) throw new Error('desktop Host is not ready to restart')
      const nextOrigin = await host.restart()
      hostOrigin = nextOrigin
      await recreateWindow()
    } catch (error) {
      console.error('desktop Host restart failed:', error)
      void requestAppQuit()
    } finally {
      restarting = false
    }
  })()
}

/** Live desktop-service bridge for the packaged app: control channel, pnpm runtime, bootstrap file. */
interface DesktopBridge {
  readonly control: DesktopControlServer
  readonly pnpmRuntime: DesktopPnpmRuntimeInstallation
  readonly bootstrapPath: string
  /** Install-recovery reconciliation this generation must resolve; the launcher owns it. */
  readonly recovery: InstallRecoveryReconciliation | undefined
}

/** One claimed install-recovery transaction the Host boot must confirm or roll back. */
interface InstallRecoveryReconciliation {
  readonly store: DesktopInstallRecoveryStore
  readonly transaction: DesktopInstallRecoveryTransaction
  settled: boolean
}

let desktopBridge: DesktopBridge | undefined

/** Profile the packaged desktop app boots; 'dsh web' is '--profile web'. */
const DESKTOP_PROFILE_NAME = 'web'

/**
 * Open the OS terminal at the active profile directory.
 * @param directory - absolute profile directory to open.
 */
function openDesktopTerminal(
  profile: { name: string; dir: string; homeDir: string },
  userData: string,
  appExecutable: string,
  cliEntry: string,
): void {
  openDesktopTerminalWindow({
    appExecutable,
    pnpmBinPath: join(process.resourcesPath, 'host/node_modules/pnpm/bin/pnpm.mjs'),
    dshBootstrapPath: cliEntry,
    profileName: profile.name,
    productVersion: app.getVersion(),
    profileDir: profile.dir,
    homeDir: profile.homeDir,
    installRecoveryStatePath: desktopInstallRecoveryStatePath(userData),
    stateDir: join(userData, 'host-commands', profile.name, 'terminal'),
    onLaunchError: (cause) => { console.error('desktop terminal failed to open:', cause) },
  })
}

/**
 * Establish the packaged-app bridge that activates the Host's desktop services.
 * @param nodeExecutable - executable the Host runs under (Electron RunAsNode).
 * @param cliEntry - packaged dsh CLI entry the bridge addresses.
 * @param bridgeEnv - spawn environment the public pnpm PATH entry must be installed into.
 * @returns the bridge whose env additions the spawn must publish.
 */
async function setupDesktopBridge(nodeExecutable: string, cliEntry: string, bridgeEnv: NodeJS.ProcessEnv): Promise<DesktopBridge> {
  const userData = app.getPath('userData')
  const homeDir = resolveDshHome()
  const electronVersion = (process.versions as { electron?: string }).electron ?? '0.0.0'
  const pnpmBinPath = join(process.resourcesPath, 'host/node_modules/pnpm/bin/pnpm.mjs')
  const pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: nodeExecutable,
    pnpmBinPath,
    electronVersion,
    stateDir: join(userData, 'host-commands', DESKTOP_PROFILE_NAME),
    environment: bridgeEnv,
  })
  const control = await startDesktopControlServer({
    openTerminal: () => { openDesktopTerminal({ name: DESKTOP_PROFILE_NAME, dir: join(homeDir, 'profiles', DESKTOP_PROFILE_NAME), homeDir }, app.getPath('userData'), process.execPath, cliEntry) },
    requestRestart: () => { restartApp() },
  })
  const bootstrapPath = join(userData, 'host-bootstrap.json')
  const generationId = randomUUID()
  writeDesktopBootstrapFile({
    generationId,
    profile: {
      name: DESKTOP_PROFILE_NAME,
      dir: join(homeDir, 'profiles', DESKTOP_PROFILE_NAME),
      homeDir,
      statePath: join(userData, 'profile-selection', 'state.json'),
    },
    pnpm: {
      appExecutable: nodeExecutable,
      pnpmBinPath,
      electronVersion,
      nodeBinDir: pnpmRuntime.nodeBinDir,
      nodeShimPath: pnpmRuntime.nodeShimPath,
      clearEnvironmentPath: pnpmRuntime.clearEnvironmentPath,
      dshBootstrapPath: cliEntry,
      installRecoveryStatePath: desktopInstallRecoveryStatePath(userData),
    },
    plugins: {
      statePath: join(userData, 'plugin-management', 'state.json'),
      installAnchor: join(process.resourcesPath, 'host/node_modules/@deepseek-ai/dsh/package.json'),
    },
    actions: { controlUrl: control.url, controlToken: control.token },
  }, bootstrapPath)
  const recovery = await reconcileInstallRecoveryAtStartup(userData, homeDir, generationId)
  return { control, pnpmRuntime, bootstrapPath, recovery }
}

/**
 * Claim the install-recovery WAL for a fresh desktop generation and resolve every claim shape.
 * A verifying install waits for a healthy Host boot; interrupted installs roll back immediately.
 */
async function reconcileInstallRecoveryAtStartup(
  userData: string,
  homeDir: string,
  generationId: string,
): Promise<InstallRecoveryReconciliation | undefined> {
  const store = new DesktopInstallRecoveryStore({
    statePath: desktopInstallRecoveryStatePath(userData),
    profileName: DESKTOP_PROFILE_NAME,
    profileDir: join(homeDir, 'profiles', DESKTOP_PROFILE_NAME),
    generationId,
  })
  const claim = await store.claim()
  if (claim.action === 'none') return undefined
  if (claim.action === 'verify') return { store, transaction: claim.transaction, settled: false }
  if (claim.action === 'prompt') {
    console.error(`dsh-desktop: rolling back interrupted plugin install ${claim.transaction.packageName} (${claim.reason})`)
    await rollbackClaimedInstall(store, claim.transaction.transactionId)
    return undefined
  }
  if (claim.action === 'terminal') {
    if (claim.transaction.phase === 'verified') {
      await store.clear(claim.transaction.transactionId)
    } else if (claim.transaction.phase === 'rolled-back' && claim.transaction.rollbackNotifiedAt === undefined) {
      await store.markRollbackNotified(claim.transaction.transactionId)
    } else if (claim.transaction.phase === 'manual-recovery-required') {
      throw new Error(`dsh-desktop: plugin install recovery requires manual repair (${claim.transaction.transactionId})`)
    }
    return undefined
  }
  console.error(`dsh-desktop: deferred plugin install recovery (${claim.reason}) for ${claim.transaction.packageName}`)
  return undefined
}

/** Restore one claimed transaction's profile backups and persist the rollback notice. */
async function rollbackClaimedInstall(store: DesktopInstallRecoveryStore, transactionId: string): Promise<void> {
  const result = await store.restore(transactionId, 'startup-failed')
  if (result.status === 'manual-recovery-required') {
    throw new Error(`dsh-desktop: plugin install rollback requires manual repair (${result.transaction.transactionId})`)
  }
  await store.markRollbackNotified(transactionId)
}

/** Confirm or roll back a verifying install once the Host's health is observable. */
async function settleVerifyingInstall(
  recovery: InstallRecoveryReconciliation,
  healthy: boolean,
): Promise<void> {
  if (recovery.settled) return
  recovery.settled = true
  if (healthy) {
    await recovery.store.markHealthy(recovery.transaction.transactionId)
    await recovery.store.clear(recovery.transaction.transactionId)
  } else {
    console.error(`dsh-desktop: Host boot failed; rolling back plugin install ${recovery.transaction.packageName}`)
    await rollbackClaimedInstall(recovery.store, recovery.transaction.transactionId)
  }
}

/** Spawn environment carrying the bridge's pnpm PATH entry; undefined in development. */
let desktopBridgeEnv: NodeJS.ProcessEnv | undefined

async function boot(): Promise<void> {
  if (bootQuitPromise !== undefined) return
  const paths = hostPaths()
  assertHostArtifacts(paths)
  if (app.isPackaged && process.env.DSH_DESKTOP_BOOTSTRAP !== '0') {
    desktopBridgeEnv = {
      ...process.env,
      DSH_DESKTOP: '1',
      DSH_DESKTOP_HOST_CONFIG: userDesktopConfigPath(),
    }
    desktopBridge = await setupDesktopBridge(paths.nodeExecutable, paths.cliEntry, desktopBridgeEnv)
  }
  host = createHostSupervisor({
    spawnHost: () => spawnDshWeb({
      ...paths,
      webHost: resolveWebHost(),
      webPort: resolveWebPort(),
      trustedHosts: resolveTrustedHosts(),
      ...(desktopBridge === undefined ? {} : { desktopBootstrapPath: desktopBridge.bootstrapPath }),
      env: desktopBridgeEnv ?? {
        ...process.env,
        DSH_DESKTOP: '1',
        DSH_DESKTOP_HOST_CONFIG: userDesktopConfigPath(),
      },
    }),
    log: chunk => process.stderr.write(chunk),
    onUnexpectedExit: ({ code, signal }) => {
      console.error(`desktop Host exited unexpectedly (code ${String(code)}, signal ${String(signal)})`)
      const verify = desktopBridge?.recovery
      if (verify !== undefined) {
        void settleVerifyingInstall(verify, false).catch((cause) => {
          console.error('dsh-desktop: verifying install rollback failed:', cause)
        })
      }
      restartApp()
    },
  })
  hostOrigin = await host.start()
  const verify = desktopBridge?.recovery
  if (verify !== undefined) {
    try {
      await fetch(hostOrigin, { signal: AbortSignal.timeout(30_000) })
      await settleVerifyingInstall(verify, true)
    } catch {
      await settleVerifyingInstall(verify, false)
    }
  }
  hardenSession()
  lifecycle = createDesktopLifecycle({
    getWindow: () => mainWindow,
    createWindow: createMainWindow,
    disposeHost: async () => { await host?.shutdown() },
    quit: releaseAppQuit,
    reportError: (error) => { console.error('desktop shutdown failed:', error) },
  })
  createTray()
  await lifecycle.showWindow()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { void lifecycle?.showWindow() })
  app.on('activate', () => { void lifecycle?.showWindow() })
  app.on('window-all-closed', () => {
    // Tray and Host own application lifetime on every platform.
  })
  app.on('before-quit', (event: Event) => {
    if (quitReleased) return
    event.preventDefault()
    void requestAppQuit()
  })
  app.on('will-quit', () => {
    desktopBridge?.pnpmRuntime.dispose()
    void desktopBridge?.control.close()
  })
  app.whenReady().then(boot).catch(async (error: unknown) => {
    console.error('desktop startup failed:', error)
    if (bootQuitPromise === undefined) {
      await dialog.showMessageBox({
        type: 'error',
        title: `${APP_NAME} failed to start`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    await requestAppQuit()
  })
}
