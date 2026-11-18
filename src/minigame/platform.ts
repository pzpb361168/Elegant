import type { PlayerIdentity } from '../shared/onlineTypes.ts';
import type { AllGameStats, GameTab } from '../types/game.ts';

const STATS_KEY = 'yayi_pavilion_stats_v1';
const PLAYER_ID_KEY = 'yayi_online_player_id';
const NICKNAME_KEY = 'yayi_online_nickname';
const WS_URL_KEY = 'yayi_ws_server_url_v1';
export const DEFAULT_WS_SERVER_URL = 'ws://127.0.0.1:3000/ws';

const ORIENTAL_PREFIXES = ['松风', '竹影', '青衫', '听雨', '云水', '墨香', '清茶', '明月', '南山', '沧海'];
const ORIENTAL_SUFFIXES = ['弈客', '居士', '棋士', '书生', '隐士', '散人', '雅士', '公子'];

const DEFAULT_STATS: AllGameStats = {
  GOMOKU: { wins: 0, losses: 0, draws: 0 },
  XIANGQI: { wins: 0, losses: 0, draws: 0 },
  JUNQI: { wins: 0, losses: 0, draws: 0 },
};

export interface ScreenMetrics {
  width: number;
  height: number;
  dpr: number;
  safeTop: number;
  safeBottom: number;
  capsuleLeft: number;
}

export function getScreenMetrics(): ScreenMetrics {
  try {
    const info =
      typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = info.windowWidth || 375;
    const height = info.windowHeight || 667;
    const dpr = Math.min(3, info.pixelRatio || 2);
    let safeTop = info.safeArea?.top ?? info.statusBarHeight ?? 20;
    let capsuleLeft = width - 96;
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      try {
        const cap = wx.getMenuButtonBoundingClientRect();
        if (cap && cap.bottom > 0) {
          safeTop = Math.max(safeTop, cap.top);
          if (cap.left > 0) capsuleLeft = cap.left - 8;
        }
      } catch {
        // Ignore on unsupported simulators
      }
    }
    const safeBottom = info.safeArea ? Math.max(0, height - info.safeArea.bottom) : 0;
    return { width, height, dpr, safeTop, safeBottom, capsuleLeft };
  } catch {
    return { width: 375, height: 667, dpr: 2, safeTop: 20, safeBottom: 0, capsuleLeft: 279 };
  }
}

export function getStorage(key: string): string | null {
  try {
    const v = wx.getStorageSync(key);
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setStorage(key: string, val: string): void {
  try {
    wx.setStorageSync(key, val);
  } catch {
    // Ignore storage quota errors
  }
}

export function loadGameStats(): AllGameStats {
  try {
    const raw = getStorage(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      GOMOKU: { ...DEFAULT_STATS.GOMOKU, ...(parsed.GOMOKU || {}) },
      XIANGQI: { ...DEFAULT_STATS.XIANGQI, ...(parsed.XIANGQI || {}) },
      JUNQI: { ...DEFAULT_STATS.JUNQI, ...(parsed.JUNQI || {}) },
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function recordGameOutcome(
  game: Exclude<GameTab, 'LOBBY' | 'ONLINE'>,
  outcome: 'WIN' | 'LOSS' | 'DRAW'
): AllGameStats {
  const current = loadGameStats();
  const target = { ...current[game] };
  if (outcome === 'WIN') target.wins += 1;
  else if (outcome === 'LOSS') target.losses += 1;
  else target.draws += 1;
  const updated: AllGameStats = { ...current, [game]: target };
  setStorage(STATS_KEY, JSON.stringify(updated));
  return updated;
}

export function resetAllGameStats(): AllGameStats {
  setStorage(STATS_KEY, JSON.stringify(DEFAULT_STATS));
  return {
    GOMOKU: { ...DEFAULT_STATS.GOMOKU },
    XIANGQI: { ...DEFAULT_STATS.XIANGQI },
    JUNQI: { ...DEFAULT_STATS.JUNQI },
  };
}

export function generateRandomAlias(): string {
  const pre = ORIENTAL_PREFIXES[Math.floor(Math.random() * ORIENTAL_PREFIXES.length)];
  const suf = ORIENTAL_SUFFIXES[Math.floor(Math.random() * ORIENTAL_SUFFIXES.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${pre}${suf}${num}`;
}

let sessionPlayerId: string | null = null;

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  if (!sessionPlayerId) {
    const saved = getStorage(PLAYER_ID_KEY);
    if (saved) {
      sessionPlayerId = saved;
    } else {
      sessionPlayerId = `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      setStorage(PLAYER_ID_KEY, sessionPlayerId);
    }
  }
  let nickname = getStorage(NICKNAME_KEY);
  if (!nickname || !nickname.trim()) {
    nickname = generateRandomAlias();
    setStorage(NICKNAME_KEY, nickname);
  }
  return { playerId: sessionPlayerId, nickname };
}

export function savePlayerNickname(nickname: string): PlayerIdentity {
  const current = getOrCreatePlayerIdentity();
  const clean = nickname.trim().slice(0, 16) || generateRandomAlias();
  setStorage(NICKNAME_KEY, clean);
  return { ...current, nickname: clean };
}

export interface CloudContainerTarget {
  env: string;
  service: string;
  path: string;
}

export function parseCloudContainerTarget(url: string): CloudContainerTarget | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('cloud://')) return null;
  const rest = trimmed.slice('cloud://'.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const env = parts[0];
  const service = parts[1];
  const path = parts.length > 2 ? '/' + parts.slice(2).join('/') : '/ws';
  return { env, service, path };
}

export function isValidWsTarget(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith('ws://') ||
    trimmed.startsWith('wss://') ||
    parseCloudContainerTarget(trimmed) !== null
  );
}

export function getSavedWsUrl(): string {
  const raw = getStorage(WS_URL_KEY);
  return raw && isValidWsTarget(raw) ? raw : DEFAULT_WS_SERVER_URL;
}

export function saveWsUrl(url: string): string {
  const trimmed = url.trim();
  const valid = isValidWsTarget(trimmed) ? trimmed : DEFAULT_WS_SERVER_URL;
  setStorage(WS_URL_KEY, valid);
  return valid;
}

export function showToast(title: string, icon: 'success' | 'none' = 'none'): void {
  try {
    wx.showToast({ title, icon, duration: 1800 });
  } catch {
    // Ignore
  }
}

export function promptEditableModal(
  title: string,
  defaultValue: string,
  placeholderText: string,
  onConfirm: (value: string) => void
): void {
  try {
    wx.showModal({
      title,
      content: defaultValue,
      editable: true,
      placeholderText,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm && typeof res.content === 'string') {
          onConfirm(res.content);
        }
      },
    });
  } catch {
    showToast('当前环境不支持弹窗输入');
  }
}

export function confirmModal(
  title: string,
  content: string,
  onConfirm: () => void
): void {
  try {
    wx.showModal({
      title,
      content,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) onConfirm();
      },
    });
  } catch {
    onConfirm();
  }
}
