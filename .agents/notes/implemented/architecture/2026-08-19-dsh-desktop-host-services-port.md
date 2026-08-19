# Agent Note: dsh-desktop-host ports the desktop launcher services

Status: implemented

English | [中文](2026-08-19-dsh-desktop-host-services-port.zh.md)

## Problem

The in-box community market degrades to read-only browsing whenever the optional Desktop capabilities are absent: its Host routes inject desktopProfiles, desktopPnpm, desktopPlugins, and desktopActions, and without providers the install, uninstall, and restart surfaces render a Desktop-required state. The upstream implementation lives in the separate anywhere-labs/deepseek-harness-desktop repository as one Electron-coupled plugin (dsh-plugin-desktop, ~12.9k lines), while this repository's desktop app is a thin Electron shell that spawns 'dsh web' as a subprocess. Nothing bridged the two.

## Decision

Port only the pure Node/Cordis service core into a new host package, packages/host/desktop-host (@deepseek-ai/dsh-desktop-host), composed as a Host row inserted by the dsh-web-app bundle patch — never listed in dsh.profile.bundles. The four services keep their upstream interfaces:

- desktopProfiles (profile-manager.ts, profile-service.ts) — discovery, restart-safe selection state, single launcher profile 'web' (upstream's desktop/web template pair collapses to this repository's one 'dsh web' profile);
- desktopPnpm (pnpm.ts) plus the install-recovery write-ahead log (install-recovery.ts) — one packaged-pnpm operation at a time behind launcher-resolved runtime paths;
- desktopPlugins (desktop-plugins.ts) — direct-bundle inventory and persistent disable state;
- desktopActions (desktop-actions.ts) — terminal-open and one-shot restart over a bootstrap-injected implementation.

The Electron side stays in apps/desktop. The launcher contract is one file: main.ts writes a bootstrap JSON (generation identity, profile facts, packaged pnpm runtime paths, control-channel credentials) and publishes its path as DSH_DESKTOP_BOOTSTRAP; the plugin validates it at the file boundary (loopback-only control URL, non-empty string fields) and registers every service for that generation. Without the env var the entry is inert, so a standalone 'dsh web' boot keeps today's read-only browsing. The pnpm command runtime (shims, clear-env preloader, reversible PATH entry) is ported as apps/desktop/src/desktop-runtime-environment.ts and installed per profile under Electron userData; pnpm@11.7.0 joins the staged desktop runtime so packaged installs never fall back to ambient pnpm. Restart requests map to the existing restartApp() host supervisor path.

## Verification

Package tests cover each service against the real on-disk formats (profile state, WAL, disable store), and tests/loader-composition.spec.ts boots the entry through the actual Loader with the real subprocess Service Definition: with a published bootstrap every service is live and requestRestart reaches a loopback control server; without it every service stays absent; a malformed bootstrap fails loud. apps/desktop tests cover the pnpm runtime installation and the spawn env publishing.

## Alternatives considered

- **Compose through PROFILE_TEMPLATES.web like the market bundle**: rejected. Profile manifests would list the desktop host package, while its services are launcher-owned facts about one Electron generation; keeping it in the bundle patch preserves the ported guard that the package must not appear in dsh.profile.bundles.
- **Bridge through settings (like dsh-desktop-host-config) instead of a bootstrap file**: rejected. The bootstrap carries executable paths and a token, not user-editable settings; a one-generation file with 0o600 mode is the narrower channel.
- **Port the upstream Electron terminal window as part of change**: rejected as scope. openTerminal opens the OS terminal at the active profile directory on macOS; the Electron terminal surface remains upstream-owned follow-up work.

## Consequences

- The market's managed operations are expected to work in packaged desktop boots once the staged runtime ships; the packaged app still needs a full packaging smoke to prove the end-to-end install path against the real npm registry.
- Startup-health reconciliation of a pending install-recovery record (claim on next generation, rollback on failure) is owned by the Electron launcher; only the WAL data surface is ported, so a crash between install and restart currently leaves the pending record blocking the next protected add until manually cleared.
- Upstream sync for these files is now a port maintenance concern: the source of record is the upstream monorepo's dsh-plugin-desktop directory.
