# DeepSeek Harness Desktop

English | [中文](README.zh.md)

The desktop app supervises the existing loopback Web Host and keeps it alive from the system tray when its window is closed.

## Development

Install dependencies, then use the single desktop development command; it builds the Host and client packages, Web frontend, and Electron main process before launching:

```sh
pnpm run dev:desktop
```

Closing the window hides it. Use the tray menu to restore the window or quit. Explicit quit waits for the Host process to stop and escalates termination after the bounded Host grace period.

### Host auto-restart

If the Web Host process exits unexpectedly (a crash, or a plugin — such as a third-party plugin market's "restart" — tearing the Host down under the supervisor), the app **auto-relaunches the Host and rebuilds the window**, so a plugin-prompted restart brings the application back instead of leaving it exited. The relaunch is bound: when a Host keeps exiting on every start, the app gives up and quits rather than looping. An explicit quit (tray → quit / Cmd+Q) still exits without auto-restart.

## Packaging

```sh
pnpm run package:desktop
```

Packaged applications run the staged `@deepseek-ai/dsh` CLI in a separate process through Electron's Node mode, retaining the supervised-Host lifecycle without shipping a second Node. macOS auto-start is available by adding the app to System Settings > Login Items.

### Unsigned DMG

`pnpm run package:desktop` builds the `.app` directory only; to produce a DMG run electron-builder directly from `apps/desktop`. Two prerequisites avoid packaging failures on flaky/offline networks: an unpacked Electron runtime outside `node_modules/electron/dist` (a reinstall may purge it), and a ready-made `build/icon.icns` so the CJS icon tool is not mis-run as ESM under this `"type": "module"` package.

```sh
cd apps/desktop
# 1) Provide the platform Electron runtime once. Extract it from the cached zip
#    into a stable copy if node_modules/electron/dist is missing:
#    mkdir -p .dsh-electron-dist && ditto -x -k ~/Library/Caches/electron/electron-v43.4.0-darwin-arm64.zip .dsh-electron-dist/
# 2) Provide a ready-made icns at build/icon.icns (skip the png-to-icns step):
#    the app icon as an icns; generate from build/icon.png or reuse a prior dist/.icon-icns/icon.icns.
# 3) Build the unsigned DMG:
CI=true CSC_IDENTITY_AUTO_DISCOVERY=false \
  pnpm exec electron-builder --mac dmg \
  --config.electronDist=./.dsh-electron-dist \
  --config.mac.icon=build/icon.icns
```

The unsigned DMG lands at `dist/DSH-desktop-0.1.0-rc.5-arm64.dmg` (verify with `hdiutil verify`). Use the signature-free build for local installs; release a signed, notarized DMG via `dist:mac:desktop`.

## Web Host runtime configuration

The desktop app launches the Web Host as `dsh web --host <host> --port <port> [--trusted-host <authority>...]`. The bind **host**, **port**, and **trusted domains** are configurable at runtime — restart the app to apply, no repackaging needed.

### Settings card (recommended)

The desktop mounts the [`@deepseek-ai/dsh-desktop-host-config`](../host/desktop-host-config/README.md) plugin, which registers a **桌面应用 Web Host** settings card in the GUI. The card is seeded from the values the shell actually spawned the host with (the desktop publishes them as `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` to the host process), so it shows the live `host:port` on first open instead of `不可用` or defaults. Edit `webHost` / `webPort` / `trustedHosts` there and save; the plugin writes them to a writable JSON config under Electron's `userData`, which the desktop reads on the next spawn. Restart the app to apply. Any port `0..65535` is valid — `3080` works like any other fixed port.

### Config file

The desktop reads a writable per-user config first, then the bundled default (the repo copy in development):

- `<userData>/desktop.config.json` — writable; the settings card writes here.
- `<app>/Contents/Resources/desktop-resources/desktop.config.json` — bundled defaults.

```json
{
  "comment": "...",
  "webHost": "127.0.0.1",
  "webPort": 51925,
  "trustedHosts": ["dsh.example.com"]
}
```

Fields:

| Field | Meaning | Default |
| --- | --- | --- |
| `webHost` | Loopback bind host the Web Host listens on. The harness rejects `0.0.0.0` (remote-code-execution exposure), so this stays loopback | `127.0.0.1` |
| `webPort` | Fixed loopback port the Web Host listens on. A tunnel / reverse proxy must forward here; `0` asks the OS to assign one | `0` |
| `trustedHosts` | Authorities admitted through the `/api` browser-trust fence (`host` or `host:port`, may be many). **Requests to `/api/*` from an unlisted public domain are rejected (HTTP 403 `forbidden`)**, while static pages such as `/` and `/m` are unaffected | `[]` |

> When using a custom domain through the Mobile remote control feature (`dsh-remote-web-ui`), add that domain to `trustedHosts`; otherwise the phone can open the mobile page but every `/api/*` call (e.g. `host.describe`) returns 403.

### Environment variables (highest priority)

After deployment, set environment variables instead of editing files:

```sh
launchctl setenv DSH_DESKTOP_WEB_HOST 127.0.0.1
launchctl setenv DSH_DESKTOP_WEB_PORT 51925
launchctl setenv DSH_DESKTOP_TRUSTED_HOSTS dsh.example.com
```

Then restart the app. To change domains, update `DSH_DESKTOP_TRUSTED_HOSTS` (comma-separated for multiple) and restart.

| Environment variable | Overrides |
| --- | --- |
| `DSH_DESKTOP_WEB_HOST` | `webHost` |
| `DSH_DESKTOP_WEB_PORT` | `webPort` |
| `DSH_DESKTOP_TRUSTED_HOSTS` | `trustedHosts` (comma-separated) |
## Signed macOS DMG

The `dist:mac:desktop` command requires a valid `Developer ID Application` identity and one complete notarization credential source. See the spec for credential details.
