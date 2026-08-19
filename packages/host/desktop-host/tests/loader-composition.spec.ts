/**
 * Real-composition guard: the desktop-host entry boots from a test-only
 * cordis.yml through the actual Loader path with the real subprocess Service
 * Definition. With a published bootstrap file every desktop service goes live
 * and native actions reach the loopback control channel; without the env var
 * the entry stays inert and every service remains absent.
 */

import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Subprocess from '@deepseek-ai/dsh-subprocess'
import * as entry from '../src/index.ts'
import { DESKTOP_BOOTSTRAP_ENV } from '../src/bootstrap.ts'

let root: string | undefined
let context: Context | undefined
let previousEnv: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (previousEnv === undefined) Reflect.deleteProperty(process.env, DESKTOP_BOOTSTRAP_ENV)
  else process.env[DESKTOP_BOOTSTRAP_ENV] = previousEnv
  previousEnv = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Minimal loopback control endpoint recording accepted actions. */
async function startControl(): Promise<{ url: string; token: string; actions: string[]; close(): Promise<void> }> {
  const token = 'test-control-token'
  const actions: string[] = []
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      actions.push((JSON.parse(Buffer.concat(chunks).toString()) as { action: string }).action)
      response.writeHead(204).end()
    })
  })
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('control test server did not bind')
  return {
    url: 'http://127.0.0.1:' + String(address.port) + '/',
    token,
    actions,
    close: async () => {
      await new Promise<void>((accept) => { server.close(() => { accept() }) })
    },
  }
}

/** Boot the entry through the Loader with an optionally published bootstrap file. */
async function bootComposition(bootstrapPath?: string): Promise<Context> {
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root!).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === '@deepseek-ai/dsh-subprocess') return Subprocess
      if (specifier === '@deepseek-ai/dsh-desktop-host') return entry
      throw new Error('unexpected Loader import: ' + specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const configPath = join(root!, 'cordis.yml')
  await writeFile(configPath, [
    '- id: subprocess',
    "  name: '@deepseek-ai/dsh-subprocess'",
    '- id: desktop-host',
    "  name: '@deepseek-ai/dsh-desktop-host'",
    '',
  ].join('\n'))
  previousEnv = process.env[DESKTOP_BOOTSTRAP_ENV]
  if (bootstrapPath === undefined) Reflect.deleteProperty(process.env, DESKTOP_BOOTSTRAP_ENV)
  else process.env[DESKTOP_BOOTSTRAP_ENV] = bootstrapPath
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return ctx
}

/** Write one contract-complete bootstrap file for the given control endpoint. */
async function writeBootstrap(root: string, controlUrl: string): Promise<string> {
  const path = join(root, 'host-bootstrap.json')
  await writeFile(path, JSON.stringify({
    generationId: 'gen-test',
    profile: { name: 'web', dir: join(root, 'profiles', 'web'), homeDir: root, statePath: join(root, 'selection.json') },
    pnpm: {
      appExecutable: process.execPath,
      pnpmBinPath: join(root, 'pnpm.mjs'),
      electronVersion: '0.0.0-test',
      nodeBinDir: join(root, 'node-bin'),
      nodeShimPath: join(root, 'node-bin', 'node'),
      clearEnvironmentPath: join(root, 'clear-env.mjs'),
      dshBootstrapPath: join(root, 'dsh-bin.js'),
      installRecoveryStatePath: join(root, 'plugin-install-recovery', 'state.json'),
    },
    plugins: { statePath: join(root, 'disabled-bundles.json'), installAnchor: join(root, 'anchor-package.json') },
    actions: { controlUrl, controlToken: 'test-control-token' },
  }))
  return path
}

describe('desktop-host real composition', () => {
  it('registers every desktop service when the launcher published a bootstrap', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-composition-'))
    const control = await startControl()
    try {
      const bootstrapPath = await writeBootstrap(root, control.url)
      const ctx = await bootComposition(bootstrapPath)
      expect(ctx.get('desktopProfiles')).toBeDefined()
      expect(ctx.get('desktopProfiles')!.current.name).toBe('web')
      expect(ctx.get('desktopPlugins')).toBeDefined()
      expect(ctx.get('desktopPnpm')).toBeDefined()
      const actions = ctx.get('desktopActions')
      expect(actions).toBeDefined()
      await actions!.requestRestart()
      await vi.waitFor(() => { expect(control.actions).toContain('request-restart') })
    } finally {
      await control.close()
    }
  })

  it('stays inert without the bootstrap env, leaving every service absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-composition-'))
    const ctx = await bootComposition(undefined)
    expect(ctx.get('desktopProfiles')).toBeUndefined()
    expect(ctx.get('desktopPnpm')).toBeUndefined()
    expect(ctx.get('desktopPlugins')).toBeUndefined()
    expect(ctx.get('desktopActions')).toBeUndefined()
  })

  it('fails loud on a bootstrap file with a missing field', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-composition-'))
    const path = join(root, 'host-bootstrap.json')
    await writeFile(path, JSON.stringify({ generationId: 'gen-test' }))
    await expect(bootComposition(path)).rejects.toThrow(/missing non-empty string field/)
  })
})
