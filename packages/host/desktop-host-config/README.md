# @deepseek-ai/dsh-desktop-host-config

English | [中文](README.zh.md)

Desktop Web Host configuration plugin: a settings card that exposes the loopback bind host (`webHost`), the fixed port (`webPort`), and the extra authorities the `/api` browser-trust fence accepts (`trustedHosts`). The card's base layer is seeded from the `DSH_DESKTOP_WEB_*` env vars the Electron shell publishes for the actual spawn, so it shows what the app runs with on first open (e.g. `127.0.0.1:51925`) instead of schema defaults. On every committed change it writes the resolved values back to a small JSON config file that the Electron shell (`apps/desktop`) reads when it spawns `dsh web`, so the host can be re-bound from the GUI without repackaging the app.

## Configuration

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `webHost` | `'127.0.0.1' | 'localhost'` | `'127.0.0.1'` | Loopback bind host passed to `dsh web --host`. The harness CLI rejects `0.0.0.0` (remote-code-execution exposure), so this is restricted to loopback. |
| `webPort` | `number` | `0` | Fixed loopback port passed to `dsh web --port`; `0` asks the OS to assign one. |
| `trustedHosts` | `string[]` | `[]` | Extra authorities the `/api` browser-trust fence accepts, passed as `--trusted-host` flags. |

## How it works

The desktop app starts `dsh web` with `--host`, `--port`, and `--trusted-host` flags. Those values must be known before the process starts, and the harness settings document is `dsh-settings` (a process-internal service), so the desktop cannot read them from the running process. This plugin bridges the two:

1. It registers a settings namespace (`desktop-host-config`) through `installSettingsSection`, so the values are editable in the GUI settings and persist in the harness settings document. The registration's `base` layer resolves schema defaults, then an explicit composition `config`, then the `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` env vars — the spawn facts win, because the Loader resolves an absent entry config to schema defaults that would otherwise mask the port the host actually binds.
2. When the Electron shell spawns the host, it sets `DSH_DESKTOP_HOST_CONFIG` to a writable JSON path (under Electron's `userData`). The plugin's `onChange` writes the resolved `{webHost, webPort, trustedHosts}` to that path.
3. The desktop's `main.ts` reads that JSON (it is plain JSON, no YAML dependency in the Electron render path) on the next spawn and passes the values to `dsh web`.

A standalone `dsh web` (no `DSH_DESKTOP_*` env) shows the settings card but writes nothing; only the Electron shell feeds the file the desktop reads.

## Behavior notes

- A settings change takes effect on the **next** host spawn; the plugin intentionally does not restart the running host (that would tear down the session you are editing in). Restart the app (or trigger a host respawn) to apply.
- The schema and validate hook keep `webHost` loopback-only, matching the harness's safety decision.
- The env-seeded base honors the same validation: a non-loopback `DSH_DESKTOP_WEB_HOST`, a non-numeric or out-of-range `DSH_DESKTOP_WEB_PORT` (any integer `0..65535` is valid, including `3080`), and empty trusted entries are ignored per field. The desktop shell publishes these vars from its resolved config, so an invalid value here only falls back to its default.
- The user settings section (settings.yaml) always wins over the env-seeded base after a save, so editing the card and saving still lands exactly where the previous behavior put it.

## Development

Typecheck and build with the package's own tsconfig; the package is a host row in the `dsh-web-app` bundle.

## Model Experience

None, as the plugin is a settings-card bridge: it resolves and writes host bind flags to a JSON handoff file and registers no prompt, tool, or schema.

#### KV Cache effect

None. The plugin resolves and writes host configuration only; it issues no model request, so it contributes no prompt or KV-cache state.

## Known Limitations and Deferred Work

- **No feedback from the spawn** — the plugin never learns whether the shell applied the written values (or whether the spawn rejected them); the card stays a fire-and-forget write.
- **The Electron reader (`apps/desktop`) lives outside this package** — the JSON handoff has a consumer only under the Electron shell; nothing in this repository closes that loop.
