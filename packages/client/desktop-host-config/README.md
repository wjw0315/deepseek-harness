# @deepseek-ai/dsh-client-desktop-host-config

English | [中文](README.zh.md)

Browser half of the desktop Web Host configuration feature: a General settings row that edits the host `desktop-host-config` settings namespace — the loopback bind host, the fixed port, and the trusted domains the `/api` browser-trust fence accepts. It pairs with the host plugin [`@deepseek-ai/dsh-desktop-host-config`](../../host/desktop-host-config/README.md), which mirrors committed values back to the JSON file the Electron shell reads on the next spawn.

## Model experience

The row appears in **General settings** as **桌面应用 Web Host / Desktop Web Host**. Expanding it reveals three staged inputs (bind host, fixed port, trusted domains); **Save** writes the form to the settings namespace and **restarting the app applies the new bind**. This is a pure settings surface: editing preferences creates and alters no assistant chats, so there is no model-visible effect.

## Configuration

No plugin configuration is required. The row reads and writes the `desktop-host-config` settings namespace (the same namespace the host plugin owns), so no build or repackaging is involved.

## Development

- Typecheck with the package tsconfig; the client row is registered in `packages/bundle/web-app/cordis.patch.yml`.
- Test with `pnpm vitest run packages/client/desktop-host-config`.
