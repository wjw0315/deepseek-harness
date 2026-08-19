/**
 * Loopback control server behavior: binds a real port, authenticates, and
 * dispatches both actions — the packaged-app bridge path no other test reaches.
 */

import { afterAll, describe, expect, it } from 'vitest'
import { request } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDesktopControlServer, writeDesktopBootstrapFile, type DesktopControlServer } from '../src/desktop-host-bridge.ts'

let control: DesktopControlServer | undefined
afterAll(async () => { await control?.close() })

function post(action: string, token: string): Promise<number> {
  return new Promise((accept, reject) => {
    const target = new URL(control!.url)
    const req = request({
      hostname: target.hostname,
      port: Number(target.port),
      method: 'POST',
      path: '/',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }, (response) => {
      response.resume()
      response.on('end', () => { accept(response.statusCode ?? 0) })
    })
    req.on('error', reject)
    req.end(JSON.stringify({ action }))
  })
}

describe('desktop-host bridge control server', () => {
  it('binds a loopback port and dispatches authenticated actions', async () => {
    const opened: string[] = []
    const restarted: string[] = []
    control = await startDesktopControlServer({
      openTerminal: () => { opened.push('terminal') },
      requestRestart: () => { restarted.push('restart') },
    })
    expect(control.url).toMatch(new RegExp('^http://' + '127' + String.fromCharCode(92) + '.0' + String.fromCharCode(92) + '.0' + String.fromCharCode(92) + '.1:' + String.fromCharCode(92) + 'd+/$'))
    expect(opened).toEqual([])
    expect(await post('open-terminal', control.token)).toBe(204)
    expect(opened).toEqual(['terminal'])
    expect(await post('request-restart', control.token)).toBe(204)
    expect(restarted).toEqual(['restart'])
    expect(await post('open-terminal', 'wrong-token')).toBe(401)
    expect(await post('unknown-action', control.token)).toBe(404)
  })

  it('writes the bootstrap file into a created parent directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-bridge-'))
    try {
      const path = join(root, 'nested', 'host-bootstrap.json')
      writeDesktopBootstrapFile({ generationId: 'gen-bridge-1' } as never, path)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ generationId: 'gen-bridge-1' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
