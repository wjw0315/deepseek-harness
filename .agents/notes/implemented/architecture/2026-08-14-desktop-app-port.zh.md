# Agent Note: 桌面应用以托盘托管的 Electron 外壳包装 Web Host

Status: implemented

[English](2026-08-14-desktop-app-port.md) | 中文

## 问题

DeepSeek Harness GUI 是一个环回 web 应用：`dsh web` Host 在 `127.0.0.1` 上通过 HTTP 提供 Web 前端，用户通过浏览器访问。将这个 harness 作为可双击的 macOS 桌面应用交付，需要一个原生外壳来承载该环回 GUI，并且需要一个不依赖用户自行安装 Node 的运行时；窗口关闭时应让 harness 保持存活，而当用户真正退出时，宿主进程则不得泄漏。

## 决策

`apps/desktop` 处的桌面应用是一个 Electron 外壳，作为子进程监督未作改动的 `dsh web` Host。`Electron` 的主入口（`src/main.ts`）创建一个 `HostSupervisor`（`src/host-supervisor.ts`），它以 `web --host 127.0.0.1 --port 0 --expose-internals` 方式 `spawn` 内置的 `@deepseek-ai/dsh` CLI 并持有其生命周期：它将并发的 `start`/`shutdown` 调用合并为一次，若在就绪超时（默认 90 秒）内失败则判定启动失败，在一个有界的宽限期（默认 5 秒）之后将关闭从 `SIGTERM` 升级为 `SIGKILL`，并且当一个已就绪的 Host 在非应用拥有的关闭流程之外退出时，会**自动重新拉起 Host（`restart`）并重建 `BrowserWindow`**，而不是退出应用——重拉是有界的，因此一旦 Host 每次启动都反复退出，就会以退出收场，而不是死循环；显式退出依旧不会自动重启。外壳窗口是一个 `BrowserWindow`，其加载 Host 的环回 URL，因此整个产品面——客户端、API 网关、LLM 提供方、工具——就是已经交付的 Web 应用，而不是重新实现。

打包后的应用与系统 Node 无关。打包后，`spawnDshWeb` 选择 `process.execPath`（即 Electron 可执行文件）作为兼容 Node 的运行时，并在子进程的环境里设置 `ELECTRON_RUN_AS_NODE=1`，这样 Electron 内置的 Node 就可以把嵌入的 CLI 当作普通 Node 进程来运行；在开发环境下它选择 `PATH` 中的 `node` 二进制且不设置该变量。不额外交付第二个 Node 运行时。Host 入口在打包时解析为 `process.resourcesPath/host/node_modules/@deepseek-ai/dsh/lib/bin.js`，在开发环境下解析为检出目录的 `apps/cli/lib/bin.js`。

应用生命周期由托盘而非窗口拥有。关闭窗口会将其隐藏（`window-lifecycle.ts` 阻止关闭并隐藏 `BrowserWindow`，使其渲染器与 Host 连接保持存活）；单实例锁（`app.requestSingleInstanceLock`）让第二次启动聚焦现有窗口；`window-all-closed` 是空操作。显式退出——托盘菜单中的 `退出`、已运行时启动第二个实例，或 `Cmd+Q` / 在退出尚未释放时的 `before-quit`——都路由到 `requestQuit`，它设置 `isQuitting`，仅一次地释放 Host，然后才 `app.quit()`。析构错误会被报告，而不会被静默地释放退出。

就绪是一个双方约定的单一行。`dsh web --host 127.0.0.1 --port 0` 绑定一个操作系统分配的环回端口并打印规范行 `dsh web: http://127.0.0.1:<port>/`；`createReadinessParser` 增量扫描 Host 的标准输出来定位该行，并将该 token 校验为带有显式整数端口的环回 HTTP，然后才释放用于加载窗口的 origin。对于那些在输出该行之前就退出的 Host、输出相互冲突的就绪 URL 的 Host，或耗时超过启动预算的 Host，监督者都会拒绝。

打包会组装一个封闭的依赖闭包。`apps/desktop/runtime/package.json` 是 `@deepseek-ai/dsh-desktop-runtime`，一个仅含依赖的部署根，用来列出打包后 Host 所需的各个 workspace 包。`scripts/stage-runtime.ts` 运行 `pnpm deploy --legacy --prod` 到 `apps/desktop/runtime-host/node_modules`，恢复遗留的 hoist 并物化 workspace 软链接，然后校验 CLI 入口与 Web 前端都存在。electron-builder 的 `extraResources` 把这段已暂存的树复制进 `.app` 下的 `Contents/Resources/host/`，而打包后的外壳在 `process.resourcesPath/host` 下定位 Host 入口与前端的资源。`scripts/verify-packaged-runtime.ts` 作为 `afterPack` 钩子运行，在构建出的应用中检查已暂存的运行时。

在任何渲染器加载之前，外壳已完成加固。`BrowserWindow` 使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；默认 session 安装拒绝一切的权限检查和权限请求处理函数；`will-navigate` 阻止导航离开 Host origin，`setWindowOpenHandler` 拒绝创建窗口，而是把外部的 HTTP(S) URL 交给默认浏览器打开。

## 曾考虑的替代方案

- **嵌入第二个独立的 Node 或打包一个 Node 二进制**：否决——通过 `ELECTRON_RUN_AS_NODE=1` 交付 Electron 自带的 Node，复用了已经内置的运行时，并保持闭包单一来源；额外增加一个 Node 会使体积与版本偏差翻倍，却并不改变被监督 Host 的模型。
- **把 Web 前端与 API 内联进 Electron 主进程**：否决——Host 是拥有自身监督与析构的真实子进程；内联会绕过既有的 `dsh web` 部署路径及其环回契约。
- **窗口拥有的生命周期（关闭窗口即退出）**：否决——改为关闭即隐藏，使 harness 在托盘图标背后继续运行，符合桌面应用的预期，也避免了每次打开都重启 Host 的缓慢代价。
- **固定一个众所周知的环回端口**：否决——`--port 0` 把端口选择委托给操作系统，就绪行提供实际的 origin，从而避免端口被占用时的冲突。

## 后果

- 桌面应用以零重新实现的方式复用整个环回 Web 产品；浏览器所服务的那个 Host，正是外壳所监督的那个 Host。
- 打包后的 `.app` 无需系统 Node，使 harness 可以双击运行；代价是在 bundle 内携带 Electron 运行时与已暂存的 `host` 闭包。
- 关闭窗口保持 Host 存活；退出是显式且有序的，Host 在进程退出前保证已被析构，而不是被抛弃。
- 安全加固在外壳层实施：沙箱化的渲染器、拒绝一切的权限，以及一个导航围栏把窗口限制在 Host origin 内，并把外部链接路由到默认浏览器。
- 打包是一段暂存的闭包（`runtime` 根 → `runtime-host` → `extraResources` → `Contents/Resources/host`），因此 Host 的依赖集由部署机制清单确定，并由 `afterPack` 钩子校验，而不是被隐式地组装。
