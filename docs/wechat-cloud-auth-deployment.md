# 微信云开发身份认证与联机部署

本项目的联机功能仅允许通过当前微信小游戏 AppID 认证的用户连接。网页端账号、网页服务和客户端自报的 `playerId` 都不会参与认证。

## 身份链路

```text
小游戏 wx.cloud.callFunction('authLogin')
  -> 云函数从 getWXContext() 取得 OPENID
  -> users 集合查找或创建游戏用户
  -> 使用 ONLINE_AUTH_SECRET 签发 30 分钟在线令牌
  -> 小游戏以 auth:login 首帧发送令牌
  -> 云托管 WebSocket 验签并把用户绑定到当前连接
```

WebSocket 服务只从已验证的连接会话读取用户 ID 和昵称。建房、入座、走棋、认输、聊天等后续消息均不包含用户 ID，客户端无法冒充其他玩家。

## 一次性配置

1. 在微信开发者工具中开通云开发环境，并记下环境 ID。
2. 编辑 `src/minigame/cloudConfig.ts`：

   ```ts
   export const CLOUD_ENV_ID = '你的云开发环境 ID';
   export const ONLINE_WSS_URL = 'wss://云托管服务域名/ws';
   ```

3. 在云开发控制台创建数据库集合 `users`。初版字段为：`openId`、`nickname`、`createdAt`、`lastLoginAt`。
4. 将 `cloudfunctions/authLogin/` 部署为名为 `authLogin` 的云函数，并为它配置环境变量 `ONLINE_AUTH_SECRET`。
5. 使用同一个 `ONLINE_AUTH_SECRET` 配置云托管服务的环境变量。该值至少 32 个随机字符，绝不能写入小游戏代码、Git 或客户端配置。
6. 使用仓库根目录 `Dockerfile` 部署云托管服务。服务会读取平台提供的 `PORT`，健康检查为 `/api/health`，WebSocket 路径为 `/ws`。
7. 在小游戏后台把云托管域名加入 Socket 合法域名。正式版必须使用 `wss://`。

## 数据库权限

不要为 `users` 开放客户端读写权限。`openId` 仅由云函数读取和写入；客户端只应获得云函数返回的内部用户 ID、展示昵称和短期令牌。

## 发布前检查

```powershell
npm.cmd run lint
npm.cmd run build:minigame
```

在两台真实微信设备上验证：首次进入联机大厅、创建/加入同一房间、聊天、走棋、断线重连。令牌有效期为 30 分钟，断线重连时客户端会重新调用云函数换取新令牌。

## 运行边界

当前房间状态仍保存在云托管实例内存中，适合单实例试玩。服务重启会清空房间；扩容为多实例前，应将房间状态和登录会话迁移到 Redis，并将战绩/棋谱保存到云开发数据库。
