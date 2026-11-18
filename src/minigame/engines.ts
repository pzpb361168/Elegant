import type {
  Coord,
  GomokuOnlineBoardState,
  GomokuStone,
  JunqiRank,
  JunqiSide,
  JunqiSubMode,
  XiangqiOnlineBoardState,
  XiangqiPieceType,
  XiangqiSide,
} from '../shared/onlineTypes.ts';
import {
  applyGomokuMove,
  applyJunqiFlip,
  applyJunqiMove,
  applyXiangqiMove,
  canSwapJunqiSetup,
  cloneGomokuState,
  cloneServerJunqiState,
  cloneXiangqiState,
  countJunqiMines,
  createInitialGomokuState,
  createInitialServerJunqiState,
  createInitialXiangqiState,
  createJunqiHalfSetup,
  getJunqiLegalMovesGeneric,
  getJunqiMinAliveOfficerRank,
  getXiangqiLegalMoves,
  GOMOKU_SIZE,
  hasJunqiEngineer,
  isJunqiCamp,
  isJunqiOwnHQ,
  JUNQI_COLS,
  JUNQI_RANK_NAMES,
  JUNQI_ROWS,
  type ServerJunqiPiece,
  type ServerJunqiState,
  XIANGQI_COLS,
  XIANGQI_ROWS,
} from '../shared/gameRules.ts';
import type { AIDifficulty, MoveLogEntry, PlayMode } from '../types/game.ts';

function nowTime(): string {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ============================================================================
// 1. GOMOKU LOCAL ENGINE + AI
// ============================================================================

export interface GomokuLocalSession {
  board: GomokuOnlineBoardState;
  history: GomokuOnlineBoardState[];
  logs: MoveLogEntry[];
  hint: Coord | null;
}

export function createGomokuSession(): GomokuLocalSession {
  return {
    board: createInitialGomokuState(),
    history: [],
    logs: [],
    hint: null,
  };
}

function evalGomokuLine(
  grid: (0 | GomokuStone)[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: GomokuStone
): number {
  let count = 1;
  let openEnds = 0;
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === color) {
    count++;
    nr += dr;
    nc += dc;
  }
  if (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === 0) openEnds++;

  nr = r - dr;
  nc = c - dc;
  while (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === color) {
    count++;
    nr -= dr;
    nc -= dc;
  }
  if (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === 0) openEnds++;

  if (count >= 5) return 100000;
  if (count === 4) return openEnds === 2 ? 15000 : openEnds === 1 ? 3500 : 100;
  if (count === 3) return openEnds === 2 ? 2200 : openEnds === 1 ? 300 : 30;
  if (count === 2) return openEnds === 2 ? 260 : openEnds === 1 ? 40 : 10;
  return count * 10;
}

function evalGomokuPoint(grid: (0 | GomokuStone)[][], r: number, c: number, color: GomokuStone): number {
  let total = 0;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as [number, number][]) {
    total += evalGomokuLine(grid, r, c, dr, dc, color);
  }
  total += Math.max(0, 14 - (Math.abs(r - 7) + Math.abs(c - 7)));
  return total;
}

export function computeGomokuAIMove(
  gridInput: (0 | GomokuStone)[][],
  aiColor: GomokuStone,
  difficulty: AIDifficulty
): Coord {
  const grid = gridInput.map((row) => [...row]);
  const humanColor: GomokuStone = aiColor === 1 ? 2 : 1;

  let hasStones = false;
  for (let r = 0; r < GOMOKU_SIZE && !hasStones; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (grid[r][c] !== 0) {
        hasStones = true;
        break;
      }
    }
  }
  if (!hasStones) return { r: 7, c: 7 };

  const candidates: { r: number; c: number; score: number }[] = [];
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      if (grid[r][c] !== 0) continue;
      let near = false;
      for (let nr = Math.max(0, r - 2); nr <= Math.min(GOMOKU_SIZE - 1, r + 2) && !near; nr++) {
        for (let nc = Math.max(0, c - 2); nc <= Math.min(GOMOKU_SIZE - 1, c + 2); nc++) {
          if (grid[nr][nc] !== 0) {
            near = true;
            break;
          }
        }
      }
      if (!near) continue;

      const atk = evalGomokuPoint(grid, r, c, aiColor);
      const def = evalGomokuPoint(grid, r, c, humanColor);
      let score = 0;
      if (atk >= 100000) score = 999999;
      else if (def >= 100000) score = 500000;
      else if (difficulty === 'EASY') score = atk * 0.9 + def * 0.75 + Math.random() * 180;
      else if (difficulty === 'MEDIUM') score = atk * 1.05 + def * 1.0 + Math.random() * 25;
      else score = atk * 1.15 + (def >= 2000 ? def * 1.25 : def * 1.05);

      candidates.push({ r, c, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (difficulty === 'HARD' && candidates.length > 1 && candidates[0].score < 400000) {
    const topN = candidates.slice(0, 6);
    let best = topN[0];
    let bestVal = -Infinity;
    for (const cand of topN) {
      grid[cand.r][cand.c] = aiColor;
      let maxOpp = 0;
      for (let r = 0; r < GOMOKU_SIZE; r++) {
        for (let c = 0; c < GOMOKU_SIZE; c++) {
          if (grid[r][c] === 0) {
            const o = evalGomokuPoint(grid, r, c, humanColor);
            if (o > maxOpp) maxOpp = o;
          }
        }
      }
      grid[cand.r][cand.c] = 0;
      const net = cand.score - maxOpp * 0.45;
      if (net > bestVal) {
        bestVal = net;
        best = cand;
      }
    }
    return { r: best.r, c: best.c };
  }
  return candidates[0] ? { r: candidates[0].r, c: candidates[0].c } : { r: 7, c: 7 };
}

export function stepGomokuLocal(
  session: GomokuLocalSession,
  r: number,
  c: number,
  playMode: PlayMode
): { ok: true; next: GomokuLocalSession } | { ok: false; error: string } {
  const actorSide = session.board.turn;
  const res = applyGomokuMove(session.board, actorSide, r, c);
  if (!res.ok) return res;

  const actor =
    actorSide === 1 ? '黑方(先)' : playMode === 'PVE' ? '白方(AI)' : '白方(后)';

  return {
    ok: true,
    next: {
      board: res.next,
      history: [...session.history, cloneGomokuState(session.board)],
      logs: [
        { step: session.logs.length + 1, actor, description: res.desc, timestamp: nowTime() },
        ...session.logs,
      ].slice(0, 40),
      hint: null,
    },
  };
}

export function undoGomokuLocal(session: GomokuLocalSession, playMode: PlayMode): GomokuLocalSession | null {
  if (session.history.length === 0 || session.board.winner !== null) return null;
  if (playMode === 'PVE' && session.board.turn === 2) return null;
  const pop = playMode === 'PVE' && session.history.length >= 2 ? 2 : 1;
  const idx = session.history.length - pop;
  return {
    board: session.history[idx],
    history: session.history.slice(0, idx),
    logs: session.logs.slice(pop),
    hint: null,
  };
}

// ============================================================================
// 2. XIANGQI LOCAL ENGINE + ALPHA-BETA AI
// ============================================================================

const XIANGQI_VALUES: Record<XiangqiPieceType, number> = {
  G: 10000,
  R: 900,
  C: 450,
  H: 400,
  E: 200,
  A: 200,
  S: 120,
};

export interface XiangqiLocalSession {
  board: XiangqiOnlineBoardState;
  history: XiangqiOnlineBoardState[];
  logs: MoveLogEntry[];
  selected: Coord | null;
  legalTargets: Coord[];
}

export function createXiangqiSession(): XiangqiLocalSession {
  return {
    board: createInitialXiangqiState(),
    history: [],
    logs: [],
    selected: null,
    legalTargets: [],
  };
}

function evaluateXiangqiBoard(board: XiangqiOnlineBoardState['board']): number {
  let score = 0;
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 0; c < XIANGQI_COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      let val = XIANGQI_VALUES[p.type];
      if (p.type === 'S') {
        const crossed = p.side === 'BLACK' ? r >= 5 : r <= 4;
        if (crossed) val += 90;
        if (c >= 2 && c <= 6) val += 20;
      } else if (p.type === 'H' || p.type === 'C' || p.type === 'R') {
        if (c >= 2 && c <= 6 && r >= 2 && r <= 7) val += 25;
      }
      score += p.side === 'BLACK' ? val : -val;
    }
  }
  return score;
}


export function computeXiangqiAIMove(
  stateBoard: XiangqiOnlineBoardState['board'],
  side: XiangqiSide,
  difficulty: AIDifficulty
): { from: Coord; to: Coord } | null {
  const board = stateBoard.map((row) => row.map((p) => (p ? { ...p } : null)));
  const getAllMoves = (s: XiangqiSide) => {
    const out: { from: Coord; to: Coord }[] = [];
    for (let r = 0; r < XIANGQI_ROWS; r++) {
      for (let c = 0; c < XIANGQI_COLS; c++) {
        const p = board[r][c];
        if (p && p.side === s) {
          for (const to of getXiangqiLegalMoves(board, r, c)) {
            out.push({ from: { r, c }, to });
          }
        }
      }
    }
    return out;
  };

  const legal = getAllMoves(side);
  if (legal.length === 0) return null;

  if (difficulty === 'EASY') {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const m of legal) {
      const cap = board[m.to.r][m.to.c];
      const val = (cap ? XIANGQI_VALUES[cap.type] : 0) + Math.random() * 140;
      if (val > bestScore) {
        bestScore = val;
        best = m;
      }
    }
    return best;
  }

  const maxDepth = difficulty === 'MEDIUM' ? 2 : 3;
  const sortMoves = (moves: { from: Coord; to: Coord }[]) =>
    moves.sort((a, b) => {
      const ca = board[a.to.r][a.to.c] ? XIANGQI_VALUES[board[a.to.r][a.to.c]!.type] : 0;
      const cb = board[b.to.r][b.to.c] ? XIANGQI_VALUES[board[b.to.r][b.to.c]!.type] : 0;
      return cb - ca;
    });

  const minimax = (depth: number, alpha: number, beta: number, maximizingBlack: boolean): number => {
    if (depth === 0) return evaluateXiangqiBoard(board);
    const currSide: XiangqiSide = maximizingBlack ? 'BLACK' : 'RED';
    const moves = sortMoves(getAllMoves(currSide));
    if (moves.length === 0) {
      return maximizingBlack ? -50000 - depth * 100 : 50000 + depth * 100;
    }

    if (maximizingBlack) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const mv = board[m.from.r][m.from.c];
        const tg = board[m.to.r][m.to.c];
        board[m.to.r][m.to.c] = mv;
        board[m.from.r][m.from.c] = null;
        const ev = minimax(depth - 1, alpha, beta, false);
        board[m.from.r][m.from.c] = mv;
        board[m.to.r][m.to.c] = tg;
        if (ev > maxEval) maxEval = ev;
        if (ev > alpha) alpha = ev;
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const mv = board[m.from.r][m.from.c];
        const tg = board[m.to.r][m.to.c];
        board[m.to.r][m.to.c] = mv;
        board[m.from.r][m.from.c] = null;
        const ev = minimax(depth - 1, alpha, beta, true);
        board[m.from.r][m.from.c] = mv;
        board[m.to.r][m.to.c] = tg;
        if (ev < minEval) minEval = ev;
        if (ev < beta) beta = ev;
        if (beta <= alpha) break;
      }
      return minEval;
    }
  };

  sortMoves(legal);
  const isMax = side === 'BLACK';
  let chosen = legal[0];
  let bestVal = isMax ? -Infinity : Infinity;
  for (const m of legal) {
    const mv = board[m.from.r][m.from.c];
    const tg = board[m.to.r][m.to.c];
    board[m.to.r][m.to.c] = mv;
    board[m.from.r][m.from.c] = null;
    const ev = minimax(maxDepth - 1, -Infinity, Infinity, !isMax) + (Math.random() - 0.5) * 8;
    board[m.from.r][m.from.c] = mv;
    board[m.to.r][m.to.c] = tg;
    if ((isMax && ev > bestVal) || (!isMax && ev < bestVal)) {
      bestVal = ev;
      chosen = m;
    }
  }
  return chosen;
}

export function stepXiangqiLocal(
  session: XiangqiLocalSession,
  from: Coord,
  to: Coord,
  playMode: PlayMode
): { ok: true; next: XiangqiLocalSession; captured: boolean; checked: boolean } | { ok: false; error: string } {
  const actorSide = session.board.turn;
  const hadTarget = session.board.board[to.r]?.[to.c] !== null;
  const res = applyXiangqiMove(session.board, actorSide, from, to);
  if (!res.ok) return res;

  const actor =
    actorSide === 'RED' ? '红方' : playMode === 'PVE' ? '黑方(AI)' : '黑方';

  return {
    ok: true,
    captured: hadTarget,
    checked: res.next.inCheckSide !== null,
    next: {
      board: res.next,
      history: [...session.history, cloneXiangqiState(session.board)],
      logs: [
        { step: session.logs.length + 1, actor, description: res.desc, timestamp: nowTime() },
        ...session.logs,
      ].slice(0, 40),
      selected: null,
      legalTargets: [],
    },
  };
}

export function undoXiangqiLocal(session: XiangqiLocalSession, playMode: PlayMode): XiangqiLocalSession | null {
  if (session.history.length === 0 || session.board.winner !== null) return null;
  if (playMode === 'PVE' && session.board.turn === 'BLACK') return null;
  const pop = playMode === 'PVE' && session.history.length >= 2 ? 2 : 1;
  const idx = session.history.length - pop;
  return {
    board: session.history[idx],
    history: session.history.slice(0, idx),
    logs: session.logs.slice(pop),
    selected: null,
    legalTargets: [],
  };
}

// ============================================================================
// 3. JUNQI LOCAL ENGINE + TACTICAL AI
// ============================================================================

export interface JunqiLocalSession {
  state: ServerJunqiState;
  phase: 'SETUP' | 'PLAYING' | 'GAME_OVER';
  history: ServerJunqiState[];
  logs: MoveLogEntry[];
  selected: Coord | null;
  legalTargets: Coord[];
  openFaceDeploy: boolean;
}

export function createJunqiSession(
  subMode: JunqiSubMode,
  openFaceDeploy = false
): JunqiLocalSession {
  const state = createInitialServerJunqiState(subMode);
  if (subMode === 'DEPLOY') {
    state.lastBanner = '布阵阶段：点击下方红方两枚棋子可换位，就绪后点「开始交锋」';
  }
  return {
    state,
    phase: subMode === 'DEPLOY' ? 'SETUP' : 'PLAYING',
    history: [],
    logs: [],
    selected: null,
    legalTargets: [],
    openFaceDeploy,
  };
}

export function applyJunqiLocalPreset(
  session: JunqiLocalSession,
  preset: 'BALANCED' | 'FORTRESS'
): JunqiLocalSession {
  if (session.phase !== 'SETUP') return session;
  const next = cloneServerJunqiState(session.state);
  const redHalf = createJunqiHalfSetup('RED', preset, true);
  for (let lr = 0; lr < 6; lr++) {
    next.board[lr + 6] = redHalf[lr];
  }
  next.lastBanner =
    preset === 'FORTRESS' ? '已切换【固若金汤】铁桶阵型' : '已切换【均衡先锋】布阵';
  return { ...session, state: next, selected: null, legalTargets: [] };
}

export function swapJunqiLocalSetup(
  session: JunqiLocalSession,
  c1: Coord,
  c2: Coord
): { ok: true; next: JunqiLocalSession } | { ok: false; error: string } {
  const check = canSwapJunqiSetup(session.state.board, 'RED', c1, c2);
  if (!check.ok) return check;
  const next = cloneServerJunqiState(session.state);
  const tmp = next.board[c1.r][c1.c];
  next.board[c1.r][c1.c] = next.board[c2.r][c2.c];
  next.board[c2.r][c2.c] = tmp;
  next.lastBanner = '布阵位置已调整，可继续换位或点击「开始交锋」';
  return { ok: true, next: { ...session, state: next, selected: null, legalTargets: [] } };
}

export function stepJunqiFlipLocal(
  session: JunqiLocalSession,
  r: number,
  c: number,
  playMode: PlayMode
): { ok: true; next: JunqiLocalSession } | { ok: false; error: string } {
  const actorSide = session.state.turn;
  const res = applyJunqiFlip(session.state, actorSide, r, c);
  if (!res.ok) return res;
  const actor = actorSide === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方(AI)' : '蓝方';
  return {
    ok: true,
    next: {
      ...session,
      state: res.next,
      history: [...session.history, cloneServerJunqiState(session.state)],
      logs: [
        { step: session.logs.length + 1, actor, description: res.desc, timestamp: nowTime() },
        ...session.logs,
      ].slice(0, 40),
      selected: null,
      legalTargets: [],
    },
  };
}

export function stepJunqiMoveLocal(
  session: JunqiLocalSession,
  from: Coord,
  to: Coord,
  playMode: PlayMode
):
  | { ok: true; next: JunqiLocalSession; outcomeKind: 'MOVE' | 'WIN' | 'LOSS' | 'BOMB' }
  | { ok: false; error: string } {
  const actorSide = session.state.turn;
  const attacker = session.state.board[from.r]?.[from.c];
  const defender = session.state.board[to.r]?.[to.c];

  const res = applyJunqiMove(session.state, actorSide, from, to);
  if (!res.ok) return res;

  let outcomeKind: 'MOVE' | 'WIN' | 'LOSS' | 'BOMB' = 'MOVE';
  if (defender && attacker) {
    if (defender.rank === -1 || (attacker.carryingFlag && isJunqiOwnHQ(actorSide, to.r, to.c))) {
      outcomeKind = 'WIN';
    } else if (attacker.rank === 10 || defender.rank === 10) {
      outcomeKind = 'BOMB';
    } else if (defender.rank === 0) {
      if (attacker.rank === 1) {
        outcomeKind = 'WIN';
      } else {
        const afterDef = res.next.board[to.r][to.c];
        outcomeKind = afterDef === null ? 'BOMB' : 'LOSS';
      }
    } else if (attacker.rank > defender.rank) {
      outcomeKind = 'WIN';
    } else if (attacker.rank < defender.rank) {
      outcomeKind = 'LOSS';
    } else {
      outcomeKind = 'BOMB';
    }
  } else if (attacker?.carryingFlag && isJunqiOwnHQ(actorSide, to.r, to.c)) {
    outcomeKind = 'WIN';
  }

  const actor = actorSide === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方(AI)' : '蓝方';
  return {
    ok: true,
    outcomeKind,
    next: {
      ...session,
      state: res.next,
      phase: res.next.winner !== null ? 'GAME_OVER' : 'PLAYING',
      history: [...session.history, cloneServerJunqiState(session.state)],
      logs: [
        { step: session.logs.length + 1, actor, description: res.desc, timestamp: nowTime() },
        ...session.logs,
      ].slice(0, 40),
      selected: null,
      legalTargets: [],
    },
  };
}

export function undoJunqiLocal(session: JunqiLocalSession, playMode: PlayMode): JunqiLocalSession | null {
  if (session.phase !== 'PLAYING' || session.history.length === 0 || session.state.winner !== null) return null;
  if (playMode === 'PVE' && session.state.turn === 'BLUE') return null;
  const pop = playMode === 'PVE' && session.history.length >= 2 ? 2 : 1;
  const idx = session.history.length - pop;
  return {
    ...session,
    state: session.history[idx],
    history: session.history.slice(0, idx),
    logs: session.logs.slice(pop),
    selected: null,
    legalTargets: [],
  };
}

export function computeJunqiAIAction(
  state: ServerJunqiState,
  difficulty: AIDifficulty
): { kind: 'FLIP'; r: number; c: number } | { kind: 'MOVE'; from: Coord; to: Coord } | null {
  const board = state.board;
  const subMode = state.subMode;
  const redMines = countJunqiMines(board, 'RED');
  const blueHasEng = hasJunqiEngineer(board, 'BLUE');
  const blueMinRank = getJunqiMinAliveOfficerRank(board, 'BLUE');

  let redFlagPos: Coord | null = null;
  let redCarrierPos: Coord | null = null;
  for (let rr = 0; rr < JUNQI_ROWS; rr++) {
    for (let cc = 0; cc < JUNQI_COLS; cc++) {
      const tp = board[rr][cc];
      if (tp && tp.side === 'RED') {
        if (tp.rank === -1 && (tp.revealed || subMode === 'DEPLOY')) redFlagPos = { r: rr, c: cc };
        if (tp.carryingFlag) redCarrierPos = { r: rr, c: cc };
      }
    }
  }

  const candidates: { from: Coord; to: Coord; score: number }[] = [];

  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p: ServerJunqiPiece | null = board[r][c];
      if (!p || !p.revealed || p.side !== 'BLUE') continue;
      const targets = getJunqiLegalMovesGeneric(board, r, c, subMode);
      for (const to of targets) {
        const def = board[to.r][to.c];
        let score = 0;

        if (p.carryingFlag) {
          if (isJunqiOwnHQ('BLUE', to.r, to.c)) {
            score = 999999;
          } else {
            const dBefore = Math.min(Math.abs(r - 0) + Math.abs(c - 1), Math.abs(r - 0) + Math.abs(c - 3));
            const dAfter = Math.min(Math.abs(to.r - 0) + Math.abs(to.c - 1), Math.abs(to.r - 0) + Math.abs(to.c - 3));
            score = 4500 + (dBefore - dAfter) * 650 + (isJunqiCamp(to.r, to.c) ? 180 : 0);
          }
        } else if (def) {
          if (def.rank === -1) {
            score = redMines === 0 && blueMinRank !== null && p.rank === blueMinRank ? 99999 : -9999;
          } else if (def.rank === 0) {
            if (p.rank === 1) score = 1600;
            else if (p.rank === 10) score = 900;
            else if (!blueHasEng) score = 320 + (def.mineHits ?? 0) * 300 - p.rank * 35;
            else score = -950;
          } else if (p.rank === 10 || def.rank === 10) {
            score = def.rank >= p.rank ? 220 : -150;
          } else if (p.rank > def.rank) {
            score = 520 + def.rank * 80;
          } else if (p.rank === def.rank) {
            score = 220;
          } else {
            score = -600;
          }
          if (blueMinRank !== null && p.rank === blueMinRank && redMines <= 1) score -= 220;
        } else {
          score = (to.r - r) * 18 + (isJunqiCamp(to.r, to.c) ? 65 : 0);
          if (redCarrierPos) {
            const distToCarrier = Math.abs(to.r - redCarrierPos.r) + Math.abs(to.c - redCarrierPos.c);
            score += Math.max(0, 8 - distToCarrier) * 110;
            if ((to.r === 10 || to.r === 11) && (to.c === 1 || to.c === 2 || to.c === 3)) score += 360;
          } else if (redMines === 0 && redFlagPos && blueMinRank !== null && p.rank === blueMinRank) {
            const dBefore = Math.abs(r - redFlagPos.r) + Math.abs(c - redFlagPos.c);
            const dAfter = Math.abs(to.r - redFlagPos.r) + Math.abs(to.c - redFlagPos.c);
            score += (dBefore - dAfter) * 280;
          }
        }

        if (difficulty === 'EASY') score += Math.random() * 220;
        else if (difficulty === 'MEDIUM') score += Math.random() * 60;
        candidates.push({ from: { r, c }, to, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (subMode === 'FLIP') {
    const unrevealed: Coord[] = [];
    for (let r = 0; r < JUNQI_ROWS; r++) {
      for (let c = 0; c < JUNQI_COLS; c++) {
        if (board[r][c] && !board[r][c]!.revealed) unrevealed.push({ r, c });
      }
    }
    if (unrevealed.length > 0 && (candidates.length === 0 || candidates[0].score < 120)) {
      const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      return { kind: 'FLIP', r: pick.r, c: pick.c };
    }
  }

  if (candidates.length > 0) {
    return { kind: 'MOVE', from: candidates[0].from, to: candidates[0].to };
  }
  return null;
}

export function getJunqiRankText(rank: JunqiRank | null): string {
  if (rank === null) return '?';
  return JUNQI_RANK_NAMES[rank];
}
