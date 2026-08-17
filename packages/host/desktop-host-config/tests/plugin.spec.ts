import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SettingsProvider, { type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  apply,
  DESKTOP_CONFIG_ENV,
  DESKTOP_HOST_CONFIG_NAMESPACE,
  DESKTOP_TRUSTED_HOSTS_ENV,
  DESKTOP_WEB_HOST_ENV,
  DESKTOP_WEB_PORT_ENV,
} from '../src/index.ts'

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
  afterEach(() => {
    // The exported env-constant names are passed as literal keys below so the
    // deletion is static, matching the repo's process.env-cleanup idiom.
    delete process.env[DESKTOP_CONFIG_ENV] // oxlint-disable-line no-dynamic-delete
    delete process.env[DESKTOP_WEB_HOST_ENV] // oxlint-disable-line no-dynamic-delete
    delete process.env[DESKTOP_WEB_PORT_ENV] // oxlint-disable-line no-dynamic-delete
    delete process.env[DESKTOP_TRUSTED_HOSTS_ENV] // oxlint-disable-line no-dynamic-delete
  })

  it('seeds the settings base from the spawn env so the card shows the running host', async () => {
    process.env[DESKTOP_CONFIG_ENV] = ''
    process.env[DESKTOP_WEB_HOST_ENV] = '127.0.0.1'
    process.env[DESKTOP_WEB_PORT_ENV] = '51925'
    process.env[DESKTOP_TRUSTED_HOSTS_ENV] = 'a.example.com, b.example.com'

    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply)
    await applyFiber

    expect(ctx.settings.get(DESKTOP_HOST_CONFIG_NAMESPACE)).toMatchObject({
      webHost: '127.0.0.1',
      webPort: 51925,
      trustedHosts: ['a.example.com', 'b.example.com'],
    })

    await applyFiber.dispose()
    await providerFiber.dispose()
  })

  it('ignores invalid spawn env values per field', async () => {
    process.env[DESKTOP_WEB_HOST_ENV] = '0.0.0.0'
    process.env[DESKTOP_WEB_PORT_ENV] = 'not-a-port'
    process.env[DESKTOP_TRUSTED_HOSTS_ENV] = 'a.example.com,, b.example.com '

    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply)
    await applyFiber

    expect(ctx.settings.get(DESKTOP_HOST_CONFIG_NAMESPACE)).toMatchObject({
      webHost: '127.0.0.1',
      webPort: 0,
      trustedHosts: ['a.example.com', 'b.example.com'],
    })

    await applyFiber.dispose()
    await providerFiber.dispose()
  })

  it('lets the spawn env win over an explicit composition config', async () => {
    process.env[DESKTOP_WEB_HOST_ENV] = '127.0.0.1'
    process.env[DESKTOP_WEB_PORT_ENV] = '51925'
    process.env[DESKTOP_TRUSTED_HOSTS_ENV] = 'a.example.com'

    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply, {
      webHost: 'localhost',
      webPort: 8000,
      trustedHosts: ['pinned.example.com'],
    })
    await applyFiber

    // The spawn facts are what the host actually binds; an entry config
    // (schema-resolved to defaults by the Loader when absent) must not mask them.
    expect(ctx.settings.get(DESKTOP_HOST_CONFIG_NAMESPACE)).toMatchObject({
      webHost: '127.0.0.1',
      webPort: 51925,
      trustedHosts: ['a.example.com'],
    })

    await applyFiber.dispose()
    await providerFiber.dispose()
  })

  it('registers the namespace through the settings service', async () => {
    const ctx = new Context()
    const providerFiber = ctx.plugin(MemorySettings)
    await providerFiber
    const applyFiber = ctx.plugin(apply)
    await applyFiber

    const registered = ctx.settings.get(DESKTOP_HOST_CONFIG_NAMESPACE)
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
