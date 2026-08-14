#!/usr/bin/env node
/**
 * Assemble a consistent, relocatable dsh host into apps/desktop/host-dist.
 *
 * The Cordis host resolves its plugins by bare specifier at runtime from a
 * node_modules layout that (in this workspace) relies on RELATIVE symlinks in
 * node_modules/.pnpm/node_modules/@deepseek-ai -> ../../../../packages/<...> and
 * -> ../../../../vendor/<...>. Copying the repo's node_modules + packages +
 * vendor verbatim, symlink targets preserved, keeps that whole graph
 * relocatable: every package resolves to ONE cordis inside the copy, so
 * service identity stays consistent (this is the fix for the split-identity
 * "Cannot read properties of undefined (reading 'prepare')" failure).
 *
 * Layout:
 *   host-dist/node_modules     repo node_modules (symlinks preserved)
 *   host-dist/packages         repo packages (source the workspace symlinks point at)
 *   host-dist/vendor           repo vendor
 *   host-dist/apps/cli/lib     built dsh host entry (bin.js)
 *   host-dist/runtime/node     portable Node 22 binary
 *   host-dist/web-dist         built frontend (served by the host)
 *
 * Run: node scripts/package-host.cjs
 * @module dsh-desktop/package-host
 */

const { execFileSync } = require('node:child_process')
const { cpSync, existsSync, mkdirSync, rmSync, chmodSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

/**
 * Rewrite every symlink whose target is an absolute path under ROOT (the repo)
 * to a relative link inside HOST_DIR, so the closure is fully relocatable and
 * free of any checkout dependency. Targets that map to a host-dist path are
 * relativized; otherwise the link is replaced with a harmless stub.
 */
function rewriteLinks(hostDir, repoRoot) {
  const { readdirSync, lstatSync, readlinkSync, symlinkSync, existsSync } = require('node:fs')
  const { join, relative, dirname } = require('node:path')
  const links = []
  ;(function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      let st; try { st = lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) links.push(p)
      else if (st.isDirectory()) walk(p)
    }
  })(hostDir)
  for (const link of links) {
    const target = readlinkSync(link)
    if (!target.startsWith(repoRoot)) continue
    const mapped = hostDir + target.slice(repoRoot.length)
    const rel = relative(dirname(link), mapped)
    rmSync(link)
    if (existsSync(mapped)) {
      symlinkSync(rel, link)
    }
  }
  console.log('[dsh-desktop:host] rewritten ' + links.length + ' candidate symlinks (relocated to host)')
}


const ROOT = resolve(__dirname, '..', '..', '..')
const HOST_DIR = resolve(__dirname, '..', 'host-dist')

function fail(msg) {
  console.error('[dsh-desktop:host] ' + msg)
  process.exit(1)
}
function need(p, what) {
  if (!existsSync(p)) fail('missing ' + what + ': ' + p)
}

// Verify prerequisites.
need(join(ROOT, 'apps/web/dist/index.html'), 'frontend dist (run pnpm run build:web)')
need(join(ROOT, 'apps/cli/lib/bin.js'), 'built dsh host (run pnpm run build:lib)')
need(join(ROOT, 'node_modules'), 'repo node_modules (run pnpm install)')

rmSync(HOST_DIR, { recursive: true, force: true })
mkdirSync(HOST_DIR, { recursive: true })

// Symlink-preserving copies (cpSync default preserves symlinks; do NOT dereference,
// which would explode the store into 5GB and split cordis identity).
console.log('[dsh-desktop:host] copying repo node_modules (symlinks preserved)...')
cpSync(join(ROOT, 'node_modules'), join(HOST_DIR, 'node_modules'), { recursive: true })
console.log('[dsh-desktop:host] copying repo packages/...')
cpSync(join(ROOT, 'packages'), join(HOST_DIR, 'packages'), { recursive: true })
console.log('[dsh-desktop:host] copying repo vendor/...')
cpSync(join(ROOT, 'vendor'), join(HOST_DIR, 'vendor'), { recursive: true })

// Copy the ENTIRE apps/cli (lib + config + package.json AND its node_modules).
// pnpm's inject layout puts apps/cli/node_modules/@deepseek-ai/* as RELATIVE
// symlinks (../../../../packages/..., ../../../../vendor/...); copying the full
// apps/cli keeps those inject links, which is what makes bare-specifier plugin
// resolution work and stay relocatable. Copying only lib/ drops them and
// breaks "Cannot find package '@deepseek-ai/dsh-app-boot'".
cpSync(join(ROOT, 'apps/cli'), join(HOST_DIR, 'apps/cli'), { recursive: true })
// Remove any nested release/dist residue that is not needed at runtime.
rmSync(join(HOST_DIR, 'apps/cli/release'), { recursive: true, force: true })
rmSync(join(HOST_DIR, 'apps/cli/dist'), { recursive: true, force: true })

// Web frontend served by the host.
cpSync(join(ROOT, 'apps/web/dist'), join(HOST_DIR, 'web-dist'), { recursive: true })

// Portable Node 22 runtime.
const VERSION = process.env.DSH_HOST_NODE_VERSION || 'v22.22.3'
const url = process.env.DSH_NODE_MIRROR
  || 'https://cdn.npmmirror.com/binaries/node/' + VERSION + '/node-' + VERSION + '-darwin-arm64.tar.gz'
const tmp = join(require('node:os').tmpdir(), 'node-' + VERSION + '-dl')
const tar = tmp + '.tar.gz'
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const runtimeDir = join(HOST_DIR, 'runtime')
mkdirSync(runtimeDir, { recursive: true })
console.log('[dsh-desktop:host] downloading node runtime ' + VERSION + ' ...')
execFileSync('curl', ['-sL', '-o', tar, url])
execFileSync('tar', ['-xzf', tar, '-C', tmp])
const nodeBin = join(tmp, 'node-' + VERSION + '-darwin-arm64', 'bin', 'node')
if (!existsSync(nodeBin)) fail('node runtime tarball did not yield bin/node')
cpSync(nodeBin, join(runtimeDir, 'node'))
chmodSync(join(runtimeDir, 'node'), 0o755)
rmSync(tmp, { recursive: true, force: true })
rmSync(tar, { recursive: true, force: true })

// Bundle native/ (the @deepseek-ai/node-addon-landlock-run package resolves here
// and is statically imported by dsh-sandbox-local even on macOS).
cpSync(join(ROOT, 'native'), join(HOST_DIR, 'native'), { recursive: true })

// Minimal @deepseek-ai/dsh-web-frontend package: web-app's resolveDistIndex()
// requires it, but the real dist is served from web-dist/. Ship a tiny package
// whose ./dist/* exports point at the bundled web-dist copy.
mkdirSync(join(HOST_DIR, 'apps/web/dist'), { recursive: true })
cpSync(join(HOST_DIR, 'web-dist', '.'), join(HOST_DIR, 'apps/web/dist'), { recursive: true })
writeFileSync(join(HOST_DIR, 'apps/web/package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh-web-frontend',
  version: '0.1.0-rc.5',
  type: 'module',
  exports: { './dist/*': './dist/*', './package.json': './package.json' },
}, null, 2) + '\n')

// Neutralize flat-hoist links to non-runtime workspace trees that we do not
// bundle (examples/website/python). They are not imported by the web host.
for (const stub of ['./node_modules/.pnpm/node_modules/@deepseek-ai/website', './node_modules/.pnpm/node_modules/dsh-examples', './node_modules/.pnpm/node_modules/dsh-jsonrpc-agent-pkg']) {
  const p = join(HOST_DIR, stub)
  rmSync(p, { recursive: true, force: true })
  mkdirSync(p, { recursive: true })
}
// Drop self-referential desktop package link.
rmSync(join(HOST_DIR, 'node_modules/.pnpm/node_modules/@deepseek-ai/dsh-desktop'), { recursive: true, force: true })

// Rewrite any absolute repo-pointing symlinks to relative host-internal links.
rewriteLinks(HOST_DIR, ROOT)

console.log('[dsh-desktop:host] host assembled at', HOST_DIR)