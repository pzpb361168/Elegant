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
  let playerId = sessionStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(PLAYER_ID_KEY, playerId);
  }

  let nickname = localStorage.getItem(NICKNAME_KEY);
  if (!nickname || !nickname.trim()) {
    nickname = generateRandomAlias();
    localStorage.setItem(NICKNAME_KEY, nickname);
  }

  return { playerId, nickname };
}

export function savePlayerNickname(nickname: string): PlayerIdentity {
  const current = getOrCreatePlayerIdentity();
  const clean = nickname.trim().slice(0, 16) || generateRandomAlias();
  localStorage.setItem(NICKNAME_KEY, clean);
  return { ...current, nickname: clean };
}
