# @deepseek-ai/dsh-client-desktop-host-config

English | [中文](README.zh.md)

Browser half of the desktop Web Host configuration feature: a General settings row that edits the host `desktop-host-config` settings namespace — the loopback bind host, the fixed port, and the trusted domains the `/api` browser-trust fence accepts. It pairs with the host plugin [`@deepseek-ai/dsh-desktop-host-config`](../../host/desktop-host-config/README.md), which mirrors committed values back to the JSON file the Electron shell reads on the next spawn.

## Configuration

No plugin configuration is required. The row reads and writes the `desktop-host-config` settings namespace (the same namespace the host plugin owns), so no build or repackaging is involved.

## Development

- Typecheck with the package tsconfig; the client row is registered in `packages/bundle/web-app/cordis.patch.yml`.
- Test with `pnpm vitest run packages/client/desktop-host-config`.

## Model Experience

None, as this is a pure settings surface: editing the card's values creates and alters no assistant chats, so nothing reaches a model request.

#### KV Cache effect

None. The form writes only the `desktop-host-config` settings namespace and renders its own controls; it issues no model request and contributes no prompt or KV-cache state.

## Known Limitations and Deferred Work

- **Applying the new bind is out of the row's hands** — the committed values reach the host only through the JSON file the Electron shell reads on the next spawn; the row itself has no way to restart the host.
