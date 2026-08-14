/**
 * Desktop shell preload bridge.
 *
 * The dsh web GUI runs inside a BrowserWindow whose content is served over
 * http by the host. Because the page is not Node-integrated (contextIsolation
 * on, nodeIntegration off, sandbox on), this preload is the only privileged
 * channel. It exposes window.desktopRuntime.getRuntime() — a single read-only
 * snapshot of the desktop shell's bound host port (and DSH_HOME), which
 * dsh-client-ui-runtime's General-settings row renders. Nothing else is bridged.
 *
 * @module dsh-desktop/preload
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopRuntime', {
  getRuntime: () => ipcRenderer.sendSync('dsh:get-runtime'),
})
