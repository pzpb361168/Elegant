import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import { AIDifficulty, JunqiSubMode, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { hasJunqiPlayableForce, isJunqiOfficerAttackForbidden } from '../shared/gameRules';
import { JunqiCapturedTray } from './JunqiCapturedTray';
import { JunqiBoardCanvas } from './BoardCanvases';

export type JunqiSide = 'RED' | 'BLUE';
export type JunqiRank = 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 | 10 | -1;

export interface JunqiPiece {
  id: string;
  side: JunqiSide;
  rank: JunqiRank;
  revealed: boolean;
  carryingFlag?: boolean;
  mineHits?: number;
}

export type JunqiBoardGrid = (JunqiPiece | null)[][];

interface Coord {
  r: number;
  c: number;
}

interface JunqiHistoryItem {
  board: JunqiBoardGrid;
  turn: JunqiSide;
  lastBanner: string;
  capturedRed: JunqiRank[];
  capturedBlue: JunqiRank[];
}

interface JunqiGameProps {
  playMode: PlayMode;
  subMode: JunqiSubMode;
  difficulty: AIDifficulty;
  onModeChange: (mode: PlayMode) => void;
  onSubModeChange: (sub: JunqiSubMode) => void;
  onDifficultyChange: (diff: AIDifficulty) => void;
  onRecordResult: (outcome: 'WIN' | 'LOSS' | 'DRAW') => void;
}

const ROWS = 12;
const COLS = 5;

export const RANK_NAMES: Record<JunqiRank, string> = {
  9: '司令',
  8: '军长',
  7: '师长',
  6: '旅长',
  5: '团长',
  4: '营长',
  3: '连长',
  2: '排长',
  1: '工兵',
  10: '炸弹',
  0: '地雷',
  [-1]: '军旗',
};

const ARMY_ROSTER: JunqiRank[] = [
  9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 10, 10, 0, 0, 0, -1,
];

const COL_X = [142, 241, 340, 439, 538];
const ROW_Y = [112, 174, 236, 298, 360, 422, 546, 608, 670, 732, 794, 856];

function nowClock(): string {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function isCamp(r: number, c: number): boolean {
  if ((r === 2 || r === 4 || r === 7 || r === 9) && (c === 1 || c === 3)) return true;
  if ((r === 3 || r === 8) && c === 2) return true;
  return false;
}

export function isHQ(r: number, c: number): boolean {
  return (r === 0 || r === 11) && (c === 1 || c === 3);
}

export function isOwnHQ(side: JunqiSide, r: number, c: number): boolean {
  return side === 'RED' ? r === 11 && (c === 1 || c === 3) : r === 0 && (c === 1 || c === 3);
}

function countSideMines(board: JunqiBoardGrid, side: JunqiSide): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 0) count++;
    }
  }
  return count;
}

function hasSideEngineer(board: JunqiBoardGrid, side: JunqiSide): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 1) return true;
    }
  }
  return false;
}

function getMinAliveOfficerRank(board: JunqiBoardGrid, side: JunqiSide): JunqiRank | null {
  let minRank: number | null = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank >= 1 && p.rank <= 9) {
        if (minRank === null || p.rank < minRank) minRank = p.rank;
      }
    }
  }
  return minRank as JunqiRank | null;
}

export function isRailwayNode(r: number, c: number): boolean {
  if (r === 1 || r === 5 || r === 6 || r === 10) return true;
  if (r >= 1 && r <= 10 && (c === 0 || c === 4)) return true;
  return false;
}

function isRailwayEdge(r1: number, c1: number, r2: number, c2: number): boolean {
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  if (r1 === r2 && (r1 === 1 || r1 === 5 || r1 === 6 || r1 === 10)) return true;
  if (c1 === c2) {
    if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
      return c1 === 0 || c1 === 2 || c1 === 4;
    }
    if ((c1 === 0 || c1 === 4) && r1 >= 1 && r1 <= 10 && r2 >= 1 && r2 <= 10) return true;
  }
  return false;
}

function isOneStepConnected(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (dr === 0 && dc === 0) return false;
  if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
    return dc === 0 && (c1 === 0 || c1 === 2 || c1 === 4);
  }
  if (dr + dc === 1) return true;
  if (dr === 1 && dc === 1) {
    const sameHalf = (r1 <= 5 && r2 <= 5) || (r1 >= 6 && r2 >= 6);
    if (sameHalf && (isCamp(r1, c1) || isCamp(r2, c2))) return true;
  }
  return false;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createFlipModeBoard(): JunqiBoardGrid {
  const board: JunqiBoardGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const allPieces: JunqiPiece[] = [];
  (['RED', 'BLUE'] as JunqiSide[]).forEach((side) => {
    ARMY_ROSTER.forEach((rank, idx) => {
      allPieces.push({ id: `${side}-${rank}-${idx}`, side, rank, revealed: false });
    });
  });
  const shuffled = shuffleArray(allPieces);
  let ptr = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isCamp(r, c) && ptr < shuffled.length) board[r][c] = shuffled[ptr++];
    }
  }
  return board;
}

function createDeployModeBoard(
  presetStyle: 'BALANCED' | 'FORTRESS' = 'BALANCED',
  revealOpponent: boolean = false
): JunqiBoardGrid {
  const board: JunqiBoardGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const deployHalf = (side: JunqiSide, revealed: boolean) => {
    const isBottom = side === 'RED';
    const hqRow = isBottom ? 11 : 0;
    const backTwoRows = isBottom ? [10, 11] : [0, 1];
    const frontRow = isBottom ? 6 : 5;
    const allRows = isBottom ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];

    const slots: Coord[] = [];
    for (const r of allRows) {
      for (let c = 0; c < COLS; c++) {
        if (!isCamp(r, c)) slots.push({ r, c });
      }
    }

    let idCounter = 0;
    const placeAt = (r: number, c: number, rank: JunqiRank) => {
      board[r][c] = { id: `${side}-${rank}-${idCounter++}`, side, rank, revealed };
      const idx = slots.findIndex((s) => s.r === r && s.c === c);
      if (idx !== -1) slots.splice(idx, 1);
    };

    const flagCol = presetStyle === 'FORTRESS' ? 1 : Math.random() < 0.5 ? 1 : 3;
    const otherHqCol = flagCol === 1 ? 3 : 1;
    placeAt(hqRow, flagCol, -1);
    placeAt(hqRow, otherHqCol, 2);

    const mineCandidates = shuffleArray(slots.filter((s) => backTwoRows.includes(s.r)));
    for (let i = 0; i < 3; i++) placeAt(mineCandidates[i].r, mineCandidates[i].c, 0);

    const bombCandidates = shuffleArray(slots.filter((s) => s.r !== frontRow));
    for (let i = 0; i < 2; i++) placeAt(bombCandidates[i].r, bombCandidates[i].c, 10);

    const remainingRanks: JunqiRank[] = [
      9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1,
    ];
    const shuffledRanks = shuffleArray(remainingRanks);
    const remainingSlots = shuffleArray(slots);
    remainingSlots.forEach((slot, idx) => placeAt(slot.r, slot.c, shuffledRanks[idx]));
  };

  deployHalf('BLUE', revealOpponent);
  deployHalf('RED', true);
  return board;
}

function cloneJunqiBoard(board: JunqiBoardGrid): JunqiBoardGrid {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function resolveStandardCombat(
  attacker: JunqiPiece,
  defender: JunqiPiece
): 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'BOTH_DIE' {
  if (attacker.rank === 10 || defender.rank === 10) return 'BOTH_DIE';
  if (attacker.rank > defender.rank) return 'ATTACKER_WINS';
  if (attacker.rank < defender.rank) return 'DEFENDER_WINS';
  return 'BOTH_DIE';
}

export function getJunqiLegalMoves(
  board: JunqiBoardGrid,
  r: number,
  c: number,
  subMode: JunqiSubMode,
  isTargetFaceVisible?: (p: JunqiPiece) => boolean
): Coord[] {
  const piece = board[r][c];
  if (!piece || !piece.revealed) return [];
  if (piece.rank === -1 || piece.rank === 0) return [];
  if (subMode === 'DEPLOY' && isHQ(r, c) && !piece.carryingFlag) return [];

  const mySide = piece.side;
  const enemySide: JunqiSide = mySide === 'RED' ? 'BLUE' : 'RED';
  const enemyMines = countSideMines(board, enemySide);
  const minRank = getMinAliveOfficerRank(board, mySide);

  const legal: Coord[] = [];
  const addedKey = new Set<string>();

  const tryAddTarget = (nr: number, nc: number): boolean => {
    const key = `${nr},${nc}`;
    const occ = board[nr][nc];

    if (!occ) {
      if (!addedKey.has(key)) {
        addedKey.add(key);
        legal.push({ r: nr, c: nc });
      }
      return true;
    }

    if (occ.side === mySide) {
      if (piece.carryingFlag && isOwnHQ(mySide, nr, nc)) {
        if (!addedKey.has(key)) {
          addedKey.add(key);
          legal.push({ r: nr, c: nc });
        }
      }
      return false;
    }

    if (piece.carryingFlag) return false;
    if (isCamp(nr, nc)) return false;
    if (!occ.revealed) return false;
    if (occ.carryingFlag) return false;

    const canSeeOcc = isTargetFaceVisible ? isTargetFaceVisible(occ) : subMode === 'FLIP';
    if (occ.rank === -1 && canSeeOcc) {
      if (enemyMines > 0 || minRank === null || piece.rank !== minRank) return false;
    }

    if (canSeeOcc && isJunqiOfficerAttackForbidden(piece.rank, occ.rank)) {
      return false;
    }

    if (!addedKey.has(key)) {
      addedKey.add(key);
      legal.push({ r: nr, c: nc });
    }
    return false;
  };

  for (let nr = Math.max(0, r - 1); nr <= Math.min(ROWS - 1, r + 1); nr++) {
    for (let nc = Math.max(0, c - 1); nc <= Math.min(COLS - 1, c + 1); nc++) {
      if (isOneStepConnected(r, c, nr, nc)) tryAddTarget(nr, nc);
    }
  }

  if (isRailwayNode(r, c)) {
    if (piece.rank === 1) {
      const visited = new Set<string>([`${r},${c}`]);
      const queue: Coord[] = [{ r, c }];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = curr.r + dr;
          const nc = curr.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const nKey = `${nr},${nc}`;
          if (visited.has(nKey)) continue;
          if (!isRailwayEdge(curr.r, curr.c, nr, nc)) continue;
          visited.add(nKey);
          if (tryAddTarget(nr, nc)) queue.push({ r: nr, c: nc });
        }
      }
    } else {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let cr = r;
        let cc = c;
        while (true) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (!isRailwayEdge(cr, cc, nr, nc)) break;
          if (!tryAddTarget(nr, nc)) break;
          cr = nr;
          cc = nc;
        }
      }
    }
  }

  return legal;
}

function hasAnyLegalAction(board: JunqiBoardGrid, side: JunqiSide, subMode: JunqiSubMode): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (subMode === 'FLIP' && !p.revealed) return true;
      if (p.revealed && p.side === side) {
        if (getJunqiLegalMoves(board, r, c, subMode, () => true).length > 0) return true;
      }
    }
  }
  return false;
}

export const JunqiGame: React.FC<JunqiGameProps> = ({
  playMode,
  subMode,
  difficulty,
  onModeChange,
  onSubModeChange,
  onRecordResult,
}) => {
  const [board, setBoard] = useState<JunqiBoardGrid>(() =>
    subMode === 'FLIP' ? createFlipModeBoard() : createDeployModeBoard('BALANCED', false)
  );
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING' | 'GAME_OVER'>(
    subMode === 'DEPLOY' ? 'SETUP' : 'PLAYING'
  );
  const [turn, setTurn] = useState<JunqiSide>('RED');
  const [selected, setSelected] = useState<Coord | null>(null);
  const [legalTargets, setLegalTargets] = useState<Coord[]>([]);
  const [lastBanner, setLastBanner] = useState<string>('点击棋子开始行军');
  const [winner, setWinner] = useState<JunqiSide | 'DRAW' | null>(null);
  const [capturedRed, setCapturedRed] = useState<JunqiRank[]>([]);
  const [capturedBlue, setCapturedBlue] = useState<JunqiRank[]>([]);
  const [history, setHistory] = useState<JunqiHistoryItem[]>([]);
  const [moveLogs, setMoveLogs] = useState<MoveLogEntry[]>([]);
  const [openFaceDeploy, setOpenFaceDeploy] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [junqiEffect, setJunqiEffect] = useState<{
    r: number;
    c: number;
    kind: 'FLIP' | 'MOVE' | 'WIN' | 'LOSS' | 'BOMB';
    label?: string;
    key: number;
  } | null>(null);

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== 'PLAYING') return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const initNewGame = useCallback(
    (targetSubMode: JunqiSubMode = subMode, openView: boolean = openFaceDeploy) => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      if (targetSubMode === 'FLIP') {
        setBoard(createFlipModeBoard());
        setPhase('PLAYING');
        setLastBanner('翻棋开局：须先排完敌雷，再由最低官阶将敌旗扛回己方大本营');
      } else {
        setBoard(createDeployModeBoard('BALANCED', openView));
        setPhase('SETUP');
        setLastBanner('布阵阶段：点击下方己方任意两枚棋子可互换位置，就绪后点击「开始交锋」');
      }
      setTurn('RED');
      setSelected(null);
      setLegalTargets([]);
      setWinner(null);
      setCapturedRed([]);
      setCapturedBlue([]);
      setHistory([]);
      setMoveLogs([]);
      setElapsedSeconds(0);
      setJunqiEffect(null);
      soundFX.playSelect();
    },
    [openFaceDeploy, subMode]
  );

  const canSwapSetupPieces = (
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ): { ok: boolean; reason?: string } => {
    const p1 = board[r1][c1];
    const p2 = board[r2][c2];
    if (!p1 || !p2 || p1.side !== 'RED' || p2.side !== 'RED') {
      return { ok: false, reason: '只能在下方己方防区棋子之间互换布阵' };
    }
    const checkPlacement = (rank: JunqiRank, r: number, c: number): string | null => {
      if (rank === -1 && !isHQ(r, c)) return '军旗必须部署在底线「大本营」内';
      if (rank === 0 && r !== 10 && r !== 11) return '地雷只能部署在最后两排';
      if (rank === 10 && r === 6) return '炸弹不可部署在前线第一排';
      return null;
    };
    const err1 = checkPlacement(p1.rank, r2, c2);
    if (err1) return { ok: false, reason: err1 };
    const err2 = checkPlacement(p2.rank, r1, c1);
    if (err2) return { ok: false, reason: err2 };
    return { ok: true };
  };

  const performFlip = useCallback(
    (r: number, c: number) => {
      const piece = board[r][c];
      if (!piece || piece.revealed) return;

      const nextBoard = cloneJunqiBoard(board);
      nextBoard[r][c]!.revealed = true;

      setHistory((prev) => [
        ...prev,
        {
          board: cloneJunqiBoard(board),
          turn,
          lastBanner,
          capturedRed: [...capturedRed],
          capturedBlue: [...capturedBlue],
        },
      ]);
      setBoard(nextBoard);
      setSelected(null);
      setLegalTargets([]);

      const actorLabel = turn === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方 (AI)' : '蓝方';
      const pieceDesc = `${piece.side === 'RED' ? '红' : '蓝'}【${RANK_NAMES[piece.rank]}】`;
      setLastBanner(`${actorLabel}翻出 ${pieceDesc}`);

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorLabel,
          description: `于 (${r + 1},${c + 1}) 翻出 ${pieceDesc}`,
          timestamp: nowClock(),
        },
        ...prev,
      ]);

      soundFX.playJunqiFlip();
      setJunqiEffect({ r, c, kind: 'FLIP', key: Date.now() + Math.random() });
      setTurn(turn === 'RED' ? 'BLUE' : 'RED');
    },
    [board, capturedBlue, capturedRed, lastBanner, playMode, turn]
  );

  const performMoveOrAttack = useCallback(
    (from: Coord, to: Coord) => {
      const attacker = board[from.r][from.c];
      if (!attacker) return;
      const defender = board[to.r][to.c];
      const enemySide: JunqiSide = turn === 'RED' ? 'BLUE' : 'RED';

      if (defender && defender.side === enemySide && defender.rank === -1) {
        const enemyMines = countSideMines(board, enemySide);
        if (enemyMines > 0) {
          setLastBanner(`敌方尚余 ${enemyMines} 颗地雷未清除，须先排空全部地雷方能夺旗！`);
          soundFX.playJunqiClash('LOSS');
          setSelected(null);
          setLegalTargets([]);
          return;
        }
        const minRank = getMinAliveOfficerRank(board, turn);
        if (minRank === null || attacker.rank !== minRank) {
          const reqName = minRank !== null ? RANK_NAMES[minRank] : '最低官阶';
          setLastBanner(`须由己方当前存活最低官阶【${reqName}】前往扛取敌方军旗！`);
          soundFX.playJunqiClash('LOSS');
          setSelected(null);
          setLegalTargets([]);
          return;
        }
      }

      if (
        defender &&
        defender.side === enemySide &&
        isJunqiOfficerAttackForbidden(attacker.rank, defender.rank)
      ) {
        setLastBanner('敌军官阶高于己方，只能大吃小或同级对兑，不可小打大主动阵亡！');
        soundFX.playCheck();
        setSelected(null);
        setLegalTargets([]);
        return;
      }

      const nextBoard = cloneJunqiBoard(board);
      const nextCapturedRed = [...capturedRed];
      const nextCapturedBlue = [...capturedBlue];
      const recordCaptured = (fallenSide: JunqiSide, rank: JunqiRank) => {
        if (fallenSide === 'RED') nextCapturedRed.push(rank);
        else nextCapturedBlue.push(rank);
      };

      setHistory((prev) => [
        ...prev,
        {
          board: cloneJunqiBoard(board),
          turn,
          lastBanner,
          capturedRed: [...capturedRed],
          capturedBlue: [...capturedBlue],
        },
      ]);

      const actorLabel = turn === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方 (AI)' : '蓝方';
      let logDesc = '';
      let flagReturnedWinner: JunqiSide | null = null;

      if (attacker.carryingFlag && isOwnHQ(turn, to.r, to.c)) {
        nextBoard[from.r][from.c] = null;
        nextBoard[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
        logDesc = `【${RANK_NAMES[attacker.rank]}】将敌方【军旗】成功扛回大本营！`;
        setLastBanner(`${actorLabel}${logDesc}`);
        setJunqiEffect({ r: to.r, c: to.c, kind: 'WIN', label: '凯旋', key: Date.now() + Math.random() });
        flagReturnedWinner = turn;
      } else if (!defender) {
        nextBoard[to.r][to.c] = { ...attacker };
        nextBoard[from.r][from.c] = null;
        if (attacker.carryingFlag) {
          logDesc = `扛旗【${RANK_NAMES[attacker.rank]}】突围进驻 (${to.r + 1},${to.c + 1})`;
          setLastBanner(`${actorLabel}扛旗部队正撤向己方大本营！`);
        } else {
          logDesc = `【${RANK_NAMES[attacker.rank]}】进驻 (${to.r + 1},${to.c + 1})`;
          setLastBanner(`${actorLabel}${logDesc}`);
        }
        setJunqiEffect({ r: to.r, c: to.c, kind: 'MOVE', key: Date.now() + Math.random() });
        soundFX.playJunqiMove();
      } else if (defender.rank === -1) {
        nextBoard[from.r][from.c] = null;
        nextBoard[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
        logDesc = `最低官阶【${RANK_NAMES[attacker.rank]}】拔得敌方【军旗】！正扛回己方大本营`;
        setLastBanner(`${actorLabel}拔得敌旗！请护送返回己方大本营（不可被吃，谨防堵截）`);
        setJunqiEffect({ r: to.r, c: to.c, kind: 'WIN', label: '扛旗', key: Date.now() + Math.random() });
        soundFX.playJunqiClash('WIN');
      } else if (defender.rank === 0) {
        nextBoard[from.r][from.c] = null;
        if (attacker.rank === 1) {
          nextBoard[to.r][to.c] = { ...attacker };
          recordCaptured(enemySide, 0);
          logDesc = `【工兵】成功排除敌方【地雷】`;
          setLastBanner(`${actorLabel}工兵精准排雷成功！`);
          setJunqiEffect({ r: to.r, c: to.c, kind: 'WIN', label: '排雷', key: Date.now() + Math.random() });
          soundFX.playJunqiClash('WIN');
        } else if (attacker.rank === 10) {
          nextBoard[to.r][to.c] = null;
          recordCaptured(turn, 10);
          recordCaptured(enemySide, 0);
          logDesc = `【炸弹】直接炸毁敌方【地雷】（同归于尽）`;
          setLastBanner(`${actorLabel}炸弹爆破清雷（同归于尽）！`);
          setJunqiEffect({ r: to.r, c: to.c, kind: 'BOMB', label: '炸雷', key: Date.now() + Math.random() });
          soundFX.playJunqiClash('BOMB');
        } else {
          recordCaptured(turn, attacker.rank);
          const attackerHasEng = hasSideEngineer(board, turn);
          if (!attackerHasEng) {
            const hits = (defender.mineHits ?? 0) + 1;
            if (hits >= 3) {
              nextBoard[to.r][to.c] = null;
              recordCaptured(enemySide, 0);
              logDesc = `无工兵三子换雷（3/3）：部队牺牲并清除敌方【地雷】`;
              setLastBanner(`${actorLabel}连撞三子强行排雷成功，地雷已清除！`);
              setJunqiEffect({ r: to.r, c: to.c, kind: 'BOMB', label: '清雷', key: Date.now() + Math.random() });
              soundFX.playJunqiClash('BOMB');
            } else {
              nextBoard[to.r][to.c] = { ...defender, mineHits: hits };
              logDesc = `无工兵撞雷（${hits}/3）：部队阵亡，敌方地雷已受创`;
              setLastBanner(`${actorLabel}强行撞雷牺牲，该地雷已受创（${hits}/3）`);
              setJunqiEffect({ r: to.r, c: to.c, kind: 'LOSS', label: `受创 ${hits}/3`, key: Date.now() + Math.random() });
              soundFX.playJunqiClash('LOSS');
            }
          } else {
            logDesc = `部队触及敌方地雷阵亡（己方尚有工兵可排雷）`;
            setLastBanner(`${actorLabel}普通部队触雷阵亡，地雷依然存在！`);
            setJunqiEffect({ r: to.r, c: to.c, kind: 'LOSS', label: '触雷', key: Date.now() + Math.random() });
            soundFX.playJunqiClash('LOSS');
          }
        }
      } else {
        const result = resolveStandardCombat(attacker, defender);
        nextBoard[from.r][from.c] = null;
        if (result === 'ATTACKER_WINS') {
          nextBoard[to.r][to.c] = { ...attacker };
          recordCaptured(enemySide, defender.rank);
          logDesc = `【${RANK_NAMES[attacker.rank]}】击溃敌方【${RANK_NAMES[defender.rank]}】`;
          setLastBanner(`${actorLabel}交战告捷：${logDesc}`);
          setJunqiEffect({ r: to.r, c: to.c, kind: 'WIN', label: '破敌', key: Date.now() + Math.random() });
          soundFX.playJunqiClash('WIN');
        } else if (result === 'DEFENDER_WINS') {
          recordCaptured(turn, attacker.rank);
          logDesc = `进攻受挫，不敌敌方驻军`;
          setLastBanner(`${actorLabel}进攻失利，部队阵亡`);
          setJunqiEffect({ r: to.r, c: to.c, kind: 'LOSS', label: '阵亡', key: Date.now() + Math.random() });
          soundFX.playJunqiClash('LOSS');
        } else {
          nextBoard[to.r][to.c] = null;
          recordCaptured(turn, attacker.rank);
          recordCaptured(enemySide, defender.rank);
          logDesc = `于 (${to.r + 1},${to.c + 1}) 与敌军同归于尽`;
          setLastBanner(`激烈交火：双方棋子同归于尽！`);
          setJunqiEffect({ r: to.r, c: to.c, kind: 'BOMB', label: '同归', key: Date.now() + Math.random() });
          soundFX.playJunqiClash('BOMB');
        }
      }

      setBoard(nextBoard);
      setCapturedRed(nextCapturedRed);
      setCapturedBlue(nextCapturedBlue);
      setSelected(null);
      setLegalTargets([]);

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorLabel,
          description: logDesc,
          timestamp: nowClock(),
        },
        ...prev,
      ]);

      const nextSide: JunqiSide = turn === 'RED' ? 'BLUE' : 'RED';
      const finishGame = (winSide: JunqiSide | 'DRAW', bannerMsg?: string) => {
        if (bannerMsg) setLastBanner(bannerMsg);
        setWinner(winSide);
        setPhase('GAME_OVER');
        soundFX.playVictory();
        if (winSide === 'DRAW') onRecordResult('DRAW');
        else if (playMode === 'PVE') onRecordResult(winSide === 'RED' ? 'WIN' : 'LOSS');
        else onRecordResult('WIN');
      };

      if (flagReturnedWinner) {
        finishGame(flagReturnedWinner);
        return;
      }

      const nextHasForce = hasJunqiPlayableForce(nextBoard, nextSide, subMode);
      const actorHasForce = hasJunqiPlayableForce(nextBoard, turn, subMode);

      if (!nextHasForce && !actorHasForce) {
        finishGame('DRAW', '双方有生作战力量均已耗尽，本局判和！');
        return;
      }
      if (!nextHasForce) {
        const loserLabel = nextSide === 'RED' ? '红方' : '蓝方';
        finishGame(turn, `${loserLabel}已无任何可用棋子，${actorLabel}赢得战役胜利！`);
        return;
      }
      if (!actorHasForce) {
        const winnerLabel = nextSide === 'RED' ? '红方' : '蓝方';
        finishGame(nextSide, `${actorLabel}已无任何可用棋子，${winnerLabel}赢得战役胜利！`);
        return;
      }
      if (!hasAnyLegalAction(nextBoard, nextSide, subMode)) {
        finishGame(turn, `${actorLabel}封锁敌军全部行动，赢得战役胜利！`);
        return;
      }

      setTurn(nextSide);
    },
    [board, capturedBlue, capturedRed, lastBanner, onRecordResult, playMode, subMode, turn]
  );

  // AI Turn Logic when turn === 'BLUE' in PvE
  useEffect(() => {
    if (playMode === 'PVE' && phase === 'PLAYING' && turn === 'BLUE' && winner === null) {
      aiTimeoutRef.current = setTimeout(() => {
        const candidateMoves: { from: Coord; to: Coord; score: number }[] = [];
        const redMines = countSideMines(board, 'RED');
        const blueHasEng = hasSideEngineer(board, 'BLUE');
        const blueMinRank = getMinAliveOfficerRank(board, 'BLUE');

        let redFlagPos: Coord | null = null;
        let redCarrierPos: Coord | null = null;
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            const tp = board[rr][cc];
            if (tp && tp.side === 'RED') {
              if (tp.rank === -1 && (tp.revealed || subMode === 'DEPLOY')) redFlagPos = { r: rr, c: cc };
              if (tp.carryingFlag) redCarrierPos = { r: rr, c: cc };
            }
          }
        }

        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const p = board[r][c];
            if (p && p.revealed && p.side === 'BLUE') {
              const targets = getJunqiLegalMoves(board, r, c, subMode, () => true);
              for (const to of targets) {
                const def = board[to.r][to.c];
                let score = 0;
                if (p.carryingFlag) {
                  if (isOwnHQ('BLUE', to.r, to.c)) {
                    score = 999999;
                  } else {
                    const distBefore = Math.min(Math.abs(r) + Math.abs(c - 1), Math.abs(r) + Math.abs(c - 3));
                    const distAfter = Math.min(Math.abs(to.r) + Math.abs(to.c - 1), Math.abs(to.r) + Math.abs(to.c - 3));
                    score = 4500 + (distBefore - distAfter) * 650 + (isCamp(to.r, to.c) ? 180 : 0);
                  }
                } else if (def) {
                  if (def.rank === -1) {
                    score = redMines === 0 && blueMinRank !== null && p.rank === blueMinRank ? 99999 : -9999;
                  } else if (def.rank === 0) {
                    if (p.rank === 1) score = 1600;
                    else if (p.rank === 10) score = 900;
                    else if (!blueHasEng) score = 320 + (def.mineHits ?? 0) * 300 - p.rank * 35;
                    else score = -950;
                  } else {
                    const outcome = resolveStandardCombat(p, def);
                    if (outcome === 'ATTACKER_WINS') score = 520 + def.rank * 80;
                    else if (outcome === 'BOTH_DIE') score = def.rank >= p.rank ? 220 : -150;
                    else score = -600;
                    if (blueMinRank !== null && p.rank === blueMinRank && redMines <= 1) score -= 220;
                  }
                } else {
                  score = (to.r - r) * 18 + (isCamp(to.r, to.c) ? 65 : 0);
                  if (redCarrierPos) {
                    const distToCarrier = Math.abs(to.r - redCarrierPos.r) + Math.abs(to.c - redCarrierPos.c);
                    score += Math.max(0, 8 - distToCarrier) * 110;
                    if ((to.r === 10 || to.r === 11) && (to.c === 1 || to.c === 3 || to.c === 2)) score += 360;
                  } else if (redMines === 0 && redFlagPos && blueMinRank !== null && p.rank === blueMinRank) {
                    const dBefore = Math.abs(r - redFlagPos.r) + Math.abs(c - redFlagPos.c);
                    const dAfter = Math.abs(to.r - redFlagPos.r) + Math.abs(to.c - redFlagPos.c);
                    score += (dBefore - dAfter) * 280;
                  }
                }
                if (difficulty === 'EASY') score += Math.random() * 220;
                else if (difficulty === 'MEDIUM') score += Math.random() * 60;
                candidateMoves.push({ from: { r, c }, to, score });
              }
            }
          }
        }

        candidateMoves.sort((a, b) => b.score - a.score);

        if (subMode === 'FLIP') {
          const unrevealedCoords: Coord[] = [];
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (board[r][c] && !board[r][c]!.revealed) unrevealedCoords.push({ r, c });
            }
          }
          if (unrevealedCoords.length > 0 && (candidateMoves.length === 0 || candidateMoves[0].score < 120)) {
            const pick = unrevealedCoords[Math.floor(Math.random() * unrevealedCoords.length)];
            performFlip(pick.r, pick.c);
            return;
          }
        }

        if (candidateMoves.length > 0) {
          performMoveOrAttack(candidateMoves[0].from, candidateMoves[0].to);
        }
      }, 480);
    }
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [playMode, phase, turn, winner, board, subMode, difficulty, performFlip, performMoveOrAttack]);

  const isPieceFaceVisible = (piece: JunqiPiece): boolean => {
    if (phase === 'GAME_OVER') return true;
    if (subMode === 'FLIP') return piece.revealed;
    if (openFaceDeploy) return true;
    if (playMode === 'PVE') return piece.side === 'RED';
    return piece.side === turn;
  };

  const handleCellClick = (r: number, c: number) => {
    if (phase === 'GAME_OVER') return;

    if (phase === 'SETUP') {
      const clicked = board[r][c];
      if (!clicked || clicked.side !== 'RED') return;
      if (!selected) {
        setSelected({ r, c });
        soundFX.playSelect();
        return;
      }
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }
      const check = canSwapSetupPieces(selected.r, selected.c, r, c);
      if (!check.ok) {
        setLastBanner(`布阵限制：${check.reason}`);
        soundFX.playCheck();
        setSelected(null);
        return;
      }
      const nextBoard = cloneJunqiBoard(board);
      const temp = nextBoard[selected.r][selected.c];
      nextBoard[selected.r][selected.c] = nextBoard[r][c];
      nextBoard[r][c] = temp;
      setBoard(nextBoard);
      setSelected(null);
      setLastBanner(`已互换【${RANK_NAMES[temp!.rank]}】与【${RANK_NAMES[board[r][c]!.rank]}】位置`);
      soundFX.playJunqiMove();
      return;
    }

    if (playMode === 'PVE' && turn === 'BLUE') return;
    const clickedPiece = board[r][c];

    if (selected && legalTargets.some((t) => t.r === r && t.c === c)) {
      performMoveOrAttack(selected, { r, c });
      return;
    }

    if (subMode === 'FLIP' && clickedPiece && !clickedPiece.revealed) {
      performFlip(r, c);
      return;
    }

    if (clickedPiece && clickedPiece.revealed && clickedPiece.side === turn) {
      soundFX.playSelect();
      setSelected({ r, c });
      setLegalTargets(getJunqiLegalMoves(board, r, c, subMode, isPieceFaceVisible));
      return;
    }

    setSelected(null);
    setLegalTargets([]);
  };

  const handleUndo = () => {
    if (history.length === 0 || phase !== 'PLAYING') return;
    if (playMode === 'PVE' && turn === 'BLUE') return;

    const steps = playMode === 'PVE' && history.length >= 2 ? 2 : 1;
    const idx = history.length - steps;
    const snap = history[idx];

    setBoard(snap.board);
    setTurn(snap.turn);
    setLastBanner(snap.lastBanner);
    setCapturedRed(snap.capturedRed);
    setCapturedBlue(snap.capturedBlue);
    setSelected(null);
    setLegalTargets([]);
    setJunqiEffect(null);
    setHistory((prev) => prev.slice(0, idx));
    setMoveLogs((prev) => prev.slice(steps));
    soundFX.playSelect();
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const redMinesLeft = countSideMines(board, 'RED');
  const blueMinesLeft = countSideMines(board, 'BLUE');
  const redMinRank = getMinAliveOfficerRank(board, 'RED');
  const blueMinRank = getMinAliveOfficerRank(board, 'BLUE');
  const currentMinRank = turn === 'RED' ? redMinRank : blueMinRank;
  const currentEnemyMines = turn === 'RED' ? blueMinesLeft : redMinesLeft;

  return (
    <View className='page-container'>
      {/* Status Bar */}
      <View className='status-bar'>
        <View className='status-bar-top'>
          <View className='status-title-row'>
            <View
              style={{
                padding: '8rpx 16rpx',
                borderRadius: '10rpx',
                backgroundColor:
                  phase === 'SETUP' ? '#7C5332' : turn === 'RED' ? '#98352E' : '#26568B',
                color: '#FFFFFF',
                fontSize: '22rpx',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              <Text>{phase === 'SETUP' ? '排兵布阵' : turn === 'RED' ? '红方' : '蓝方'}</Text>
            </View>
            <View style={{ minWidth: 0 }}>
              <Text className='status-main-text' style={{ display: 'block' }}>
                {lastBanner}
              </Text>
              <Text className='status-sub-text font-mono-tabular' style={{ display: 'block' }}>
                {subMode === 'FLIP' ? '翻棋' : '布阵'} · 步数 {history.length} · 用时{' '}
                {formatTime(elapsedSeconds)}
              </Text>
              <Text className='status-sub-text' style={{ display: 'block', color: '#5D4037' }}>
                红雷 {redMinesLeft} · 蓝雷 {blueMinesLeft} · 扛旗最低官阶：
                {currentMinRank !== null ? RANK_NAMES[currentMinRank] : '无'}
                {currentEnemyMines === 0 ? '（可扛旗）' : '（须先清雷）'}
              </Text>
            </View>
          </View>
        </View>

        <View className='status-toolbar'>
          {phase === 'SETUP' ? (
            <Button
              onClick={() => {
                setPhase('PLAYING');
                setSelected(null);
                setLastBanner('全军出击！红方先行');
                soundFX.playMove();
              }}
              className='btn-primary-red'
            >
              开始交锋
            </Button>
          ) : (
            <Button
              onClick={handleUndo}
              disabled={history.length === 0 || phase !== 'PLAYING' || (playMode === 'PVE' && turn === 'BLUE')}
              className={`btn-soft ${
                history.length === 0 || phase !== 'PLAYING' || (playMode === 'PVE' && turn === 'BLUE')
                  ? 'btn-disabled'
                  : ''
              }`}
            >
              悔棋
            </Button>
          )}
          <Button onClick={() => initNewGame(subMode, openFaceDeploy)} className='btn-primary-dark'>
            重开
          </Button>
          <Button
            onClick={() => {
              if (phase === 'GAME_OVER' || history.length === 0) return;
              setWinner(turn === 'RED' ? 'BLUE' : 'RED');
              setPhase('GAME_OVER');
              soundFX.playCheck();
              if (playMode === 'PVE') onRecordResult('LOSS');
            }}
            disabled={phase === 'GAME_OVER' || history.length === 0}
            className={`btn-outline-red ${
              phase === 'GAME_OVER' || history.length === 0 ? 'btn-disabled' : ''
            }`}
          >
            认负
          </Button>
        </View>
      </View>

      {/* 12x5 Junqi Board */}
      <View className='board-wrap-center'>
        <View className='junqi-board-box'>
          <JunqiBoardCanvas canvasId='junqi-local-canvas' />

          <View className='junqi-overlay-layer'>
            {board.map((row, r) =>
              row.map((piece, c) => {
                const leftPct = (COL_X[c] / 680) * 100;
                const topPct = (ROW_Y[r] / 980) * 100;
                const camp = isCamp(r, c);
                const isSel = selected?.r === r && selected?.c === c;
                const isLegal = legalTargets.some((t) => t.r === r && t.c === c);
                const isFxTarget = junqiEffect?.r === r && junqiEffect?.c === c;

                return (
                  <View
                    key={`cell-${r}-${c}`}
                    onClick={() => handleCellClick(r, c)}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className='junqi-cell-btn'
                  >
                    {piece && (
                      <View
                        key={isFxTarget && junqiEffect ? `jq-pc-${junqiEffect.key}` : 'jq-pc'}
                        className={`junqi-tile font-serif-oriental ${
                          !piece.revealed && subMode === 'FLIP'
                            ? 'junqi-tile--hidden'
                            : piece.side === 'RED'
                            ? 'junqi-tile--red'
                            : 'junqi-tile--blue'
                        } ${piece.carryingFlag ? 'junqi-tile--carrier' : ''} ${
                          isFxTarget && junqiEffect?.kind === 'FLIP'
                            ? 'animate-junqi-flip'
                            : isFxTarget &&
                              (junqiEffect?.kind === 'MOVE' || junqiEffect?.kind === 'WIN')
                            ? 'animate-junqi-march'
                            : ''
                        } ${isSel ? 'junqi-tile--selected' : ''}`}
                      >
                        <Text>
                          {isPieceFaceVisible(piece)
                            ? RANK_NAMES[piece.rank]
                            : subMode === 'FLIP'
                            ? '暗棋'
                            : '敌军'}
                        </Text>
                        {piece.carryingFlag && (
                          <View className='junqi-badge-flag'>
                            <Text>扛旗</Text>
                          </View>
                        )}
                        {piece.mineHits !== undefined && piece.mineHits > 0 && (
                          <View className='junqi-badge-mine font-mono-tabular'>
                            <Text>{piece.mineHits}/3</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {isFxTarget &&
                      junqiEffect &&
                      (junqiEffect.kind === 'WIN' ||
                        junqiEffect.kind === 'LOSS' ||
                        junqiEffect.kind === 'BOMB') && (
                        <View
                          key={`jq-exp-${junqiEffect.key}`}
                          className='fx-ring-overlay animate-junqi-explosion'
                          style={{
                            borderRadius: '10rpx',
                            border:
                              junqiEffect.kind === 'BOMB'
                                ? '4rpx solid #EA580C'
                                : junqiEffect.kind === 'WIN'
                                ? '4rpx solid #D97706'
                                : '4rpx solid #991B1B',
                          }}
                        />
                      )}

                    {isFxTarget && junqiEffect?.label && (
                      <View
                        key={`jq-tag-${junqiEffect.key}`}
                        className='fx-float-badge font-serif-oriental animate-fx-float-tag'
                        style={{
                          backgroundColor:
                            junqiEffect.kind === 'WIN'
                              ? '#B45309'
                              : junqiEffect.kind === 'BOMB'
                              ? '#C2410C'
                              : '#991B1B',
                        }}
                      >
                        <Text>{junqiEffect.label}</Text>
                      </View>
                    )}

                    {isLegal && (
                      <View
                        className={`junqi-legal-target ${
                          camp && !piece ? 'junqi-legal-target--camp' : ''
                        }`}
                      />
                    )}
                  </View>
                );
              })
            )}
          </View>

          {phase === 'GAME_OVER' && winner && (
            <View className='board-modal-mask'>
              <View className='board-modal-card'>
                <Text
                  className='font-serif-oriental'
                  style={{ display: 'block', fontSize: '36rpx', fontWeight: 700, color: '#291D16', marginBottom: '10rpx' }}
                >
                  {winner === 'DRAW'
                    ? '双方力竭和局'
                    : winner === 'RED'
                    ? '红方军团赢得胜利'
                    : '蓝方军团赢得胜利'}
                </Text>
                <Text style={{ display: 'block', fontSize: '23rpx', color: '#6E5A4F', marginBottom: '26rpx' }}>
                  {lastBanner} · {formatTime(elapsedSeconds)} · {history.length} 回合
                </Text>
                <View style={{ display: 'flex', justifyContent: 'center', gap: '18rpx' }}>
                  <Button onClick={() => initNewGame(subMode, openFaceDeploy)} className='btn-primary-red'>
                    再来一局
                  </Button>
                  <Button onClick={() => setWinner(null)} className='btn-soft'>
                    检视战场
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Symmetrical Captured Trays directly below board */}
      <View className='captured-grid-row'>
        <JunqiCapturedTray side='BLUE' captured={capturedBlue} />
        <JunqiCapturedTray side='RED' captured={capturedRed} />
      </View>

      {/* Settings Card */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <View>
            <Text className='section-title font-serif-oriental'>陆战军旗 · 沙盘帷幄</Text>
            <Text className='section-subtitle' style={{ display: 'block' }}>
              随机翻棋 / 排兵布阵 · 工兵铁路飞驰 · 排雷扛旗新规
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: '20rpx' }}>
          <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '10rpx' }}>
            军旗玩法规则
          </Text>
          <View className='segment-group'>
            <Button
              onClick={() => {
                onSubModeChange('FLIP');
                initNewGame('FLIP', openFaceDeploy);
              }}
              className={`segment-btn ${subMode === 'FLIP' ? 'segment-btn--red' : ''}`}
            >
              翻棋模式
            </Button>
            <Button
              onClick={() => {
                onSubModeChange('DEPLOY');
                initNewGame('DEPLOY', openFaceDeploy);
              }}
              className={`segment-btn ${subMode === 'DEPLOY' ? 'segment-btn--red' : ''}`}
            >
              布阵模式
            </Button>
          </View>
        </View>

        <View style={{ marginBottom: '20rpx' }}>
          <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '10rpx' }}>
            对战模式
          </Text>
          <View className='segment-group'>
            <Button
              onClick={() => {
                onModeChange('PVE');
                initNewGame(subMode, openFaceDeploy);
              }}
              className={`segment-btn ${playMode === 'PVE' ? 'segment-btn--dark' : ''}`}
            >
              人机博弈 (PvE)
            </Button>
            <Button
              onClick={() => {
                onModeChange('PVP');
                initNewGame(subMode, openFaceDeploy);
              }}
              className={`segment-btn ${playMode === 'PVP' ? 'segment-btn--dark' : ''}`}
            >
              双人同屏 (PvP)
            </Button>
          </View>
        </View>

        {subMode === 'DEPLOY' && (
          <View className='sub-panel' style={{ marginBottom: '18rpx' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14rpx' }}>
              <Text style={{ fontSize: '23rpx', fontWeight: 600, color: '#5D4037' }}>快速布阵调整</Text>
              <Button
                onClick={() => setOpenFaceDeploy(!openFaceDeploy)}
                style={{ fontSize: '22rpx', color: '#0F766E', fontWeight: 600 }}
              >
                {openFaceDeploy ? '切换为暗棋迷雾' : '切换为全明棋视野'}
              </Button>
            </View>
            <View style={{ display: 'flex', gap: '14rpx' }}>
              <Button
                onClick={() => {
                  setBoard(createDeployModeBoard('BALANCED', openFaceDeploy));
                  setPhase('SETUP');
                  setLastBanner('已生成「机动突击阵」，可继续点击棋子微调');
                  soundFX.playSelect();
                }}
                className='btn-soft'
                style={{ flex: 1 }}
              >
                随机机动阵
              </Button>
              <Button
                onClick={() => {
                  setBoard(createDeployModeBoard('FORTRESS', openFaceDeploy));
                  setPhase('SETUP');
                  setLastBanner('已生成「铁桶防御阵」，可继续点击棋子微调');
                  soundFX.playSelect();
                }}
                className='btn-soft'
                style={{ flex: 1 }}
              >
                铁桶防御阵
              </Button>
            </View>
          </View>
        )}

        <View className='sub-panel'>
          <Text style={{ fontSize: '22rpx', color: '#5D4037', lineHeight: '1.6' }}>
            作战与胜负新规：仅允许大吃小或同级对兑（不可小打大主动阵亡）；须先清空敌方全部地雷（工兵/炸弹/无工兵三撞），再由最低官阶扛旗回己方大本营；任一方无可用棋子即直接判输。
          </Text>
        </View>
      </View>

      {/* Battle Log */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <Text className='section-title font-serif-oriental'>军情战报记录</Text>
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            共 {moveLogs.length} 条
          </Text>
        </View>
        {moveLogs.length === 0 ? (
          <View style={{ padding: '36rpx 0', textAlign: 'center' }}>
            <Text style={{ fontSize: '24rpx', color: '#8D6E63' }}>
              暂无交火战报，请调遣部队展开行动
            </Text>
          </View>
        ) : (
          <ScrollView scrollY className='scroll-log-box'>
            {moveLogs.map((log) => (
              <View key={log.step} className='log-item-row'>
                <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx', flex: 1, minWidth: 0 }}>
                  <Text className='font-mono-tabular' style={{ fontWeight: 700, color: '#8D6E63' }}>
                    #{log.step}
                  </Text>
                  <Text style={{ fontWeight: 600 }}>{log.actor}</Text>
                  <Text style={{ color: '#6E5A4F' }}>·</Text>
                  <Text style={{ fontWeight: 700, color: '#291D16' }}>{log.description}</Text>
                </View>
                <Text className='font-mono-tabular' style={{ fontSize: '20rpx', color: '#8D6E63', marginLeft: '10rpx' }}>
                  {log.timestamp}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};
