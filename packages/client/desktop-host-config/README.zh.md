# @deepseek-ai/dsh-client-desktop-host-config

[English](README.md) | 中文

桌面 Web Host 配置功能的浏览器半：一张「通用设置」里的行，编辑宿主 `desktop-host-config` 设置命名空间——回环绑定地址、固定端口、以及 `/api` 浏览器信任门禁接受的信任域名。它与宿主插件 [`@deepseek-ai/dsh-desktop-host-config`](../../host/desktop-host-config/README.md) 配套，后者把提交的值回写到 Electron 壳在下次启动时读取的 JSON 文件。

## 配置

无需插件配置。该行读取并写入 `desktop-host-config` 设置命名空间（宿主插件拥有的同一命名空间），因此不涉及构建或重新打包。

## 开发

- 使用本包 tsconfig 进行类型检查；客户端行已注册在 `packages/bundle/web-app/cordis.patch.yml`。
- 测试：`pnpm vitest run packages/client/desktop-host-config`。

## 模型体验

None, as this is a pure settings surface: editing the card's values creates and alters no assistant chats, so nothing reaches a model request.

#### KV Cache effect

无。表单只写入 `desktop-host-config` 设置命名空间并渲染自己的控件；它不发起任何模型请求，也不贡献任何 prompt 或 KV-cache 状态。

## 已知限制与暂缓事项

- **应用新绑定不归本行负责** —— 提交的值只有经由 Electron 壳在下次启动时读取的 JSON 文件才能抵达宿主；本行自身无法重启宿主。
