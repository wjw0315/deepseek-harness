# Agent Note: dshmarket ships as an in-box web profile bundle

Status: implemented

English | [中文](2026-08-18-dshmarket-in-box-bundle.zh.md)

## Problem

The desktop and web product is the DSH web profile. Distributing the plugin market (browse, search, one-click install) requires the `web` profile to mount the `dshmarket` bundle, otherwise users must reach it through a manual profile-local install. The aim is a built-in plugin market that ships with every fresh `web` profile, and a `dsh plugin --profile web add dshmarket` command that activates it reliably, without a profile-local npm fetch just to resolve it.

## Decision

`dshmarket` (npm version `1.13.1`) is an in-box profile bundle alongside `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` — the same `dsh.profile.bundles` mechanism the [profile plugin bundles note](2026-08-05-profile-plugin-bundles.md) owns, applied here to a shipped third-party market. Concretely:

- `apps/cli/package.json` declares `dshmarket@^1.13.1` in `dependencies`, so it enters the `@deepseek-ai/dsh` installation closure. That closure is what `healProfilesModuleFallback` mirrors as symlinks into `$DSH_HOME/profiles/node_modules` and what the desktop `stage-runtime.ts` stages into the packaged Host, so a profile boot resolves `dshmarket` from the installation without pnpm managing it in the profile.
- `PROFILE_TEMPLATES.web` in `packages/boot/app-boot/src/profile.ts` is `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket']`, so a freshly-initialized `web` profile lists it as a bundle layer. `loadProfile` resolves its `dsh.bundle.patch` (`cordis.patch.yml`), which inserts the `dsh-market` host row mounting `dshmarket`.
- No `packages/bundle/web-app` change is needed: `dshmarket` self-describes. Its own manifest declares `dsh.bundle`, and `@deepseek-ai/dsh-client-modules` discovers its `dsh.client` from the loader entry and serves `/plugins/dshmarket/client.js`, so the market's browser half composes into `window.__DSH_BOOT__` automatically.

The tarball ships prebuilt `lib/` and `client/client.js`, so the dependency is self-contained; no source of the separate `dsh-market/dsh-market` repository is copied into `packages/`. `dsh plugin --profile web add dshmarket` stays the activation path for an already-initialized profile and is idempotent: reconcile refuses to duplicate a bundle already in the layer list.

Two repo gates changed with the addition. `knip` cannot see a bundle as used (it resolves by name, never by an import), so `apps/cli` `ignoreDependencies` gains `dshmarket`. pnpm's supply-chain minimum-release-age gate auto-excluded the freshly-published pinned version in `pnpm-workspace.yaml` `minimumReleaseAgeExclude`.

## Alternatives considered

- **Copy the market's source into `packages/` as a repo-owned workspace package**: rejected. It is a separately-maintained repository, and vendoring its source would fight this repo's per-file coverage, invariant-companion, aggregate-face, and README model-experience gates for a package we do not own, while forking future upstream updates. Depending on the published tarball matches how the other in-box bundles ship (installable package + `dsh.bundle`).
- **Keep the market as a runtime-only profile-local npm install, no in-box closure**: rejected. That binds every fresh profile to a network fetch at `add` time and leaves the shipped desktop app unable to resolve the bundle from its Host closure.
- **Add `dshmarket` to the closure but not to `PROFILE_TEMPLATES.web`** (opt-in only): rejected — the requirement is a market that is genuinely built in, active on fresh `web` profiles by default; the `add` command still serves already-initialized profiles.

## Consequences

- Every fresh `web` profile boots with the plugin market enabled; the desktop/CLI app ships it in the Host closure, resolvable with no profile-local install.
- The market's client bundle is auto-served by client-modules once the `dsh-market` row is a loaded entry, keeping one composition path for in-box and out-of-tree plugins.
- The app gains one pinned external dependency (`dshmarket@1.13.1`) with runtime deps `js-yaml` only; updates to the market arrive by bumping the pinned version and rerunning the install gates, not by editing a vendored source copy.
- An already-initialized `web` profile (one created before this change) keeps its own bundles list and adopts the market via `dsh plugin --profile web add dshmarket` rather than automatically.
