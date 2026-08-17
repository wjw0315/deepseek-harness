# @deepseek-ai/dsh-desktop-host-config

[English](README.md) | 中文

桌面 Web Host 配置插件：一张设置卡，暴露回环绑定地址（`webHost`）、固定端口（`webPort`）、以及 `/api` 浏览器信任门禁额外接受的权威（`trustedHosts`）。设置卡的 base 层由 Electron 壳为实际启动发布的 `DSH_DESKTOP_WEB_*` 环境变量播种，因此首次打开时就显示应用实际运行的值（如 `127.0.0.1:51925`），而不是 schema 默认值。每次变更生效时，把解析后的值写回一个小型 JSON 配置文件，Electron 壳（`apps/desktop`）在启动 `dsh web` 时读取它，从而无需重新打包即可在 GUI 里重新绑定 Host。

## 配置项

| 字段 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `webHost` | `'127.0.0.1' | 'localhost'` | `'127.0.0.1'` | 传给 `dsh web --host` 的回环绑定地址。harness CLI 拒绝 `0.0.0.0`（会暴露远程代码执行），故此处仅限回环。 |
| `webPort` | `number` | `0` | 传给 `dsh web --port` 的固定回环端口；`0` 表示让操作系统分配。 |
| `trustedHosts` | `string[]` | `[]` | `/api` 浏览器信任门禁额外接受的权威，作为 `--trusted-host` 参数传入。 |

## 工作原理

桌面应用以 `--host`、`--port`、`--trusted-host` 参数启动 `dsh web`。这些值必须在进程启动前确定，而 harness 的设置文档属于 `dsh-settings`（进程内服务），桌面在进程运行前读不到。本插件负责打通二者：

1. 通过 `installSettingsSection` 注册设置命名空间（`desktop-host-config`），从而值可在 GUI 设置中编辑并持久化到 harness 设置文档。注册的 `base` 层依次解析 schema 默认值、显式的组合 `config`、以及 `DSH_DESKTOP_WEB_HOST` / `DSH_DESKTOP_WEB_PORT` / `DSH_DESKTOP_TRUSTED_HOSTS` 环境变量——启动事实优先，因为 Loader 会把缺失的 entry config 解析为 schema 默认值，若优先于环境变量会遮蔽 Host 实际绑定的端口。
2. Electron 壳启动 Host 时设置 `DSH_DESKTOP_HOST_CONFIG` 指向一个可写的 JSON 路径（Electron `userData` 下）。插件在 `onChange` 把解析后的 `{webHost, webPort, trustedHosts}` 写入该路径。
3. 桌面的 `main.ts` 在下次启动时读取该 JSON（纯 JSON，Electron 渲染路径无需 YAML 依赖）并把值传给 `dsh web`。

独立运行的 `dsh web`（未设 `DSH_DESKTOP_*` 环境变量）只显示设置卡、不写文件；只有 Electron 壳会写桌面读取的那个文件。

## 行为说明

- 设置变更在**下一次**启动 Host 时生效；本插件刻意不重启正在运行的 Host（那会中断你正在操作的会话）。重启应用（或触发 Host 重新拉起）即可应用。
- schema 与 validate 钩子将 `webHost` 限制在回环，与 harness 的安全决策一致。
- 环境变量播种的 base 遵循同样的校验：非回环的 `DSH_DESKTOP_WEB_HOST`、非数字或越界的 `DSH_DESKTOP_WEB_PORT`（任意整数 `0..65535` 均有效，包括 `3080`），以及空白信任域名都会按字段忽略。桌面壳从其解析后的配置发布这些变量，因此无效值只会回退到默认值。
- 保存后，用户设置段（settings.yaml）始终优先于环境变量播种的 base，因此编辑设置卡并保存仍然与前版行为一致。

## 开发

使用本包自身的 tsconfig 进行类型检查与构建；本包是 `dsh-web-app` bundle 中的一个 host 行。
