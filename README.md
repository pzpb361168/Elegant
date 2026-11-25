# 雅弈阁 — 东方经典棋室（微信原生小游戏版）

融合传统东方木艺美学的三合一棋类平台，基于 **微信小游戏原生 Canvas 2D + TypeScript** 架构，兼容已选「游戏」类目的微信小程序 AppID（`wx2079d48526fd71c9`），支持**单机人机博弈（PvE）**、**本地双人同屏（PvP）**与 **WebSocket 实时联机对战 / 观战**。

> **三版本 Git 分支说明**
> - `main` 分支：**网页版**（React 19 + Vite 8 + Tailwind CSS + Express/WS）
> - `feat/wechat-miniprogram` 分支：**微信小程序版**（Taro 4 + React 18 + Canvas 2D，适合「小程序」非游戏类目 AppID）
> - `feat/wechat-minigame` 分支（当前分支）：**微信原生小游戏版**（`compileType: "game"`，生成 `dist/game.json` 与 `dist/game.js`，直接适配游戏类目 AppID `wx2079d48526fd71c9`）

---

## 核心功能

### 1. 三大经典棋类与规则
- **五子棋（15×15 标准星位盘）**：支持初级 / 中级 / 高级 AI、本地双人、悔棋、支招提示与五连珠高亮连线。
- **中国象棋（10×9 楚河汉界标准盘）**：支持 Alpha-Beta AI（初级 / 中级 / 高级）、本地双人、完整走法校验（将帅照面、蹩马腿、塞象眼、炮打隔山）、将军 / 绝杀 / 困毙检测及双方被吃棋子展示。
- **陆战军旗（12×5 翻棋 / 暗棋布阵双模式）**：
  - **排雷前置机制**：必须先清空敌方全部地雷才能拔取敌方军旗；工兵可直接排雷并占领，炸弹可爆破地雷（同归于尽），己方无工兵存活时连续 3 枚棋子撞击同一地雷可清除（实时显示 `1/3`、`2/3`）。
  - **动态最低官阶扛旗回营**：敌雷清空后，仅己方当前存活的最低官阶可拔起敌旗，扛回己方大本营获胜。
  - **带旗免吃、仅可堵截**：扛旗棋子不可被吃，也不可主动攻敌，只能被敌方卡位堵截。
  - **严格禁小打大**：常规官阶 `1~9` 仅允许大吃小或同级对兑，禁止低官阶主动撞高官阶。
  - **无子即时判输**：场面上无任何可移动棋子即刻判输。
  - **左右两侧阵亡亮明匣**：所有模式下棋盘左右两侧陈列匣均实时公开亮明双方阵亡兵种。

### 2. 实时联机大厅与棋室
- 基于 `wx.connectSocket` 接入同一套 Express + `ws` 服务端（`/ws`）。
- 支持公开棋室大厅刷新、创建房间、房号直达、点击/复制邀请路径（`?room=房号`）、微信转发卡片带房号直达。
- 支持自由换座、观战席实时同步、暗棋布阵己方编辑与防透视迷雾清洗、快捷聊天、悔棋 / 和棋协商、认负与再来一局。
- 支持在联机大厅直接点击切换并持久化 WebSocket 服务端地址（本地调试默认 `ws://127.0.0.1:3000/ws`，真机调试填入局域网 IP 或公网 `wss://` 域名）。

### 3. Canvas 2D 交互与合成音效
- 顶部栏自动避让微信右上角胶囊安全区（`wx.getMenuButtonBoundingClientRect()`）。
- 底部 4 标签页切换：五子棋 / 中国象棋 / 陆战军旗 / 联机棋室。
- 规则典籍弹窗、战绩统计弹窗、建房弹窗、聊天弹窗均支持触控滑动。
- 基于 `wx.createWebAudioContext()` 合成三套棋种音效，支持一键静音。

---

## 目录结构

```text
.
├── minigame/
│   └── game.json                  # 微信小游戏全局配置（竖屏、隐藏系统状态栏）
├── project.config.json            # 微信开发者工具配置（compileType: "game", wx2079d48526fd71c9）
├── scripts/
│   └── build-minigame.mjs         # esbuild 打包脚本：产出 dist/game.js、dist/game.json、dist/project.config.json
├── server.ts                      # 联机 WebSocket + HTTP 健康检查服务端（端口 3000）
├── src/
│   ├── shared/
│   │   ├── onlineTypes.ts         # 联机协议与状态类型
│   │   └── gameRules.ts           # 前后端共用权威规则与迷雾清洗引擎
│   ├── types/
│   │   └── game.ts                # 本地模式与战绩类型定义
│   └── minigame/
│       ├── wx.d.ts                # 微信小游戏全局 wx API 类型声明
│       ├── platform.ts            # 屏幕安全区、本地存储、昵称与弹窗工具
│       ├── sound.ts               # wx.createWebAudioContext 音效合成器
│       ├── engines.ts             # 三棋种单机引擎与 AI
│       ├── onlineClient.ts        # wx.connectSocket 联机客户端与断线重连
│       ├── ui.ts                  # Canvas 2D 调色盘、按钮、滚动区域与动画特效队列
│       ├── boardsRenderer.ts      # 五子棋 / 象棋 / 军旗 Canvas 2D 棋盘绘制器
│       ├── scenes.ts              # 界面场景、弹窗、战局交互主控制器
│       └── main.ts                # 小游戏入口、DPR 适配、触控与分享挂载
```

---

## 构建与运行指南

### 1. 安装依赖

```bash
npm install
```

### 2. 编译打包微信小游戏到 `dist/`

```bash
# 类型检查
npm run lint

# 构建产物到 dist/（生成 dist/game.json、dist/game.js、dist/project.config.json）
npm run build:minigame
```

或开启监听模式持续构建：

```bash
npm run dev:minigame
```

### 3. 导入微信开发者工具
1. 打开 **微信开发者工具**，选择 **导入项目**。
2. 目录既可选择 **项目根目录**（根目录 `project.config.json` 已设置 `"miniprogramRoot": "dist/"` 和 `"compileType": "game"`），也可直接选择 **`dist/` 目录**（`dist/project.config.json` 与 `dist/game.json` 均已就绪）。
3. 确认 AppID 为 `wx2079d48526fd71c9`，编译模式为 **小游戏**。
4. 本地联机调试时，请在微信开发者工具右上角 **详情 → 本地设置** 中勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。

### 4. 启动联机 WebSocket 服务端

```bash
npm run server
```

服务端默认监听 `http://0.0.0.0:3000`：
- 健康检查：`GET /api/health`
- WebSocket 联机端点：`/ws`
- 开发者工具模拟器默认连接 `ws://127.0.0.1:3000/ws`；真机预览时请在大厅点击「服务端地址」改为本机局域网 `ws://你的IP:3000/ws` 或正式 `wss://` 域名。

### 微信云开发认证 + 免域名云托管联机

本分支联机版仅接受微信小游戏云开发身份认证，并通过 `wx.cloud.connectContainer` 微信内网专有通道连接云托管 WebSocket（**全程无需域名、无需域名 ICP 备案、无需配置 socket 合法域名**）。完整配置、密钥管理和云托管部署步骤见 [docs/wechat-cloud-auth-deployment.md](docs/wechat-cloud-auth-deployment.md)。

