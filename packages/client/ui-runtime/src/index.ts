/**
 * Desktop runtime diagnostics, node half.
 *
 * Deliberately empty: this surface is pure browser presentation. It reads the
 * desktop shell's actual bound port (surfaced by the Electron preload bridge as
 * window.desktopRuntime) and renders it as a General-settings row. Nothing on
 * the host side owns a diagnostic to mount here.
 */

/** Host plugin body — no host-side behavior for the runtime diagnostic row. */
export function apply(): void {}
