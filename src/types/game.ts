export type GameTab = 'LOBBY' | 'GOMOKU' | 'XIANGQI' | 'JUNQI';

export type PlayMode = 'PVE' | 'PVP';

export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type JunqiSubMode = 'FLIP' | 'DEPLOY';

export interface GameStatsRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface AllGameStats {
  GOMOKU: GameStatsRecord;
  XIANGQI: GameStatsRecord;
  JUNQI: GameStatsRecord;
}

export interface MoveLogEntry {
  step: number;
  actor: string;
  description: string;
  timestamp: string;
}
