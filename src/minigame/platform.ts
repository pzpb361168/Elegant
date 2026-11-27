import type { PlayerIdentity } from '../shared/onlineTypes.ts';
import type { AllGameStats, GameTab } from '../types/game.ts';

const STATS_KEY = 'yayi_pavilion_stats_v1';
const PLAYER_ID_KEY = 'yayi_online_player_id';
const NICKNAME_KEY = 'yayi_online_nickname';
const WS_URL_KEY = 'yayi_ws_server_url_v1';
const ONLINE_AUTH_PROMPT_DONE_KEY = 'yayi_online_auth_prompt_done_v1';
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

export function hasCompletedOnlineAuthPrompt(): boolean {
  return getStorage(ONLINE_AUTH_PROMPT_DONE_KEY) === '1';
}

export function markOnlineAuthPromptCompleted(): void {
  setStorage(ONLINE_AUTH_PROMPT_DONE_KEY, '1');
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

export function getSavedWsUrl(): string {
  const raw = getStorage(WS_URL_KEY);
  return raw && (raw.startsWith('ws://') || raw.startsWith('wss://'))
    ? raw
    : DEFAULT_WS_SERVER_URL;
}

export function saveWsUrl(url: string): string {
  const trimmed = url.trim();
  const valid =
    trimmed.startsWith('ws://') || trimmed.startsWith('wss://')
      ? trimmed
      : DEFAULT_WS_SERVER_URL;
  setStorage(WS_URL_KEY, valid);
  return valid;
}

let activeSystemModalCount = 0;
let onSystemModalChange: (() => void) | null = null;

export function setSystemModalChangeListener(cb: () => void): void {
  onSystemModalChange = cb;
}

export function isSystemModalOpen(): boolean {
  return activeSystemModalCount > 0;
}

export function setupWeChatPrivacyHandler(): void {
  if (typeof wx === 'undefined' || typeof wx.onNeedPrivacyAuthorization !== 'function') {
    return;
  }
  try {
    wx.onNeedPrivacyAuthorization((resolve) => {
      try {
        resolve({ event: 'exposureAuthorization' });
      } catch {
        // Ignore if unsupported
      }
      activeSystemModalCount++;
      if (onSystemModalChange) onSystemModalChange();
      try {
        wx.showModal({
          title: '用户隐私保护提示',
          content:
            '在你使用雅弈阁联机对战服务前，请阅读并同意《用户隐私保护指引》。同意后，我们将仅在获取你明示授权后收集微信昵称与头像用于棋室席位展示。',
          confirmText: '同意',
          cancelText: '拒绝',
          success: (res) => {
            activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
            if (res.confirm) {
              resolve({ event: 'agree' });
            } else {
              resolve({ event: 'disagree' });
            }
            if (onSystemModalChange) onSystemModalChange();
          },
        });
      } catch {
        activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
        resolve({ event: 'agree' });
        if (onSystemModalChange) onSystemModalChange();
      }
    });
  } catch {
    // Ignore on older base libraries
  }
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
    activeSystemModalCount++;
    if (onSystemModalChange) onSystemModalChange();
    wx.showModal({
      title,
      content: defaultValue,
      editable: true,
      placeholderText,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
        if (onSystemModalChange) onSystemModalChange();
        if (res.confirm && typeof res.content === 'string') {
          onConfirm(res.content);
        }
      },
    });
  } catch {
    activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
    if (onSystemModalChange) onSystemModalChange();
    showToast('当前环境不支持弹窗输入');
  }
}

export function confirmModal(
  title: string,
  content: string,
  onConfirm: () => void
): void {
  try {
    activeSystemModalCount++;
    if (onSystemModalChange) onSystemModalChange();
    wx.showModal({
      title,
      content,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
        if (onSystemModalChange) onSystemModalChange();
        if (res.confirm) onConfirm();
      },
    });
  } catch {
    activeSystemModalCount = Math.max(0, activeSystemModalCount - 1);
    if (onSystemModalChange) onSystemModalChange();
    onConfirm();
  }
}
