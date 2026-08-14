import { describe, expect, it } from 'vitest'
import { createDesktopLifecycle, type DesktopWindow } from '../src/window-lifecycle.ts'

function fakeWindow(overrides: Partial<DesktopWindow> = {}): DesktopWindow {
  return { isDestroyed: () => false, isVisible: () => true, show: () => {}, focus: () => {}, hide: () => {}, ...overrides }
}

const noopQuit = () => { type _unused = typeof noopQuit; void _unused }

describe('createDesktopLifecycle', () => {
  it('hides the window on close when not quitting', () => {
    const win = fakeWindow()
    const hides: string[] = []
    win.hide = () => { hides.push('hide') }
    const lifecycle = createDesktopLifecycle({
      getWindow: () => win,
      createWindow: async () => win,
      disposeHost: async () => {},
      quit: noopQuit,
    })
    let prevented = false
    lifecycle.onWindowClose({ preventDefault: () => { prevented = true } })
    expect(prevented).toBe(true)
    expect(hides).toEqual(['hide'])
  })

  it('quits after disposing the host once', async () => {
    let disposed = 0
    let quitCalled = 0
    const lifecycle = createDesktopLifecycle({
      getWindow: () => undefined,
      createWindow: async () => fakeWindow(),
      disposeHost: async () => { disposed++ },
      quit: () => { quitCalled++ },
    })
    await Promise.all([lifecycle.requestQuit(), lifecycle.requestQuit()])
    expect(disposed).toBe(1)
    expect(quitCalled).toBe(1)
  })
})
