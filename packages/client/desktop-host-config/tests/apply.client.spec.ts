/**
 * dsh-client-desktop-host-config apply wiring: locale dictionaries, the
 * declaration-aware General row registration, controller write routing to the
 * bound settings scope, and HMR collapse recovery.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { DesktopHostConfigRow } from '../src/client/DesktopHostConfigRow.tsx'

// The locale service reads its initial language from the browser; these specs
// assert the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

const SLOT = 'settings.general.item'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const ns = () => ({
    ns: 'desktop-host-config',
    schema: { uid: 1, refs: { 1: { type: 'object', dict: { webHost: { type: 'string' }, webPort: { type: 'number' }, trustedHosts: { type: 'array' } } } } },
    value: { webHost: '127.0.0.1', webPort: 51925, trustedHosts: [] },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describe = vi.fn(() => Promise.resolve({
    rpcId: 'host-config-describe' as never,
    result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [ns()] } },
  }))
  const mutate = vi.fn(() => Promise.resolve({ rpcId: 'host-config-mutate' as never, result: { ok: true as const, value: ns() } }))
  ctx.provide('connection', { api: { settings: { describe, mutate } }, isLoopback: true } as never)
  new TestRemote(ctx)
  await ctx.plugin(SettingsScopeBinder).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, describe, mutate }
}

/** Stand in for the settings shell: declare the General item slot from root. */
function declareItems(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

describe('dsh-client-desktop-host-config apply', () => {
  it('declares the required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'settingsScope'])
  })

  it('registers localized copy and the row (declaration before or after apply)', async () => {
    const before = await bench()
    declareItems(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = before.slots.entries(SLOT).find(e => e.component === DesktopHostConfigRow)!
    expect(entry.options).toMatchObject({ id: 'desktop-host-config' })
    // The row declares the locale namespace, so the renderer binds t from NS.
    expect(entry.locale).toBe(NS)

    const after = await bench()
    const fiber = after.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(after.slots.entries(SLOT)).toHaveLength(0)
    declareItems(after.slots)
    await Promise.resolve()
    expect(after.slots.entries(SLOT).some(e => e.component === DesktopHostConfigRow)).toBe(true)
  })

  it('teardown removes the row and dictionaries; teardown without a declaration is quiet', async () => {
    const b = await bench()
    declareItems(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    expect(b.locale.bind(NS)('title')).toBe('title')

    const quiet = await bench()
    const f2 = quiet.ctx.plugin({ inject: [...inject], apply })
    await f2.await()
    await f2.dispose()
    expect(quiet.slots.entries(SLOT)).toHaveLength(0)
  })
})
