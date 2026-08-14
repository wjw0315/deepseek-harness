# Desktop App Port — `apps/desktop` (macOS-first)

Date: 2026-08-14

Status: Approved (design review)

## Objective

Make DeepSeek Harness runnable as a native desktop application **built from this repository**, as a sustainable in-repo package (`apps/desktop`, `@deepseek-ai/dsh-desktop`), modeled on [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop). This delivers the user's original goal — launch like an app, auto-start at login, and keep running in the background — without depending on the system Node installation.

Decisions locked during brainstorming:
- Full port (Electron shell + Host supervision + packaging scripts), not a lighter shell-only subset.
- Sustainable in-repo package for future multi-platform release.
- macOS first: verify and ship a macOS `.app`; Windows/Linux electron-builder config is scaffolded but not verified this round.
- Root `build` includes `build:desktop`.
- Upgrade system Node to 24 LTS up front (required by the repo `^22.19 || >=24` engine and dsh rc.6; this also fixes the previously-broken `npx @deepseek-ai/dsh web` path).
- Auto-start uses the native macOS login item (documented), not a custom in-app toggle; no separate LaunchAgent/background-service fallback is built this round.
- Icons: use available placeholders (reference tray template images; app icon derived/placeholder), user replaces later.

## Architecture

The desktop app is a thin Electron shell that supervises the repository's own Web Host on a loopback port and presents it in a hardened `BrowserWindow`. When packaged, the Host's full dependency closure (`runtime-host`) is embedded under `Contents/Resources/host/` and run by Electron's bundled Node (`ELECTRON_RUN_AS_NODE=1`), so the packaged app is independent of any system Node.

Three cross-cutting ownerships keep the app "resident in background":
- **Tray owns application lifetime**: closing the window hides it; the tray and Host keep the app alive.
- **Host supervisor owns the dsh web process**: spawn, readiness, watchdog, graceful shutdown.
- **Explicit quit releases `app.quit`** only after the Host is torn down.

## Components

### 1. Repository / build infrastructure

New workspace package `apps/desktop` → `@deepseek-ai/dsh-desktop`.

Root `package.json` additions:
- `build` appends `&& build:desktop` (confirmed: include desktop in default full build).
- `build:desktop` → `pnpm --filter @deepseek-ai/dsh-desktop run build`.
- `package:desktop` → `pnpm --filter @deepseek-ai/dsh-desktop run package` (unsigned local `.app`).
- `dist:desktop` → `pnpm --filter @deepseek-ai/dsh-desktop run dist`.
- `dist:mac:desktop` → `pnpm --filter @deepseek-ai/dsh-desktop run dist:mac` (signed + notarized DMG; needs credentials).

Node prerequisite: install Node 24 LTS (via nvm) before building; required by repo engine `^22.19 || >=24` and by the `dev`/`build`/`package` scripts that invoke root `pnpm run build`.

### 2. Source files (`apps/desktop/src/`)

`host-supervisor.ts` (no Electron imports; unit-testable):
- `createReadinessParser()` / `parseReadinessLine()`: incrementally parse the Web Host readiness line `dsh web: http://127.0.0.1:<port>/`; require loopback HTTP with an explicit port; reject conflicting or malformed URLs.
- `createHostSupervisor()`: single-owner child-process lifecycle; coalesces concurrent start/shutdown; readiness timeout 90s → SIGTERM; shutdown SIGTERM then SIGKILL after 5s; `onUnexpectedExit` hook.
- `spawnDshWeb()`: `spawn(node, ['--expose-internals', cliEntry, 'web', '--host','127.0.0.1','--port','0'])` — OS-assigned loopback port, actual URL read from stdout.

`window-lifecycle.ts` (no Electron imports; unit-testable):
- `createDesktopLifecycle()`: window close → hide (not exit); explicit quit → release `quit`; coalesce concurrent quit/show.

`main.ts` (Electron main shell):
- Single-instance lock; `app.whenReady()` boot; dev mode resolves repository sources, packaged mode resolves `process.resourcesPath/host/...` (`hostPaths()`).
- 1440×920 window (macOS hidden title bar, sidebar vibrancy, traffic lights); hardened `webPreferences` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`).
- Session hardening: `setPermissionCheckHandler` / `setPermissionRequestHandler` both deny.
- Tray (template image) + menu (Open main window / Quit); tray click shows window.
- Navigation guard: `will-navigate` / `setWindowOpenHandler` allow only the Host origin; external http(s) opens in the system browser.
- Lifecycle: `window-all-closed` no-op; `before-quit` defers to `requestAppQuit()`.

### 3. Lifecycle / resident-background behavior

- Close window → hide; app lives in tray + Host.
- Single instance; a second launch focuses the main window.
- Quit sources (tray Quit / Cmd+Q / before-quit) → `requestAppQuit()` → graceful `host.shutdown()` → `app.quit()`.
- Unexpected Host exit (crash) → `onUnexpectedExit` → `requestAppQuit()` (no orphaned window).
- Auto-start is provided by the native macOS login item, documented in README.

### 4. Packaging: runtime host + electron-builder

`apps/desktop/runtime/package.json` (`@deepseek-ai/dsh-desktop-runtime`): dependency-only deploy root; `dependencies` list the Host closure (`@deepseek-ai/dsh`, `dsh-web-frontend`, full host-runtime plugin tree) as `workspace:^`. Not part of routine workspace build; only consumed by `stage-runtime.ts`.

`apps/desktop/scripts/stage-runtime.ts`: materializes the deployed Host closure to `apps/desktop/runtime-host/` before packaging — deploy, strip `.bin` links, dereference symlinks, ensure `dsh-web-frontend/dist/index.html` and `@deepseek-ai/dsh/lib/bin.js` exist. `runtime-host/` is a generated deploy target (gitignored), not checked in.

`apps/desktop/package.json` electron-builder `build`:
- `appId: ai.deepseek.harness.desktop`; `productName: DeepSeek Harness`; `asar: true`.
- `extraResources`: `resources/` → `desktop-resources/`; `runtime-host/package.json` → `host/package.json`; `runtime-host/node_modules` → `host/node_modules`.
- `files`: `lib/**` + `package.json`.
- `afterPack`: `scripts/verify-packaged-runtime.ts` — rejects if `host/node_modules/@deepseek-ai/dsh/lib/bin.js` or `dsh-web-frontend/dist/index.html` is absent.
- `mac`: `target: dir` (unsigned local `.app` this round); `hardenedRuntime: true`; `category: public.app-category.developer-tools`.
- `win`/`linux`: config scaffolded (`target: dir`, icons), not verified this round.
- `mac.notarize` and signing path reserved for `dist:mac:desktop`.

### 5. Icons and resources

- Tray template images `resources/trayTemplate.png` / `trayTemplate@2x.png` taken from reference (black-and-white, transparent-background template images).
- App icon: reference `build/icon.png` used as placeholder; repository `assets/` currently holds only community QR images and `apps/web/public/favicon.svg`, so no ready 1024 png exists.
- User replaces icon at will.

### 6. Tests, docs, delivery

- Vitest unit tests for `host-supervisor` (readiness parser, concurrent start/shutdown, exit fallback) and `window-lifecycle` (close/quit behavior), mirroring reference test style.
- `main.ts` smoke-tested via `pnpm run dev:desktop` (window + tray).
- `apps/desktop/README.md`: how to `dev` / `package` / `dist`; tray/resident/quit behavior; macOS login-item auto-start instructions; `dist:mac:desktop` credential requirements.
- Root README: note `apps/desktop`.

Delivery verification path:
1. Install Node 24 LTS.
2. `pnpm install && pnpm run build` (proves `build:desktop` compiles).
3. `pnpm run package:desktop` → unsigned `.app`.
4. Launch `.app`: window appears, tray present, close-window keeps app resident in tray, add to system login items.

## Out of scope (this round)

- Windows/Linux package verification (config only).
- Signed + notarized DMG (requires Apple Developer credentials).
- Custom in-app "auto-start at login" toggle.
- Separate LaunchAgent / background web service fallback.
- Real branding-quality app icon.
