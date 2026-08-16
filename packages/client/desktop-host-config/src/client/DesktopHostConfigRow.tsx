/**
 * Desktop Web Host preference row (General settings item). Matches the
 * Setting-Cell pattern: title + description on the left and a selector pill
 * showing the current bind on the right; clicking the pill reveals three
 * staged fields (bind host, fixed port, trusted domains) that write on Save.
 *
 * The collapsed pill and the expanded fields both render from the live host
 * settings snapshot, so configured values show immediately; edits are staged
 * in local state and committed only on Save.
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostConfigRowState } from './settings-store.ts'
import css from './DesktopHostConfigRow.module.css'

/** Registration-side business face for the host-backed preference. */
export interface DesktopHostConfigRowInjected {
  hooks: {
    /** Host config snapshot bound by the renderer as useDesktopHostConfig. */
    desktopHostConfig: SnapshotStore<HostConfigRowState>
  }
  /** Write one bind-host value. */
  setWebHost: (value: '127.0.0.1' | 'localhost') => Promise<void>
  /** Write one fixed-port value. */
  setWebPort: (value: number) => Promise<void>
  /** Write the trusted-host list. */
  setTrustedHosts: (values: string[]) => Promise<void>
}

/** Full component props. */
export type DesktopHostConfigRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.desktopHost'>
  & InjectFace<DesktopHostConfigRowInjected>

/**
 * Parse comma-separated trusted-host text into a trimmed, non-empty list.
 * @param text - raw draft text.
 * @returns host entries (possibly empty).
 */
function parseHosts(text: string): string[] {
  return text.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
}

/**
 * Render the Desktop Web Host preference row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function DesktopHostConfigRow({
  t,
  useDesktopHostConfig,
  setWebHost,
  setWebPort,
  setTrustedHosts,
}: DesktopHostConfigRowProps): JSX.Element {
  const snapshot = useDesktopHostConfig(s => s)
  const [open, setOpen] = useState(false)
  const [webHost, setWebHostDraft] = useState<'127.0.0.1' | 'localhost'>('127.0.0.1')
  const [webPort, setWebPortDraft] = useState('0')
  const [trustedHosts, setTrustedHostsDraft] = useState('')

  // Re-seed drafts whenever a new host snapshot arrives so the fields always
  // show the current configuration (not a stale initial mount).
  useEffect(() => {
    setWebHostDraft(snapshot.webHost)
    setWebPortDraft(String(snapshot.webPort))
    setTrustedHostsDraft(snapshot.trustedHosts.join(', '))
  }, [snapshot.webHost, snapshot.webPort, snapshot.trustedHosts, snapshot.ready])

  // The collapsed pill always reflects the live snapshot, not local state.
  const pillLabel = snapshot.ready
    ? `${snapshot.webHost}:${snapshot.webPort}`
    : t('unavailable')
  const description = snapshot.ready ? t('description') : t('unavailable')
  const portValid = Number.isInteger(Number(webPort)) && Number(webPort) >= 0 && Number(webPort) <= 65535

  const save = async (): Promise<void> => {
    if (webHost !== snapshot.webHost) await setWebHost(webHost)
    if (Number(webPort) !== snapshot.webPort && portValid) await setWebPort(Number(webPort))
    await setTrustedHosts(parseHosts(trustedHosts))
    setOpen(false)
  }

  return (
    <>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{t('title')}</div>
          <div className={css.desc}>{description}</div>
        </div>
        <button
          type="button"
          className={css.selector}
          aria-haspopup="true"
          aria-expanded={open}
          disabled={!snapshot.writable}
          onClick={() => { setOpen(value => !value) }}
        >
          {pillLabel}
          <IconChevronDownOutline14 className={css.chevron + (open ? ' ' + css.chevronOpen : '')} />
        </button>
      </div>
      {open && (
        <div className={css.panel}>
          <div className={css.field}>
            <label className={css.label} htmlFor="dhc-webhost">{t('webHost')}</label>
            <select
              id="dhc-webhost"
              className={css.input}
              value={webHost}
              disabled={!snapshot.writable}
              onChange={(e) => { setWebHostDraft(e.target.value as '127.0.0.1' | 'localhost') }}
            >
              <option value="127.0.0.1">127.0.0.1</option>
              <option value="localhost">localhost</option>
            </select>
          </div>
          <div className={css.field}>
            <label className={css.label} htmlFor="dhc-webport">{t('webPort')}</label>
            <input
              id="dhc-webport"
              className={css.input + (portValid ? '' : ' ' + css.inputInvalid)}
              type="text"
              inputMode="numeric"
              value={webPort}
              placeholder="0"
              disabled={!snapshot.writable}
              onChange={(e) => { setWebPortDraft(e.target.value) }}
            />
          </div>
          <div className={css.field}>
            <label className={css.label} htmlFor="dhc-trustedhosts">{t('trustedHosts')}</label>
            <textarea
              id="dhc-trustedhosts"
              className={css.textarea}
              value={trustedHosts}
              rows={2}
              disabled={!snapshot.writable}
              onChange={(e) => { setTrustedHostsDraft(e.target.value) }}
            />
            <p className={css.hint}>{t('restartHint')}</p>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.button} disabled={!portValid} onClick={() => { setOpen(false) }}>
              {t('cancel')}
            </button>
            <button type="button" className={css.buttonPrimary} disabled={!snapshot.writable || !portValid} onClick={() => { void save() }}>
              {t('save')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
