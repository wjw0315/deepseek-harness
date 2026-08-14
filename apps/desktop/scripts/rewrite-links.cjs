
const { readdirSync, lstatSync, readlinkSync, symlinkSync, rmSync, existsSync } = require('node:fs')
const { join, resolve, dirname, relative, sep } = require('node:path')

const REPO = process.env.DSH_REPO_ROOT
const HOST = process.env.DSH_HOST_DIR
if (!REPO || !HOST) { console.error('need DSH_REPO_ROOT and DSH_HOST_DIR'); process.exit(1) }

function walk(dir) {
  let items = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let st
    try { st = lstatSync(p) } catch { continue }
    if (st.isSymbolicLink()) {
      items.push(p)
    } else if (st.isDirectory()) {
      items = items.concat(walk(p))
    }
  }
  return items
}

const links = walk(HOST)
let rewritten = 0
let skipped = 0
for (const link of links) {
  const target = readlinkSync(link)
  // Rewrite only absolute links that point INSIDE the repo root.
  if (!target.startsWith(REPO)) { skipped++; continue }
  // Map repo path -> host-dist equivalent, then relativize against the link dir.
  const relFrom = target.slice(REPO.length) // e.g. /node_modules/.pnpm/... or /packages/...
  const mapped = HOST + relFrom
  if (!existsSync(mapped)) {
    // The target may not exist at the same relative place; skip rather than break the link.
    console.error(' WARN no host counterpart: ' + target)
    skipped++
    continue
  }
  const rel = relative(dirname(link), mapped)
  if (rel === '') continue
  rmSync(link)
  symlinkSync(rel, link)
  rewritten++
}
console.log('links scanned:', links.length, 'rewritten:', rewritten, 'already-relative/skipped:', skipped)
