import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'json-schema-to-typescript'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const checkOnly = process.argv.includes('--check')
const targets = [
  ['catalog-source', 'CatalogSourceManifest'],
  ['catalog-query', 'CatalogQuery'],
  ['catalog-provider-page', 'CatalogProviderPage'],
  ['catalog-snapshot', 'CatalogSnapshot'],
]
const outputDir = resolve(packageRoot, 'src/contracts/generated')
const options = {
  bannerComment: '/* Generated from docs/schemas by scripts/generate-contract-types.mjs. Do not edit. */',
  enableConstEnums: false,
  maxItems: 5,
  style: {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
  },
}

const contractProse = {
  CategoryId: 'An opaque category identifier used by the current adapter.',
  CapabilityId: 'An opaque capability identifier used by the current adapter.',
  ProviderId: 'A provider-claimed stable identity for a catalog source.',
  Identifier: 'An opaque identifier for one catalog item.',
  PlainText: 'A plain-text string value.',
  HttpsUri: 'An absolute HTTPS URI.',
  MediaAlt: 'A short alt-text string for an image.',
  Item: 'A catalog item carried by a provider page or normalized snapshot.',
  Item1: 'The tag discriminator union that distinguishes an item by its owning registry shape.',
  Repository: 'The upstream repository a catalog item is distributed from.',
  Package: 'The package registry coordinates a catalog item is installed from.',
  Publisher: 'The publisher claiming a catalog item.',
  Capabilities: 'The declared capability identifiers a catalog item requires or optionally supports.',
  Compatibility: 'The declared host and catalog API compatibility surface of a catalog item.',
  Source: 'The catalog source a normalized snapshot was fetched from.',
  Provenance: 'Host-observed provenance attached to a normalized snapshot item.',
  Page: 'Pagination state for a catalog result page.',
  CapabilityList: 'A list of capability identifiers.',
}

/** Prose describing a generated type, falling back to a name-based sentence. */
function proseFor(name) {
  return contractProse[name] ?? `The ${name} contract type.`
}

/** Whether a contiguous JSDoc block (out[start..end]) carries a prose line. */
function jsDocHasProse(block) {
  return block.some((line) => {
    const text = line.trim()
    if (text.startsWith('/**') && text.length > 3) {
      const rest = text.endsWith('*/') ? text.slice(3, -2).trim() : text.slice(3).trim()
      return rest.length > 0 && !rest.startsWith('@')
    }
    if (text.startsWith('*') && text !== '*/') {
      const rest = text.slice(1).trim()
      return rest.length > 0 && !rest.startsWith('@')
    }
    return false
  })
}

/** The start index in `out` of a JSDoc block ending at `end`, or -1 when none. */
function jsDocBlockStart(out, end) {
  if (end < 0 || !out[end].trim().endsWith('*/')) return -1
  let i = end
  while (i >= 0 && (out[i].trim().startsWith('*') || out[i].includes('/*'))) {
    if (out[i].includes('/**')) return i
    i -= 1
  }
  return -1
}

/** Ensure every exported declaration carries a JSDoc block with prose. */
function ensureContractJsDoc(generated) {
  const lines = generated.split('\n')
  const out = []
  for (const line of lines) {
    const match = /^export (type|interface) ([A-Za-z0-9_]+)/.exec(line)
    if (match) {
      let i = out.length - 1
      while (i >= 0 && out[i].trim() === '') i -= 1
      const start = jsDocBlockStart(out, i)
      if (start === -1) {
        out.push(`/** ${proseFor(match[2])} */`)
      } else if (!jsDocHasProse(out.slice(start, i + 1))) {
        out.splice(start + 1, 0, ` * ${proseFor(match[2])}`)
      }
      out.push(line)
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

if (!checkOnly) mkdirSync(outputDir, { recursive: true })

for (const [schemaName, typeName] of targets) {
  const schemaPath = resolve(packageRoot, `docs/schemas/${schemaName}.schema.json`)
  const outputPath = resolve(outputDir, `${schemaName}.ts`)
  const schema = { ...JSON.parse(readFileSync(schemaPath, 'utf8')), title: typeName }
  const generated = ensureContractJsDoc(await compile(schema, typeName, options))

  if (checkOnly) {
    if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== generated) {
      throw new Error(`${schemaName} generated types are stale; run yarn generate:types`)
    }
    continue
  }

  writeFileSync(outputPath, generated, 'utf8')
}

process.stdout.write(`contract-types: ${targets.length} generated type files ${checkOnly ? 'are current' : 'written'}\n`)
