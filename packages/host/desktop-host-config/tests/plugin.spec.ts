import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SettingsProvider, { type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply, DESKTOP_CONFIG_ENV, DESKTOP_HOST_CONFIG_NAMESPACE } from '../src/index.ts'

/** In-memory settings provider implementing the three Service primitives. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown>

  constructor(ctx: ConstructorParameters<typeof SettingsProvider>[0], options?: { doc?: Record<string, unknown> }) {
    super(ctx)
    this.doc = structuredClone(options?.doc ?? {})
  }

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

describe('desktop-host-config apply', () => {
  it('registers the namespace through the settings service', async () => {
    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply)
    await applyFiber

    const registered = ctx.settings.get(DESKTOP_HOST_CONFIG_NAMESPACE) as unknown
    expect(registered).toMatchObject({
      webHost: '127.0.0.1',
      webPort: 0,
      trustedHosts: [],
    })

    await applyFiber.dispose()
    await providerFiber.dispose()
  })

  it('writes resolved values to the DSH_DESKTOP_HOST_CONFIG JSON file on change', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-host-config-'))
    const configPath = join(dir, 'desktop.config.json')
    process.env[DESKTOP_CONFIG_ENV] = configPath

    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply)
    await applyFiber

    const ns = DESKTOP_HOST_CONFIG_NAMESPACE
    await ctx.settings.update(ns, { webPort: 51925, trustedHosts: ['dsh.example.com'] })

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    expect(written).toMatchObject({
      webHost: '127.0.0.1',
      webPort: 51925,
      trustedHosts: ['dsh.example.com'],
    })

    await applyFiber.dispose()
    await providerFiber.dispose()
    process.env[DESKTOP_CONFIG_ENV] = undefined
    rmSync(dir, { recursive: true, force: true })
  })
})
