# Agent Note: macOS 桌面端预留整宽标题栏，使原生红黄绿按钮避开 logo

Status: implemented

[English](2026-08-18-macos-desktop-titlebar-reservation.md) | 中文

## 问题

macOS 桌面窗口使用 Electron `titleBarStyle: 'hiddenInset'` 与 `trafficLightPosition: { x: 16, y: 18 }`（apps/desktop/src/main.ts），原生红黄绿三枚窗口按钮浮于渲染页左上角。而 web UI 顶部紧贴窗口：侧边栏 logo 行（`ui-sidebar` 的 `SidebarRoot` `.logoRow`）起始于约 `x≈16, y≈24`，恰好落在红黄绿按钮绘制区域——三个按钮压在 wordmark/鲸鱼上。

该 web GUI 也会在纯浏览器及其它桌面平台上运行，那里没有原生窗口按钮，因此不能无条件预留空间。

## 决策

仅在 macOS 上预留整宽标题栏，由桌面壳已发送的启动平台标记驱动。桌面壳以 `?dsh-desktop-platform=darwin` 加载渲染页（apps/desktop/src/main.ts:242）；web 壳在启动时读取该参数（`applyDesktopTitlebarMarker`），值为 `darwin` 时给 `<html data-titlebar="mac">` 打标。`base.css` 依据该标记在 `#root` 顶部预留：

```css
html[data-titlebar='mac'] #root {
  box-sizing: border-box;
  padding-top: 32px;
}
```

32px 恰好为红黄绿按钮留出一点间隙：按钮位于 `trafficLightPosition {x:16, y:18}`、直径约 12px（下缘约 y=30）。顶部条以下的所有内容整体下移——侧边栏 logo、收起后的窄 rail、中间列与详情列——因此任何面板状态下内容都不被按钮遮挡，空条即为天然的可拖动区域（`hiddenInset` 把顶部非交互区当作拖动区）。浏览器与非 macOS 平台不写 `<html>` 标记，保持全出血；既有浏览器 DOM 快照不受影响，因为其测试 URL 不带平台参数。

该标记助手对 search 字符串保持纯函数，可脱离完整启动链单测。

## 备选方案

- **仅下移侧边栏顶部**（把 logo 行推低）。改动窄、更省，但收起后的 56px 窄 rail 窄于按钮跨度（`x≈16–80`），显示 rail 时按钮仍会压到中间列顶部边缘。因仍留残局而否决。
- **移动 `trafficLightPosition`**。内容不动，但把系统按钮从常规左上角挪开；不符合 macOS 惯例而否决。
- **不做检测、恒给 `#root` 加 padding**。会让纯浏览器里的 web 内容无谓地缩进；否决。

## 影响

macOS 桌面端窗口顶部为清晰的 32px 标题栏；logo 与各面板都避开窗口按钮。web 壳同时承担标记与 CSS 两半，因而无需改动桌面壳，也无需逐列调整布局。32px 空条显示 `body` 基色背景而非侧边栏填充色；这是标准标题栏外观，符合「预留整宽空条」的意图。

## 测试

`applyDesktopTitlebarMarker` 单测钉住仅在 `darwin` 时打标（无参数、`win32`、无关查询参数都保持不打标）。`base.css` 契约测试钉住 `html[data-titlebar='mac'] #root` 规则为 `box-sizing: border-box` + `padding-top: 32px`，防止预留被静默收缩或与标记脱钩。组装浏览器快照套件不变，因其 URL 不带 `dsh-desktop-platform` 参数。
