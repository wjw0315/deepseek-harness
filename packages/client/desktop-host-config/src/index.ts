/**
 * Desktop Web Host configuration surface, node half. The empty apply exists
 * so the plugin appears in the host cordis.yml / Loader; the browser half
 * ships the General settings row that edits the `desktop-host-config`
 * namespace through exports["./client"].
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
