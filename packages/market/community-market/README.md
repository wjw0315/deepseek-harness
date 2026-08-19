# @deepseek-ai/dsh-community-market

Community plugin discovery and managed package operations for DeepSeek Harness, ported from [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop).

The market ships as an in-box `web` profile bundle. It mounts the `community-market` Host row, which registers the `/api/community-market/*` routes and a `settings` namespace, and a browser client that composes the "Plugin market" settings tab, a sidebar launcher, and a shell overlay. Browsing and searching are portable. Managed package operations (install, uninstall, preview) appear when the optional Desktop capabilities are live, and otherwise the market degrades to read-only browsing.

## How it composes

The Host row injects `webServer` and `settings`. Catalog adapters normalize provider pages or snapshots through the shared contract validators; restricted HTTP and media fetchers pin DNS and block private-network addresses before any request leaves the process. Registered source records persist through the settings document and republish on reload.

## Model Experience

Indirectly, through the browser settings tab, sidebar launcher, and overlay that present catalog entries and install outcomes over the Host `/api/community-market/*` routes; the package registers no prompt, model tool, or schema of its own.

#### KV Cache effect

None. The market issues no model request, so it contributes no prompt or KV-cache state; it reads and writes its own settings document and serves fetched catalog pages through the Host.

## Known Limitations and Deferred Work

- Managed package operations require the Desktop profile, pnpm, action, and plugin capabilities that are not part of this package's port; until those land, the market is read-only for browsing and the install surface renders a Desktop-required state.
