# Agent Note: dsh-desktop-host 移植桌面启动器服务

Status: implemented

[English](2026-08-19-dsh-desktop-host-services-port.md) | 中文

## Problem

内置社区市场在缺少可选 Desktop 能力时退化为只读浏览：其 Host 路由注入 desktopProfiles、desktopPnpm、desktopPlugins 与 desktopActions，没有提供方时安装、卸载与重启界面呈现 Desktop-required 状态。上游实现位于独立的 anywhere-labs/deepseek-harness-desktop 仓库，是一个与 Electron 耦合的插件（dsh-plugin-desktop，约 12.9k 行）；而本仓库的桌面应用是以子进程方式启动 'dsh web' 的轻量 Electron 外壳，两者之间没有桥接。

## Decision

只把纯 Node/Cordis 服务核心移植到新 host 包 packages/host/desktop-host（@deepseek-ai/dsh-desktop-host），作为 dsh-web-app bundle patch 插入的 Host 行组合——绝不列入 dsh.profile.bundles。四个服务保持上游接口：

- desktopProfiles（profile-manager.ts、profile-service.ts）——发现、重启安全的选择状态、单一启动器 profile 'web'（上游 desktop/web 双模板收敛为本仓库唯一的 'dsh web' profile）；
- desktopPnpm（pnpm.ts）与安装恢复写前日志（install-recovery.ts）——同一时刻仅一个打包 pnpm 操作，运行时路径由启动器解析；
- desktopPlugins（desktop-plugins.ts）——direct-bundle 清单与持久化 disable 状态；
- desktopActions（desktop-actions.ts）——打开终端与一次性重启，经 bootstrap 注入的实现执行。

Electron 侧留在 apps/desktop。启动器契约是一个文件：main.ts 写出 bootstrap JSON（代标识、profile 事实、打包 pnpm 运行时路径、控制通道凭据）并以 DSH_DESKTOP_BOOTSTRAP 发布其路径；插件在文件边界校验（控制 URL 仅限环回、字符串字段非空）并为该代注册全部服务。没有该环境变量时入口保持惰性，独立 'dsh web' 启动维持现有只读浏览。pnpm 命令运行时（shim、clear-env 预加载、可撤销的 PATH 条目）移植为 apps/desktop/src/desktop-runtime-environment.ts，按 profile 安装在 Electron userData 下；pnpm@11.7.0 进入桌面 staged runtime，打包安装绝不回退到环境 pnpm。重启请求映射到既有 restartApp() 宿主重启路径。

## Verification

包测试针对真实磁盘格式（profile 状态、WAL、disable 存储）覆盖每个服务；tests/loader-composition.spec.ts 以真实 subprocess Service Definition 通过实际 Loader 启动入口：有 bootstrap 时全部服务在线且 requestRestart 到达环回控制服务器；无则全部缺失；畸形 bootstrap 大声失败。apps/desktop 测试覆盖 pnpm 运行时安装与 spawn 环境发布。

## Alternatives considered

- **像 market bundle 一样通过 PROFILE_TEMPLATES.web 组合**：拒绝。profile manifest 会列出桌面宿主包，而其服务是关于一个 Electron 代的启动器事实；保留在 bundle patch 中维持移植来的守卫——该包不得出现在 dsh.profile.bundles。
- **经 settings 桥接（如 dsh-desktop-host-config）而非 bootstrap 文件**：拒绝。bootstrap 携带可执行路径与 token，不是用户可编辑设置；0o600 权限的单代文件是更窄的通道。
- **随本次改动移植上游 Electron 终端窗口**：超出范围。openTerminal 在 macOS 上于活动 profile 目录打开系统终端；Electron 终端界面仍属上游后续工作。

## Consequences

- staged runtime 发布后，market 的受管操作预期可在打包桌面启动中工作；打包应用仍需完整打包冒烟来验证对真实 npm registry 的端到端安装路径。
- 待定安装恢复记录的启动健康对账由 apps/desktop main.ts 拥有：每个打包代认领 WAL，awaiting-restart 安装在 Host 响应首次 HTTP 探测后确认（随后清除），Host 退出或探测失败则回滚；中断安装在认领时即回滚。与上游的渲染器启动监控不同，轻量 Electron 外壳以 Host HTTP 可达性作为健康信号。
- 这些文件的上游同步成为移植维护事项：source of record 是上游 monorepo 的 dsh-plugin-desktop 目录。
- 打包契约（首次 DMG 冒烟发现）：Electron 主包必须内联 workspace 包（`tsdown.config.ts` 对 `@deepseek-ai/*` 设置 `noExternal`）——electron-builder 只把包文件夹拷进 app.asar、不解析 peer，外部导入 dsh-desktop-host 会因缺少 cordis peer 在启动时失败。
- market 进入 `PROFILE_TEMPLATES.web` 之前创建的旧 profile 保留更早的 bundle 列表（上游 `dshmarket`，还被供应链 minimumReleaseAge 策略拒绝）；已存在的 `~/.dsh` profile 需补一次 `@deepseek-ai/dsh-community-market` 行，市场 UI 才会出现。
