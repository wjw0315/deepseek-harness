# Agent Note: Desktop app ports the Web Host with a tray-owned Electron shell

Status: implemented

## Problem

The DeepSeek Harness GUI is a loopback web application: a `dsh web` Host serves the Web frontend over HTTP on `127.0.0.1`, and users reach it in a browser. Shipping the harness as a double-click macOS desktop app requires a native shell that hosts that loopback GUI and a runtime that does not depend on the user installing Node; a window that closes should keep the harness alive, and the host process must not leak when the user quits for real.

## Decision

The desktop application at `apps/desktop` is an Electron shell that supervises the unchanged `dsh web` Host as a child process. `Electron`'s main entry (`src/main.ts`) creates a `HostSupervisor` (`src/host-supervisor.ts`), which `spawn`s the built `@deepseek-ai/dsh` CLI as `web --host 127.0.0.1 --port 0 --expose-internals` and owns its lifecycle: it coalesces concurrent `start`/`shutdown` calls, fails startup on a readiness timeout (default 90 s), escalates shutdown from `SIGTERM` to `SIGKILL` after a bounded grace (default 5 s), and, on a ready Host exiting outside an application-owned shutdown, requests application quit. The shell window is a `BrowserWindow` loading the Host's loopback URL, so the entire product surface — client, API gateway, LLM providers, tools — is the Web app already shipped, not a reimplementation.

The packaged app is independent of system Node. When packaged, `spawnDshWeb` selects `process.execPath` (the Electron executable) as the Node-compatible runtime and sets `ELECTRON_RUN_AS_NODE=1` in the child's environment, so Electron's bundled Node runs the embedded CLI as a plain Node process; in development it selects the `node` binary from `PATH` and does not set that variable. No second Node runtime is shipped. The Host entry resolves to `process.resourcesPath/host/node_modules/@deepseek-ai/dsh/lib/bin.js` when packaged and to the checkout `apps/cli/lib/bin.js` in development.

Application lifetime is owned by the tray, not the window. Closing the window hides it (`window-lifecycle.ts` prevents the close and hides the `BrowserWindow`, leaving its renderer and the Host connection alive); single-instance locking (`app.requestSingleInstanceLock`) makes a second launch focus the existing window; `window-all-closed` is a no-op. Explicit quit — the tray menu `退出`, a second instance while already running, or `Cmd+Q` / `before-quit` when the quit has not been released — routes through `requestQuit`, which sets `isQuitting`, disposes the Host once, and only then `app.quit()`. Teardown errors are reported instead of silently releasing quit.

Readiness is a single mutually-agreed line. `dsh web --host 127.0.0.1 --port 0` binds an OS-assigned loopback port and prints the canonical line `dsh web: http://127.0.0.1:<port>/`; `createReadinessParser` incrementally scans Host stdout for that line and validates the token as loopback HTTP with an explicit integer port before releasing the origin used to load the window. The supervisor rejects a Host that exits before emitting the line, that emits conflicting readiness URLs, or that takes longer than the startup budget.

Packaging stages a closed dependency closure. `apps/desktop/runtime/package.json` is `@deepseek-ai/dsh-desktop-runtime`, a dependency-only deploy root listing the workspace packages the packaged Host needs. `scripts/stage-runtime.ts` runs `pnpm deploy --legacy --prod` into `apps/desktop/runtime-host/node_modules`, restores legacy hoists and materializes workspace symlinks, then verifies the CLI entry and the Web frontend exist. electron-builder's `extraResources` copies that staged tree into the `.app` under `Contents/Resources/host/`, and the packaged shell locates the Host entry and frontend under `process.resourcesPath/host`. `scripts/verify-packaged-runtime.ts` runs as the `afterPack` hook to check the staged runtime in the built app.

The shell is hardened before any renderer loads. The `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`; the default session installs deny-all permission check and permission request handlers; `will-navigate` blocks navigation away from the Host origin and `setWindowOpenHandler` denies window creation, opening external HTTP(S) URLs in the default browser instead.

## Alternatives considered

- **Embed a second standalone Node or bundle a Node binary**: rejected — shipping Electron's own Node through `ELECTRON_RUN_AS_NODE=1` reuses an already-bundled runtime and keeps the closure single-source; adding a second Node doubles size and version skew without changing the supervised-Host model.
- **Package the Web frontend and API inline into the Electron main process**: rejected — the Host is a real subprocess with its own supervision and teardown; inlining would bypass the established `dsh web` deploy path and its loopback contract.
- **Window-owned lifetime (quit on window close)**: rejected — closing hides instead, so the harness keeps running behind a tray icon, matching a desktop-app expectation and avoiding slow per-open Host restarts.
- **A fixed well-known loopback port**: rejected — `--port 0` delegates port selection to the OS and the readiness line supplies the actual origin, avoiding collisions when a port is already taken.

## Consequences

- The desktop app reuses the entire loopback Web product with zero reimplementation; the same Host the browser serves is the one the shell supervises.
- The packaged `.app` needs no system Node, making the harness double-click-runnable; the trade-off is carrying the Electron runtime and the staged `host` closure inside the bundle.
- Closing the window keeps the Host alive; quit is explicit and orderly, with the Host guaranteed torn down before the process exits rather than abandoned.
- Security hardening is applied at the shell: a sandboxed renderer, deny-all permissions, and a navigation fence confine the window to the Host origin and route external links to the default browser.
- Packaging is a staged closure (`runtime` root → `runtime-host` → `extraResources` → `Contents/Resources/host`), so the Host's dependency set is pinned by the deploy-mechanism manifest and verified by an `afterPack` hook instead of being assembled implicitly.
