/**
 * Pre-build check for dsh-desktop: verifies the artifacts the host needs exist.
 * The Electron shell is useless without a built dsh host (apps/cli/lib) and a
 * built frontend (apps/web/dist). Fail loudly with the exact build command
 * instead of spawning a broken host later.
 *
 * Run as: node scripts/check-host.cjs
 *
 * @module dsh-desktop/check-host
 */

const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..', '..', '..')
const required = [
  { label: 'dsh host entry', path: join(root, 'apps/cli/lib/bin.js'), hint: 'pnpm run build:lib' },
  { label: 'web frontend dist', path: join(root, 'apps/web/dist/index.html'), hint: 'pnpm run build:web' },
]

for (const { label, path, hint } of required) {
  if (!existsSync(path)) {
    console.error(`[dsh-desktop] missing ${label}: ${path}`)
    console.error(`  Build it first: ${hint}`)
    process.exit(1)
  }
}
console.log('[dsh-desktop] host artifacts present')