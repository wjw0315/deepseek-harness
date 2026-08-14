# @deepseek-ai/dsh-desktop

Electron desktop shell for the DeepSeek Harness GUI. It launches the existing
`dsh --profile web` host as a child process and opens a native macOS window
pointed at the host's local URL, so the browser GUI runs as a desktop app
without a terminal.

## Why a host process?

The Web GUI is deliberately **not** a standalone frontend. `apps/web` is a
thin Vite build over the `@deepseek-ai/dsh-client-web` shell, and the shell
needs a live host to inject `window.__DSH_BOOT__` and to serve every backend
capability — the agent loop, LLM calls, tools, sessions, storage — over
`http://127.0.0.1:<port>`. `apps/web/vite.config.ts` even rejects
standalone `vite serve` on purpose (`rejectStandaloneServe`).

This shell reuses that host unchanged: it spawns `apps/cli/lib/bin.js
--profile web --port 0`, waits for the readiness line
`dsh web: http://127.0.0.1:<port>`, and loads that URL in a `BrowserWindow`.
Using `--port 0` avoids colliding with any browser-first `dsh web` already
bound on 3080.

## Architecture note: the "designed" Electron path

The repo's transport layer (`@deepseek-ai/dsh-client-connection`) is designed
so a future Electron app can load `dist` over `file://` and swap the
fetch carrier to an IPC bridge instead of the HTTP webserver — see
`packages/host/webserver` docs and the
`2026-07-19-gui-layering-and-rpc-protocol` Agent Note ("Electron does not
reuse the webserver"). That path avoids an HTTP server entirely but requires
implementing an IPC-fetch transport aspect that has not been built yet. This
shell takes the pragmatic route instead: keep the HTTP host, just wrap it in a
native window. It works today with zero transport surgery.

## Running

You need a built host and frontend first (from the repository root):

```sh
pnpm install
pnpm run build          # builds lib + web dist the shell depends on
pnpm --filter @deepseek-ai/dsh-desktop install
pnpm --filter @deepseek-ai/dsh-desktop start
```

`start` (`electron .`) compiles nothing itself — run `build` first. The
desktop package's `build` script checks that the host artifacts exist and
exits loudly with the right command if they do not.

## Packaging a macOS app

```sh
pnpm --filter @deepseek-ai/dsh-desktop package:dir   # .app only, fastest smoke
pnpm --filter @deepseek-ai/dsh-desktop package       # .app + .dmg + .zip
```

Output lands in `apps/desktop/release/`. The shell runs the host on
Electron's own bundled Node (`ELECTRON_RUN_AS_NODE=1`), so the product window
needs no separate Node binary.

### Self-contained host (implemented)

The .app is fully self-contained: it bundles the dsh host, its dependency
closure, the built frontend, and a portable Node 22 runtime, so it runs on any
machine with no repo, no pnpm store, and no system Node.

```
Contents/Resources/host/
  lib/bin.js         the dsh host entry (ESM)
  config/            shipped agent presets
  node_modules/      dependency closure (pnpm deploy --legacy + full hoist mirror)
  package.json       "type":"module" so the host loads as ESM
  runtime/node       portable Node 22.22.3 (dsh requires Node ^22.19)
  web-dist/          the built frontend (served by the host)
```

How it is built (`scripts/package-host.cjs`):
1. `pnpm deploy --filter @deepseek-ai/dsh --legacy` produces the base closure.
   pnpm resolves peer-only and link:/override packages against the deploying
   project rather than materializing them, so the closure initially misses
   packages the host's runtime graph reaches by bare specifier (e.g.
   `@deepseek-ai/cordis-plugin-group`, `@deepseek-ai/cosmokit`).
2. The script mirrors the repo's public hoist
   (`node_modules/.pnpm/node_modules/@deepseek-ai/*`) into the deploy's same
   hoist directory and re-creates missing top-level `node_modules/@deepseek-ai`
   symlinks, so every bare-specifier resolves under Node's walk-up rules.
3. A portable Node 22 binary is downloaded from the npmmirror mirror (GitHub
   releases are unreachable on restricted networks) into `runtime/node`. The
   host needs Node ^22.19; `ELECTRON_RUN_AS_NODE` (Electron's bundled Node 20)
   cannot run it, so the shell spawns the host with this binary, never Electron
   node mode.
4. electron-builder copies `host-dist/` + `apps/web/dist` into
   `Contents/Resources/host/`.

Verified end to end: the packaged `host/runtime/node host/lib/bin.js
--profile web --port 0` prints `dsh web: http://127.0.0.1:<port>`, serves
HTTP 200, and injects the `__DSH_BOOT__` manifest — using only files inside
the .app.

## Environment

- `DSH_HOST_BIN` — override the host entry the shell spawns (development
  affordance; defaults to `apps/cli/lib/bin.js`).
- Standard dsh env applies to the spawned host (`DSH_HOME`, `DEEPSEEK_API_KEY`,
  etc.); the shell forwards its own environment to the child.

## Structure

```
apps/desktop/
  src/main.ts        Electron main: spawn host, parse readiness URL, open window
  src/preload.ts     explicit no-op bridge (reserved for a future native seam)
  scripts/check-host.cjs  pre-build gate for required artifacts
  package.json       scripts + electron-builder config (extraResources host)
  tsconfig.json      standalone CJS compilation to dist/
```