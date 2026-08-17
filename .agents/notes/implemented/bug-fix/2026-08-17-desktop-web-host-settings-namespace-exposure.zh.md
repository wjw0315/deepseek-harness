# Agent Note: The Desktop Web Host settings row is served by the plugin-owned settings surface

Status: implemented

[English](2026-08-17-desktop-web-host-settings-namespace-exposure.md) | 中文

## Problem

桌面应用的 Web Host 设置行绑定的是 `desktop-host-config` 设置命名空间。在插件自有设置平面之前的网关中，该命名空间不在 Web 设置白名单内，设置行表现出的所有故障都源于这同一个缺口：

- 它的 scope 在 `settings.describe` 中找不到该命名空间，因此一直显示"不可用"，也从未加载实时的 host、端口和受信主机。
- 写入被以 `settings-not-exposed` 拒绝，而客户端的 `write()` 会吞掉该错误并重新读取，所以保存后界面没有任何变化。
- 由于写入从未落盘，宿主插件的 `onChange` 从不触发，`desktop.config.json` 从未被写入，重启后所有设置全部丢失。

修复也没有送达用户：机器上安装的打包应用，其宿主的 `api-proxy` 仍带着白名单（仓库已构建的 `lib/` 产物早于白名单移除），因此未重新构建工作区就打包桌面应用，照样会发布旧行为。从当前代码树重新构建是修复的一部分，而不是可选项。

## Decision

[插件自有设置平面](../architecture/2026-08-12-plugin-owned-settings-surface.md) 的决定取消了白名单：注册即暴露，网关不再拦截任何写入。因此桌面插件注册的 `desktop-host-config` 命名空间会被 `settings.describe` 提供，也可通过 `settings.update`/`mutate` 写入，这修复了设置行的三种故障：它能加载实时值，保存能落到设置接缝，宿主插件的 `onChange` 也会为下次启动写入 `desktop.config.json`。

仅靠暴露修复还留一个症状层面的缺口：全新启动时设置行会显示命名空间的 schema 默认值（`127.0.0.1:0`），而应用实际从配置文件启动（如 `127.0.0.1:51925`），看起来就像"没有实时数据"。因此桌面壳把实际启动 Host 所使用的值以 `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` 发布到子进程环境，宿主插件用它们播种设置 base（依次为 schema 默认值、显式组合 config、启动环境变量——启动事实优先，因为 Loader 会把缺失的 entry config 解析为 schema 默认值，若优先会遮蔽它们）。设置行在首次打开时就显示应用实际运行的 host:port，保存后用户设置段仍然优先于播种值。

## Alternatives considered

- **把 `desktop-host-config` 加入网关白名单。** 这是合并前考虑的修复方案；由于白名单已不存在，该方案已过时，插件自有设置平面使得按命名空间逐个接纳既无必要也无法表达。
- **在设置行中暴露 `settings-not-exposed` 错误**，而不是静默地重新读取。这改善了诊断，但并不能让该行生效；暴露决定才是真正的修复。留作后续工作。
- **在设置行中显示浏览器的实时 origin（`window.location`）。** 被否决：它混淆了"当前连接"与"下次启动的绑定"，且保存后直至重启 pill 都不会变化。播种设置 base 既保持 pill 的含义（配置/生效的绑定），又在首次打开时就如实显示。

## Consequences

桌面应用 Web Host 设置行在首次打开时显示生效的 `host:port`，通过设置接缝保存 host/端口/受信主机，并在重启后仍能持久化到 `desktop.config.json`。端口 `3080` 是合法的 `webPort`（整数 0–65535），也是 Web 应用自身的默认端口。该行在设置平面既有的保护下仍保持仅回环、密钥脱敏。发布该修复需要先重新构建工作区（`pnpm run build`）再打包桌面应用。

## Testing

`api-proxy-config` 测试固定了桌面命名空间：`desktop-host-config` 注册会被 `settings.describe` 提供，并可通过 `settings.update` 写入，且写入会到达设置接缝。桌面插件自身的测试断言了设置变更时会写入 JSON 配置文件，以及启动环境变量会播种设置卡的 base（有效值、按字段的无效回退、以及启动环境变量优先于 entry config）。`host-supervisor` 测试固定了子进程环境发布启动事实。行为已针对全新构建的宿主验证：`settings.describe` 以启动值提供该命名空间，`webPort` 变更会写入 `desktop.config.json` 并在宿主重启后保持，且固定 `--port` 可正常绑定。
