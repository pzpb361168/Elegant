import type { AuthenticatedPlayer } from '../shared/onlineTypes.ts';
import { CLOUD_ENV_ID, isCloudConfigReady } from './cloudConfig.ts';

interface CloudLoginResult {
  token?: unknown;
  expiresAt?: unknown;
  player?: unknown;
}

export interface CloudAuthSession {
  token: string;
  expiresAt: number;
  player: AuthenticatedPlayer;
}

let initialized = false;

export async function loginWithWeChat(): Promise<CloudAuthSession> {
  if (!isCloudConfigReady()) {
    throw new Error('联机服务尚未配置云开发环境 ID 与云托管服务名');
  }
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前微信基础库不支持云开发，请升级基础库');
  }
  if (!initialized) {
    wx.cloud.init({ env: CLOUD_ENV_ID.trim() });
    initialized = true;
  }

  const response = await wx.cloud.callFunction({ name: 'authLogin' });
  const result = (response.result || {}) as CloudLoginResult;
  const player = result.player as Partial<AuthenticatedPlayer> | undefined;
  if (
    typeof result.token !== 'string' ||
    typeof result.expiresAt !== 'number' ||
    !player ||
    typeof player.playerId !== 'string' ||
    typeof player.nickname !== 'string'
  ) {
    throw new Error('微信身份认证返回无效，请稍后重试');
  }
  return {
    token: result.token,
    expiresAt: result.expiresAt,
    player: { playerId: player.playerId, nickname: player.nickname },
  };
}
