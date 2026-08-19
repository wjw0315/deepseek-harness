# dsh-desktop-host

[English](README.md) | 中文

DSH Electron 桌面应用的 Host 服务，移植自 [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)：profile 管理器、带安装恢复写前日志的受管包管理能力、direct-bundle 清单，以及支撑社区市场包操作的窄原生动作服务。

本包作为 `web` profile bundle 的一个 Host 行发布。没有 `DSH_DESKTOP_BOOTSTRAP`（普通 `dsh web` 启动）时插件保持惰性，市场退化为只读浏览。Electron 启动器发布 bootstrap 文件后，本代注册 `desktopProfiles`、`desktopPnpm`、`desktopPlugins` 与 `desktopActions`；profile 身份来自 bootstrap，包管理操作经由启动器拥有的 pnpm 运行时执行，打开终端/重启经环回控制通道回到外壳。

## 组合方式

Host 行注入 `subprocess`。bootstrap 文件（在文件边界校验，控制 URL 仅限环回）是唯一的启动器契约：携带代标识、活动 profile 及其私有状态路径、打包的 pnpm 运行时路径和控制通道凭据。profile 选择持久化一个待切换目标并请求有序重启；受保护的插件安装在下一次启动验证健康前保留一条恢复记录；disable 状态存储保持 direct-bundle 清单有界且一致。

## Model Experience

Indirectly, through the community market's install and uninstall surfaces, which read this package's services to describe and mutate profile bundle membership; the package registers no prompt, model tool, or schema of its own.

#### KV Cache effect

None. The services issue no model request, so they contribute no prompt or KV-cache state; they read and write profile manifests, the recovery WAL, and the disable-state store.

## Known Limitations and Deferred Work

- Electron 侧（bootstrap 文件写入、环回控制服务器、打包 pnpm 运行时装配）位于 apps/desktop，不属于本包；仅在打包桌面启动中激活，源码 `dsh web` 启动时服务保持惰性。
- Startup-health reconciliation (claiming a pending install-recovery record on the next generation) is owned by the launcher and ported only as the WAL's data surface.
