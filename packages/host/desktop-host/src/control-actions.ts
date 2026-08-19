/** Control-channel actions the Host requests from the Electron shell. */

import type { DesktopActionsBootstrap } from './desktop-actions.ts'

/** Loopback control endpoint plus its bearer token, from the bootstrap file. */
export interface DesktopControlChannel {
  readonly controlUrl: string
  readonly controlToken: string
}

function unauthorized(name: string, response: Response): Error {
  return new Error(`dsh-desktop-host: control channel rejected ${name} (HTTP ${response.status})`)
}

/**
 * Build the desktop actions bootstrap over the launcher's loopback control channel.
 * @param channel - endpoint and token published by the Electron shell.
 * @returns launcher operations for {@link DesktopActionsService}.
 */
export function controlActionsBootstrap(channel: DesktopControlChannel): DesktopActionsBootstrap {
  const post = async (name: string): Promise<void> => {
    let response: Response
    try {
      response = await fetch(channel.controlUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${channel.controlToken}` },
        body: JSON.stringify({ action: name }),
      })
    } catch (cause) {
      throw new Error(`dsh-desktop-host: control channel request ${name} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    if (!response.ok) throw unauthorized(name, response)
  }
  return {
    // Terminal opening is user-facing and one-way: report a failure on stderr
    // instead of throwing into the fire-and-forget caller.
    openTerminal(): void {
      void post('open-terminal').catch((cause: unknown) => {
        process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
      })
    },
    requestRestart(): Promise<void> {
      return post('request-restart')
    },
  }
}
