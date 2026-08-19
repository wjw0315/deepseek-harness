// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { DesktopHostConfigRow, type DesktopHostConfigRowProps } from '../src/client/DesktopHostConfigRow.tsx'
import { en } from '../src/client/locales.ts'
import { HostConfigController } from '../src/client/settings-store.ts'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostConfig } from '../src/client/settings-store.ts'

type FakeScope = SettingsScope<HostConfig> & { push: (s: SettingsScopeSnapshot<HostConfig>) => void }

afterEach(cleanup)

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

const dictionary: Record<string, string> = en
const t: DesktopHostConfigRowProps['t'] = key => dictionary[key] ?? key
const runtime = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
}

function mount(controller: HostConfigController, actions?: Partial<DesktopHostConfigRowProps>) {
  return render(
    <DesktopHostConfigRow
      {...runtime}
      setWebHost={vi.fn(async () => {})}
      setWebPort={vi.fn(async () => {})}
      setTrustedHosts={vi.fn(async () => {})}
      requestRestart={vi.fn(async () => {})}
      useDesktopHostConfig={bindSnapshotSelector(controller.store)}
      t={t}
      {...actions}
    />,
  )
}

describe('DesktopHostConfigRow', () => {
  it('requests a desktop restart from the restart button', () => {
    const controller = new HostConfigController(fakeScope(ready({ webPort: 51925 })))
    const requestRestart = vi.fn(async () => {})
    mount(controller, { requestRestart })
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(requestRestart).toHaveBeenCalledTimes(1)
  })

  it('renders the current bind as the collapsed pill', () => {
    const controller = new HostConfigController(fakeScope(ready({ webPort: 51925 })))
    mount(controller)
    expect(screen.getByRole('button', { name: '127.0.0.1:51925' })).toBeTruthy()
  })

  it('shows the configured values in the expanded fields', () => {
    const controller = new HostConfigController(fakeScope(ready({ webPort: 51925, trustedHosts: ['a.example.com'] })))
    mount(controller)
    fireEvent.click(screen.getByRole('button', { name: '127.0.0.1:51925' }))
    // getByLabelText returns HTMLElement; the control accessors are the user-visible value.
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
    expect((screen.getByLabelText('Port (0 = auto)') as HTMLInputElement).value).toBe('51925')
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
    expect((screen.getByLabelText('Trusted domains (comma-separated)') as HTMLTextAreaElement).value).toContain('a.example.com')
  })

  it('disables Save when the port is invalid', () => {
    const controller = new HostConfigController(fakeScope(ready({ webPort: 51925 })))
    mount(controller)
    fireEvent.click(screen.getByRole('button', { name: '127.0.0.1:51925' }))
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    const input = screen.getByLabelText('Port (0 = auto)') as HTMLInputElement
    expect(save.disabled).toBe(false)
    fireEvent.change(input, { target: { value: '99999' } })
    expect(save.disabled).toBe(true)
  })

  it('writes staged values on Save', async () => {
    const controller = new HostConfigController(fakeScope(ready({ webPort: 51925 })))
    const setWebPort = vi.fn(async () => {})
    const setTrustedHosts = vi.fn(async () => {})
    mount(controller, { setWebPort, setTrustedHosts })
    fireEvent.click(screen.getByRole('button', { name: '127.0.0.1:51925' }))
    fireEvent.change(screen.getByLabelText('Port (0 = auto)'), { target: { value: '51926' } })
    fireEvent.change(screen.getByLabelText('Trusted domains (comma-separated)'), { target: { value: 'dsh.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(setWebPort).toHaveBeenCalledWith(51926) })
    await waitFor(() => { expect(setTrustedHosts).toHaveBeenCalledWith(['dsh.example.com']) })
  })

  it('disables the selector and fields when the namespace is not writable', () => {
    const scope = fakeScope(ready({ webPort: 51925 }, false))
    const controller = new HostConfigController(scope)
    mount(controller)
    const pill = screen.getByRole('button', { name: '127.0.0.1:51925' }) as HTMLButtonElement
    expect(pill.disabled).toBe(true)
  })
})
