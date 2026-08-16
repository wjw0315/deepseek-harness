import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { HostConfigController, type HostConfig } from '../src/client/settings-store.ts'

/** A controllable fake scope for the controller under test. */
type FakeScope = SettingsScope<HostConfig> & { push: (s: SettingsScopeSnapshot<HostConfig>) => void }

function fakeScope(initial: SettingsScopeSnapshot<HostConfig>): FakeScope {
  const listeners: Array<() => void> = []
  let snapshot: SettingsScopeSnapshot<HostConfig> = initial
  return {
    push: (next) => { snapshot = next; for (const l of listeners) l() },
    getSnapshot: () => snapshot,
    subscribe: (l) => { listeners.push(l); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1) } },
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

function ready(value: HostConfig, writable = true): SettingsScopeSnapshot<HostConfig> {
  return { status: 'ready', value, base: null, user: null, revision: 1, writable, mode: 'host' }
}

describe('HostConfigController', () => {
  it('projects resolved values with host defaults', () => {
    const scope = fakeScope(ready({ webPort: 51925, trustedHosts: ['a.example.com'] }))
    const controller = new HostConfigController(scope)
    expect(controller.store.getSnapshot()).toEqual({
      ready: true,
      webHost: '127.0.0.1',
      webPort: 51925,
      trustedHosts: ['a.example.com'],
      writable: true,
    })
  })

  it('applies defaults when a field is absent', () => {
    const scope = fakeScope(ready({}))
    const controller = new HostConfigController(scope)
    expect(controller.store.getSnapshot()).toEqual({
      ready: true,
      webHost: '127.0.0.1',
      webPort: 0,
      trustedHosts: [],
      writable: true,
    })
  })

  it('updates the store snapshot when the scope publishes a change', () => {
    const scope = fakeScope(ready({ webPort: 51925 }))
    const controller = new HostConfigController(scope)
    scope.push(ready({ webPort: 51926 }))
    expect(controller.store.getSnapshot().webPort).toBe(51926)
  })

  it('routes write actions to the scope', async () => {
    const scope = fakeScope(ready({}))
    const controller = new HostConfigController(scope)
    await controller.setWebHost('localhost')
    await controller.setWebPort(8080)
    await controller.setTrustedHosts(['b.example.com'])
    expect(scope.set).toHaveBeenCalledWith('webHost', 'localhost')
    expect(scope.set).toHaveBeenCalledWith('webPort', 8080)
    expect(scope.set).toHaveBeenCalledWith('trustedHosts', ['b.example.com'])
  })

  it('reports readiness false before any accepted section', () => {
    const scope = fakeScope({ status: 'loading', value: undefined, base: null, user: null, revision: undefined, writable: false, mode: 'host' })
    const controller = new HostConfigController(scope)
    expect(controller.store.getSnapshot().ready).toBe(false)
  })
})
