# dsh-desktop-host

English | [中文](README.zh.md)

Desktop Host services for the DSH Electron app, ported from [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop): the profile manager, the managed package-manager capability with its install-recovery write-ahead log, the direct-bundle inventory, and the narrow native-action service that together back the community market's package operations.

The package ships as a Host row in the `web` profile bundle. Without `DSH_DESKTOP_BOOTSTRAP` — an ordinary `dsh web` boot — the plugin stays inert and the market degrades to read-only browsing. When the Electron launcher publishes a bootstrap file, this generation registers `desktopProfiles`, `desktopPnpm`, `desktopPlugins`, and `desktopActions`; profile identity is derived from the bootstrap, package-manager operations run through the launcher-owned pnpm runtime, and terminal-open/restart travel a loopback control channel back to the shell.

## How it composes

The Host row injects `subprocess`. The bootstrap file (validated at the file boundary, loopback-only control URL) is the single launcher contract: it carries the generation identity, the active profile and its private state paths, the packaged pnpm runtime paths, and the control channel credentials. Profile selection persists a pending target and requests an orderly restart; a protected plugin add leaves one install-recovery record until the next generation verifies startup health; the disable-state store keeps direct-bundle inventory bounded and consistent.

## Model Experience

Indirectly, through the community market's install and uninstall surfaces, which read this package's services to describe and mutate profile bundle membership; the package registers no prompt, model tool, or schema of its own.

#### KV Cache effect

None. The services issue no model request, so they contribute no prompt or KV-cache state; they read and write profile manifests, the recovery WAL, and the disable-state store.

## Known Limitations and Deferred Work

- The Electron side (bootstrap-file writer, loopback control server, packaged pnpm runtime staging) lives in apps/desktop and is not part of this package; it activates only in packaged desktop boots, so source `dsh web` launches keep the services inert.
- Startup-health reconciliation (claiming a pending install-recovery record on the next generation) is owned by the launcher and ported only as the WAL's data surface.
