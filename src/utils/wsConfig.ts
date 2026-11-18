import Taro from '@tarojs/taro';

const WS_URL_STORAGE_KEY = 'yayi_ws_server_url_v1';
export const DEFAULT_WS_SERVER_URL = 'ws://127.0.0.1:3000/ws';

export function getSavedWsUrl(): string {
  try {
    const saved = String(Taro.getStorageSync(WS_URL_STORAGE_KEY) || '').trim();
    if (saved && /^wss?:\/\//i.test(saved)) {
      return saved;
    }
  } catch {
    // Ignore
  }
  return DEFAULT_WS_SERVER_URL;
}

export function saveWsUrl(url: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = url.trim();
  if (!/^wss?:\/\/\S+$/i.test(trimmed)) {
    return {
      ok: false,
      error: '服务端地址须以 ws:// 或 wss:// 开头（例如 ws://127.0.0.1:3000/ws）',
    };
  }
  try {
    Taro.setStorageSync(WS_URL_STORAGE_KEY, trimmed);
  } catch {
    // Ignore
  }
  return { ok: true, url: trimmed };
}
