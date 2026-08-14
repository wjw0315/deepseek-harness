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

## 签名后的 macOS DMG

`dist:mac:desktop` 命令需要有效的 `Developer ID Application` 身份以及一个完整的公证凭据来源。凭据细节参见规范文档。
