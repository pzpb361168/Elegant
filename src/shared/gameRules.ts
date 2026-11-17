import type {
  Coord,
  GomokuOnlineBoardState,
  GomokuStone,
  JunqiOnlineBoardState,
  JunqiPieceView,
  JunqiRank,
  JunqiSide,
  JunqiSubMode,
  RoomStatus,
  XiangqiOnlineBoardState,
  XiangqiPiece,
  XiangqiPieceType,
  XiangqiSide,
} from './onlineTypes.ts';

// ============================================================================
// 1. GOMOKU RULES (15x15)
// ============================================================================

export const GOMOKU_SIZE = 15;

export function createInitialGomokuState(): GomokuOnlineBoardState {
  return {
    grid: Array.from({ length: GOMOKU_SIZE }, () => Array(GOMOKU_SIZE).fill(0)),
    turn: 1,
    lastMove: null,
    winningLine: null,
    winner: null,
    stepCount: 0,
  };
}

export function cloneGomokuState(state: GomokuOnlineBoardState): GomokuOnlineBoardState {
  return {
    grid: state.grid.map((r) => [...r]),
    turn: state.turn,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    winningLine: state.winningLine ? state.winningLine.map((p) => ({ ...p })) : null,
    winner: state.winner,
    stepCount: state.stepCount,
  };
}

export function checkGomokuWinLine(
  grid: (0 | GomokuStone)[][],
  r: number,
  c: number,
  color: GomokuStone
): Coord[] | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const line: Coord[] = [{ r, c }];
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === color) {
      line.push({ r: nr, c: nc });
      nr += dr;
      nc += dc;
    }
    nr = r - dr;
    nc = c - dc;
    while (nr >= 0 && nr < GOMOKU_SIZE && nc >= 0 && nc < GOMOKU_SIZE && grid[nr][nc] === color) {
      line.unshift({ r: nr, c: nc });
      nr -= dr;
      nc -= dc;
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function applyGomokuMove(
  state: GomokuOnlineBoardState,
  side: GomokuStone,
  r: number,
  c: number
): { ok: true; next: GomokuOnlineBoardState; desc: string } | { ok: false; error: string } {
  if (state.winner !== null) return { ok: false, error: '对局已结束' };
  if (state.turn !== side) return { ok: false, error: '尚未轮到您落子' };
  if (r < 0 || r >= GOMOKU_SIZE || c < 0 || c >= GOMOKU_SIZE) {
    return { ok: false, error: '落子坐标越界' };
  }
  if (state.grid[r][c] !== 0) return { ok: false, error: '此处已有棋子' };

  const next = cloneGomokuState(state);
  next.grid[r][c] = side;
  next.lastMove = { r, c };
  next.stepCount += 1;

  const colLabel = String.fromCharCode(65 + c);
  const rowLabel = 15 - r;
  const desc = `落子于 ${colLabel}${rowLabel}`;

  const winLine = checkGomokuWinLine(next.grid, r, c, side);
  if (winLine) {
    next.winningLine = winLine;
    next.winner = side;
    return { ok: true, next, desc };
  }

  const isFull = next.grid.every((row) => row.every((cell) => cell !== 0));
  if (isFull) {
    next.winner = 'DRAW';
    return { ok: true, next, desc };
  }

  next.turn = side === 1 ? 2 : 1;
  return { ok: true, next, desc };
}

// ============================================================================
// 2. XIANGQI RULES (10x9)
// ============================================================================

export const XIANGQI_ROWS = 10;
export const XIANGQI_COLS = 9;

export const XIANGQI_PIECE_LABELS: Record<XiangqiSide, Record<XiangqiPieceType, string>> = {
  RED: { G: '帥', A: '仕', E: '相', H: '馬', R: '車', C: '炮', S: '兵' },
  BLACK: { G: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', S: '卒' },
};

export function createInitialXiangqiState(): XiangqiOnlineBoardState {
  const board: (XiangqiPiece | null)[][] = Array.from({ length: XIANGQI_ROWS }, () =>
    Array(XIANGQI_COLS).fill(null)
  );
  const setupBackRow = (r: number, side: XiangqiSide) => {
    const order: XiangqiPieceType[] = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];
    order.forEach((type, c) => {
      board[r][c] = { side, type };
    });
  };
  setupBackRow(0, 'BLACK');
  board[2][1] = { side: 'BLACK', type: 'C' };
  board[2][7] = { side: 'BLACK', type: 'C' };
  [0, 2, 4, 6, 8].forEach((c) => {
    board[3][c] = { side: 'BLACK', type: 'S' };
  });

  setupBackRow(9, 'RED');
  board[7][1] = { side: 'RED', type: 'C' };
  board[7][7] = { side: 'RED', type: 'C' };
  [0, 2, 4, 6, 8].forEach((c) => {
    board[6][c] = { side: 'RED', type: 'S' };
  });

  return {
    board,
    turn: 'RED',
    lastMove: null,
    inCheckSide: null,
    capturedRed: [],
    capturedBlack: [],
    winner: null,
    stepCount: 0,
  };
}

export function cloneXiangqiState(state: XiangqiOnlineBoardState): XiangqiOnlineBoardState {
  return {
    board: state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
    turn: state.turn,
    lastMove: state.lastMove
      ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } }
      : null,
    inCheckSide: state.inCheckSide,
    capturedRed: state.capturedRed.map((p) => ({ ...p })),
    capturedBlack: state.capturedBlack.map((p) => ({ ...p })),
    winner: state.winner,
    stepCount: state.stepCount,
  };
}

function inXiangqiBounds(r: number, c: number): boolean {
  return r >= 0 && r < XIANGQI_ROWS && c >= 0 && c < XIANGQI_COLS;
}

function inPalace(r: number, c: number, side: XiangqiSide): boolean {
  if (c < 3 || c > 5) return false;
  return side === 'BLACK' ? r >= 0 && r <= 2 : r >= 7 && r <= 9;
}

function getPseudoXiangqiMoves(board: (XiangqiPiece | null)[][], r: number, c: number): Coord[] {
  const piece = board[r][c];
  if (!piece) return [];
  const { side, type } = piece;
  const moves: Coord[] = [];

  const addIfValid = (nr: number, nc: number) => {
    if (!inXiangqiBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (!target || target.side !== side) moves.push({ r: nr, c: nc });
  };

  if (type === 'G') {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) addIfValid(nr, nc);
    }
  } else if (type === 'A') {
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) addIfValid(nr, nc);
    }
  } else if (type === 'E') {
    for (const [dr, dc] of [
      [-2, -2],
      [-2, 2],
      [2, -2],
      [2, 2],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inXiangqiBounds(nr, nc)) continue;
      if (side === 'BLACK' && nr > 4) continue;
      if (side === 'RED' && nr < 5) continue;
      if (board[r + dr / 2][c + dc / 2] === null) addIfValid(nr, nc);
    }
  } else if (type === 'H') {
    const jumps: [number, number, number, number][] = [
      [-2, -1, -1, 0],
      [-2, 1, -1, 0],
      [2, -1, 1, 0],
      [2, 1, 1, 0],
      [-1, -2, 0, -1],
      [1, -2, 0, -1],
      [-1, 2, 0, 1],
      [1, 2, 0, 1],
    ];
    for (const [dr, dc, lr, lc] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (inXiangqiBounds(nr, nc) && board[r + lr][c + lc] === null) addIfValid(nr, nc);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      let nr = r + dr;
      let nc = c + dc;
      while (inXiangqiBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) moves.push({ r: nr, c: nc });
        else {
          if (target.side !== side) moves.push({ r: nr, c: nc });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      let nr = r + dr;
      let nc = c + dc;
      let jumped = false;
      while (inXiangqiBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!jumped) {
          if (!target) moves.push({ r: nr, c: nc });
          else jumped = true;
        } else {
          if (target) {
            if (target.side !== side) moves.push({ r: nr, c: nc });
            break;
          }
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (type === 'S') {
    const forward = side === 'RED' ? -1 : 1;
    addIfValid(r + forward, c);
    const crossed = side === 'RED' ? r <= 4 : r >= 5;
    if (crossed) {
      addIfValid(r, c - 1);
      addIfValid(r, c + 1);
    }
  }
  return moves;
}

function areGeneralsFacing(board: (XiangqiPiece | null)[][]): boolean {
  let redG: Coord | null = null;
  let blackG: Coord | null = null;
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 3; c <= 5; c++) {
      const p = board[r][c];
      if (p?.type === 'G') {
        if (p.side === 'RED') redG = { r, c };
        else blackG = { r, c };
      }
    }
  }
  if (!redG || !blackG || redG.c !== blackG.c) return false;
  for (let r = blackG.r + 1; r < redG.r; r++) {
    if (board[r][redG.c] !== null) return false;
  }
  return true;
}

export function isXiangqiSideInCheck(
  board: (XiangqiPiece | null)[][],
  side: XiangqiSide
): boolean {
  if (areGeneralsFacing(board)) return true;
  let gen: Coord | null = null;
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 0; c < XIANGQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.type === 'G') {
        gen = { r, c };
        break;
      }
    }
    if (gen) break;
  }
  if (!gen) return true;
  const opp: XiangqiSide = side === 'RED' ? 'BLACK' : 'RED';
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 0; c < XIANGQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === opp) {
        if (getPseudoXiangqiMoves(board, r, c).some((m) => m.r === gen!.r && m.c === gen!.c)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function getXiangqiLegalMoves(
  board: (XiangqiPiece | null)[][],
  r: number,
  c: number
): Coord[] {
  const piece = board[r][c];
  if (!piece) return [];
  const pseudo = getPseudoXiangqiMoves(board, r, c);
  const legal: Coord[] = [];
  for (const target of pseudo) {
    const saved = board[target.r][target.c];
    board[target.r][target.c] = piece;
    board[r][c] = null;
    const check = isXiangqiSideInCheck(board, piece.side);
    board[r][c] = piece;
    board[target.r][target.c] = saved;
    if (!check) legal.push(target);
  }
  return legal;
}

function hasAnyXiangqiMove(board: (XiangqiPiece | null)[][], side: XiangqiSide): boolean {
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 0; c < XIANGQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && getXiangqiLegalMoves(board, r, c).length > 0) {
        return true;
      }
    }
  }
  return false;
}

export function applyXiangqiMove(
  state: XiangqiOnlineBoardState,
  side: XiangqiSide,
  from: Coord,
  to: Coord
): { ok: true; next: XiangqiOnlineBoardState; desc: string } | { ok: false; error: string } {
  if (state.winner !== null) return { ok: false, error: '对局已结束' };
  if (state.turn !== side) return { ok: false, error: '尚未轮到您行棋' };
  if (!inXiangqiBounds(from.r, from.c) || !inXiangqiBounds(to.r, to.c)) {
    return { ok: false, error: '棋子坐标越界' };
  }

  const moving = state.board[from.r][from.c];
  if (!moving || moving.side !== side) return { ok: false, error: '请选择己方棋子' };

  const legal = getXiangqiLegalMoves(state.board, from.r, from.c);
  if (!legal.some((m) => m.r === to.r && m.c === to.c)) {
    return { ok: false, error: '不符合象棋行棋规则' };
  }

  const next = cloneXiangqiState(state);
  const captured = next.board[to.r][to.c];
  next.board[to.r][to.c] = moving;
  next.board[from.r][from.c] = null;
  next.lastMove = { from, to };
  next.stepCount += 1;

  if (captured) {
    if (captured.side === 'RED') next.capturedRed.push(captured);
    else next.capturedBlack.push(captured);
  }

  const pieceChar = XIANGQI_PIECE_LABELS[moving.side][moving.type];
  const capNote = captured ? ` 吃掉【${XIANGQI_PIECE_LABELS[captured.side][captured.type]}】` : '';
  const desc = `${pieceChar} (${from.c + 1},${10 - from.r}) → (${to.c + 1},${10 - to.r})${capNote}`;

  const nextSide: XiangqiSide = side === 'RED' ? 'BLACK' : 'RED';
  next.inCheckSide = isXiangqiSideInCheck(next.board, nextSide) ? nextSide : null;

  if (!hasAnyXiangqiMove(next.board, nextSide)) {
    next.winner = side;
    return { ok: true, next, desc };
  }

  next.turn = nextSide;
  return { ok: true, next, desc };
}

// ============================================================================
// 3. JUNQI RULES (12x5)
// ============================================================================

export const JUNQI_ROWS = 12;
export const JUNQI_COLS = 5;

export const JUNQI_RANK_NAMES: Record<JunqiRank, string> = {
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

const JUNQI_ROSTER: JunqiRank[] = [
  9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 10, 10, 0, 0, 0, -1,
];

export function isJunqiCamp(r: number, c: number): boolean {
  if ((r === 2 || r === 4 || r === 7 || r === 9) && (c === 1 || c === 3)) return true;
  if ((r === 3 || r === 8) && c === 2) return true;
  return false;
}

export function isJunqiHQ(r: number, c: number): boolean {
  return (r === 0 || r === 11) && (c === 1 || c === 3);
}

export function isJunqiRailwayNode(r: number, c: number): boolean {
  if (r === 1 || r === 5 || r === 6 || r === 10) return true;
  if (r >= 1 && r <= 10 && (c === 0 || c === 4)) return true;
  return false;
}

function isJunqiRailwayEdge(r1: number, c1: number, r2: number, c2: number): boolean {
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  if (r1 === r2 && (r1 === 1 || r1 === 5 || r1 === 6 || r1 === 10)) return true;
  if (c1 === c2) {
    if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
      return c1 === 0 || c1 === 2 || c1 === 4;
    }
    if ((c1 === 0 || c1 === 4) && r1 >= 1 && r1 <= 10 && r2 >= 1 && r2 <= 10) {
      return true;
    }
  }
  return false;
}

function isJunqiOneStepConnected(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (dr === 0 && dc === 0) return false;
  if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
    return dc === 0 && (c1 === 0 || c1 === 2 || c1 === 4);
  }
  if (dr + dc === 1) return true;
  if (dr === 1 && dc === 1) {
    const sameHalf = (r1 <= 5 && r2 <= 5) || (r1 >= 6 && r2 >= 6);
    if (sameHalf && (isJunqiCamp(r1, c1) || isJunqiCamp(r2, c2))) return true;
  }
  return false;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface ServerJunqiPiece {
  id: string;
  side: JunqiSide;
  rank: JunqiRank;
  revealed: boolean;
  carryingFlag?: boolean;
  mineHits?: number;
}

export interface ServerJunqiState {
  subMode: JunqiSubMode;
  board: (ServerJunqiPiece | null)[][];
  turn: JunqiSide;
  lastBanner: string;
  lastMove: { from: Coord; to: Coord } | null;
  winner: JunqiSide | 'DRAW' | null;
  stepCount: number;
  capturedRed: JunqiRank[];
  capturedBlue: JunqiRank[];
}

export function isJunqiOfficerAttackForbidden(
  attackerRank: JunqiRank | number | null,
  defenderRank: JunqiRank | number | null
): boolean {
  if (attackerRank === null || defenderRank === null) return false;
  return (
    attackerRank >= 1 &&
    attackerRank <= 9 &&
    defenderRank >= 1 &&
    defenderRank <= 9 &&
    attackerRank < defenderRank
  );
}

export function hasJunqiPlayableForce(
  board: (Pick<JunqiPieceView, 'side' | 'rank' | 'revealed'> | null)[][],
  side: JunqiSide,
  subMode: JunqiSubMode
): boolean {
  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p = board[r][c];
      if (!p || p.side !== side) continue;
      if (subMode === 'FLIP' && !p.revealed) {
        return true;
      }
      if (p.rank !== null && p.rank >= 1 && p.rank <= 10) {
        return true;
      }
    }
  }
  return false;
}

export function isJunqiOwnHQ(side: JunqiSide, r: number, c: number): boolean {
  return side === 'RED' ? r === 11 && (c === 1 || c === 3) : r === 0 && (c === 1 || c === 3);
}

export function countJunqiMines(
  board: (Pick<JunqiPieceView, 'side' | 'rank'> | null)[][],
  side: JunqiSide
): number {
  let count = 0;
  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 0) count++;
    }
  }
  return count;
}

export function hasJunqiEngineer(
  board: (Pick<JunqiPieceView, 'side' | 'rank'> | null)[][],
  side: JunqiSide
): boolean {
  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 1) return true;
    }
  }
  return false;
}

export function getJunqiMinAliveOfficerRank(
  board: (Pick<JunqiPieceView, 'side' | 'rank'> | null)[][],
  side: JunqiSide
): JunqiRank | null {
  let minRank: number | null = null;
  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank !== null && p.rank >= 1 && p.rank <= 9) {
        if (minRank === null || p.rank < minRank) {
          minRank = p.rank;
        }
      }
    }
  }
  return minRank as JunqiRank | null;
}

export function createJunqiHalfSetup(
  side: JunqiSide,
  preset: 'BALANCED' | 'FORTRESS',
  revealed: boolean
): (ServerJunqiPiece | null)[][] {
  const half: (ServerJunqiPiece | null)[][] = Array.from({ length: 6 }, () => Array(5).fill(null));
  const isBottom = side === 'RED';
  const localHqRow = isBottom ? 5 : 0; // maps to global 11 or 0
  const localBackRows = isBottom ? [4, 5] : [0, 1];
  const localFrontRow = isBottom ? 0 : 5;

  const slots: Coord[] = [];
  for (let lr = 0; lr < 6; lr++) {
    const globalR = isBottom ? lr + 6 : lr;
    for (let c = 0; c < 5; c++) {
      if (!isJunqiCamp(globalR, c)) slots.push({ r: lr, c });
    }
  }

  let idCounter = 0;
  const placeAt = (lr: number, c: number, rank: JunqiRank) => {
    half[lr][c] = { id: `${side}-${rank}-${Date.now()}-${idCounter++}`, side, rank, revealed };
    const idx = slots.findIndex((s) => s.r === lr && s.c === c);
    if (idx !== -1) slots.splice(idx, 1);
  };

  const flagCol = preset === 'FORTRESS' ? 1 : Math.random() < 0.5 ? 1 : 3;
  const otherHqCol = flagCol === 1 ? 3 : 1;
  placeAt(localHqRow, flagCol, -1);
  placeAt(localHqRow, otherHqCol, 2);

  const mines = shuffle(slots.filter((s) => localBackRows.includes(s.r)));
  for (let i = 0; i < 3; i++) placeAt(mines[i].r, mines[i].c, 0);

  const bombs = shuffle(slots.filter((s) => s.r !== localFrontRow));
  for (let i = 0; i < 2; i++) placeAt(bombs[i].r, bombs[i].c, 10);

  const remRanks: JunqiRank[] = [9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1];
  const shufRanks = shuffle(remRanks);
  const shufSlots = shuffle(slots);
  shufSlots.forEach((s, idx) => placeAt(s.r, s.c, shufRanks[idx]));

  return half;
}

export function createInitialServerJunqiState(subMode: JunqiSubMode): ServerJunqiState {
  const board: (ServerJunqiPiece | null)[][] = Array.from({ length: JUNQI_ROWS }, () =>
    Array(JUNQI_COLS).fill(null)
  );

  if (subMode === 'FLIP') {
    const pieces: ServerJunqiPiece[] = [];
    (['RED', 'BLUE'] as JunqiSide[]).forEach((side) => {
      JUNQI_ROSTER.forEach((rank, idx) => {
        pieces.push({ id: `${side}-${rank}-${idx}`, side, rank, revealed: false });
      });
    });
    const shuffled = shuffle(pieces);
    let ptr = 0;
    for (let r = 0; r < JUNQI_ROWS; r++) {
      for (let c = 0; c < JUNQI_COLS; c++) {
        if (!isJunqiCamp(r, c) && ptr < shuffled.length) {
          board[r][c] = shuffled[ptr++];
        }
      }
    }
    return {
      subMode,
      board,
      turn: 'RED',
      lastBanner: '翻棋开局：须先排完敌雷，再由最低官阶将敌旗扛回己方大本营',
      lastMove: null,
      winner: null,
      stepCount: 0,
      capturedRed: [],
      capturedBlue: [],
    };
  }

  // DEPLOY mode: both sides start with default balanced formation (hidden from each other)
  const blueHalf = createJunqiHalfSetup('BLUE', 'BALANCED', true);
  const redHalf = createJunqiHalfSetup('RED', 'BALANCED', true);
  for (let lr = 0; lr < 6; lr++) {
    board[lr] = blueHalf[lr];
    board[lr + 6] = redHalf[lr];
  }

  return {
    subMode,
    board,
    turn: 'RED',
    lastBanner: '双方正在各自半场排兵布阵，完成布阵后即可鸣锣开战',
    lastMove: null,
    winner: null,
    stepCount: 0,
    capturedRed: [],
    capturedBlue: [],
  };
}

export function cloneServerJunqiState(state: ServerJunqiState): ServerJunqiState {
  return {
    subMode: state.subMode,
    board: state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
    turn: state.turn,
    lastBanner: state.lastBanner,
    lastMove: state.lastMove
      ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } }
      : null,
    winner: state.winner,
    stepCount: state.stepCount,
    capturedRed: [...state.capturedRed],
    capturedBlue: [...state.capturedBlue],
  };
}

export function canSwapJunqiSetup(
  board: (Pick<JunqiPieceView, 'side' | 'rank'> | null)[][],
  side: JunqiSide,
  c1: Coord,
  c2: Coord
): { ok: true } | { ok: false; error: string } {
  const p1 = board[c1.r]?.[c1.c];
  const p2 = board[c2.r]?.[c2.c];
  if (!p1 || !p2 || p1.side !== side || p2.side !== side) {
    return { ok: false, error: '只能在己方防区棋子之间互换位置' };
  }
  const backRows = side === 'RED' ? [10, 11] : [0, 1];
  const frontRow = side === 'RED' ? 6 : 5;

  const validatePos = (rank: JunqiRank | null, r: number, c: number): string | null => {
    if (rank === -1 && !isJunqiHQ(r, c)) return '军旗必须部署在大本营内';
    if (rank === 0 && !backRows.includes(r)) return '地雷只能部署在最后两排';
    if (rank === 10 && r === frontRow) return '炸弹不可部署在前线第一排';
    return null;
  };

  const err1 = validatePos(p1.rank, c2.r, c2.c);
  if (err1) return { ok: false, error: err1 };
  const err2 = validatePos(p2.rank, c1.r, c1.c);
  if (err2) return { ok: false, error: err2 };
  return { ok: true };
}

export function getJunqiLegalMovesGeneric(
  board: (Pick<JunqiPieceView, 'side' | 'rank' | 'revealed' | 'carryingFlag'> | null)[][],
  r: number,
  c: number,
  subMode: JunqiSubMode,
  options?: { enemyMinesCount?: number; ownMinRank?: JunqiRank | null }
): Coord[] {
  const piece = board[r]?.[c];
  if (!piece || !piece.revealed || piece.side === 'UNKNOWN' || piece.rank === null) return [];
  if (piece.rank === -1 || piece.rank === 0) return [];
  if (subMode === 'DEPLOY' && isJunqiHQ(r, c) && !piece.carryingFlag) return [];

  const mySide = piece.side;
  const enemySide: JunqiSide = mySide === 'RED' ? 'BLUE' : 'RED';
  const enemyMines =
    options?.enemyMinesCount !== undefined
      ? options.enemyMinesCount
      : countJunqiMines(board, enemySide);
  const minRank =
    options?.ownMinRank !== undefined
      ? options.ownMinRank
      : getJunqiMinAliveOfficerRank(board, mySide);

  const legal: Coord[] = [];
  const added = new Set<string>();

  const tryAdd = (nr: number, nc: number): boolean => {
    const key = `${nr},${nc}`;
    const occ = board[nr][nc];
    if (!occ) {
      if (!added.has(key)) {
        added.add(key);
        legal.push({ r: nr, c: nc });
      }
      return true;
    }

    // Own piece blocking: flag-carrier may enter own HQ even if occupied by own Flag/guard
    if (occ.side === mySide) {
      if (piece.carryingFlag && isJunqiOwnHQ(mySide, nr, nc)) {
        if (!added.has(key)) {
          added.add(key);
          legal.push({ r: nr, c: nc });
        }
      }
      return false;
    }

    // Flag carrier is strictly non-combatant (cannot eat or be eaten, only blocked by enemy pieces)
    if (piece.carryingFlag) return false;

    if (isJunqiCamp(nr, nc)) return false;
    if (!occ.revealed) return false;

    // Enemy carrying a flag cannot be captured — only blocked!
    if (occ.carryingFlag) return false;

    // Visible enemy flag can only be picked up if enemy mines === 0 AND attacker is lowest alive officer rank
    if (occ.rank === -1) {
      if (enemyMines > 0 || minRank === null || piece.rank !== minRank) {
        return false;
      }
    }

    // Visible enemy officer: smaller officer (1..9) cannot proactively attack larger officer (1..9)
    if (occ.rank !== null && isJunqiOfficerAttackForbidden(piece.rank, occ.rank)) {
      return false;
    }

    if (!added.has(key)) {
      added.add(key);
      legal.push({ r: nr, c: nc });
    }
    return false;
  };

  for (let nr = Math.max(0, r - 1); nr <= Math.min(JUNQI_ROWS - 1, r + 1); nr++) {
    for (let nc = Math.max(0, c - 1); nc <= Math.min(JUNQI_COLS - 1, c + 1); nc++) {
      if (isJunqiOneStepConnected(r, c, nr, nc)) tryAdd(nr, nc);
    }
  }

  if (isJunqiRailwayNode(r, c)) {
    if (piece.rank === 1) {
      const visited = new Set<string>([`${r},${c}`]);
      const queue: Coord[] = [{ r, c }];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nr = curr.r + dr;
          const nc = curr.c + dc;
          if (nr < 0 || nr >= JUNQI_ROWS || nc < 0 || nc >= JUNQI_COLS) continue;
          const nKey = `${nr},${nc}`;
          if (visited.has(nKey)) continue;
          if (!isJunqiRailwayEdge(curr.r, curr.c, nr, nc)) continue;
          visited.add(nKey);
          if (tryAdd(nr, nc)) queue.push({ r: nr, c: nc });
        }
      }
    } else {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        let cr = r;
        let cc = c;
        while (true) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= JUNQI_ROWS || nc < 0 || nc >= JUNQI_COLS) break;
          if (!isJunqiRailwayEdge(cr, cc, nr, nc)) break;
          if (!tryAdd(nr, nc)) break;
          cr = nr;
          cc = nc;
        }
      }
    }
  }
  return legal;
}

function resolveJunqiStandardCombat(
  attacker: ServerJunqiPiece,
  defender: ServerJunqiPiece
): 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'BOTH_DIE' {
  if (attacker.rank === 10 || defender.rank === 10) return 'BOTH_DIE';
  if (attacker.rank > defender.rank) return 'ATTACKER_WINS';
  if (attacker.rank < defender.rank) return 'DEFENDER_WINS';
  return 'BOTH_DIE';
}

function hasAnyJunqiAction(
  board: (ServerJunqiPiece | null)[][],
  side: JunqiSide,
  subMode: JunqiSubMode
): boolean {
  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (subMode === 'FLIP' && !p.revealed) return true;
      if (p.revealed && p.side === side && getJunqiLegalMovesGeneric(board, r, c, subMode).length > 0) {
        return true;
      }
    }
  }
  return false;
}

export function applyJunqiFlip(
  state: ServerJunqiState,
  side: JunqiSide,
  r: number,
  c: number
): { ok: true; next: ServerJunqiState; desc: string } | { ok: false; error: string } {
  if (state.winner !== null) return { ok: false, error: '对局已结束' };
  if (state.subMode !== 'FLIP') return { ok: false, error: '当前非翻棋模式' };
  if (state.turn !== side) return { ok: false, error: '尚未轮到您行动' };
  const piece = state.board[r]?.[c];
  if (!piece || piece.revealed) return { ok: false, error: '该位置无法翻棋' };

  const next = cloneServerJunqiState(state);
  next.board[r][c]!.revealed = true;
  next.lastMove = { from: { r, c }, to: { r, c } };
  next.stepCount += 1;

  const sideText = piece.side === 'RED' ? '红' : '蓝';
  const pieceDesc = `${sideText}【${JUNQI_RANK_NAMES[piece.rank]}】`;
  next.lastBanner = `${side === 'RED' ? '红方' : '蓝方'}翻出 ${pieceDesc}`;
  next.turn = side === 'RED' ? 'BLUE' : 'RED';
  return { ok: true, next, desc: `于 (${r + 1},${c + 1}) 翻出 ${pieceDesc}` };
}

export function applyJunqiMove(
  state: ServerJunqiState,
  side: JunqiSide,
  from: Coord,
  to: Coord
): { ok: true; next: ServerJunqiState; desc: string } | { ok: false; error: string } {
  if (state.winner !== null) return { ok: false, error: '对局已结束' };
  if (state.turn !== side) return { ok: false, error: '尚未轮到您行军' };

  const attacker = state.board[from.r]?.[from.c];
  if (!attacker || !attacker.revealed || attacker.side !== side) {
    return { ok: false, error: '请选择已翻开的己方棋子' };
  }

  const legal = getJunqiLegalMovesGeneric(state.board, from.r, from.c, state.subMode);
  if (!legal.some((m) => m.r === to.r && m.c === to.c)) {
    return { ok: false, error: '目标位置不可达或不符合扛旗/排雷规则' };
  }

  const enemySide: JunqiSide = side === 'RED' ? 'BLUE' : 'RED';
  const defender = state.board[to.r][to.c];

  // Validate Flag pickup preconditions authoritatively (especially in DEPLOY fog-of-war)
  if (defender && defender.side === enemySide && defender.rank === -1) {
    const enemyMines = countJunqiMines(state.board, enemySide);
    if (enemyMines > 0) {
      return {
        ok: false,
        error: `敌方尚余 ${enemyMines} 颗地雷未清除，须先排空全部地雷方能夺旗！`,
      };
    }
    const minRank = getJunqiMinAliveOfficerRank(state.board, side);
    if (minRank === null || attacker.rank !== minRank) {
      const reqLabel = minRank !== null ? JUNQI_RANK_NAMES[minRank] : '最低官阶';
      return {
        ok: false,
        error: `须由己方当前存活最低官阶【${reqLabel}】前往扛取敌方军旗！`,
      };
    }
  }

  // Enforce "no smaller officer proactively attacking larger officer" (especially in DEPLOY fog-of-war)
  if (
    defender &&
    defender.side === enemySide &&
    isJunqiOfficerAttackForbidden(attacker.rank, defender.rank)
  ) {
    return {
      ok: false,
      error: '敌军官阶高于己方，只能大吃小或同级对兑，不可小打大主动阵亡！',
    };
  }

  const next = cloneServerJunqiState(state);
  const nextDefender = next.board[to.r][to.c];
  next.lastMove = { from, to };
  next.stepCount += 1;

  const recordCaptured = (fallenSide: JunqiSide, rank: JunqiRank) => {
    if (fallenSide === 'RED') next.capturedRed.push(rank);
    else next.capturedBlue.push(rank);
  };

  let desc = '';
  const actorLabel = side === 'RED' ? '红方' : '蓝方';

  // Case A: Flag-carrier entering own HQ (empty or occupied by own Flag/piece) -> VICTORY!
  if (attacker.carryingFlag && isJunqiOwnHQ(side, to.r, to.c)) {
    next.board[from.r][from.c] = null;
    next.board[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
    desc = `【${JUNQI_RANK_NAMES[attacker.rank]}】成功将敌方军旗扛回己方大本营！`;
    next.lastBanner = `${actorLabel}${desc}`;
    next.winner = side;
    return { ok: true, next, desc };
  }

  if (!nextDefender) {
    next.board[to.r][to.c] = { ...attacker };
    next.board[from.r][from.c] = null;
    if (attacker.carryingFlag) {
      desc = `扛旗【${JUNQI_RANK_NAMES[attacker.rank]}】突围进驻 (${to.r + 1},${to.c + 1})`;
      next.lastBanner = `${actorLabel}扛旗部队正撤回己方大本营！`;
    } else {
      desc =
        state.subMode === 'FLIP'
          ? `【${JUNQI_RANK_NAMES[attacker.rank]}】进驻 (${to.r + 1},${to.c + 1})`
          : `部队机动进驻 (${to.r + 1},${to.c + 1})`;
      next.lastBanner = `${actorLabel}部队进驻 (${to.r + 1},${to.c + 1})`;
    }
  } else if (nextDefender.rank === -1) {
    // Pick up enemy Flag (mines === 0 and attacker is minRank already verified above)
    next.board[from.r][from.c] = null;
    next.board[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
    desc = `【${JUNQI_RANK_NAMES[attacker.rank]}】拔得敌方【军旗】！需扛回己方大本营`;
    next.lastBanner = `${actorLabel}最低官阶拔得敌旗！请护送返回己方大本营（不可被吃，谨防堵截）`;
  } else if (nextDefender.rank === 0) {
    // Landmine combat: Engineer clears directly; Bomb destroys directly; if no Engineer left, 3 hits clear 1 mine
    next.board[from.r][from.c] = null;
    if (attacker.rank === 1) {
      next.board[to.r][to.c] = { ...attacker };
      recordCaptured(enemySide, 0);
      desc = `【工兵】成功排除敌方【地雷】`;
      next.lastBanner = `${actorLabel}工兵精准排雷成功！`;
    } else if (attacker.rank === 10) {
      next.board[to.r][to.c] = null;
      recordCaptured(side, 10);
      recordCaptured(enemySide, 0);
      desc = `【炸弹】直接炸毁敌方【地雷】（同归于尽）`;
      next.lastBanner = `${actorLabel}炸弹爆破清雷（同归于尽）！`;
    } else {
      recordCaptured(side, attacker.rank);
      const attackerHasEng = hasJunqiEngineer(state.board, side);
      if (!attackerHasEng) {
        const hits = (nextDefender.mineHits ?? 0) + 1;
        if (hits >= 3) {
          next.board[to.r][to.c] = null;
          recordCaptured(enemySide, 0);
          desc = `无工兵三子换雷（3/3）：部队牺牲并清除敌方【地雷】`;
          next.lastBanner = `${actorLabel}连撞三子强行排雷成功，地雷已清除！`;
        } else {
          next.board[to.r][to.c] = { ...nextDefender, mineHits: hits };
          desc = `无工兵撞雷（${hits}/3）：部队阵亡，敌方地雷已受创`;
          next.lastBanner = `${actorLabel}强行撞雷牺牲，该地雷已受创（${hits}/3）`;
        }
      } else {
        desc = `部队触及敌方地雷阵亡（己方尚有工兵可排雷）`;
        next.lastBanner = `${actorLabel}普通部队触雷阵亡，地雷依然存在！`;
      }
    }
  } else {
    // Standard ranked piece or Bomb combat
    const result = resolveJunqiStandardCombat(attacker, nextDefender);
    next.board[from.r][from.c] = null;
    if (result === 'ATTACKER_WINS') {
      next.board[to.r][to.c] = { ...attacker };
      recordCaptured(enemySide, nextDefender.rank);
      desc =
        state.subMode === 'FLIP'
          ? `【${JUNQI_RANK_NAMES[attacker.rank]}】击溃【${JUNQI_RANK_NAMES[nextDefender.rank]}】`
          : `进攻得手，击溃敌方守军（敌损【${JUNQI_RANK_NAMES[nextDefender.rank]}】）`;
      next.lastBanner = `${actorLabel}${desc}`;
    } else if (result === 'DEFENDER_WINS') {
      recordCaptured(side, attacker.rank);
      desc = `进攻受挫，不敌敌方驻军`;
      next.lastBanner = `${actorLabel}进攻失利，部队阵亡`;
    } else {
      next.board[to.r][to.c] = null;
      recordCaptured(side, attacker.rank);
      recordCaptured(enemySide, nextDefender.rank);
      desc = `于 (${to.r + 1},${to.c + 1}) 与敌军同归于尽`;
      next.lastBanner = `激烈交火：双方棋子同归于尽！`;
    }
  }

  const nextSide: JunqiSide = side === 'RED' ? 'BLUE' : 'RED';
  const nextHasForce = hasJunqiPlayableForce(next.board, nextSide, state.subMode);
  const actorHasForce = hasJunqiPlayableForce(next.board, side, state.subMode);

  if (!nextHasForce && !actorHasForce) {
    next.winner = 'DRAW';
    next.lastBanner = `双方有生作战力量均已耗尽，本局判和！`;
    return { ok: true, next, desc };
  }

  if (!nextHasForce) {
    next.winner = side;
    const loserLabel = nextSide === 'RED' ? '红方' : '蓝方';
    next.lastBanner = `${loserLabel}已无任何可用棋子，${actorLabel}赢得战役胜利！`;
    return { ok: true, next, desc };
  }

  if (!actorHasForce) {
    next.winner = nextSide;
    const winnerLabel = nextSide === 'RED' ? '红方' : '蓝方';
    next.lastBanner = `${actorLabel}已无任何可用棋子，${winnerLabel}赢得战役胜利！`;
    return { ok: true, next, desc };
  }

  if (!hasAnyJunqiAction(next.board, nextSide, state.subMode)) {
    next.winner = side;
    next.lastBanner = `${actorLabel}封锁敌军全部行动，赢得战役胜利！`;
    return { ok: true, next, desc };
  }

  next.turn = nextSide;
  return { ok: true, next, desc };
}

// Sanitize Junqi board for a specific client viewer so hidden info cannot leak over WebSocket
export function sanitizeJunqiStateForViewer(
  state: ServerJunqiState,
  viewerRole: 'SEAT_1' | 'SEAT_2' | 'SPECTATOR',
  roomStatus: RoomStatus
): JunqiOnlineBoardState {
  const gameEnded = roomStatus === 'FINISHED' || state.winner !== null;
  const viewerSide: JunqiSide | null =
    viewerRole === 'SEAT_1' ? 'RED' : viewerRole === 'SEAT_2' ? 'BLUE' : null;

  const board: (JunqiPieceView | null)[][] = state.board.map((row) =>
    row.map((piece) => {
      if (!piece) return null;

      // Once game ends, reveal entire board for post-match review
      if (gameEnded) {
        return {
          id: piece.id,
          side: piece.side,
          rank: piece.rank,
          revealed: true,
          carryingFlag: piece.carryingFlag,
          mineHits: piece.mineHits,
        };
      }

      if (state.subMode === 'FLIP') {
        if (!piece.revealed) {
          return {
            id: piece.id,
            side: 'UNKNOWN',
            rank: null,
            revealed: false,
          };
        }
        return {
          id: piece.id,
          side: piece.side,
          rank: piece.rank,
          revealed: true,
          carryingFlag: piece.carryingFlag,
          mineHits: piece.mineHits,
        };
      }

      // DEPLOY mode: Fog of war! Only show rank to the owner, EXCEPT carryingFlag & >0 mineHits are public battle telemetry
      const canSeeRank = viewerSide !== null && piece.side === viewerSide;
      return {
        id: piece.id,
        side: piece.side,
        rank: canSeeRank ? piece.rank : null,
        revealed: piece.revealed,
        carryingFlag: piece.carryingFlag || undefined,
        mineHits: piece.mineHits && piece.mineHits > 0 ? piece.mineHits : undefined,
      };
    })
  );

  return {
    subMode: state.subMode,
    board,
    turn: state.turn,
    lastBanner: state.lastBanner,
    lastMove: state.lastMove
      ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } }
      : null,
    winner: state.winner,
    stepCount: state.stepCount,
    redMines: countJunqiMines(state.board, 'RED'),
    blueMines: countJunqiMines(state.board, 'BLUE'),
    redMinRank: getJunqiMinAliveOfficerRank(state.board, 'RED'),
    blueMinRank: getJunqiMinAliveOfficerRank(state.board, 'BLUE'),
    capturedRed: [...state.capturedRed],
    capturedBlue: [...state.capturedBlue],
  };
}
