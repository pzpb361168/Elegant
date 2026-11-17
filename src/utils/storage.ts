import { AllGameStats, GameTab } from '../types/game';

const STORAGE_KEY = 'yayi_pavilion_stats_v1';

const DEFAULT_STATS: AllGameStats = {
  GOMOKU: { wins: 0, losses: 0, draws: 0 },
  XIANGQI: { wins: 0, losses: 0, draws: 0 },
  JUNQI: { wins: 0, losses: 0, draws: 0 },
};

export function loadGameStats(): AllGameStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATS;
    const parsed = JSON.parse(raw);
    return {
      GOMOKU: { ...DEFAULT_STATS.GOMOKU, ...(parsed.GOMOKU || {}) },
      XIANGQI: { ...DEFAULT_STATS.XIANGQI, ...(parsed.XIANGQI || {}) },
      JUNQI: { ...DEFAULT_STATS.JUNQI, ...(parsed.JUNQI || {}) },
    };
  } catch {
    return DEFAULT_STATS;
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

  const updated: AllGameStats = {
    ...current,
    [game]: target,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}

export function resetAllGameStats(): AllGameStats {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATS));
  } catch {
    // Ignore
  }
  return DEFAULT_STATS;
}
