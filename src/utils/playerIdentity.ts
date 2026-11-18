import Taro from '@tarojs/taro';
import type { PlayerIdentity } from '../shared/onlineTypes';

const PLAYER_ID_KEY = 'yayi_online_player_id';
const NICKNAME_KEY = 'yayi_online_nickname';

const ORIENTAL_PREFIXES = [
  '松风',
  '竹影',
  '青衫',
  '听雨',
  '云水',
  '墨香',
  '清茶',
  '明月',
  '南山',
  '沧海',
];

const ORIENTAL_SUFFIXES = [
  '弈客',
  '居士',
  '棋士',
  '书生',
  '隐士',
  '散人',
  '雅士',
  '公子',
];

export function generateRandomAlias(): string {
  const pre = ORIENTAL_PREFIXES[Math.floor(Math.random() * ORIENTAL_PREFIXES.length)];
  const suf = ORIENTAL_SUFFIXES[Math.floor(Math.random() * ORIENTAL_SUFFIXES.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${pre}${suf}${num}`;
}

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  let playerId = '';
  try {
    playerId = String(Taro.getStorageSync(PLAYER_ID_KEY) || '');
  } catch {
    playerId = '';
  }

  if (!playerId) {
    playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      Taro.setStorageSync(PLAYER_ID_KEY, playerId);
    } catch {
      // Ignore
    }
  }

  let nickname = '';
  try {
    nickname = String(Taro.getStorageSync(NICKNAME_KEY) || '');
  } catch {
    nickname = '';
  }

  if (!nickname || !nickname.trim()) {
    nickname = generateRandomAlias();
    try {
      Taro.setStorageSync(NICKNAME_KEY, nickname);
    } catch {
      // Ignore
    }
  }

  return { playerId, nickname };
}

export function savePlayerNickname(nickname: string): PlayerIdentity {
  const current = getOrCreatePlayerIdentity();
  const clean = nickname.trim().slice(0, 16) || generateRandomAlias();
  try {
    Taro.setStorageSync(NICKNAME_KEY, clean);
  } catch {
    // Ignore
  }
  return { ...current, nickname: clean };
}
