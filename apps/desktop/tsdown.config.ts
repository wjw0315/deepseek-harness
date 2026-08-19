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
  // Workspace packages must inline into the bundle: electron-builder stages
  // only their folders into app.asar without resolving their peers
  // (dsh-desktop-host imports @deepseek-ai/cordis at runtime).
  noExternal: [/^@deepseek-ai\//],
})
