# Desktop App Port (`apps/desktop`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sustainable `@deepseek-ai/dsh-desktop` Electron app to this repository that packages a standalone macOS `.app`, resident in the tray, without depending on the system Node.

**Architecture:** A thin Electron shell supervises the repository's own `dsh web` Host on a loopback OS-assigned port (`--port 0`), reads its readiness URL, and renders it in a hardened `BrowserWindow`. When packaged, the Host's full dependency closure is materialized by `stage-runtime.ts` into `Runtime/host/` (via `ELECTRON_RUN_AS_NODE=1`) so the app carries its own Node. Tray owns application lifetime; the host supervisor owns the dsh process; explicit quit tears down the Host then releases `app.quit`.

**Tech Stack:** Electron 43, electron-builder 26, tsdown, TypeScript, vitest, pnpm workspace, Node 24 LTS.

**Source (port baseline):** [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) (MIT). Raw files are fetched with `curl` from `https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/<path>`.

## Global Constraints

- Repository Node engine `^22.19 || >=24` — install and use Node 24 LTS before building (`~/nodejs/.../22.12` is too old).
- Root `build` MUST append `&& build:desktop`.
- New workspace package `apps/desktop` named `@deepseek-ai/dsh-desktop`; private.
- `appId: ai.deepseek.harness.desktop`; `productName: DeepSeek Harness`.
- macOS `mac` target stays `dir` this round (unsigned local `.app`); `win`/`linux` scaffolded with `target: dir`, not verified.
- `runtime-host/` (generated deploy target) and `apps/desktop/dist/` and `apps/desktop/node_modules/` are gitignored.
- All `docs/**` Markdown and READMEs must satisfy `verify-md-wrap` (one physical line per paragraph) and `verify-md-links`.
- DEDUPE: `verify-runtime-closure` (root script) already exists; the ported `main.ts` and scripts reference it. Do NOT re-create it.
- Markdown fenced `ts` blocks must compile under `doc-typecheck`; the ported source files already pass the reference repo's gates.

---

### Task 1: Upgrade Node to 24 LTS

**Files:**
- Modify: `~/.zshrc` (the `# Node.js` export PATH line points at `$HOME/nodejs/node-v22.12.0-darwin-arm64/bin`)
- Create: `scripts/node-version-check.mjs` (optional helper, not required by CI)

**Interfaces:**
- Consumes: nothing.
- Produces: a `node` on PATH reporting `v24.x` and `<space>@deepseek-ai/dsh` / `electron-builder` resolvable from it.

- [ ] **Step 1: Install Node 24 LTS via nvm**

Run:
```sh
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
```
If `nvm` is not installed, install it:
```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 24 && nvm alias default 24
```
Expected: `nvm install 24` prints `Now using node v24.x.x (npm ...)`.

- [ ] **Step 2: Verify node and npm versions**

Run: `node -v && npm -v`

Expected: `v24.x.x` and an npm version ≥ 10.

- [ ] **Step 3: Re-point the shell's Node PATH (optional; keeps the old layout)**

Edit `~/.zshrc`, replacing the resolved absolute-node line so a fresh terminal uses 24 (the nvm default line already wins first, so this is belt-and-suspenders for LaunchAgent-style minimal shells). Update the line:
```sh
export PATH="$HOME/nodejs/node-v22.12.0-darwin-arm64/bin:$PATH"
```
to point at the new nvm-linked node:
```sh
export PATH="$HOME/.nvm/versions/node/$(cat "$NVM_DIR/alias/default")/bin:$PATH"
```
Expected: `source ~/.zshrc && node -v` reports `v24.x.x`.

- [ ] **Step 4: Reinstall/hoist workspace tooling under Node 24**

Run (repo root):
```sh
corepack enable
pnpm --version
node --version
```
Expected: `pnpm` reports `11.7.0` (packageManager field) and `node` reports `v24.x.x`.

Commit any tooling change. If nothing changed in the repo, record the explicit outcome "toolchain now on Node 24" and continue.

- [ ] **Step 5: Commit this toolchain change if any repo file changed**

```bash
git add -A pnpm-lock.yaml package.json 2>/dev/null || true
git commit -m "chore: move toolchain to Node 24 LTS" 2>/dev/null || echo "no repo files changed; toolchain is environment-only"
```

---

### Task 2: Scaffold the `apps/desktop` package (package.json, tsconfig, tsdown)

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsdown.config.ts`
- Create: `apps/desktop/README.md`
- Create: `apps/desktop/README.zh.md`
- Create: `apps/desktop/resources/trayTemplate.png`, `apps/desktop/resources/trayTemplate@2x.png`
- Create: `apps/desktop/build/icon.png`
- Create: `apps/desktop/.gitignore` (and append to root `.gitignore` for `runtime-host/`)

**Interfaces:**
- Consumes: reference baseline files (fetched).
- Produces: a package whose `pnpm --filter @deepseek-ai/dsh-desktop run build` type-checks and bundles `lib/main.js` (still referencing not-yet-created `src/`; this task writes the transport files first where possible).

- [ ] **Step 1: Create the desktop package manifest**

Write `apps/desktop/package.json`:
```json
{
  "name": "@deepseek-ai/dsh-desktop",
  "description": "DeepSeek Harness desktop application with tray-owned Host lifecycle",
  "version": "0.1.0-rc.5",
  "private": true,
  "type": "module",
  "main": "lib/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tests/tsconfig.json",
    "dev": "pnpm --workspace-root run build && electron .",
    "package": "pnpm --workspace-root run build && node --import tsx scripts/stage-runtime.ts && electron-builder --dir",
    "dist": "pnpm --workspace-root run build && node --import tsx scripts/stage-runtime.ts && electron-builder",
    "dist:mac": "node --import tsx scripts/release-mac.ts"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.20.0",
    "electron": "43.4.0",
    "electron-builder": "26.15.3",
    "tsdown": "^0.22.2",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  },
  "build": {
    "appId": "ai.deepseek.harness.desktop",
    "productName": "DeepSeek Harness",
    "electronDist": "node_modules/electron/dist",
    "afterPack": "./scripts/verify-packaged-runtime.ts",
    "asar": true,
    "files": [
      "lib/**",
      "package.json"
    ],
    "extraResources": [
      { "from": "resources", "to": "desktop-resources" },
      { "from": "runtime-host/package.json", "to": "host/package.json" },
      { "from": "runtime-host/node_modules", "to": "host/node_modules" }
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "hardenedRuntime": true,
      "icon": "build/icon.png",
      "target": ["dir"]
    },
    "win": { "icon": "build/icon.png", "target": ["dir"] },
    "linux": { "category": "Development", "target": ["dir"] }
  }
}
```

- [ ] **Step 2: Install the desktop package toolchain**

Run (repo root so the workspace installs `electron`/`electron-builder`):
```sh
pnpm install
```
Expected: resolves into the pnpm workspace; `apps/desktop/node_modules/.bin/electron` and `.bin/electron-builder` exist.

- [ ] **Step 3: Create tsconfig.json**

Write `apps/desktop/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/types",
    "types": ["node", "electron"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create tsdown.config.ts**

Write `apps/desktop/tsdown.config.ts`:
```ts
import { defineConfig } from 'tsdown'

/** Bundle the Electron main entry while preserving Electron as a runtime builtin. */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: { neverBundle: ['electron'] },
})
```

- [ ] **Step 5: Fetch the resources (icon + tray templates)**

Run:
```sh
BASE=https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop
mkdir -p apps/desktop/resources apps/desktop/build
curl -fsSL "$BASE/resources/trayTemplate.png"     -o apps/desktop/resources/trayTemplate.png
curl -fsSL "$BASE/resources/trayTemplate@2x.png"  -o apps/desktop/resources/trayTemplate@2x.png
curl -fsSL "$BASE/build/icon.png"                 -o apps/desktop/build/icon.png
```
Expected: three files downloaded (verify sizes are non-zero; e.g. `file apps/desktop/build/icon.png` prints `PNG image data`).

Note: `icon.png` is a tracked 1024×1024 source; do not generate `.icns` (electron-builder converts).

- [ ] **Step 6: Write the desktop README (single-line paragraphs)**

Write `apps/desktop/README.md`:
````markdown
# DeepSeek Harness Desktop

The desktop app supervises the existing loopback Web Host and keeps it alive from the system tray when its window is closed.

## Development

Install dependencies, then use the single desktop development command; it builds the Host and client packages, Web frontend, and Electron main process before launching:

```sh
pnpm run dev:desktop
```

Closing the window hides it. Use the tray menu to restore the window or quit. Explicit quit waits for the Host process to stop and escalates termination after the bounded Host grace period.

## Packaging

```sh
pnpm run package:desktop
```

Packaged applications run the staged `@deepseek-ai/dsh` CLI in a separate process through Electron's Node mode, retaining the supervised-Host lifecycle without shipping a second Node. macOS auto-start is available by adding the app to System Settings > Login Items.

## Signed macOS DMG

The `dist:mac:desktop` command requires a valid `Developer ID Application` identity and one complete notarization credential source. See the spec for credential details.
````
Write `apps/desktop/README.zh.md` mirroring the above (Chinese), each paragraph on one physical line.

- [ ] **Step 7: Gitignore generated/staging artifacts**

Append to root `.gitignore`:
```
apps/desktop/runtime-host/
apps/desktop/dist/
apps/desktop/node_modules/
```
Expected: `git check-ignore apps/desktop/runtime-host` returns the pattern.

- [ ] **Step 8: Verify the package manifests resolve**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec electron --version`

Expected: prints the Electron version (e.g. `v43.4.0`).

_(Do not run `build` yet — `src/` does not exist until Task 3.)_

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/tsdown.config.ts apps/desktop/README.md apps/desktop/README.zh.md apps/desktop/resources apps/desktop/build .gitignore
git commit -m "feat(desktop): scaffold @deepseek-ai/dsh-desktop package"
```

---

### Task 3: Port `host-supervisor.ts` and `window-lifecycle.ts` plus their tests

**Files:**
- Create: `apps/desktop/src/host-supervisor.ts`
- Create: `apps/desktop/src/window-lifecycle.ts`
- Create: `apps/desktop/tests/tsconfig.json`
- Create: `apps/desktop/tests/host-supervisor.spec.ts`
- Create: `apps/desktop/tests/window-lifecycle.spec.ts`

**Interfaces:**
- Consumes: nothing (pure TS, no Electron).
- Produces:
  - `createReadinessParser(): { push(chunk: string): string | undefined; finalize(): string }`
  - `createHostSupervisor(options: HostSupervisorOptions): { start(): Promise<string>; shutdown(): Promise<void> }`
  - `spawnDshWeb(options: SpawnDshWebOptions): HostChild`
  - `createDesktopLifecycle(options: DesktopLifecycleOptions): { isQuitting: boolean; pendingQuit: Promise<void> | undefined; onWindowClose(e): void; showWindow(): Promise<void>; requestQuit(): Promise<void> }`

- [ ] **Step 1: Port `host-supervisor.ts`**

Copy the reference file verbatim:
```sh
curl -fsSL https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/src/host-supervisor.ts -o apps/desktop/src/host-supervisor.ts
```
Expected: file contains `createReadinessParser`, `createHostSupervisor`, `spawnDshWeb`, `nodeChildAdapter`, `parseReadinessLine`.

Adaptation: none needed; it imports only `node:child_process` and `node:stream`.

- [ ] **Step 2: Port `window-lifecycle.ts`**

```sh
curl -fsSL https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/src/window-lifecycle.ts -o apps/desktop/src/window-lifecycle.ts
```
Expected: file exports `createDesktopLifecycle` and the `DesktopLifecycleOptions`/`DesktopWindow`/`WindowCloseEvent` interfaces.

- [ ] **Step 3: Create the tests tsconfig**

Write `apps/desktop/tests/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "../lib/types/tests",
    "types": ["node", "vitest"]
  },
  "include": ["./*.spec.ts"]
}
```

- [ ] **Step 4: Write `host-supervisor.spec.ts`**

Write `apps/desktop/tests/host-supervisor.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createReadinessParser } from '../src/host-supervisor.ts'

const line = 'dsh web: http://127.0.0.1:51876/\n'

describe('createReadinessParser', () => {
  it('extracts the readiness URL across chunk boundaries', () => {
    const parser = createReadinessParser()
    expect(parser.push(line.slice(0, 10))).toBeUndefined()
    expect(parser.push(line.slice(10))).toBe('http://127.0.0.1:51876')
  })

  it('rejects a non-loopback address', () => {
    const parser = createReadinessParser()
    expect(() => {
      parser.push('dsh web: http://0.0.0.0:51876/\n')
      parser.finalize()
    }).toThrow()
  })

  it('finalize() requires a readiness line', () => {
    expect(() => createReadinessParser().finalize()).toThrow()
  })
})
```

- [ ] **Step 5: Write `window-lifecycle.spec.ts`**

Write `apps/desktop/tests/window-lifecycle.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createDesktopLifecycle, type DesktopWindow } from '../src/window-lifecycle.ts'

function fakeWindow(overrides: Partial<DesktopWindow> = {}): DesktopWindow {
  return { isDestroyed: () => false, isVisible: () => true, show: () => {}, focus: () => {}, hide: () => {}, ...overrides }
}

const noopQuit = () => { type _unused = typeof noopQuit; void _unused }

describe('createDesktopLifecycle', () => {
  it('hides the window on close when not quitting', () => {
    const win = fakeWindow()
    const hides: string[] = []
    win.hide = () => { hides.push('hide') }
    const lifecycle = createDesktopLifecycle({
      getWindow: () => win,
      createWindow: async () => win,
      disposeHost: async () => {},
      quit: noopQuit,
    })
    let prevented = false
    lifecycle.onWindowClose({ preventDefault: () => { prevented = true } })
    expect(prevented).toBe(true)
    expect(hides).toEqual(['hide'])
  })

  it('quits after disposing the host once', async () => {
    let disposed = 0
    let quitCalled = 0
    const lifecycle = createDesktopLifecycle({
      getWindow: () => undefined,
      createWindow: async () => fakeWindow(),
      disposeHost: async () => { disposed++ },
      quit: () => { quitCalled++ },
    })
    await Promise.all([lifecycle.requestQuit(), lifecycle.requestQuit()])
    expect(disposed).toBe(1)
    expect(quitCalled).toBe(1)
  })
})
```

- [ ] **Step 6: Run the new tests**

Run:
```sh
pnpm --filter @deepseek-ai/dsh-desktop exec vitest run tests
```
Expected: both spec files pass (readiness extraction, non-loopback rejection, finalize-requires-line, hide-on-close, single quit).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src apps/desktop/tests
git commit -m "feat(desktop): port Host supervisor and window lifecycle with tests"
```

---

### Task 4: Port `main.ts` (Electron shell) with repo path adaptation

**Files:**
- Create: `apps/desktop/src/main.ts`

**Interfaces:**
- Consumes: `createHostSupervisor`, `spawnDshWeb` (Task 3), `createDesktopLifecycle` (Task 3).
- Produces: the Electron main entry bundled to `lib/main.js`; expects the Web Host readiness line `dsh web: http://127.0.0.1:<port>/`.

- [ ] **Step 1: Fetch the reference `main.ts`**

```sh
curl -fsSL https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/src/main.ts -o apps/desktop/src/main.ts
```
Expected: file contains `hostPaths`, `createMainWindow`, `createTray`, `requestAppQuit`, `boot`, single-instance lock, `app.whenReady().then(boot)`.

- [ ] **Step 2: Verify the two path contracts against this repo**

The reference uses `cliEntry: join(REPOSITORY_ROOT, 'apps/cli/lib/bin.js')` for dev, `join(process.resourcesPath, 'host/node_modules/@deepseek-ai/dsh/lib/bin.js')` for packaged, `REPOSITORY_ROOT = resolve(DESKTOP_DIR, '../..')`, and spawns `dsh web --host 127.0.0.1 --port 0`.

Confirm each holds in this repo:
- `apps/cli/package.json` `bin.dsh === 'lib/bin.js'` (already verified in repo). ✓
- The `dsh cli` `web` profile accepts `--host`/`--port` app args (the CLI forwards launcher-unknown tokens to the app). ✓ (matches reference).

No edit needed. If any contract differs, edit the single constant in `main.ts` accordingly and note the diff in the commit message.

- [ ] **Step 3: Typecheck the desktop package**

Run:
```sh
pnpm --filter @deepseek-ai/dsh-desktop run build
```
Expected: `tsc` emits `lib/types/main.js` and tsdown bundles `lib/main.js`. No type errors from `src/`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main.ts
git commit -m "feat(desktop): port Electron main shell"
```

---

### Task 5: Runtime host manifest and staging + packaging scripts

**Files:**
- Create: `apps/desktop/runtime/package.json` (`@deepseek-ai/dsh-desktop-runtime`)
- Create: `apps/desktop/scripts/stage-runtime.ts`
- Create: `apps/desktop/scripts/verify-packaged-runtime.ts`
- Create: `apps/desktop/scripts/release-preflight.ts`
- Create: `apps/desktop/scripts/release-mac.ts`

**Interfaces:**
- Consumes: root `scripts/verify-runtime-closure.ts` (exists), `runtime/package.json` manifest.
- Produces: `apps/desktop/runtime-host/` staged closure consumed by electron-builder `extraResources`.

- [ ] **Step 1: Port the runtime manifest**

```sh
curl -fsSL https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/runtime/package.json -o apps/desktop/runtime/package.json
```
Expected: package `name` is `@deepseek-ai/dsh-desktop-runtime`, private, `type: module`, with the full `@deepseek-ai/*` `workspace:^` dependency list.

- [ ] **Step 2: Port `stage-runtime.ts`**

```sh
curl -fsSL https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/scripts/stage-runtime.ts -o apps/desktop/scripts/stage-runtime.ts
```
Expected: contains `deploy()`, `restoreLegacyHoists()`, `materializeLinks()`, `main()` deleting+staging to `apps/desktop/runtime-host`, invoking `scripts/verify-runtime-closure.ts` and checking the `@deepseek-ai/dsh/lib/bin.js` + `dsh-web-frontend/dist/index.html` entries.

Adaptation: confirm the two staged entry constants match local build outputs (`@deepseek-ai/dsh/lib/bin.js` and `@deepseek-ai/dsh-web-frontend/dist/index.html`). Both are produced by root `build:lib` + `build:web`. No edit expected.

- [ ] **Step 3: Port the packaging scripts**

```sh
BASE=https://raw.githubusercontent.com/anywhere-labs/deepseek-harness-desktop/master/apps/desktop/scripts
curl -fsSL "$BASE/verify-packaged-runtime.ts" -o apps/desktop/scripts/verify-packaged-runtime.ts
curl -fsSL "$BASE/release-preflight.ts"       -o apps/desktop/scripts/release-preflight.ts
curl -fsSL "$BASE/release-mac.ts"             -o apps/desktop/scripts/release-mac.ts
```
Expected: three files present; `release-mac.ts` self-invokes only when run directly; `verify-packaged-runtime.ts` exports the default `afterPack` check.

- [ ] **Step 4: Typecheck the whole desktop package**

Run: `pnpm --filter @deepseek-ai/dsh-desktop run typecheck`

Expected: passes (`tsc` over `src/` and `tests/`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/runtime/package.json apps/desktop/scripts
git commit -m "feat(desktop): add runtime manifest and staging/packaging scripts"
```

---

### Task 6: Wire desktop commands into the root `package.json` and default build

**Files:**
- Modify: `package.json` (root scripts)
- Modify: `apps/cli/tests` if the `npm-public` release gate flags the new package (only if demanded by gates)

**Interfaces:**
- Consumes: nothing new.
- Produces: root commands `build:desktop`, `package:desktop`, `dist:desktop`, `dist:mac:desktop`, `dev:desktop`; `build` now includes `build:desktop`.

- [ ] **Step 1: Add desktop scripts to root package.json**

In `package.json` `scripts`, change:
```json
"build": "npm run build:lib && npm run build:web",
```
to:
```json
"build": "npm run build:lib && npm run build:web && npm run build:desktop",
```
and add under `scripts`:
```json
"build:desktop": "pnpm --filter @deepseek-ai/dsh-desktop run build",
"dev:desktop": "pnpm --filter @deepseek-ai/dsh-desktop run dev",
"package:desktop": "pnpm --filter @deepseek-ai/dsh-desktop run package",
"dist:desktop": "pnpm --filter @deepseek-ai/dsh-desktop run dist",
"dist:mac:desktop": "pnpm --filter @deepseek-ai/dsh-desktop run dist:mac",
```

- [ ] **Step 2: Confirm workspace membership**

Verify `pnpm-workspace.yaml` includes `apps/*` (so `apps/desktop` is a workspace member):
```sh
grep -n "apps/\*" pnpm-workspace.yaml
```
Expected: a match. If absent, add `apps/*`.

- [ ] **Step 3: Update root README to mention the desktop app**

Add a short line to the relevant README section (one physical line per paragraph), e.g. under the appropriate "运行"/"Run" subsection:

`The desktop application (`apps/desktop`) packages the Web Host as a native macOS app resident in the tray.`

Mirror in `README.zh.md`.

- [ ] **Step 4: Full build + desktop typecheck**

Run: `pnpm run build`

Expected: `build:lib`, `build:web`, and `build:desktop` all succeed; `apps/desktop/lib/main.js` exists.

- [ ] **Step 5: Run repo gates relevant to the change**

Run:
```sh
node --import tsx scripts/verify-md-wrap.ts
node --import tsx scripts/verify-md-links.ts
pnpm run typecheck
```
Expected: all pass (no hard-wrapped prose; links resolve; desktop typechecks).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml README.md README.zh.md
git commit -m "build(desktop): wire desktop build/dev/package/dist commands into root"
```

---

### Task 7: Package and smoke-test the macOS `.app`

**Files:**
- Test artifact: `apps/desktop/dist/mac*/DeepSeek Harness.app` (gitignored)

**Interfaces:**
- Consumes: Tasks 2–6 complete.
- Produces: a runnable unsigned `.app` proving the packaged Host launches from Electron's bundled Node.

- [ ] **Step 1: Ensure web frontend is built (required for staging)**

Run: `pnpm run build:web`

Expected: `apps/web/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html` exists (root `build:web` produced it).

- [ ] **Step 2: Stage the runtime closure**

Run:
```sh
pnpm --filter @deepseek-ai/dsh-desktop exec node --import tsx scripts/stage-runtime.ts
```
Expected: stdout prints `desktop runtime staged at apps/desktop/runtime-host`; verify `apps/desktop/runtime-host/node_modules/@deepseek-ai/dsh/lib/bin.js` and `.../dsh-web-frontend/dist/index.html` exist.

- [ ] **Step 3: Package the app**

Run: `pnpm run package:desktop` (or `pnpm --filter @deepseek-ai/dsh-desktop run package`)

Expected: electron-builder produces `apps/desktop/dist/mac-arm64/DeepSeek Harness.app` (or `dist/mac/...` on the platform), and the `afterPack` verify passes (no "Host entry missing" error).

- [ ] **Step 4: Verify the packaged Host files are embedded**

Run:
```sh
test -f "apps/desktop/dist/mac-arm64/DeepSeek Harness.app/Contents/Resources/host/node_modules/@deepseek-ai/dsh/lib/bin.js" && echo OK-host
test -f "apps/desktop/dist/mac-arm64/DeepSeek Harness.app/Contents/Resources/host/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html" && echo OK-frontend
```
Expected: both `OK` lines.

- [ ] **Step 5: Code-sign ad-hoc so the sandbox can run it**

Run:
```sh
codesign --force --deep --sign - "apps/desktop/dist/mac-arm64/DeepSeek Harness.app"
```
Expected: exits 0.

- [ ] **Step 6: Launch and smoke-test the app**

Run:
```sh
open "apps/desktop/dist/mac-arm64/DeepSeek Harness.app"
sleep 12
launchctl print "gui/$(id -u)/ai.deepseek.harness.desktop" 2>/dev/null | grep -E "state|pid" | head
```
Expected: the process is running; the tray icon appears. Human check: closing the window leaves the tray icon resident; the Host stays up.

_(The full `launchctl print` label may differ; alternatively confirm via `pgrep -fl 'DeepSeek Harness'`.)_

- [ ] **Step 7: Quit via tray and confirm clean teardown**

Click the tray "退出" (Quit) or send `SIGTERM` to the Electron main process; confirm no orphaned `dsh web` node process from `process.resourcesPath` remains:
```sh
pgrep -fl "host/node_modules/@deepseek-ai/dsh/lib/bin.js"
```
Expected: empty.

- [ ] **Step 8: Document the smoke result**

Leave the app open in the tray (background residence) or quit it at the user's discretion. No commit required unless a fix was needed this task.

---

### Task 8: Agent Note + final verification

**Files:**
- Create: `.agents/notes/implemented/architecture/2026-08-14-desktop-app-port.md` (or a `feature/` note per repo conventions)

**Interfaces:**
- Consumes: the shipped desktop package.
- Produces: a decision record satisfying the repo "every non-trivial change has an Agent Note" rule.

- [ ] **Step 1: Write the Agent Note**

Write `.agents/notes/implemented/architecture/2026-08-14-desktop-app-port.md` describing: the Electron-shell-plus-supervised-Host approach, the `ELECTRON_RUN_AS_NODE` packaged runtime, tray-owned lifetime, `--port 0` loopback readiness contract, and the `runtime-host` staged-closure packaging. Follow the note's format template in `.agents/notes/README.md`. Keep one physical line per paragraph.

- [ ] **Step 2: Run the full repo checks that touch this surface**

Run:
```sh
pnpm run build
pnpm run typecheck
node --import tsx scripts/verify-md-wrap.ts
node --import tsx scripts/verify-md-links.ts
```
Expected: all green.

- [ ] **Step 3: Review final diff for unintended files**

Run: `git status --short`

Expected: only intended files (package metadata, `apps/desktop/**`, root scripts, docs, Agent Note) are present; `apps/desktop/runtime-host/`, `dist/`, and `node_modules/` are gitignored.

- [ ] **Step 4: Commit the Agent Note**

```bash
git add .agents/notes/implemented/architecture/2026-08-14-desktop-app-port.md
git commit -m "docs: record desktop app port decision note"
```

- [ ] **Step 5: Final acceptance**

Confirm against the spec: `apps/desktop` exists; `build:desktop` runs in root `build`; `package:desktop` yields a `.app`; window/tray/quit behavior verified; Node is on 24; docs updated. Report any deviation.

---

## Self-Review

**Spec coverage:** Objective → Task 1 (Node 24) + Task 7 (package proves independence from system Node). Architecture (Electron shell + supervised Host + tray) → Tasks 3–4. Repository/build infra → Tasks 2, 6. Icons/resources → Task 2. Tests → Tasks 3. Docs → Tasks 2, 6, 8. Delivery verification (build → package → launch → login item) → Tasks 6–7. Out-of-scope items (Win/Linux verification, signed DMG, in-app autostart toggle, LaunchAgent fallback, brand icon) → intentionally excluded; no task contradicts them.

**Placeholder scan:** every step has exact commands, expected output, or complete code. Long reference files are fetched verbatim via `curl` in the step, not hand-transcribed, so no "copy similar to" placeholders.

**Type consistency:** `createReadinessParser` returns `{push, finalize}` used by `spawnDshWeb`; `createHostSupervisor`'s `{start, shutdown}` feed `main.ts`; `createDesktopLifecycle`'s `{isQuitting, pendingQuit, onWindowClose, showWindow, requestQuit}` match `main.ts` call sites and `main.ts` passes the exact resolver options. The `hostPaths()` dev/packaged cliEntry paths match `@deepseek-ai/dsh`'s `bin.dsh = 'lib/bin.js'`.
