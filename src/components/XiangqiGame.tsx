import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIDifficulty, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { RotateCcw, RefreshCw, Flag, Award, ShieldAlert, Eye } from 'lucide-react';

export type XiangqiSide = 'RED' | 'BLACK';
export type PieceType = 'G' | 'A' | 'E' | 'H' | 'R' | 'C' | 'S';
// G=General(帅/将), A=Advisor(仕/士), E=Elephant(相/象), H=Horse(马), R=Chariot(车), C=Cannon(炮), S=Soldier(兵/卒)

export interface XiangqiPiece {
  side: XiangqiSide;
  type: PieceType;
}

export type XiangqiBoard = (XiangqiPiece | null)[][]; // 10 rows x 9 cols

interface Coord {
  r: number;
  c: number;
}

interface XiangqiMove {
  from: Coord;
  to: Coord;
}

interface XiangqiHistoryItem {
  board: XiangqiBoard;
  turn: XiangqiSide;
  lastMove: XiangqiMove | null;
  capturedRed: XiangqiPiece[];
  capturedBlack: XiangqiPiece[];
}

interface XiangqiGameProps {
  playMode: PlayMode;
  difficulty: AIDifficulty;
  onModeChange: (mode: PlayMode) => void;
  onDifficultyChange: (diff: AIDifficulty) => void;
  onRecordResult: (outcome: 'WIN' | 'LOSS' | 'DRAW') => void;
}

const ROWS = 10;
const COLS = 9;

const PIECE_LABELS: Record<XiangqiSide, Record<PieceType, string>> = {
  RED: {
    G: '帥',
    A: '仕',
    E: '相',
    H: '馬',
    R: '車',
    C: '炮',
    S: '兵',
  },
  BLACK: {
    G: '將',
    A: '士',
    E: '象',
    H: '馬',
    R: '車',
    C: '砲',
    S: '卒',
  },
};

const PIECE_VALUES: Record<PieceType, number> = {
  G: 10000,
  R: 900,
  C: 450,
  H: 400,
  E: 200,
  A: 200,
  S: 120,
};

function createInitialXiangqiBoard(): XiangqiBoard {
  const board: XiangqiBoard = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  const setupBackRow = (r: number, side: XiangqiSide) => {
    const order: PieceType[] = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];
    order.forEach((type, c) => {
      board[r][c] = { side, type };
    });
  };

  // Black top (rows 0..4)
  setupBackRow(0, 'BLACK');
  board[2][1] = { side: 'BLACK', type: 'C' };
  board[2][7] = { side: 'BLACK', type: 'C' };
  [0, 2, 4, 6, 8].forEach((c) => {
    board[3][c] = { side: 'BLACK', type: 'S' };
  });

  // Red bottom (rows 5..9)
  setupBackRow(9, 'RED');
  board[7][1] = { side: 'RED', type: 'C' };
  board[7][7] = { side: 'RED', type: 'C' };
  [0, 2, 4, 6, 8].forEach((c) => {
    board[6][c] = { side: 'RED', type: 'S' };
  });

  return board;
}

function cloneXiangqiBoard(board: XiangqiBoard): XiangqiBoard {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function inPalace(r: number, c: number, side: XiangqiSide): boolean {
  if (c < 3 || c > 5) return false;
  return side === 'BLACK' ? r >= 0 && r <= 2 : r >= 7 && r <= 9;
}

// Generate pseudo-legal moves for a piece at (r, c), ignoring whether own General is left in check
function getPseudoMoves(board: XiangqiBoard, r: number, c: number): Coord[] {
  const piece = board[r][c];
  if (!piece) return [];
  const { side, type } = piece;
  const moves: Coord[] = [];

  const addIfValid = (nr: number, nc: number) => {
    if (!inBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (!target || target.side !== side) {
      moves.push({ r: nr, c: nc });
    }
  };

  if (type === 'G') {
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) {
        addIfValid(nr, nc);
      }
    }
  } else if (type === 'A') {
    const dirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) {
        addIfValid(nr, nc);
      }
    }
  } else if (type === 'E') {
    // Elephant: 2-step diagonal, cannot cross river, blocked by elephant eye
    const dirs = [
      [-2, -2],
      [-2, 2],
      [2, -2],
      [2, 2],
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const eyeR = r + dr / 2;
      const eyeC = c + dc / 2;
      if (!inBounds(nr, nc)) continue;
      // Cannot cross river
      if (side === 'BLACK' && nr > 4) continue;
      if (side === 'RED' && nr < 5) continue;
      if (board[eyeR][eyeC] === null) {
        addIfValid(nr, nc);
      }
    }
  } else if (type === 'H') {
    // Horse: L-shape with orthogonal leg check (蹩马腿)
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
    for (const [dr, dc, legR, legC] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[r + legR][c + legC] === null) {
        addIfValid(nr, nc);
      }
    }
  } else if (type === 'R') {
    // Chariot: orthogonal lines
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (target.side !== side) moves.push({ r: nr, c: nc });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (type === 'C') {
    // Cannon: moves like Chariot, captures by jumping over exactly 1 screen piece
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      let jumped = false;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!jumped) {
          if (!target) {
            moves.push({ r: nr, c: nc });
          } else {
            jumped = true;
          }
        } else {
          if (target) {
            if (target.side !== side) {
              moves.push({ r: nr, c: nc });
            }
            break;
          }
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if (type === 'S') {
    // Soldier: 1 step forward; once across the river, also 1 step left/right
    const forward = side === 'RED' ? -1 : 1;
    addIfValid(r + forward, c);
    const crossedRiver = side === 'RED' ? r <= 4 : r >= 5;
    if (crossedRiver) {
      addIfValid(r, c - 1);
      addIfValid(r, c + 1);
    }
  }

  return moves;
}

// Check if the two Generals face each other directly on the same column with no pieces in between
function areGeneralsFacing(board: XiangqiBoard): boolean {
  let redG: Coord | null = null;
  let blackG: Coord | null = null;

  for (let r = 0; r < ROWS; r++) {
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

// Check if `side`'s General is currently under attack (in Check)
function isSideInCheck(board: XiangqiBoard, side: XiangqiSide): boolean {
  if (areGeneralsFacing(board)) return true;

  let genCoord: Coord | null = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.type === 'G') {
        genCoord = { r, c };
        break;
      }
    }
    if (genCoord) break;
  }
  if (!genCoord) return true;

  const oppSide: XiangqiSide = side === 'RED' ? 'BLACK' : 'RED';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === oppSide) {
        const oppMoves = getPseudoMoves(board, r, c);
        if (oppMoves.some((m) => m.r === genCoord!.r && m.c === genCoord!.c)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Generate strictly legal moves for a piece at (r, c)
function getLegalMovesForPiece(board: XiangqiBoard, r: number, c: number): Coord[] {
  const piece = board[r][c];
  if (!piece) return [];
  const pseudo = getPseudoMoves(board, r, c);
  const legal: Coord[] = [];

  for (const target of pseudo) {
    const savedTarget = board[target.r][target.c];
    board[target.r][target.c] = piece;
    board[r][c] = null;

    const inCheck = isSideInCheck(board, piece.side);

    board[r][c] = piece;
    board[target.r][target.c] = savedTarget;

    if (!inCheck) {
      legal.push(target);
    }
  }
  return legal;
}

function getAllLegalMoves(board: XiangqiBoard, side: XiangqiSide): XiangqiMove[] {
  const allMoves: XiangqiMove[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side) {
        const targets = getLegalMovesForPiece(board, r, c);
        for (const to of targets) {
          allMoves.push({ from: { r, c }, to });
        }
      }
    }
  }
  return allMoves;
}

// Board evaluation from BLACK's perspective (AI plays BLACK in PvE)
function evaluateXiangqiBoard(board: XiangqiBoard): number {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;

      let val = PIECE_VALUES[p.type];
      // Positional bonuses
      if (p.type === 'S') {
        const crossed = p.side === 'BLACK' ? r >= 5 : r <= 4;
        if (crossed) val += 90;
        if (c >= 2 && c <= 6) val += 20;
      } else if (p.type === 'H' || p.type === 'C' || p.type === 'R') {
        // Central control bonus
        if (c >= 2 && c <= 6 && r >= 2 && r <= 7) val += 25;
      }

      if (p.side === 'BLACK') score += val;
      else score -= val;
    }
  }
  return score;
}

function computeBestXiangqiMove(board: XiangqiBoard, side: XiangqiSide, difficulty: AIDifficulty): XiangqiMove | null {
  const legalMoves = getAllLegalMoves(board, side);
  if (legalMoves.length === 0) return null;

  if (difficulty === 'EASY') {
    // Prioritize captures with some randomness
    let bestMove = legalMoves[0];
    let bestScore = -Infinity;
    for (const m of legalMoves) {
      const captured = board[m.to.r][m.to.c];
      const capBonus = captured ? PIECE_VALUES[captured.type] : 0;
      const val = capBonus + Math.random() * 140;
      if (val > bestScore) {
        bestScore = val;
        bestMove = m;
      }
    }
    return bestMove;
  }

  const maxDepth = difficulty === 'MEDIUM' ? 2 : 3;

  // Sort moves to improve alpha-beta pruning (captures first)
  const sortMoves = (moves: XiangqiMove[]) =>
    moves.sort((a, b) => {
      const capA = board[a.to.r][a.to.c] ? PIECE_VALUES[board[a.to.r][a.to.c]!.type] : 0;
      const capB = board[b.to.r][b.to.c] ? PIECE_VALUES[board[b.to.r][b.to.c]!.type] : 0;
      return capB - capA;
    });

  const minimax = (
    depth: number,
    alpha: number,
    beta: number,
    maximizingBlack: boolean
  ): number => {
    if (depth === 0) {
      return evaluateXiangqiBoard(board);
    }

    const currentSide: XiangqiSide = maximizingBlack ? 'BLACK' : 'RED';
    const moves = sortMoves(getAllLegalMoves(board, currentSide));

    if (moves.length === 0) {
      return maximizingBlack ? -50000 - depth * 100 : 50000 + depth * 100;
    }

    if (maximizingBlack) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const moving = board[m.from.r][m.from.c];
        const target = board[m.to.r][m.to.c];
        board[m.to.r][m.to.c] = moving;
        board[m.from.r][m.from.c] = null;

        const ev = minimax(depth - 1, alpha, beta, false);

        board[m.from.r][m.from.c] = moving;
        board[m.to.r][m.to.c] = target;

        if (ev > maxEval) maxEval = ev;
        if (ev > alpha) alpha = ev;
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const moving = board[m.from.r][m.from.c];
        const target = board[m.to.r][m.to.c];
        board[m.to.r][m.to.c] = moving;
        board[m.from.r][m.from.c] = null;

        const ev = minimax(depth - 1, alpha, beta, true);

        board[m.from.r][m.from.c] = moving;
        board[m.to.r][m.to.c] = target;

        if (ev < minEval) minEval = ev;
        if (ev < beta) beta = ev;
        if (beta <= alpha) break;
      }
      return minEval;
    }
  };

  const isMaximizing = side === 'BLACK';
  let chosenMove = legalMoves[0];
  let bestVal = isMaximizing ? -Infinity : Infinity;

  sortMoves(legalMoves);

  for (const m of legalMoves) {
    const moving = board[m.from.r][m.from.c];
    const target = board[m.to.r][m.to.c];
    board[m.to.r][m.to.c] = moving;
    board[m.from.r][m.from.c] = null;

    const val = minimax(maxDepth - 1, -Infinity, Infinity, !isMaximizing);

    board[m.from.r][m.from.c] = moving;
    board[m.to.r][m.to.c] = target;

    if (isMaximizing) {
      if (val > bestVal) {
        bestVal = val;
        chosenMove = m;
      }
    } else {
      if (val < bestVal) {
        bestVal = val;
        chosenMove = m;
      }
    }
  }

  return chosenMove;
}

export const XiangqiGame: React.FC<XiangqiGameProps> = ({
  playMode,
  difficulty,
  onModeChange,
  onDifficultyChange,
  onRecordResult,
}) => {
  const [board, setBoard] = useState<XiangqiBoard>(createInitialXiangqiBoard);
  const [turn, setTurn] = useState<XiangqiSide>('RED');
  const [selected, setSelected] = useState<Coord | null>(null);
  const [legalTargets, setLegalTargets] = useState<Coord[]>([]);
  const [lastMove, setLastMove] = useState<XiangqiMove | null>(null);
  const [hintMove, setHintMove] = useState<XiangqiMove | null>(null);
  const [inCheckSide, setInCheckSide] = useState<XiangqiSide | null>(null);
  const [winner, setWinner] = useState<XiangqiSide | 'DRAW' | null>(null);
  const [history, setHistory] = useState<XiangqiHistoryItem[]>([]);
  const [capturedRed, setCapturedRed] = useState<XiangqiPiece[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<XiangqiPiece[]>([]);
  const [moveLogs, setMoveLogs] = useState<MoveLogEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [moveEffect, setMoveEffect] = useState<{
    to: Coord;
    isCapture: boolean;
    isCheck: boolean;
    key: number;
  } | null>(null);

  const aiTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (winner !== null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [winner]);

  const resetGame = useCallback(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setBoard(createInitialXiangqiBoard());
    setTurn('RED');
    setSelected(null);
    setLegalTargets([]);
    setLastMove(null);
    setHintMove(null);
    setInCheckSide(null);
    setWinner(null);
    setHistory([]);
    setCapturedRed([]);
    setCapturedBlack([]);
    setMoveLogs([]);
    setElapsedSeconds(0);
    setMoveEffect(null);
    soundFX.playSelect();
  }, []);

  const executeMove = useCallback(
    (from: Coord, to: Coord) => {
      const movingPiece = board[from.r][from.c];
      if (!movingPiece) return;

      const captured = board[to.r][to.c];
      const nextBoard = cloneXiangqiBoard(board);
      nextBoard[to.r][to.c] = movingPiece;
      nextBoard[from.r][from.c] = null;

      setHistory((prev) => [
        ...prev,
        {
          board: cloneXiangqiBoard(board),
          turn,
          lastMove,
          capturedRed: [...capturedRed],
          capturedBlack: [...capturedBlack],
        },
      ]);

      if (captured) {
        if (captured.side === 'RED') {
          setCapturedRed((prev) => [...prev, captured]);
        } else {
          setCapturedBlack((prev) => [...prev, captured]);
        }
      }

      setBoard(nextBoard);
      setSelected(null);
      setLegalTargets([]);
      setLastMove({ from, to });
      setHintMove(null);

      const pieceChar = PIECE_LABELS[movingPiece.side][movingPiece.type];
      const captureNote = captured
        ? ` 吃掉【${PIECE_LABELS[captured.side][captured.type]}】`
        : '';

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: movingPiece.side === 'RED' ? '红方' : playMode === 'PVE' ? '黑方 (AI)' : '黑方',
          description: `${pieceChar} (${from.c + 1},${10 - from.r}) → (${to.c + 1},${10 - to.r})${captureNote}`,
          timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);

      const nextSide: XiangqiSide = turn === 'RED' ? 'BLACK' : 'RED';
      const remainingMoves = getAllLegalMoves(nextBoard, nextSide);
      const nextInCheck = isSideInCheck(nextBoard, nextSide);

      setInCheckSide(nextInCheck ? nextSide : null);
      setMoveEffect({
        to,
        isCapture: Boolean(captured),
        isCheck: nextInCheck,
        key: Date.now() + Math.random(),
      });

      if (remainingMoves.length === 0) {
        // Checkmate or Stalemate (in Xiangqi, stalemate is also a loss for the stalemated side)
        setWinner(turn);
        soundFX.playVictory();
        if (playMode === 'PVE') {
          onRecordResult(turn === 'RED' ? 'WIN' : 'LOSS');
        } else {
          onRecordResult('WIN');
        }
        return;
      }

      if (nextInCheck) {
        soundFX.playXiangqiCheck();
      } else if (captured) {
        soundFX.playXiangqiCapture();
      } else {
        soundFX.playXiangqiMove();
      }

      setTurn(nextSide);
    },
    [board, capturedBlack, capturedRed, lastMove, onRecordResult, playMode, turn]
  );

  // Trigger AI when turn === 'BLACK' in PvE
  useEffect(() => {
    if (playMode === 'PVE' && turn === 'BLACK' && winner === null) {
      aiTimerRef.current = window.setTimeout(() => {
        const aiMove = computeBestXiangqiMove(cloneXiangqiBoard(board), 'BLACK', difficulty);
        if (aiMove) {
          executeMove(aiMove.from, aiMove.to);
        }
      }, 480);
    }
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [playMode, turn, winner, board, difficulty, executeMove]);

  const handleCellClick = (r: number, c: number) => {
    if (winner !== null) return;
    if (playMode === 'PVE' && turn === 'BLACK') return;

    const clickedPiece = board[r][c];

    // If a piece is already selected and user clicked a valid target
    if (selected && legalTargets.some((t) => t.r === r && t.c === c)) {
      executeMove(selected, { r, c });
      return;
    }

    // If user clicked their own piece, select it and calculate legal moves
    if (clickedPiece && clickedPiece.side === turn) {
      soundFX.playSelect();
      setSelected({ r, c });
      const moves = getLegalMovesForPiece(cloneXiangqiBoard(board), r, c);
      setLegalTargets(moves);
      return;
    }

    // Otherwise deselect
    setSelected(null);
    setLegalTargets([]);
  };

  const handleUndo = () => {
    if (history.length === 0 || winner !== null) return;
    if (playMode === 'PVE' && turn === 'BLACK') return;

    const steps = playMode === 'PVE' && history.length >= 2 ? 2 : 1;
    const targetIdx = history.length - steps;
    const snapshot = history[targetIdx];

    setBoard(snapshot.board);
    setTurn(snapshot.turn);
    setLastMove(snapshot.lastMove);
    setCapturedRed(snapshot.capturedRed);
    setCapturedBlack(snapshot.capturedBlack);
    setSelected(null);
    setLegalTargets([]);
    setHintMove(null);
    setMoveEffect(null);
    setInCheckSide(isSideInCheck(snapshot.board, snapshot.turn) ? snapshot.turn : null);
    setHistory((prev) => prev.slice(0, targetIdx));
    setMoveLogs((prev) => prev.slice(steps));
    soundFX.playSelect();
  };

  const handleHint = () => {
    if (winner !== null) return;
    if (playMode === 'PVE' && turn === 'BLACK') return;
    const best = computeBestXiangqiMove(cloneXiangqiBoard(board), turn, 'MEDIUM');
    if (best) {
      setHintMove(best);
      setSelected(best.from);
      setLegalTargets(getLegalMovesForPiece(cloneXiangqiBoard(board), best.from.r, best.from.c));
      soundFX.playSelect();
    }
  };

  const handleResign = () => {
    if (winner !== null || history.length === 0) return;
    const victor: XiangqiSide = turn === 'RED' ? 'BLACK' : 'RED';
    setWinner(victor);
    soundFX.playCheck();
    if (playMode === 'PVE') {
      onRecordResult('LOSS');
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Board Section */}
      <div className="lg:col-span-8 flex flex-col items-center">
        {/* Status Bar */}
        <div className="w-full max-w-[580px] mb-4 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 rounded-xl bg-[#EFE9D8] border border-[#D8CBB8]">
          <div className="flex items-center gap-3">
            <span
              className={`w-7 h-7 rounded-full font-serif-oriental font-bold text-sm flex items-center justify-center shadow-sm border ${
                turn === 'RED'
                  ? 'bg-[#FDF8EE] text-[#B91C1C] border-[#B91C1C]'
                  : 'bg-[#FDF8EE] text-[#1E293B] border-[#1E293B]'
              }`}
            >
              {turn === 'RED' ? '帥' : '將'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#291D16]">
                  {winner === null
                    ? turn === 'RED'
                      ? '当前行棋：红方'
                      : playMode === 'PVE'
                      ? '雅弈 AI 正在思索招法...'
                      : '当前行棋：黑方'
                    : winner === 'RED'
                    ? '对局结束：红方绝杀获胜！'
                    : '对局结束：黑方绝杀获胜！'}
                </span>
                {inCheckSide && winner === null && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#B91C1C]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    将军！
                  </span>
                )}
              </div>
              <div className="text-xs text-[#6E5A4F]">
                回合步数 <span className="font-mono-tabular font-semibold">{history.length}</span> · 用时{' '}
                <span className="font-mono-tabular font-semibold">{formatTime(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHint}
              disabled={winner !== null || (playMode === 'PVE' && turn === 'BLACK')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              支招提示
            </button>
            <button
              onClick={handleUndo}
              disabled={history.length === 0 || winner !== null || (playMode === 'PVE' && turn === 'BLACK')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              悔棋
            </button>
          </div>
        </div>

        {/* Traditional 9x10 Chinese Chess Board */}
        <div className="relative w-full max-w-[580px] aspect-[9/10] p-6 sm:p-8 rounded-2xl wood-board-surface border-2 border-[#7C5332] select-none">
          <div className="relative w-full h-full">
            {/* SVG Board Lines, River & Palace Diagonals */}
            <svg viewBox="0 0 800 900" className="w-full h-full overflow-visible" aria-label="中国象棋棋盘">
              {/* Outer Thick Frame */}
              <rect
                x="-16"
                y="-16"
                width="832"
                height="932"
                fill="none"
                stroke="#3E2723"
                strokeWidth="5"
                opacity="0.85"
              />

              {/* 10 Horizontal Grid Lines */}
              {Array.from({ length: ROWS }).map((_, r) => (
                <line
                  key={`h-${r}`}
                  x1={0}
                  y1={r * 100}
                  x2={800}
                  y2={r * 100}
                  stroke="#3E2723"
                  strokeWidth={r === 0 || r === 9 || r === 4 || r === 5 ? 3.5 : 2.2}
                />
              ))}

              {/* 9 Vertical Grid Lines (broken across river for cols 1..7) */}
              {Array.from({ length: COLS }).map((_, c) => {
                if (c === 0 || c === 8) {
                  return (
                    <line
                      key={`v-${c}`}
                      x1={c * 100}
                      y1={0}
                      x2={c * 100}
                      y2={900}
                      stroke="#3E2723"
                      strokeWidth={3.5}
                    />
                  );
                }
                return (
                  <g key={`v-${c}`}>
                    <line
                      x1={c * 100}
                      y1={0}
                      x2={c * 100}
                      y2={400}
                      stroke="#3E2723"
                      strokeWidth={2.2}
                    />
                    <line
                      x1={c * 100}
                      y1={500}
                      x2={c * 100}
                      y2={900}
                      stroke="#3E2723"
                      strokeWidth={2.2}
                    />
                  </g>
                );
              })}

              {/* Top & Bottom Palace Diagonals (九宫格斜线) */}
              <line x1={300} y1={0} x2={500} y2={200} stroke="#3E2723" strokeWidth={2.2} />
              <line x1={500} y1={0} x2={300} y2={200} stroke="#3E2723" strokeWidth={2.2} />
              <line x1={300} y1={700} x2={500} y2={900} stroke="#3E2723" strokeWidth={2.2} />
              <line x1={500} y1={700} x2={300} y2={900} stroke="#3E2723" strokeWidth={2.2} />

              {/* Chu River & Han Border Calligraphy (楚河 · 汉界) */}
              <text
                x={200}
                y={466}
                textAnchor="middle"
                className="fill-[#3E2723] font-serif-oriental text-[46px] font-bold tracking-[0.35em]"
                opacity="0.82"
              >
                楚河
              </text>
              <text
                x={600}
                y={466}
                textAnchor="middle"
                className="fill-[#3E2723] font-serif-oriental text-[46px] font-bold tracking-[0.35em]"
                opacity="0.82"
              >
                漢界
              </text>
            </svg>

            {/* 9x10 Interactive Grid Cells */}
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                marginLeft: '-6.25%',
                marginRight: '-6.25%',
                marginTop: '-5.55%',
                marginBottom: '-5.55%',
              }}
            >
              {board.map((row, r) =>
                row.map((piece, c) => {
                  const isSel = selected?.r === r && selected?.c === c;
                  const isLegal = legalTargets.some((t) => t.r === r && t.c === c);
                  const isFrom = lastMove?.from.r === r && lastMove?.from.c === c;
                  const isTo = lastMove?.to.r === r && lastMove?.to.c === c;
                  const isHintDest = hintMove?.to.r === r && hintMove?.to.c === c;
                  const isFxTarget = moveEffect?.to.r === r && moveEffect?.to.c === c;
                  const isCheckedGeneral =
                    piece?.type === 'G' && inCheckSide !== null && piece.side === inCheckSide;

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => handleCellClick(r, c)}
                      className="relative flex items-center justify-center w-full h-full focus:outline-none cursor-pointer"
                    >
                      {/* Last move origin subtle square */}
                      {isFrom && !piece && (
                        <span className="w-3 h-3 rounded-full bg-[#7C5332]/50" />
                      )}

                      {/* Threatened General pulsing cinnabar aura */}
                      {isCheckedGeneral && (
                        <span className="absolute inset-0 rounded-full border-3 border-[#B91C1C] bg-[#B91C1C]/20 pointer-events-none animate-xiangqi-general-pulse" />
                      )}

                      {/* Move / Capture impact ring */}
                      {isFxTarget && moveEffect && (
                        <span
                          key={`xq-ring-${moveEffect.key}`}
                          className={`absolute inset-0 rounded-full pointer-events-none ${
                            moveEffect.isCapture
                              ? 'border-[3px] border-[#B91C1C] bg-[#B91C1C]/15 animate-xiangqi-capture'
                              : 'border-2 border-[#9A6B32]/85 animate-xiangqi-ring'
                          }`}
                        />
                      )}

                      {/* Xiangqi Wooden Carved Disc Piece */}
                      {piece && (
                        <div
                          key={isFxTarget && moveEffect ? `xq-pc-${moveEffect.key}` : 'xq-pc'}
                          className={`w-[86%] h-[86%] rounded-full flex items-center justify-center transition-transform duration-150 bg-radial-[at_35%_30%] from-[#FFFDF7] via-[#F5E6C8] to-[#DFC393] border-2 shadow-[0_4px_7px_rgba(45,27,18,0.45)] ${
                            piece.side === 'RED'
                              ? 'border-[#991B1B] text-[#B91C1C]'
                              : 'border-[#1E293B] text-[#1E293B]'
                          } ${isFxTarget ? 'animate-xiangqi-slam' : ''} ${
                            isSel ? '-translate-y-1.5 ring-3 ring-[#0F766E] scale-105' : ''
                          } ${isTo ? 'ring-2 ring-[#B91C1C]/70' : ''}`}
                        >
                          <div
                            className={`w-[84%] h-[84%] rounded-full border flex items-center justify-center ${
                              piece.side === 'RED' ? 'border-[#B91C1C]/45' : 'border-[#1E293B]/45'
                            }`}
                          >
                            <span className="font-serif-oriental font-bold text-lg sm:text-2xl leading-none select-none">
                              {PIECE_LABELS[piece.side][piece.type]}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Floating capture callout badge */}
                      {isFxTarget && moveEffect?.isCapture && (
                        <span
                          key={`xq-tag-${moveEffect.key}`}
                          className="absolute -top-2 z-20 px-1.5 py-0.5 rounded bg-[#B91C1C] text-[#FFFDF7] font-serif-oriental font-bold text-xs shadow-md pointer-events-none animate-fx-float-tag"
                        >
                          吃
                        </span>
                      )}

                      {/* Legal Target Marker (Jade dot for empty, Jade ring for capture) */}
                      {isLegal && !piece && (
                        <span className="w-4 h-4 rounded-full bg-[#0F766E] shadow-sm ring-2 ring-white/70 pointer-events-none" />
                      )}
                      {isLegal && piece && (
                        <span className="absolute inset-1 rounded-full border-3 border-[#0F766E] bg-[#0F766E]/15 pointer-events-none" />
                      )}

                      {/* Hint destination marker */}
                      {isHintDest && (
                        <span className="absolute inset-0.5 rounded-full border-2 border-dashed border-[#B91C1C] animate-pulse pointer-events-none" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Non-blocking dramatic Check (將軍) Stamp Flash */}
          {moveEffect?.isCheck && winner === null && (
            <div
              key={`xq-check-${moveEffect.key}`}
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              <div className="px-7 py-3 rounded-xl bg-[#7F1D1D]/92 border-2 border-[#FDE68A] shadow-2xl animate-xiangqi-check-banner">
                <span className="font-serif-oriental font-bold text-3xl sm:text-4xl tracking-[0.35em] text-[#FEF3C7]">
                  將 軍
                </span>
              </div>
            </div>
          )}

          {/* Victory Overlay Modal */}
          {winner !== null && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] rounded-2xl flex items-center justify-center p-6 z-20">
              <div className="bg-[#F7F3E8] border-2 border-[#7C5332] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center">
                  <Award className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold font-serif-oriental text-[#291D16] mb-1">
                  {winner === 'RED' ? '红方运筹帷幄获胜' : '黑方运筹帷幄获胜'}
                </h3>
                <p className="text-xs text-[#6E5A4F] mb-5">
                  绝杀定局 · 共历时 {formatTime(elapsedSeconds)} · 交锋 {history.length} 回合
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={resetGame}
                    className="px-5 py-2.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    再来一局
                  </button>
                  <button
                    onClick={() => setWinner(null)}
                    className="px-4 py-2.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#291D16] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    查看棋盘
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Desk Control Panel */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5">
          <div className="border-b border-[#D8CBB8] pb-3 mb-4">
            <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">楚河汉界 · 象棋案几</h2>
            <p className="text-xs text-[#6E5A4F]">含蹩马腿、塞象眼、老将照面与应将完整规则</p>
          </div>

          {/* Mode Selector */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#5D4037] mb-2">对战模式</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
              <button
                onClick={() => {
                  onModeChange('PVE');
                  resetGame();
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playMode === 'PVE'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                人机博弈 (PvE)
              </button>
              <button
                onClick={() => {
                  onModeChange('PVP');
                  resetGame();
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playMode === 'PVP'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                双人同屏 (PvP)
              </button>
            </div>
          </div>

          {playMode === 'PVE' && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-[#5D4037] mb-2">AI 棋力境界</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
                {(
                  [
                    { id: 'EASY', label: '初窥门径' },
                    { id: 'MEDIUM', label: '登堂入室' },
                    { id: 'HARD', label: '国手宗师' },
                  ] as { id: AIDifficulty; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onDifficultyChange(item.id)}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      difficulty === item.id
                        ? 'bg-[#B91C1C] text-white shadow-sm'
                        : 'text-[#4E342E] hover:text-[#291D16]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Captured Pieces Tray */}
          <div className="mb-4 p-3 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] space-y-2">
            <div className="text-xs font-semibold text-[#5D4037]">双方战果（已俘获棋子）</div>
            <div className="flex flex-wrap items-center gap-1 min-h-[24px]">
              <span className="text-xs text-[#B91C1C] font-medium mr-1">红方斩获:</span>
              {capturedBlack.length === 0 ? (
                <span className="text-xs text-[#8D6E63]">暂无</span>
              ) : (
                capturedBlack.map((p, idx) => (
                  <span
                    key={idx}
                    className="w-6 h-6 rounded-full bg-[#EFE9D8] border border-[#1E293B]/40 text-[#1E293B] font-serif-oriental text-xs font-bold flex items-center justify-center"
                  >
                    {PIECE_LABELS.BLACK[p.type]}
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 min-h-[24px]">
              <span className="text-xs text-[#1E293B] font-medium mr-1">黑方斩获:</span>
              {capturedRed.length === 0 ? (
                <span className="text-xs text-[#8D6E63]">暂无</span>
              ) : (
                capturedRed.map((p, idx) => (
                  <span
                    key={idx}
                    className="w-6 h-6 rounded-full bg-[#EFE9D8] border border-[#B91C1C]/40 text-[#B91C1C] font-serif-oriental text-xs font-bold flex items-center justify-center"
                  >
                    {PIECE_LABELS.RED[p.type]}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={resetGame}
              className="py-2.5 px-4 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              新局开始
            </button>
            <button
              onClick={handleResign}
              disabled={winner !== null || history.length === 0}
              className="py-2.5 px-4 rounded-lg border border-[#B91C1C]/50 text-[#B91C1C] hover:bg-[#B91C1C]/10 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-3.5 h-3.5" />
              投子认负
            </button>
          </div>
        </div>

        {/* Move Log */}
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 flex flex-col h-[270px]">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-2.5 mb-3">
            <h3 className="text-sm font-bold font-serif-oriental text-[#291D16]">象棋着法记录</h3>
            <span className="text-xs text-[#6E5A4F] font-mono-tabular">共 {moveLogs.length} 步</span>
          </div>
          {moveLogs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#8D6E63]">
              红先黑后，点击红方棋子开启对局
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {moveLogs.map((log) => (
                <div
                  key={log.step}
                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-[#F7F3E8]/80 text-[#3E2723]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular font-semibold text-[#8D6E63] w-7">
                      #{log.step}
                    </span>
                    <span className="font-medium">{log.actor}</span>
                    <span className="text-[#6E5A4F]">·</span>
                    <span className="font-semibold text-[#291D16]">{log.description}</span>
                  </div>
                  <span className="text-[11px] font-mono-tabular text-[#8D6E63]">{log.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
