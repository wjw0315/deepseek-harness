/**
 * Desktop Web Host configuration controller over the host `desktop-host-config`
 * settings namespace. Exposes the current values and staged-write actions the
 * General settings row renders; writes target single fields so the settings
 * scope keeps revision fencing and ordering for us.
 */

import {
  createSnapshotStore,
  type SettingsScope,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'

/** The host `desktop-host-config` settings namespace (spelled here, not imported from a Host package). */
export const DESKTOP_HOST_CONFIG_NS = 'desktop-host-config'

/** The config this surface edits. Optional fields mirror the host schema defaults. */
export interface HostConfig {
  /** Loopback bind host; the host plugin restricts this to loopback. */
  webHost?: '127.0.0.1' | 'localhost'
  /** Fixed loopback port; 0 asks the OS to assign one. */
  webPort?: number
  /** Extra authorities the /api browser-trust fence accepts. */
  trustedHosts?: string[]
}

/** The row snapshot: readiness plus one editable field each. */
export interface HostConfigRowState {
  /** Whether the namespace is ready/host-persisted (false until first accepted section). */
  ready: boolean
  /** Current resolved values (undefined fields fall back to the host schema defaults). */
  webHost: '127.0.0.1' | 'localhost'
  webPort: number
  trustedHosts: string[]
  /** Whether the host document accepts writes. */
  writable: boolean
}

/** Extract the resolved values from a scope snapshot, applying host defaults. */
function valuesOf(snapshot: {
  status: 'loading' | 'ready' | 'unavailable'
  value: HostConfig | undefined
}): { webHost: '127.0.0.1' | 'localhost'; webPort: number; trustedHosts: string[] } {
  const value = snapshot.value
  return {
    webHost: value?.webHost ?? '127.0.0.1',
    webPort: value?.webPort ?? 0,
    trustedHosts: value?.trustedHosts ?? [],
  }
}

/**
 * Bridge the bound `desktop-host-config` scope onto the row snapshot and its
 * write actions.
 */
export class HostConfigController {
  /** Row snapshot consumed through a bound selector hook. */
  readonly store: SnapshotStore<HostConfigRowState>

  /**
   * @param scope - the bound settings scope for the `desktop-host-config` namespace.
   */
  constructor(private readonly scope: SettingsScope<HostConfig>) {
    this.store = createSnapshotStore<HostConfigRowState>(this.projection())
    scope.subscribe(() => {
      this.store.set(this.projection())
    })
  }

  private readonly projection = (): HostConfigRowState => {
    const snapshot = this.scope.getSnapshot()
    const values = valuesOf(snapshot)
    return {
      ready: snapshot.status === 'ready',
      webHost: values.webHost,
      webPort: values.webPort,
      trustedHosts: values.trustedHosts,
      writable: snapshot.writable,
    }
  }

  /** Stage one bind-host value. */
  setWebHost(value: '127.0.0.1' | 'localhost'): Promise<void> {
    return this.scope.set('webHost', value)
  }

  /** Stage one fixed-port value. */
  setWebPort(value: number): Promise<void> {
    return this.scope.set('webPort', value)
  }

  /** Stage the trusted-host list wholesale. */
  setTrustedHosts(values: string[]): Promise<void> {
    return this.scope.set('trustedHosts', values)
  }
}
