# 雅弈阁 · 微信小程序版（Taro 4 + React 18）

融合传统东方木艺美学的全栈棋类对战平台微信小程序版，完整迁移了 **五子棋**、**中国象棋**、**陆战军旗** 三款经典棋类的单机 AI / 本地双人玩法，以及基于 `Taro.connectSocket` 的 **实时 WebSocket 联机对战与观战**。

> **Git 分支说明**
> - `main` 分支：保留完整的 **Web 版**（React 19 + Vite + Tailwind CSS + Express/WS）。
> - `feat/wechat-miniprogram` 分支（当前分支）：**微信小程序版**（Taro 4 + React 18 + Canvas 2D + WebAudio）。

---

## 核心功能一览

### 1. 三大经典棋类与特色规则（全量适配小程序触控与 Canvas 2D）
- **五子棋（15×15 标准星位盘）**
  - 原生微信 `<Canvas type="2d">` 高清 DPR 绘制棋盘、星位、坐标标记与五连珠胜负连线。
  - 支持多难度 AI（初级 / 中级 / 高级）、本地双人、支招提示、悔棋与水墨涟漪落子动效。
- **中国象棋（10×9 楚河汉界标准盘）**
  - Canvas 2D 绘制楚河汉界与九宫格，完整实现将/帅照面、蹩马腿、塞象眼、炮打隔山、过河卒、将军/绝杀/困毙检测及双方被吃子陈列。
- **陆战军旗（翻棋模式 / 暗棋布阵双模式）**
  - **排雷前置机制**：必须先清空敌方全部地雷，才能拔取敌方军旗。工兵可直接排雷；炸弹可直接炸雷（同归于尽）；己方无工兵存活时，连续 3 枚棋子撞击同一颗地雷亦可清除该雷（棋面显示 `1/3`、`2/3` 受损计数）。
  - **动态最低官阶扛旗回营**：敌雷清空后，仅己方当前存活的**最低官阶**棋子（从工兵顺延至排长、连长……）可拔起敌方军旗，并将其**扛回己方大本营**方获胜。
  - **带旗免吃、仅可堵截**：扛旗中的棋子不可被敌方吃掉，仅能卡位堵截；带旗子亦不可主动攻敌。
  - **严格禁小打大**：常规官阶（`工兵`～`司令`）间仅允许**大吃小或同级同归**，禁止低官阶主动撞击高官阶送死（保留炸弹、排雷与三撞清雷）。
  - **无子即时判输**：任一方场上无任何可移动棋子（含全部阵亡，或仅剩地雷/军旗）即直接判输。
  - **棋盘两侧亮明阵亡**：所有模式下，棋盘左右两侧陈列匣实时公开亮明双方所有阵亡兵种。

### 2. 实时联机大厅与微信分享
- **SocketTask 实时联机**：基于 `Taro.connectSocket` 对接后端 `ws` 服务（`server.ts`），支持断线重连、公开大厅房间列表、房号直达与棋室文字聊天。
- **可配置服务端地址**：联机大厅内置 WebSocket 地址设置与本地持久化（默认 `ws://127.0.0.1:3000/ws`），真机调试时可直接修改为局域网 IP（如 `ws://192.168.x.x:3000/ws`）或线上 `wss://` 域名。
- **微信转发邀战**：支持页面级 `useShareAppMessage` 与房间内一键复制房号 / `<Button openType="share">` 转发邀友直达房间（自动解析 `?room=CODE` 参数）。

### 3. 声效与自适应布局
- 使用微信小程序 `Taro.createWebAudioContext()` 实时合成三套棋类声效，并采用 `Taro.getStorageSync` / `setStorageSync` 持久化战绩、静音开关、玩家昵称与联机地址。
- 全套 `rpx` 响应式布局与底部安全区适配，无内联 `<svg>` DOM 节点，符合微信 WXML 渲染规范。

---

## 技术栈

| 类别 | 技术选型 |
| --- | --- |
| 小程序框架 | Taro `4.3.3` · React `18.3.1` · TypeScript `5.6` |
| 棋盘渲染与样式 | 微信原生 `Canvas 2D` · SCSS（`rpx` 单位）· CSS Keyframes |
| 小程序能力适配 | `Taro.connectSocket` · `Taro.createWebAudioContext` · `Taro.getStorageSync` · `useShareAppMessage` |
| 联机服务端 | Express 4 · `ws` WebSocket Server · `src/shared/gameRules.ts`（前后端共用规则引擎） |

---

## 目录结构

```text
.
├── project.config.json            # 微信开发者工具配置（已预设测试号 touristappid 与 urlCheck: false）
├── babel.config.js                # Taro Babel 编译配置
├── config/                        # Taro 4 构建配置（index.ts / dev.ts / prod.ts）
├── server.ts                      # Express + WebSocket 独立联机服务端（默认端口 3000，/ws）
├── src/
│   ├── app.config.ts              # 小程序全局页面与导航栏配置
│   ├── app.scss                   # 全局 rpx 样式与三款棋类动效关键帧
│   ├── app.tsx                    # Taro 入口组件
│   ├── pages/index/
│   │   ├── index.config.ts        # 首页导航与微信转发分享配置
│   │   └── index.tsx              # 主框架（单机弈馆 / 联机大厅 / 底部导航 / 分享参数解析）
│   ├── shared/
│   │   ├── onlineTypes.ts         # 联机协议与状态类型定义
│   │   └── gameRules.ts           # 前后端共用权威走法、军旗排雷/扛旗/判负及迷雾清洗引擎
│   ├── components/
│   │   ├── BoardCanvases.tsx      # 五子棋、象棋、军旗微信原生 Canvas 2D 棋盘组件
│   │   ├── GomokuGame.tsx         # 单机/双人五子棋
│   │   ├── XiangqiGame.tsx        # 单机/双人中国象棋
│   │   ├── JunqiGame.tsx          # 单机/双人陆战军旗
│   │   ├── JunqiCapturedTray.tsx  # 军旗棋盘两侧阵亡棋子亮明陈列组件
│   │   ├── OnlineArena.tsx        # Taro SocketTask 联机连接、断线重连与服务端地址配置
│   │   ├── LobbyView.tsx          # 联机公开大厅、建房与地址设置面板
│   │   ├── OnlineRoomView.tsx     # 联机棋室（席位、观战、聊天、分享邀请、协商面板）
│   │   ├── OnlineBoardRenderer.tsx# 联机三棋种棋盘与特效渲染
│   │   └── RulesModal.tsx         # 棋道规则典籍弹窗
│   └── utils/
│       ├── sound.ts               # Taro WebAudio 多棋种音效合成器
│       ├── storage.ts             # 本地战绩存储（Taro Storage）
│       ├── playerIdentity.ts      # 免登录雅号持久化（Taro Storage）
│       └── wsConfig.ts            # 联机 WebSocket 服务地址配置持久化
```

---

## 小程序编译、联机服务与真机预览

### 1. 安装依赖

```bash
npm install
```

### 2. 编译微信小程序产物（输出至 `dist/`）

```bash
# 生产/单次编译
npm run build:weapp

# 开发监听模式（修改代码自动重编 dist/）
npm run dev:weapp

# TypeScript 类型检查
npm run lint
```

### 3. 导入微信开发者工具
1. 打开 **微信开发者工具**，选择「导入项目」。
2. 项目目录选择本仓库根目录（`/app/applet`，`project.config.json` 已设置 `miniprogramRoot: "dist/"`、`appid: "touristappid"` 与 `urlCheck: false`；也可直接导入 `dist/` 目录）。
3. 若使用个人/企业正式 AppID，可在开发者工具详情中替换 AppID，并在测试环境开启「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。

### 4. 启动联机 WebSocket 服务端（如需联机对战）

```bash
# 启动独立 WebSocket 联机服务器（默认监听 0.0.0.0:3000，WS 路径为 /ws）
npm run server
```

- **开发者工具模拟器联机**：在小程序「联机弈馆」内点击「设置地址」，保持默认 `ws://127.0.0.1:3000/ws` 即可直连本机服务端。
- **局域网真机预览联机**：在小程序「联机弈馆 → 设置地址」中输入电脑局域网 IP（例如 `ws://192.168.1.100:3000/ws`），并确保手机与电脑处于同一局域网。
- **正式发布上线**：部署 `server.ts` 至支持 TLS 的服务器并配置 `wss://你的域名/ws`，在微信公众平台配置 `socket 合法域名`。
