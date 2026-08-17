# DeepSeek Harness 桌面应用

[English](README.md) | 中文

桌面应用监管现有的回环 Web Host，并在其窗口关闭后从系统托盘持续保活。

## 开发

安装依赖后，使用单个桌面开发命令；它会在启动前构建 Host 与客户端包、Web 前端以及 Electron 主进程：

```sh
pnpm run dev:desktop
```

关闭窗口会将其隐藏。可通过托盘菜单恢复窗口或退出。显式退出会等待 Host 进程停止，并在受控的 Host 宽限期结束后升级终止操作。

## 打包

```sh
pnpm run package:desktop
```

打包后的应用通过 Electron 的 Node 模式在独立进程中运行暂存的 `@deepseek-ai/dsh` CLI，在无需附带第二个 Node 的前提下保留受监管的 Host 生命周期。macOS 自动启动可通过将应用添加到「系统设置 > 登录项」实现。

### 打无签名 DMG

`pnpm run package:desktop` 只产出 `.app` 目录；要得到 DMG，需在 `apps/desktop` 下直接运行 electron-builder。为避免在弱网/离线环境下打包失败，需满足两个前置：一个不在 `node_modules/electron/dist` 下的解包 Electron 运行时（重装可能清掉它），以及一份现成的 `build/icon.icns`（避免本包 `"type": "module"` 下 CJS 图标工具被误当作 ESM 运行）。

```sh
cd apps/desktop
# 1) Provide the platform Electron runtime once. Extract it from the cached zip
#    into a stable copy if node_modules/electron/dist is missing:
#    mkdir -p .dsh-electron-dist && ditto -x -k ~/Library/Caches/electron/electron-v43.4.0-darwin-arm64.zip .dsh-electron-dist/
# 2) Provide a ready-made icns at build/icon.icns (skip the png-to-icns step):
#    the app icon as an icns; generate from build/icon.png or reuse a prior dist/.icon-icns/icon.icns.
# 3) Build the unsigned DMG:
CI=true CSC_IDENTITY_AUTO_DISCOVERY=false \
  pnpm exec electron-builder --mac dmg \
  --config.electronDist=./.dsh-electron-dist \
  --config.mac.icon=build/icon.icns
```

无签名 DMG 会落在 `dist/DSH-desktop-0.1.0-rc.5-arm64.dmg`（可用 `hdiutil verify` 校验）。本地安装使用无签名构建；发布签名并公证的 DMG 走 `dist:mac:desktop`。

## Web Host 运行时配置

桌面应用以 `dsh web --host <host> --port <port> [--trusted-host <authority>...]` 启动 Web Host。**绑定地址**、**端口** 与 **信任域名** 都可在**运行时**调整 — 重启应用即可生效，无需重新打包。

### 设置卡（推荐）

桌面载入 [`@deepseek-ai/dsh-desktop-host-config`](../host/desktop-host-config/README.md) 插件，它会在 GUI 设置里注册一张「桌面应用 Web Host」设置卡。卡片由壳实际启动 Host 的值播种（桌面通过 `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` 发布给 Host 进程），因此首次打开即显示实时的 `host:port`，而不是「不可用」或默认值。在卡里改 `webHost` / `webPort` / `trustedHosts` 并保存，插件会把它们写入 Electron `userData` 下可写的 JSON 配置，桌面在下次启动时读取。重启应用即可生效。任意端口 `0..65535` 均有效——`3080` 与任何固定端口一样可用。

### 配置文件

桌面优先读取可写的用户配置，再回退到随包默认（开发时为仓库副本）：

- `<userData>/desktop.config.json` — 可写；设置卡写入此处。
- `<应用>/Contents/Resources/desktop-resources/desktop.config.json` — 随包默认。

```json
{
  "comment": "...",
  "webHost": "127.0.0.1",
  "webPort": 51925,
  "trustedHosts": ["dsh.example.com"]
}
```

字段说明：

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `webHost` | Web Host 监听的回环绑定地址。harness 拒绝 `0.0.0.0`（会暴露远程代码执行），故仅限回环 | `127.0.0.1` |
| `webPort` | Web Host 监听的固定回环端口。隧道 / 反向代理必须转发到这里；`0` 表示由操作系统随机分配 | `0` |
| `trustedHosts` | 允许通过 `/api` 浏览器信任门禁的域名（`host` 或 `host:port`，可多个）。**没有列出的公网域名对 `/api/*` 的请求会被拒绝（HTTP 403 `forbidden`）**，但 `/`、`/m` 等静态页面不受影响 | `[]` |

> 若通过「移动端远程控制」（`dsh-remote-web-ui`）使用自定义域名，必须把该域名加入 `trustedHosts`；否则手机能打开移动端页面，但所有 `/api/*` 调用（如 `host.describe`）都会返回 403。

### 环境变量（优先级最高）

部署后无需改文件，直接设置环境变量即可重定向：

```sh
launchctl setenv DSH_DESKTOP_WEB_HOST 127.0.0.1
launchctl setenv DSH_DESKTOP_WEB_PORT 51925
launchctl setenv DSH_DESKTOP_TRUSTED_HOSTS dsh.example.com
```

之后重启应用。换域名只改 `DSH_DESKTOP_TRUSTED_HOSTS`（逗号分隔可加多个）再重启。

| 环境变量 | 覆盖字段 |
| --- | --- |
| `DSH_DESKTOP_WEB_HOST` | `webHost` |
| `DSH_DESKTOP_WEB_PORT` | `webPort` |
| `DSH_DESKTOP_TRUSTED_HOSTS` | `trustedHosts`（逗号分隔） |
## 签名后的 macOS DMG

`dist:mac:desktop` 命令需要有效的 `Developer ID Application` 身份以及一个完整的公证凭据来源。凭据细节参见规范文档。
