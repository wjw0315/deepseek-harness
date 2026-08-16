# @deepseek-ai/dsh-client-desktop-host-config

[English](README.md) | 中文

桌面 Web Host 配置功能的浏览器半：一张「通用设置」里的行，编辑宿主 `desktop-host-config` 设置命名空间——回环绑定地址、固定端口、以及 `/api` 浏览器信任门禁接受的信任域名。它与宿主插件 [`@deepseek-ai/dsh-desktop-host-config`](../../host/desktop-host-config/README.md) 配套，后者把提交的值回写到 Electron 壳在下次启动时读取的 JSON 文件。

## 模型体验

该行出现在**通用设置**中，名为**桌面应用 Web Host**。展开后出现三个待编辑输入（绑定地址、固定端口、信任域名）；点击**保存**会把表单写入设置命名空间，**重启应用**后新的绑定生效。这是一个纯设置界面：编辑偏好不会创建或改变任何助手会话，因此没有模型可见的影响。

## 配置

无需插件配置。该行读取并写入 `desktop-host-config` 设置命名空间（宿主插件拥有的同一命名空间），因此不涉及构建或重新打包。

## 开发

- 使用本包 tsconfig 进行类型检查；客户端行已注册在 `packages/bundle/web-app/cordis.patch.yml`。
- 测试：`pnpm vitest run packages/client/desktop-host-config`。
