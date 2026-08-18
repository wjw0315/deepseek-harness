# Agent Note: dshmarket 作为内置 web profile bundle 随附交付

Status: implemented

[English](2026-08-18-dshmarket-in-box-bundle.md) | 中文

## 问题

桌面与 Web 产品即 DSH `web` profile。要分发插件市场（浏览、搜索、一键安装），需要 `web` profile 挂载 `dshmarket` bundle，否则用户只能通过手工在 profile 本地安装。目标是让内置插件市场随每个全新的 `web` profile 一起交付，并且 `dsh plugin --profile web add dshmarket` 能可靠地激活它，无需为了解析它而进行一次 profile 本地 npm 拉取。

## 决策

`dshmarket`（npm `1.13.1`）是与 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 并列的内置 profile bundle——即 [profile 插件 bundle 说明](2026-08-05-profile-plugin-bundles.md) 所拥有的同一条 `dsh.profile.bundles` 机制，这里应用于一个随附的第三方市场。具体做法：

- `apps/cli/package.json` 在 `dependencies` 中声明 `dshmarket@^1.13.1`，使它进入 `@deepseek-ai/dsh` 安装闭包。该闭包正是 `healProfilesModuleFallback` 镜像为 `$DSH_HOME/profiles/node_modules` 下的软链接、并由桌面 `stage-runtime.ts` 暂存进打包后 Host 的内容，因此 profile 启动可以自安装闭包解析 `dshmarket`，而无需 pnpm 在 profile 里管理它。
- `packages/boot/app-boot/src/profile.ts` 中的 `PROFILE_TEMPLATES.web` 为 `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket']`，因此一个全新初始化的 `web` profile 会把它列为 bundle 层。`loadProfile` 解析其 `dsh.bundle.patch`（`cordis.patch.yml`），后者插入挂载 `dshmarket` 的 `dsh-market` 主机条目。
- 无需改动 `packages/bundle/web-app`：`dshmarket` 自带描述。它自己的 manifest 声明了 `dsh.bundle`，`@deepseek-ai/dsh-client-modules` 从 loader 条目发现其 `dsh.client` 并提供 `/plugins/dshmarket/client.js`，因此市场的浏览器端会自动组合进 `window.__DSH_BOOT__`。

该 tarball 自带构建好的 `lib/` 与 `client/client.js`，依赖自包含；没有把独立的 `dsh-market/dsh-market` 仓库源码复制进 `packages/`。`dsh plugin --profile web add dshmarket` 仍然是已初始化 profile 的激活路径，并且是幂等的：reconcile 拒绝把已在层列表中出现的 bundle 重复加入。

随加入而改变了两处仓库门禁。`knip` 无法把 bundle 视为被使用（它按名称解析，绝不通过 import），因此 `apps/cli` 的 `ignoreDependencies` 增加 `dshmarket`。pnpm 供应链的最小发布年龄门禁在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 中自动排除了这个刚发布的固定版本。

## 曾考虑的替代方案

- **把市场源码复制进 `packages/` 作为仓库自有的 workspace 包**：否决。这是一个独立维护的仓库，vendor 其源码会与本仓库针对我们并不拥有的包所做的逐文件覆盖率、invariant 伴生、聚合面、README 模型体验等门禁冲突，并会分叉未来的上游更新。依赖发布 tarball 与其它内置 bundle 的交付方式（可安装包 + `dsh.bundle`）一致。
- **仅把市场作为 profile 本地 npm 安装、不做内置闭包**：否决。这把每个全新 profile 都绑定到 `add` 时的网络拉取，并使随附的桌面应用无法自其 Host 闭包解析该 bundle。
- **`dshmarket` 只进闭包、不进 `PROFILE_TEMPLATES.web`**（仅按需启用）：否决——需求是一个真正内置、默认激活于全新 `web` profile 的市场；`add` 命令仍服务于已初始化 profile。

## 后果

- 每个全新 `web` profile 默认启用插件市场并启动；桌面/CLI 应用将其随附进 Host 闭包，无需 profile 本地安装即可解析。
- 一旦 `dsh-market` 条目成为已加载条目，client-modules 就会自动提供市场的客户端 bundle，使内置与树外插件共用同一条组合路径。
- 应用新增一个固定的外部依赖（`dshmarket@1.13.1`），运行时依赖仅 `js-yaml`；市场的更新通过提升固定版本并重跑安装门禁获得，而不是改写一份 vendor 的源码副本。
- 在此改动之前创建的已初始化 `web` profile 保留其自身的 bundles 列表，经由 `dsh plugin --profile web add dshmarket` 而非自动采用该市场。
