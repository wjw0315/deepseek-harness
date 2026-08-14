/**
 * dsh-desktop main process.
 *
 * The DeepSeek Harness Web GUI is not a standalone frontend: it needs a live
 * host process (`dsh --profile web`, the `dsh-web-app` bundle) to inject
 * window.__DSH_BOOT__ and serve every backend capability (agent loop, LLM,
 * tools, sessions, storage) over http://127.0.0.1:<port>. This shell therefore
 * spawns that host as a child and opens a native BrowserWindow pointed at the
 * URL the host reports once it is ready.
 *
 * The packaged .app ships a portable Node 22 runtime (the dsh host requires
 * Node ^22.19, which Electron's bundled Node 20 cannot provide) and runs the
 * host with that binary. The host binds --port 0 and prints `dsh web:
 * http://127.0.0.1:<port>` when the server is live; this shell parses that
 * line rather than assume a fixed port, so it never collides with a
 * browser-first `dsh web` already bound on 3080.
 *
 * Setting DSH_HOST_BIN overrides the host entry (a testing/dev affordance; the
 * shell then spawns that path instead of resolving apps/cli/lib/bin.js).
 *
 * @module dsh-desktop/main
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

/** How long to wait for the host's readiness URL line before giving up. */
const HOST_READY_TIMEOUT_MS = 30_000

/** Prefix of the readiness line the web-app runtime prints once the server binds. */
const READY_PREFIX = 'dsh web: http://'

let activeChild: ChildProcess | undefined

/**
 * Runtime values surfaced to the renderer's Settings pane (read via IPC).
 * ActivePort is the port the host actually bound to (3080 preferred), so the
 * user can see where the local GUI/host is listening.
 */
const runtimeState = {
  activePort: 0,
  activeOrigin: '',
}

/** Resolve the host entry and the Node runtime that executes it. */
/**
 * Resolve the host entry and the Node runtime that executes it.
 *
 * Priority:
 *   1. DSH_HOST_BIN env override.
 *   2. A bundled self-contained host under Contents/Resources/host/ (with its
 *      own Node 22 runtime). The host REQUIRES Node ^22.19, which Electron's
 *      bundled Node 20 cannot provide, so it is always run with a real Node
 *      22 binary, never ELECTRON_RUN_AS_NODE.
 *   3. The repository's own built host (apps/cli/lib/bin.js) run with the
 *      system Node — a CONSISTENT single-store resolution that works when the
 *      developer's repo checkout is present. Producing a byte-identical
 *      relocatable closure is tracked separately (see package-host.cjs).
 *      When the repo host is used, the runner is process.execPath ONLY if it
 *      is a suitable Node; otherwise the system 'node'.
 */
function resolveHostBin(): { bin: string; runner: string } | undefined {
  const envBin = process.env.DSH_HOST_BIN
  if (envBin !== undefined && envBin.length > 0) return { bin: envBin, runner: process.execPath }
  // 2. Packaged self-contained host.
  const packagedBin = join(process.resourcesPath, 'host', 'apps', 'cli', 'lib', 'bin.js')
  const packagedRunner = join(process.resourcesPath, 'host', 'runtime', 'node')
  if (existsSync(packagedBin) && existsSync(packagedRunner)) return { bin: packagedBin, runner: packagedRunner }
  // 3. Repo host (consistent store); used for dev and when the repo is present.
  const checkout = join(__dirname, '..', '..', 'cli', 'lib', 'bin.js')
  if (existsSync(checkout)) return { bin: checkout, runner: process.env.DSH_NODE_BIN ?? 'node' }
  return undefined
}

/**
 * Port the host is asked to bind. 3080 is the preferred, stable default; the
 * orchestration retries with 0 (an OS-assigned free port) only when 3080 is
 * already taken.
 */
const PREFERRED_PORT = 3080

/**
 * Error thrown when the host fails because the requested port is already in
 * use. The caller retries on an OS-assigned port. Any other failure is fatal.
 */
class PortInUseError extends Error {
  constructor(port: number) {
    super(`port ${port} already in use`)
    this.name = 'PortInUseError'
  }
}

/**
 * Spawn the host and resolve when its readiness line arrives, recording the
 * actual bound port. When the host dies because the requested port is taken,
 * reject with {@link PortInUseError}.
 */
function startHost(bin: string, runner: string, port: number): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn(runner, [bin, '--profile', 'web', '--port', String(port)], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  activeChild = child

  let settled = false
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout>

  return new Promise((resolvePromise, reject) => {
    let stderrTail = ''

    const finish = (result: { child: ChildProcess; url: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.removeAllListeners('close')
      child.removeAllListeners('error')
      // Once the host is up, treat a later crash as fatal to the app: the
      // window would otherwise keep showing a dead backend.
      child.once('exit', () => {
        activeChild = undefined
        app.quit()
      })
      resolvePromise(result)
    }

    const fail = (message: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(message))
    }

    timeout = setTimeout(() => {
      timedOut = true
      fail(`timed out after ${HOST_READY_TIMEOUT_MS}ms waiting for dsh web host: ${stderrTail}`)
    }, HOST_READY_TIMEOUT_MS)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })
    child.once('close', (code: number | null, signal: string | null): void => {
      if (settled || timedOut) return
      // A bind failure on the requested port means it is taken; the caller
      // should retry on an OS-assigned port. Anything else is a real error.
      const busy = /EADDRINUSE|address already in use|already in use/.test(stderrTail)
      reject(busy ? new PortInUseError(port) : new Error(`dsh web host exited before ready (code ${code ?? 'null'}, signal ${signal ?? 'null'}): ${stderrTail}`))
      settled = true
      clearTimeout(timeout)
    })
    child.once('error', (err: Error): void => {
      if (!settled) fail(`failed to start dsh web host: ${err.message}`)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith(READY_PREFIX)) continue
        const portMatch = /^127\.0\.0\.1:(\d+)/.exec(trimmed.slice(READY_PREFIX.length))
        if (portMatch === null) continue
        const bound = Number(portMatch[1])
        if (!Number.isInteger(bound) || settled) continue
        runtimeState.activePort = bound
        runtimeState.activeOrigin = `http://127.0.0.1:${bound}`
        finish({ child, url: runtimeState.activeOrigin })
        return
      }
    })
  })
}

function createWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    backgroundColor: '#0f0f13',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The preload bridge exposes window.desktopRuntime to the http-loaded GUI
      // so Settings can show the host's actual bound port.
      preload: join(__dirname, 'preload.js'),
    },
  })
  void win.loadURL(url)
  win.on('closed', () => {
    if (activeChild !== undefined && activeChild.exitCode === null) activeChild.kill('SIGTERM')
    activeChild = undefined
    app.quit()
  })
  return win
}

/** Fail the launch with a dialog and quit cleanly. */
function fatal(message: string): void {
  void dialog.showMessageBox({
    type: 'error',
    title: 'DeepSeek Harness',
    message: 'Could not launch the DeepSeek Harness desktop host.',
    detail: message,
  }).finally(() => app.quit())
}

void app.whenReady().then(async () => {
  // Expose the host port (and other desktop runtime facts) to the Settings pane.
  ipcMain.on('dsh:get-runtime', (event) => {
    event.returnValue = { ...runtimeState, draftPath: process.env.DSH_HOME ?? '' }
  })

  const host = resolveHostBin()
  if (host === undefined) {
    fatal('The dsh host is not built. Run `pnpm run build` from the repository root, then retry.')
    return
  }
  try {
    // Prefer the stable 3080 port; fall back to an OS-assigned free port only
    // when 3080 is already taken. The bound port is recorded and surfaced in
    // Settings.
    const { url } = await startHost(host.bin, host.runner, PREFERRED_PORT).catch(async (err) => {
      if (!(err instanceof PortInUseError)) throw err
      return startHost(host.bin, host.runner, 0)
    })
    createWindow(url)
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err))
  }
})

app.on('window-all-closed', () => {
  if (activeChild !== undefined && activeChild.exitCode === null) activeChild.kill('SIGTERM')
  activeChild = undefined
  app.quit()
})
