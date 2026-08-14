/**
 * Runtime port row in General settings.
 *
 * Read-only diagnostic row: renders the dsh host's actual bound HTTP port
 * (window.desktopRuntime from the Electron preload bridge). Out of the desktop
 * shell the value is "—". No store, no write path, so the inject face is empty.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RuntimeKey } from './locales.ts'
import css from './RuntimePortRow.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Runtime port row copy. */
    'settings.runtime': RuntimeKey
  }
}

/** Injectable business face: none — the row is read-only. */
export interface RuntimePortRowInjected {}

/** Full Settings-row props. */
export type RuntimePortRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.runtime'>
  & InjectFace<RuntimePortRowInjected>

/** Desktop runtime surface exposed by the Electron preload bridge. */
declare global {
  interface Window {
    desktopRuntime?: {
      getRuntime: () => { activePort: number; activeOrigin: string; draftPath: string }
    }
  }
}

/** Label key for the row title. */
export const PORT_LABEL_KEY: RuntimeKey = 'runtime.portLabel'

/** Read the desktop host's bound port, or 0 when not in the desktop shell. */
export function readPort(windowLike: Pick<Window, 'desktopRuntime'> = window): number {
  const v = windowLike.desktopRuntime?.getRuntime()
  return v !== undefined && Number.isInteger(v.activePort) ? v.activePort : 0
}

/**
 * Render the runtime port row.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function RuntimePortRow({ t }: RuntimePortRowProps) {
  const port = readPort(window)
  return (
    <div className={css.group}>
      <div className={css.title}>{t(PORT_LABEL_KEY)}</div>
      <div className={css.value}>{port > 0 ? String(port) : '—'}</div>
    </div>
  )
}
