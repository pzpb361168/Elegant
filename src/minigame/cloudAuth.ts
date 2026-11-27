import type { AuthenticatedPlayer, AuthProfileStatus } from '../shared/onlineTypes.ts';
import type { WxUserInfo } from './wx.d.ts';
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

export interface WeChatProfileSyncInput {
  mode?: 'login' | 'updateProfile';
  nickName?: string;
  avatarUrl?: string;
  authStatus?: AuthProfileStatus;
}

let initialized = false;

function ensureCloudReady(): void {
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
}

export function normalizeWeChatAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let url = raw.trim();
  if (!url || url.length > 512) return '';
  if (url.startsWith('http://thirdwx.qlogo.cn/') || url.startsWith('http://wx.qlogo.cn/')) {
    url = 'https://' + url.slice('http://'.length);
  }
  return url.startsWith('https://') ? url : '';
}

export async function loginWithWeChat(profile?: WeChatProfileSyncInput): Promise<CloudAuthSession> {
  ensureCloudReady();

  const data: Record<string, unknown> = {};
  if (profile?.mode) data.mode = profile.mode;
  if (typeof profile?.nickName === 'string' && profile.nickName.trim()) {
    data.nickName = profile.nickName.trim().slice(0, 16);
  }
  const cleanOutboundAvatar = normalizeWeChatAvatarUrl(profile?.avatarUrl);
  if (cleanOutboundAvatar) {
    data.avatarUrl = cleanOutboundAvatar;
  }
  if (profile?.authStatus) data.authStatus = profile.authStatus;

  const response = await wx.cloud.callFunction({
    name: 'authLogin',
    data: Object.keys(data).length > 0 ? data : undefined,
  });
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

  const normalizedAvatar = normalizeWeChatAvatarUrl(player.avatarUrl);
  const avatarUrl = normalizedAvatar || undefined;
  const authStatus: AuthProfileStatus =
    player.authStatus === 'AUTHORIZED' ? 'AUTHORIZED' : 'GUEST_ALIAS';

  return {
    token: result.token,
    expiresAt: result.expiresAt,
    player: {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarUrl,
      authStatus,
    },
  };
}

export async function updateCloudProfile(
  profile: Omit<WeChatProfileSyncInput, 'mode'>
): Promise<CloudAuthSession> {
  return loginWithWeChat({ ...profile, mode: 'updateProfile' });
}

export async function fetchExistingWeChatUserInfo(): Promise<{
  authorized: boolean;
  userInfo: WxUserInfo | null;
}> {
  if (typeof wx.getSetting !== 'function') {
    return { authorized: false, userInfo: null };
  }

  const authorized = await new Promise<boolean>((resolve) => {
    try {
      wx.getSetting!({
        success: (res) => resolve(Boolean(res?.authSetting?.['scope.userInfo'])),
        fail: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });

  if (!authorized || typeof wx.getUserInfo !== 'function') {
    return { authorized, userInfo: null };
  }

  const userInfo = await new Promise<WxUserInfo | null>((resolve) => {
    try {
      wx.getUserInfo!({
        lang: 'zh_CN',
        success: (res) => resolve(res?.userInfo ?? null),
        fail: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });

  return { authorized: true, userInfo };
}
