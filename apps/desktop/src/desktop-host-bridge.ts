/** Electron-side bridge to the Host's desktop services: control channel and bootstrap file. */

import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'

/** Launcher operations the Host may request back over the control channel. */
export interface DesktopControlHandlers {
  /** Open the desktop terminal surface for the active profile. */
  openTerminal(): void
  /** Perform one orderly Host-and-window restart. */
  requestRestart(): void | Promise<void>
}

/** Live loopback control endpoint shared with one Host generation. */
export interface DesktopControlServer {
  /** Loopback URL published in the bootstrap file. */
  readonly url: string
  /** Bearer token required by every request. */
  readonly token: string
  /** Stop listening and reject further requests. */
  close(): Promise<void>
}

/** Exact contents of the launcher bootstrap file for one Host generation. */
export interface DesktopBootstrapFileContents {
  readonly generationId: string
  readonly profile: {
    readonly name: string
    readonly dir: string
    readonly homeDir: string
    readonly statePath: string
  }
  readonly pnpm: {
    readonly appExecutable: string
    readonly pnpmBinPath: string
    readonly electronVersion: string
    readonly nodeBinDir: string
    readonly nodeShimPath: string
    readonly clearEnvironmentPath: string
    readonly dshBootstrapPath: string
    readonly installRecoveryStatePath: string
  }
  readonly plugins: {
    readonly statePath: string
    readonly installAnchor: string
  }
  readonly actions: {
    readonly controlUrl: string
    readonly controlToken: string
  }
}

/**
 * Start the loopback control server the Host's desktop actions post to.
 * @param handlers - launcher operations invoked for accepted actions.
 * @returns the listening endpoint with its bearer token.
 */
export async function startDesktopControlServer(handlers: DesktopControlHandlers): Promise<DesktopControlServer> {
  const token = randomBytes(24).toString('base64url')
  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end()
      return
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end()
      return
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      let action: unknown
      try {
        action = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { action?: unknown }).action
      } catch {
        response.writeHead(400).end()
        return
      }
      if (action === 'open-terminal') {
        handlers.openTerminal()
        response.writeHead(204).end()
        return
      }
      if (action === 'request-restart') {
        void Promise.resolve(handlers.requestRestart()).then(() => {
          response.writeHead(204).end()
        }, () => {
          response.writeHead(500).end()
        })
        return
      }
      response.writeHead(404).end()
    })
  })
  await new Promise<void>((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); accept() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('dsh-desktop: control server did not bind a loopback port')
  return {
    url: `http://127.0.0.1:${String(address.port)}/`,
    token,
    close: async () => {
      await new Promise<void>((accept, reject) => {
        server.close(() => { accept() })
        server.on('error', reject)
      })
    },
  }
}

/**
 * Write the launcher bootstrap file for one Host generation.
 * @param contents - validated launcher values for this generation.
 * @param path - absolute bootstrap file path published as DSH_DESKTOP_BOOTSTRAP.
 */
export function writeDesktopBootstrapFile(contents: DesktopBootstrapFileContents, path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(contents, undefined, 2) + '\n', { mode: 0o600 })
}
