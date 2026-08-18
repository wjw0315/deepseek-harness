// @vitest-environment jsdom
/**
 * macOS desktop titlebar marker: the shell tags <html data-titlebar="mac"> only
 * when its own ?dsh-desktop-platform=darwin boot param is present, so the shell
 * CSS reserves the native traffic-light title bar on macOS alone and keeps the
 * web UI full-bleed in browsers and on other desktop platforms. The marker is
 * pure over the search string, so it is driven here without running the boot
 * chain (the full chain is the e2e's job).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyDesktopTitlebarMarker } from '@deepseek-ai/dsh-client-web/src/boot.tsx'

describe('applyDesktopTitlebarMarker', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.titlebar
  })

  afterEach(() => {
    delete document.documentElement.dataset.titlebar
  })

  it('marks the titlebar when the darwin desktop platform param is present', () => {
    applyDesktopTitlebarMarker('?dsh-desktop-platform=darwin')
    expect(document.documentElement.dataset.titlebar).toBe('mac')
  })

  it('leaves the document unmarked when the platform param names another platform', () => {
    applyDesktopTitlebarMarker('?dsh-desktop-platform=win32')
    expect(document.documentElement.dataset.titlebar).toBeUndefined()
  })

  it('leaves the document unmarked in a plain browser (no platform param)', () => {
    applyDesktopTitlebarMarker('')
    expect(document.documentElement.dataset.titlebar).toBeUndefined()
  })

  it('ignores unrelated query parameters', () => {
    applyDesktopTitlebarMarker('?foo=bar&baz=qux')
    expect(document.documentElement.dataset.titlebar).toBeUndefined()
  })

  it('does not react to a platform param in the fragment', () => {
    applyDesktopTitlebarMarker('#dsh-desktop-platform=darwin')
    expect(document.documentElement.dataset.titlebar).toBeUndefined()
  })
})
