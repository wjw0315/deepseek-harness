/** Electron application shell for the loopback DeepSeek Harness Web Host. */

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

async function boot(): Promise<void> {
  if (bootQuitPromise !== undefined) return
  const paths = hostPaths()
  assertHostArtifacts(paths)
  host = createHostSupervisor({
    spawnHost: () => spawnDshWeb({
      ...paths,
      webHost: resolveWebHost(),
      webPort: resolveWebPort(),
      trustedHosts: resolveTrustedHosts(),
      env: {
        ...process.env,
        DSH_DESKTOP: '1',
        DSH_DESKTOP_HOST_CONFIG: userDesktopConfigPath(),
      },
    }),
    log: chunk => process.stderr.write(chunk),
    onUnexpectedExit: ({ code, signal }) => {
      console.error(`desktop Host exited unexpectedly (code ${String(code)}, signal ${String(signal)})`)
      void requestAppQuit()
    },
  })
  hostOrigin = await host.start()
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
