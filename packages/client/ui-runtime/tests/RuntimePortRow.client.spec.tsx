// @vitest-environment jsdom
/** RuntimePortRow: renders the host's bound port from window.desktopRuntime
 * (Electron preload bridge), or a dash outside the desktop shell. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RuntimePortRow, readPort, type RuntimePortRowProps } from '../src/client/RuntimePortRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<string, string> = Object.fromEntries(
  Object.entries(en).map(([k, v]) => [k, String(v)]),
)

function baseProps(): RuntimePortRowProps {
  return {
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    useStore: (() => undefined) as never,
    actions: {} as never,
    renderSlot: (() => null) as never,
    t: (key: string) => COPY[key] ?? key,
  } as RuntimePortRowProps
}

/** Stub the jsdom window's desktopRuntime bridge for one test (window stays stable). */
function withBridge(port: number | undefined, fn: () => void) {
  const w = globalThis.window as { desktopRuntime?: unknown }
  const prev = w.desktopRuntime
  if (port !== undefined) {
    w.desktopRuntime = { getRuntime: () => ({ activePort: port, activeOrigin: 'http://127.0.0.1:' + port, draftPath: '' }) }
  } else {
    delete w.desktopRuntime
  }
  try { fn() } finally { w.desktopRuntime = prev }
}

describe('readPort', () => {
  it('reads the active port from the desktop bridge', () => {
    withBridge(3080, () => expect(readPort()).toBe(3080))
  })
  it('returns 0 when the bridge is absent', () => {
    withBridge(undefined, () => expect(readPort()).toBe(0))
  })
})

describe('RuntimePortRow', () => {
  it('shows the bound port when the desktop bridge reports it', () => {
    withBridge(3080, () => {
      render(<RuntimePortRow {...baseProps()} />)
      expect(screen.getByText('3080')).toBeTruthy()
      expect(screen.getByText('Runtime port')).toBeTruthy()
    })
  })
  it('shows a dash outside the desktop shell', () => {
    withBridge(undefined, () => {
      render(<RuntimePortRow {...baseProps()} />)
      expect(screen.getByText('—')).toBeTruthy()
    })
  })
})
