import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import { AIDifficulty, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { XiangqiBoardCanvas } from './BoardCanvases';

export type XiangqiSide = 'RED' | 'BLACK';
export type PieceType = 'G' | 'A' | 'E' | 'H' | 'R' | 'C' | 'S';

export interface XiangqiPiece {
  side: XiangqiSide;
  type: PieceType;
}

export type XiangqiBoard = (XiangqiPiece | null)[][];

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
  RED: { G: '帥', A: '仕', E: '相', H: '馬', R: '車', C: '炮', S: '兵' },
  BLACK: { G: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', S: '卒' },
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

function nowClock(): string {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function createInitialXiangqiBoard(): XiangqiBoard {
  const board: XiangqiBoard = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const setupBackRow = (r: number, side: XiangqiSide) => {
    const order: PieceType[] = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];
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
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) addIfValid(nr, nc);
    }
  } else if (type === 'A') {
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inPalace(nr, nc, side)) addIfValid(nr, nc);
    }
  } else if (type === 'E') {
    for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
      const nr = r + dr;
      const nc = c + dc;
      const eyeR = r + dr / 2;
      const eyeC = c + dc / 2;
      if (!inBounds(nr, nc)) continue;
      if (side === 'BLACK' && nr > 4) continue;
      if (side === 'RED' && nr < 5) continue;
      if (board[eyeR][eyeC] === null) addIfValid(nr, nc);
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
    for (const [dr, dc, legR, legC] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[r + legR][c + legC] === null) {
        addIfValid(nr, nc);
      }
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
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
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = r + dr;
      let nc = c + dc;
      let jumped = false;
      while (inBounds(nr, nc)) {
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
    const crossedRiver = side === 'RED' ? r <= 4 : r >= 5;
    if (crossedRiver) {
      addIfValid(r, c - 1);
      addIfValid(r, c + 1);
    }
  }

  return moves;
}

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
        if (oppMoves.some((m) => m.r === genCoord!.r && m.c === genCoord!.c)) return true;
      }
    }
  }
  return false;
}

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
    if (!inCheck) legal.push(target);
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
        for (const to of targets) allMoves.push({ from: { r, c }, to });
      }
    }
  }
  return allMoves;
}

function evaluateXiangqiBoard(board: XiangqiBoard): number {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      let val = PIECE_VALUES[p.type];
      if (p.type === 'S') {
        const crossed = p.side === 'BLACK' ? r >= 5 : r <= 4;
        if (crossed) val += 90;
        if (c >= 2 && c <= 6) val += 20;
      } else if (p.type === 'H' || p.type === 'C' || p.type === 'R') {
        if (c >= 2 && c <= 6 && r >= 2 && r <= 7) val += 25;
      }
      if (p.side === 'BLACK') score += val;
      else score -= val;
    }
  }
  return score;
}

function computeBestXiangqiMove(
  board: XiangqiBoard,
  side: XiangqiSide,
  difficulty: AIDifficulty
): XiangqiMove | null {
  const legalMoves = getAllLegalMoves(board, side);
  if (legalMoves.length === 0) return null;

  if (difficulty === 'EASY') {
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
  const sortMoves = (moves: XiangqiMove[]) =>
    moves.sort((a, b) => {
      const capA = board[a.to.r][a.to.c] ? PIECE_VALUES[board[a.to.r][a.to.c]!.type] : 0;
      const capB = board[b.to.r][b.to.c] ? PIECE_VALUES[board[b.to.r][b.to.c]!.type] : 0;
      return capB - capA;
    });

  const minimax = (depth: number, alpha: number, beta: number, maximizingBlack: boolean): number => {
    if (depth === 0) return evaluateXiangqiBoard(board);
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
    if (isMaximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      chosenMove = m;
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

  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (winner !== null) return;
    const timer = setInterval(() => {
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
        if (captured.side === 'RED') setCapturedRed((prev) => [...prev, captured]);
        else setCapturedBlack((prev) => [...prev, captured]);
      }

      setBoard(nextBoard);
      setSelected(null);
      setLegalTargets([]);
      setLastMove({ from, to });
      setHintMove(null);

      const pieceChar = PIECE_LABELS[movingPiece.side][movingPiece.type];
      const captureNote = captured ? ` 吃掉【${PIECE_LABELS[captured.side][captured.type]}】` : '';

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: movingPiece.side === 'RED' ? '红方' : playMode === 'PVE' ? '黑方 (AI)' : '黑方',
          description: `${pieceChar} (${from.c + 1},${10 - from.r}) → (${to.c + 1},${10 - to.r})${captureNote}`,
          timestamp: nowClock(),
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
        setWinner(turn);
        soundFX.playVictory();
        if (playMode === 'PVE') onRecordResult(turn === 'RED' ? 'WIN' : 'LOSS');
        else onRecordResult('WIN');
        return;
      }

      if (nextInCheck) soundFX.playXiangqiCheck();
      else if (captured) soundFX.playXiangqiCapture();
      else soundFX.playXiangqiMove();

      setTurn(nextSide);
    },
    [board, capturedBlack, capturedRed, lastMove, onRecordResult, playMode, turn]
  );

  useEffect(() => {
    if (playMode === 'PVE' && turn === 'BLACK' && winner === null) {
      aiTimerRef.current = setTimeout(() => {
        const aiMove = computeBestXiangqiMove(cloneXiangqiBoard(board), 'BLACK', difficulty);
        if (aiMove) executeMove(aiMove.from, aiMove.to);
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

    if (selected && legalTargets.some((t) => t.r === r && t.c === c)) {
      executeMove(selected, { r, c });
      return;
    }

    if (clickedPiece && clickedPiece.side === turn) {
      soundFX.playSelect();
      setSelected({ r, c });
      setLegalTargets(getLegalMovesForPiece(cloneXiangqiBoard(board), r, c));
      return;
    }

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
    if (playMode === 'PVE') onRecordResult('LOSS');
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isDisabledPlay = winner !== null || (playMode === 'PVE' && turn === 'BLACK');

  return (
    <View className='page-container'>
      {/* Status Bar */}
      <View className='status-bar'>
        <View className='status-bar-top'>
          <View className='status-title-row'>
            <View
              className={`xiangqi-piece ${turn === 'RED' ? 'xiangqi-piece--red' : 'xiangqi-piece--black'}`}
              style={{ width: '50rpx', height: '50rpx', flexShrink: 0 }}
            >
              <Text className='font-serif-oriental' style={{ fontSize: '26rpx', fontWeight: 700 }}>
                {turn === 'RED' ? '帥' : '將'}
              </Text>
            </View>
            <View style={{ minWidth: 0 }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: '12rpx' }}>
                <Text className='status-main-text'>
                  {winner === null
                    ? turn === 'RED'
                      ? '当前行棋：红方'
                      : playMode === 'PVE'
                      ? '雅弈 AI 正在思索招法...'
                      : '当前行棋：黑方'
                    : winner === 'RED'
                    ? '对局结束：红方绝杀获胜！'
                    : '对局结束：黑方绝杀获胜！'}
                </Text>
                {inCheckSide && winner === null && (
                  <Text style={{ fontSize: '24rpx', fontWeight: 700, color: '#B91C1C' }}>
                    将军！
                  </Text>
                )}
              </View>
              <Text className='status-sub-text font-mono-tabular' style={{ display: 'block' }}>
                回合步数 {history.length} · 用时 {formatTime(elapsedSeconds)}
              </Text>
            </View>
          </View>
        </View>

        <View className='status-toolbar'>
          <Button
            onClick={handleHint}
            disabled={isDisabledPlay}
            className={`btn-soft ${isDisabledPlay ? 'btn-disabled' : ''}`}
          >
            支招提示
          </Button>
          <Button
            onClick={handleUndo}
            disabled={history.length === 0 || isDisabledPlay}
            className={`btn-soft ${history.length === 0 || isDisabledPlay ? 'btn-disabled' : ''}`}
          >
            悔棋
          </Button>
          <Button onClick={resetGame} className='btn-primary-dark'>
            新局
          </Button>
          <Button
            onClick={handleResign}
            disabled={winner !== null || history.length === 0}
            className={`btn-outline-red ${winner !== null || history.length === 0 ? 'btn-disabled' : ''}`}
          >
            认负
          </Button>
        </View>
      </View>

      {/* Traditional 9x10 Chinese Chess Board */}
      <View className='board-wrap-center'>
        <View className='xiangqi-board-box wood-surface'>
          <XiangqiBoardCanvas canvasId='xiangqi-local-canvas' />

          <View className='board-overlay-xiangqi'>
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
                  <View key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className='xiangqi-cell'>
                    {isFrom && !piece && (
                      <View
                        style={{
                          width: '14rpx',
                          height: '14rpx',
                          borderRadius: '9999rpx',
                          backgroundColor: 'rgba(124, 83, 50, 0.5)',
                        }}
                      />
                    )}

                    {isCheckedGeneral && (
                      <View
                        className='fx-ring-overlay'
                        style={{
                          border: '5rpx solid #B91C1C',
                          backgroundColor: 'rgba(185, 28, 28, 0.2)',
                        }}
                      />
                    )}

                    {isFxTarget && moveEffect && (
                      <View
                        key={`xq-ring-${moveEffect.key}`}
                        className={`fx-ring-overlay ${
                          moveEffect.isCapture ? 'animate-xiangqi-capture' : 'animate-xiangqi-ring'
                        }`}
                        style={{
                          border: moveEffect.isCapture
                            ? '5rpx solid #B91C1C'
                            : '3rpx solid rgba(154, 107, 50, 0.85)',
                          backgroundColor: moveEffect.isCapture
                            ? 'rgba(185, 28, 28, 0.16)'
                            : 'transparent',
                        }}
                      />
                    )}

                    {piece && (
                      <View
                        key={isFxTarget && moveEffect ? `xq-pc-${moveEffect.key}` : 'xq-pc'}
                        className={`xiangqi-piece ${
                          piece.side === 'RED' ? 'xiangqi-piece--red' : 'xiangqi-piece--black'
                        } ${isFxTarget ? 'animate-xiangqi-slam' : ''} ${
                          isSel ? 'xiangqi-piece--selected' : isTo ? 'xiangqi-piece--last' : ''
                        }`}
                      >
                        <View className='xiangqi-piece-inner'>
                          <Text className='font-serif-oriental'>
                            {PIECE_LABELS[piece.side][piece.type]}
                          </Text>
                        </View>
                      </View>
                    )}

                    {isFxTarget && moveEffect?.isCapture && (
                      <View
                        key={`xq-tag-${moveEffect.key}`}
                        className='fx-float-badge font-serif-oriental animate-fx-float-tag'
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        <Text>吃</Text>
                      </View>
                    )}

                    {isLegal && !piece && <View className='xiangqi-legal-dot' />}
                    {isLegal && piece && <View className='xiangqi-legal-capture' />}

                    {isHintDest && (
                      <View
                        className='fx-ring-overlay'
                        style={{ border: '4rpx dashed #B91C1C' }}
                      />
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* Check Stamp Flash */}
          {moveEffect?.isCheck && winner === null && (
            <View key={`xq-check-${moveEffect.key}`} className='check-flash-overlay'>
              <View className='check-flash-banner font-serif-oriental animate-xiangqi-check-banner'>
                <Text>將 軍</Text>
              </View>
            </View>
          )}

          {/* Victory Modal */}
          {winner !== null && (
            <View className='board-modal-mask'>
              <View className='board-modal-card'>
                <Text
                  className='font-serif-oriental'
                  style={{ display: 'block', fontSize: '36rpx', fontWeight: 700, color: '#291D16', marginBottom: '10rpx' }}
                >
                  {winner === 'RED' ? '红方运筹帷幄获胜' : '黑方运筹帷幄获胜'}
                </Text>
                <Text style={{ display: 'block', fontSize: '24rpx', color: '#6E5A4F', marginBottom: '26rpx' }}>
                  绝杀定局 · 共历时 {formatTime(elapsedSeconds)} · 交锋 {history.length} 回合
                </Text>
                <View style={{ display: 'flex', justifyContent: 'center', gap: '18rpx' }}>
                  <Button onClick={resetGame} className='btn-primary-red'>
                    再来一局
                  </Button>
                  <Button onClick={() => setWinner(null)} className='btn-soft'>
                    查看棋盘
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Captured Pieces Tray */}
      <View className='sub-panel'>
        <Text style={{ fontSize: '24rpx', fontWeight: 700, color: '#5D4037', display: 'block', marginBottom: '12rpx' }}>
          双方战果（已俘获棋子）
        </Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10rpx', marginBottom: '10rpx' }}>
          <Text style={{ fontSize: '22rpx', color: '#B91C1C', fontWeight: 600 }}>红方斩获:</Text>
          {capturedBlack.length === 0 ? (
            <Text style={{ fontSize: '22rpx', color: '#8D6E63' }}>暂无</Text>
          ) : (
            capturedBlack.map((p, idx) => (
              <Text
                key={idx}
                className='font-serif-oriental'
                style={{
                  padding: '4rpx 12rpx',
                  borderRadius: '9999rpx',
                  backgroundColor: '#EFE9D8',
                  border: '2rpx solid rgba(30,41,59,0.4)',
                  color: '#1E293B',
                  fontSize: '22rpx',
                  fontWeight: 700,
                }}
              >
                {PIECE_LABELS.BLACK[p.type]}
              </Text>
            ))
          )}
        </View>
        <View style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10rpx' }}>
          <Text style={{ fontSize: '22rpx', color: '#1E293B', fontWeight: 600 }}>黑方斩获:</Text>
          {capturedRed.length === 0 ? (
            <Text style={{ fontSize: '22rpx', color: '#8D6E63' }}>暂无</Text>
          ) : (
            capturedRed.map((p, idx) => (
              <Text
                key={idx}
                className='font-serif-oriental'
                style={{
                  padding: '4rpx 12rpx',
                  borderRadius: '9999rpx',
                  backgroundColor: '#EFE9D8',
                  border: '2rpx solid rgba(185,28,28,0.4)',
                  color: '#B91C1C',
                  fontSize: '22rpx',
                  fontWeight: 700,
                }}
              >
                {PIECE_LABELS.RED[p.type]}
              </Text>
            ))
          )}
        </View>
      </View>

      {/* Settings Card */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <View>
            <Text className='section-title font-serif-oriental'>楚河汉界 · 象棋案几</Text>
            <Text className='section-subtitle' style={{ display: 'block' }}>
              含蹩马腿、塞象眼、老将照面与应将完整规则
            </Text>
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
                resetGame();
              }}
              className={`segment-btn ${playMode === 'PVE' ? 'segment-btn--dark' : ''}`}
            >
              人机博弈 (PvE)
            </Button>
            <Button
              onClick={() => {
                onModeChange('PVP');
                resetGame();
              }}
              className={`segment-btn ${playMode === 'PVP' ? 'segment-btn--dark' : ''}`}
            >
              双人同屏 (PvP)
            </Button>
          </View>
        </View>

        {playMode === 'PVE' && (
          <View>
            <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '10rpx' }}>
              AI 棋力境界
            </Text>
            <View className='segment-group'>
              {(
                [
                  { id: 'EASY', label: '初窥门径' },
                  { id: 'MEDIUM', label: '登堂入室' },
                  { id: 'HARD', label: '国手宗师' },
                ] as { id: AIDifficulty; label: string }[]
              ).map((item) => (
                <Button
                  key={item.id}
                  onClick={() => onDifficultyChange(item.id)}
                  className={`segment-btn ${difficulty === item.id ? 'segment-btn--red' : ''}`}
                >
                  {item.label}
                </Button>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Move Log */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <Text className='section-title font-serif-oriental'>象棋着法记录</Text>
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            共 {moveLogs.length} 步
          </Text>
        </View>
        {moveLogs.length === 0 ? (
          <View style={{ padding: '36rpx 0', textAlign: 'center' }}>
            <Text style={{ fontSize: '24rpx', color: '#8D6E63' }}>
              红先黑后，点击红方棋子开启对局
            </Text>
          </View>
        ) : (
          <ScrollView scrollY className='scroll-log-box'>
            {moveLogs.map((log) => (
              <View key={log.step} className='log-item-row'>
                <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx' }}>
                  <Text className='font-mono-tabular' style={{ fontWeight: 700, color: '#8D6E63' }}>
                    #{log.step}
                  </Text>
                  <Text style={{ fontWeight: 600 }}>{log.actor}</Text>
                  <Text style={{ color: '#6E5A4F' }}>·</Text>
                  <Text style={{ fontWeight: 700, color: '#B91C1C' }}>{log.description}</Text>
                </View>
                <Text className='font-mono-tabular' style={{ fontSize: '20rpx', color: '#8D6E63' }}>
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
