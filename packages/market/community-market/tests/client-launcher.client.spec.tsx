// @vitest-environment jsdom
import './market-client-mocks.client.tsx'

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it } from 'vitest'
import type {} from '../src/client/index.ts'
import { MarketLauncher, type MarketLauncherProps } from '../src/client/MarketLauncher.tsx'
import { createMarketViewStore } from '../src/client/market-view-store.ts'

afterEach(() => { cleanup() })

const t = ((key: string) => key) as PropsLocale<'community-market'>['t']

describe('community market launcher', () => {
  it('opens the market and reflects narrow versus wide sidebar presentation', () => {
    const instance = createMarketViewStore().create()
    const useStore = <T,>(selector: (state: { open: boolean }) => T): T => useSyncExternalStore(
      instance.subscribe.bind(instance),
      () => selector(instance.getSnapshot()),
    )
    const props = {
      wide: false,
      actions: instance.actions,
      useStore,
      t,
      useSessions: (() => undefined) as MarketLauncherProps['useSessions'],
      useWorkspaces: (() => undefined) as MarketLauncherProps['useWorkspaces'],
    } satisfies MarketLauncherProps

    const { rerender } = render(<MarketLauncher {...props} />)
    const button = screen.getByRole('button', { name: 'tab' })
    expect(button.getAttribute('data-wide')).toBe('false')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.textContent).not.toContain('tab')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')

    rerender(<MarketLauncher {...props} wide />)
    expect(button.getAttribute('data-wide')).toBe('true')
    expect(button.textContent).toContain('tab')
  })
})
