# Watch Claw

[English](./README.md)

> 一个像素风小屋，你的 OpenClaw AI 就住在里面 -- 实时观看它写代码、思考、休息和庆祝。

![Watch Claw V1 截图](./docs/assets/V1-demo.jpg)

当你在终端里使用 [OpenClaw](https://github.com/openclaw/openclaw) 时，**Watch Claw** 会在一栋像素风三层小屋里，以动画的形式实时呈现 AI 正在做什么：写代码时跑去机房敲键盘，搜索资料时站在阳台上眺望，空闲时回卧室打瞌睡……

## 快速开始

### 下载桌面应用（推荐）

前往 [Releases](https://github.com/luyao618/watch-claw/releases) 页面下载最新版本：

- **macOS**: `.dmg` 安装包或 `.zip` 压缩包

打开应用后，它会自动启动内置的 Bridge Server 并连接本地正在运行的 OpenClaw 会话。无需安装 Node.js 或任何开发工具。

桌面应用支持：

- **系统托盘** -- 关闭窗口后仍在后台运行，随时从托盘恢复
- **窗口置顶** -- 可设为始终在最前，边写代码边看角色动态
- **自动重连** -- 断连后自动重连，切换 OpenClaw 会话时无缝衔接

### 从源码运行

```bash
git clone https://github.com/luyao618/watch-claw.git
cd watch-claw
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173`，然后在另一个终端启动 OpenClaw 会话，就能看到角色跟着动起来。

## 它是怎么工作的

```
OpenClaw 执行工具  -->  会话日志 (JSONL)  -->  Bridge Server 推送  -->  角色做出反应
```

一个轻量级 Bridge Server 监控 OpenClaw 的会话日志（`~/.openclaw/agents/main/sessions/`），检测到新事件后通过 WebSocket 推送到前端，角色就会走到对应的房间、播放动画、显示情绪。

## 房间与行为对照

角色会根据 AI 正在执行的操作，自动走到对应的房间：

```
         +-------------------------------------------------+
  3F     |  📦 仓库           📚 书房         🌙 阳台       |
  阁楼   |  (下载安装)        (读写文件)      (搜索网页)    |
         +-------------------------------------------------+
  2F     |  🔧 工具间         🛋 办公室       🛏 卧室       |
  主楼层 |  (执行命令)        (对话思考)      (空闲休息)    |
         +-------------------------------------------------+
  1F     |  🏚 地下室         🖥 机房          🗑 垃圾桶     |
  底层   |  (子代理任务)      (编程构建)      (删除文件)    |
         +-------------------------------------------------+
```

| AI 在做什么                                               | 角色去哪  | 表情 |
| --------------------------------------------------------- | --------- | ---- |
| `web_search` / `web_fetch`                                | 🌙 阳台   | 好奇 |
| `read` / `write` / `edit` / `grep` 等文件操作             | 📚 书房   | 专注 |
| 下载安装（`curl`, `pip install`, `npm install`...）       | 📦 仓库   | 好奇 |
| 编程构建（`git`, `python`, `node`, `cargo`, `docker`...） | 🖥 机房   | 专注 |
| 通用命令（`ls`, `echo` 等）                               | 🔧 工具间 | 严肃 |
| 回复消息 / 思考中                                         | 🛋 办公室 | 思考 |
| 子代理 / 多会话协作                                       | 🏚 地下室 | 思考 |
| 删除文件（`rm`, `trash`...）                              | 🗑 垃圾桶 | 严肃 |
| 空闲超过 30 秒 / 会话结束                                 | 🛏 卧室   | 困倦 |

## 键盘操作

| 按键             | 功能              |
| ---------------- | ----------------- |
| 方向键           | 手动控制角色移动  |
| `Z`              | 切换全屋视图      |
| `F`              | 镜头跟随角色      |
| `D`              | 显示/隐藏状态面板 |
| `M`              | 静音              |
| `+` / `-` 或滚轮 | 缩放              |

## 开发者命令

```bash
pnpm dev                     # 启动开发服务器 + Bridge Server
pnpm dev:electron            # 以 Electron 桌面应用运行
pnpm build                   # 生产构建
pnpm build:electron:mac      # 打包 macOS zip
pnpm build:electron:mac:dmg  # 打包 macOS DMG 安装包
pnpm test                    # 运行测试
pnpm lint                    # 代码检查
pnpm typecheck               # 类型检查
```

详细的发布流程见 [Release Guide](./docs/RELEASE.md)。

## 技术栈

Phaser 3 (Arcade Physics) + React 19 + TypeScript + Vite + Electron + WebSocket

## 文档

- [产品需求文档](./docs/PRD_CN.md)（[EN](./docs/PRD.md)）
- [技术设计文档](./docs/TECHNICAL_CN.md)（[EN](./docs/TECHNICAL.md)）
- [任务分解](./docs/TASKS_CN.md)（[EN](./docs/TASKS.md)）

## 贡献

欢迎提交 Pull Request！Fork 仓库 -> 创建分支 -> 提交更改 -> 发起 PR。

## 开源协议

[MIT](./LICENSE) -- Copyright 2026 luyao618
