# DeepSeek Harness Desktop

English | [中文](README.zh.md)

The desktop app supervises the existing loopback Web Host and keeps it alive from the system tray when its window is closed.

## Development

Install dependencies, then use the single desktop development command; it builds the Host and client packages, Web frontend, and Electron main process before launching:

```sh
pnpm run dev:desktop
```

Closing the window hides it. Use the tray menu to restore the window or quit. Explicit quit waits for the Host process to stop and escalates termination after the bounded Host grace period.

## Packaging

```sh
pnpm run package:desktop
```

Packaged applications run the staged `@deepseek-ai/dsh` CLI in a separate process through Electron's Node mode, retaining the supervised-Host lifecycle without shipping a second Node. macOS auto-start is available by adding the app to System Settings > Login Items.

## Signed macOS DMG

The `dist:mac:desktop` command requires a valid `Developer ID Application` identity and one complete notarization credential source. See the spec for credential details.
