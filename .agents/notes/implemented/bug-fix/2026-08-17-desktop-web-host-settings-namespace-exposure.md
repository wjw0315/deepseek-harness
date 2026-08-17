# Agent Note: The Desktop Web Host settings row is served by the plugin-owned settings surface

Status: implemented

English | [中文](2026-08-17-desktop-web-host-settings-namespace-exposure.zh.md)

## Problem

The desktop app's Web Host row binds the `desktop-host-config` settings namespace. On the gateway before the plugin-owned settings surface, the namespace was absent from the Web settings allowlist, and every failure the row exhibited followed from that single gap:

- Its scope never found the namespace in `settings.describe`, so it reported `unavailable` and never loaded the live host, port, or trusted hosts.
- Writes were refused with `settings-not-exposed`, and the client's `write()` swallows that error and re-reads, so saving changed nothing on screen.
- Because no write ever landed, the host plugin's `onChange` never fired, so `desktop.config.json` was never written and every setting vanished on restart.

The fix also did not ship: the packaged app on the users' machine bundled a host whose `api-proxy` still carried the allowlist (the repo's built `lib/` outputs predate the allowlist removal), so packaging the desktop app without rebuilding the workspace shipped the old behavior. A rebuild from the current tree is part of the fix, not an optional step.

## Decision

The [plugin-owned settings surface](../architecture/2026-08-12-plugin-owned-settings-surface.md) decision removes the allowlist: registering a namespace is exposing it, and the gateway gates no write. The `desktop-host-config` namespace the desktop plugin registers is therefore served by `settings.describe` and writable through `settings.update`/`mutate`, which fixes the row's three failure modes: it loads its live values, its saves land in the settings seam, and the host plugin's `onChange` writes `desktop.config.json` for the next spawn.

The exposure fix alone left one gap in symptom terms: on a fresh boot the row would show the namespace's schema default (`127.0.0.1:0`) while the app actually spawns from its config file (e.g. `127.0.0.1:51925`), reading as "no live data". The desktop shell therefore publishes the values it actually spawned the host with as `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` on the child environment, and the host plugin seeds its settings base from them (schema defaults, then explicit composition config, then the spawn env — the spawn facts win, because the Loader resolves an absent entry config to schema defaults that would otherwise mask them). The row now shows the host:port the app runs with on first open, and the user settings section still wins over the seed after a save.

## Alternatives considered

- **Adding `desktop-host-config` to the gateway allowlist.** The fix considered before the merge; it is obsolete because the allowlist no longer exists, and the plugin-owned surface makes a per-namespace admission both unnecessary and unrepresentable.
- **Surfacing the `settings-not-exposed` error in the row** instead of silently re-reading. It improves a diagnostic but does not make the row work; the exposure decision is the actual fix. Left as future work.
- **Showing the browser's live origin (`window.location`) in the row.** Rejected: it conflates "this connection" with "next launch's bind", and the pill would not reflect a save until restart. Seeding the settings base keeps the pill's meaning (the configured/effective bind) while making it truthful on first open.

## Consequences

The Desktop Web Host row shows the effective `host:port` on first open, saves host/port/trusted hosts through the seam, and persists `desktop.config.json` across restarts. Port `3080` is a valid `webPort` (integer 0–65535) and is the web app's own default. The row stays loopback-only and secret-redacted under the plane's existing protections. Shipping the fix requires rebuilding the workspace (`pnpm run build`) before packaging the desktop app.

## Testing

The `api-proxy-config` spec pins the desktop namespace: a `desktop-host-config` registration is served by `settings.describe` and writable through `settings.update`, with the write reaching the seam. The desktop plugin's spec asserts the JSON config file is written on a settings change and that the spawn env seeds the card's base (valid values, per-field invalidity fallback, and spawn-env precedence over an entry config). The `host-supervisor` spec pins the child env publishing the spawn facts. The behavior was verified against a freshly built host: `settings.describe` serves the namespace with the spawn values, a `webPort` mutation writes `desktop.config.json` and persists across a host restart, and a fixed `--port` binds.
