# Agent Note: macOS desktop reserves a full-width title bar so the native traffic lights clear the logo

Status: implemented

English | [中文](2026-08-18-macos-desktop-titlebar-reservation.zh.md)

## Problem

The macOS desktop window runs Electron with `titleBarStyle: 'hiddenInset'` and `trafficLightPosition: { x: 16, y: 18 }` (apps/desktop/src/main.ts), so the native red/yellow/green window buttons float over the top-left of the renderer. The web UI starts no higher off the window than the window itself: the sidebar's logo row (`ui-sidebar` `SidebarRoot` `.logoRow`) began around `x≈16, y≈24`, exactly where the traffic lights draw — the three buttons sat on top of the wordmark/whale.

The web GUI is also served in a plain browser and on other desktop platforms, where there are no native window controls, so the reservation could not be applied unconditionally.

## Decision

Reserve a full-width title bar on macOS only, driven by the boot platform marker the desktop shell already sends. The desktop shell loads the renderer with `?dsh-desktop-platform=darwin` (apps/desktop/src/main.ts:242); the web shell now reads that single param at boot (`applyDesktopTitlebarMarker`) and tags `<html data-titlebar="mac">` when it is `darwin`. `base.css` then reserves the top of `#root` on that marker:

```css
html[data-titlebar='mac'] #root {
  box-sizing: border-box;
  padding-top: 32px;
}
```

32px clears the traffic lights with a small gap: the buttons sit at `trafficLightPosition {x:16, y:18}` with ~12px diameter (bottom ≈ y=30). Everything below the strip shifts down together — sidebar logo, collapsed rail, center and details columns — so no content sits under the traffic lights in any panel state, and the empty strip is the natural draggable region (`hiddenInset` treats the non-interactive top as a drag area). Browsers and non-macOS platforms leave `<html>` unmarked and stay full-bleed; existing browser DOM snapshots are unaffected because their test URLs carry no platform param.

The marker helper is pure over the search string so it is unit-testable without running the boot chain.

## Alternatives considered

- **Reserving only the sidebar's top** (push the logo row down). Narrow and cheaper, but the collapsed 56px rail is narrower than the traffic-light span (`x≈16–80`), so the buttons would still overlap the center column's top edge when the rail was showing. Rejected for leaving a case broken.
- **Moving `trafficLightPosition`**. Keeps content in place but pushes the OS buttons off the conventional top-left corner; rejected as non-standard macOS behavior.
- **Skipping detection and padding `#root` always**. Would indent web content in a plain browser where nothing occupies the strip; rejected.

## Consequences

On macOS desktop the window top is a clear 32px title bar; the logo and every panel clear the window buttons. The web shell owns both halves (marker + CSS), so the change needs no desktop-shell edit and no per-column layout work. The 32px strip shows the `body` base background rather than the sidebar fill; that is the standard title-bar appearance and matches the "reserve a full-width strip" intent.

## Testing

`applyDesktopTitlebarMarker` unit tests pin the marker to `darwin` only (absent param, `win32`, and unrelated query params leave the document unmarked). The `base.css` contract test pins the `html[data-titlebar='mac'] #root` rule to `box-sizing: border-box` + `padding-top: 32px`, so the reservation cannot silently shrink or detach from the marker. The assembled-browser snapshot suite is unchanged because its URLs carry no `dsh-desktop-platform` param.
