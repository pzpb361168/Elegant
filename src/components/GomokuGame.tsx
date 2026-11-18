import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIDifficulty, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { RotateCcw, RefreshCw, Flag, Award, Sparkles, Eye } from 'lucide-react';

export type StoneColor = 1 | 2; // 1 = Black (First), 2 = White (Second)
export type BoardGrid = (0 | StoneColor)[][];

interface Coord {
  r: number;
  c: number;
}

interface GomokuHistoryItem {
  grid: BoardGrid;
  lastMove: Coord | null;
  turn: StoneColor;
}

interface GomokuGameProps {
  playMode: PlayMode;
  difficulty: AIDifficulty;
  onModeChange: (mode: PlayMode) => void;
  onDifficultyChange: (diff: AIDifficulty) => void;
  onRecordResult: (outcome: 'WIN' | 'LOSS' | 'DRAW') => void;
}

const BOARD_SIZE = 15;
const STAR_POINTS: Coord[] = [
  { r: 3, c: 3 },
  { r: 3, c: 11 },
  { r: 7, c: 7 },
  { r: 11, c: 3 },
  { r: 11, c: 11 },
];

function createEmptyGrid(): BoardGrid {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function cloneGrid(grid: BoardGrid): BoardGrid {
  return grid.map((row) => [...row]);
}

// Check if placing stone at (r, c) creates 5 or more in a row
function checkWinLine(grid: BoardGrid, r: number, c: number, color: StoneColor): Coord[] | null {
  const directions: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const line: Coord[] = [{ r, c }];

    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === color) {
      line.push({ r: nr, c: nc });
      nr += dr;
      nc += dc;
    }

    nr = r - dr;
    nc = c - dc;
    while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === color) {
      line.unshift({ r: nr, c: nc });
      nr -= dr;
      nc -= dc;
    }

    if (line.length >= 5) {
      return line;
    }
  }
  return null;
}

// Evaluate a single line pattern for one color at (r, c)
function evaluateLineScore(grid: BoardGrid, r: number, c: number, dr: number, dc: number, color: StoneColor): number {
  let count = 1;
  let openEnds = 0;

  // Forward direction
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === color) {
    count++;
    nr += dr;
    nc += dc;
  }
  if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === 0) {
    openEnds++;
  }

  // Backward direction
  nr = r - dr;
  nc = c - dc;
  while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === color) {
    count++;
    nr -= dr;
    nc -= dc;
  }
  if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === 0) {
    openEnds++;
  }

  if (count >= 5) return 100000;
  if (count === 4) {
    if (openEnds === 2) return 15000; // Live 4
    if (openEnds === 1) return 3500;  // Rush 4
  }
  if (count === 3) {
    if (openEnds === 2) return 2200;  // Live 3
    if (openEnds === 1) return 300;   // Sleep 3
  }
  if (count === 2) {
    if (openEnds === 2) return 260;   // Live 2
    if (openEnds === 1) return 40;
  }
  return count * 10;
}

function evaluatePointTotal(grid: BoardGrid, r: number, c: number, color: StoneColor): number {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let total = 0;
  for (const [dr, dc] of dirs) {
    total += evaluateLineScore(grid, r, c, dr, dc, color);
  }
  // Center positional bonus
  const centerDist = Math.abs(r - 7) + Math.abs(c - 7);
  total += Math.max(0, 14 - centerDist);
  return total;
}

function computeAIMove(grid: BoardGrid, aiColor: StoneColor, difficulty: AIDifficulty): Coord {
  const humanColor: StoneColor = aiColor === 1 ? 2 : 1;

  // Check if board is empty
  let hasStones = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c] !== 0) {
        hasStones = true;
        break;
      }
    }
  }
  if (!hasStones) return { r: 7, c: 7 };

  const candidates: { r: number; c: number; score: number }[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c] !== 0) continue;

      // Only consider cells within 2 steps of existing stones for efficiency & natural play
      let nearExisting = false;
      for (let nr = Math.max(0, r - 2); nr <= Math.min(BOARD_SIZE - 1, r + 2); nr++) {
        for (let nc = Math.max(0, c - 2); nc <= Math.min(BOARD_SIZE - 1, c + 2); nc++) {
          if (grid[nr][nc] !== 0) {
            nearExisting = true;
            break;
          }
        }
        if (nearExisting) break;
      }
      if (!nearExisting) continue;

      const attackScore = evaluatePointTotal(grid, r, c, aiColor);
      const defenseScore = evaluatePointTotal(grid, r, c, humanColor);

      let combined = 0;
      if (attackScore >= 100000) {
        combined = 999999; // Winning move immediately
      } else if (defenseScore >= 100000) {
        combined = 500000; // Must block opponent's 5
      } else if (difficulty === 'EASY') {
        combined = attackScore * 0.9 + defenseScore * 0.75 + Math.random() * 180;
      } else if (difficulty === 'MEDIUM') {
        combined = attackScore * 1.05 + defenseScore * 1.0 + Math.random() * 25;
      } else {
        // HARD: extra weight on blocking live-3/rush-4 and creating dual threats
        combined = attackScore * 1.15 + (defenseScore >= 2000 ? defenseScore * 1.25 : defenseScore * 1.05);
      }

      // If HARD, do 1-ply lookahead for top candidates later
      candidates.push({ r, c, score: combined });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === 'HARD' && candidates.length > 1 && candidates[0].score < 400000) {
    // Mini 1-step lookahead on top 6 candidates
    const topN = candidates.slice(0, 6);
    let bestCoord = topN[0];
    let bestValue = -Infinity;

    for (const cand of topN) {
      grid[cand.r][cand.c] = aiColor;
      // Find opponent's best counter response
      let maxOppScore = 0;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (grid[r][c] === 0) {
            const oppAttack = evaluatePointTotal(grid, r, c, humanColor);
            if (oppAttack > maxOppScore) maxOppScore = oppAttack;
          }
        }
      }
      grid[cand.r][cand.c] = 0;

      const netScore = cand.score - maxOppScore * 0.45;
      if (netScore > bestValue) {
        bestValue = netScore;
        bestCoord = cand;
      }
    }
    return { r: bestCoord.r, c: bestCoord.c };
  }

  return candidates[0] || { r: 7, c: 7 };
}

export const GomokuGame: React.FC<GomokuGameProps> = ({
  playMode,
  difficulty,
  onModeChange,
  onDifficultyChange,
  onRecordResult,
}) => {
  const [grid, setGrid] = useState<BoardGrid>(createEmptyGrid);
  const [turn, setTurn] = useState<StoneColor>(1); // Black moves first
  const [lastMove, setLastMove] = useState<Coord | null>(null);
  const [hoverCoord, setHoverCoord] = useState<Coord | null>(null);
  const [winningLine, setWinningLine] = useState<Coord[] | null>(null);
  const [winner, setWinner] = useState<StoneColor | 'DRAW' | null>(null);
  const [history, setHistory] = useState<GomokuHistoryItem[]>([]);
  const [moveLogs, setMoveLogs] = useState<MoveLogEntry[]>([]);
  const [hintCoord, setHintCoord] = useState<Coord | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [stoneEffect, setStoneEffect] = useState<{ r: number; c: number; key: number } | null>(null);

  const aiTimeoutRef = useRef<number | null>(null);

  // Timer
  useEffect(() => {
    if (winner !== null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [winner]);

  const resetGame = useCallback(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setGrid(createEmptyGrid());
    setTurn(1);
    setLastMove(null);
    setWinningLine(null);
    setWinner(null);
    setHistory([]);
    setMoveLogs([]);
    setHintCoord(null);
    setStoneEffect(null);
    setElapsedSeconds(0);
    soundFX.playSelect();
  }, []);

  const placeStone = useCallback(
    (r: number, c: number) => {
      if (winner !== null || grid[r][c] !== 0) return;

      const nextGrid = cloneGrid(grid);
      nextGrid[r][c] = turn;

      // Save state for undo
      setHistory((prev) => [...prev, { grid: cloneGrid(grid), lastMove, turn }]);
      setGrid(nextGrid);
      setLastMove({ r, c });
      setStoneEffect({ r, c, key: Date.now() + Math.random() });
      setHintCoord(null);

      const colLabel = String.fromCharCode(65 + c);
      const rowLabel = 15 - r;
      const actorName = turn === 1 ? '黑方 (先手)' : playMode === 'PVE' ? '白方 (雅弈AI)' : '白方 (后手)';

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorName,
          description: `落子于 ${colLabel}${rowLabel}`,
          timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);

      // Check victory
      const winCoords = checkWinLine(nextGrid, r, c, turn);
      if (winCoords) {
        setWinningLine(winCoords);
        setWinner(turn);
        soundFX.playGomokuWin();
        if (playMode === 'PVE') {
          onRecordResult(turn === 1 ? 'WIN' : 'LOSS');
        } else {
          onRecordResult('WIN');
        }
        return;
      }

      // Check full board draw
      const isFull = nextGrid.every((row) => row.every((cell) => cell !== 0));
      if (isFull) {
        setWinner('DRAW');
        onRecordResult('DRAW');
        return;
      }

      soundFX.playGomokuPlace();
      setTurn(turn === 1 ? 2 : 1);
    },
    [grid, lastMove, onRecordResult, playMode, turn, winner]
  );

  // Trigger AI turn in PVE mode when turn === 2 (White)
  useEffect(() => {
    if (playMode === 'PVE' && turn === 2 && winner === null) {
      aiTimeoutRef.current = window.setTimeout(() => {
        const aiCoord = computeAIMove(cloneGrid(grid), 2, difficulty);
        placeStone(aiCoord.r, aiCoord.c);
      }, 420);
    }
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [playMode, turn, winner, grid, difficulty, placeStone]);

  // Undo handler (in PVE, undo 2 steps back to player's turn; in PVP, undo 1 step)
  const handleUndo = () => {
    if (history.length === 0 || winner !== null) return;
    if (playMode === 'PVE' && turn === 2) return; // Don't undo while AI is thinking

    const stepsToPop = playMode === 'PVE' && history.length >= 2 ? 2 : 1;
    const targetIndex = history.length - stepsToPop;
    const restored = history[targetIndex];

    setGrid(restored.grid);
    setLastMove(restored.lastMove);
    setTurn(restored.turn);
    setHistory((prev) => prev.slice(0, targetIndex));
    setMoveLogs((prev) => prev.slice(stepsToPop));
    setHintCoord(null);
    setStoneEffect(null);
    soundFX.playSelect();
  };

  // AI Hint for human player
  const handleHint = () => {
    if (winner !== null) return;
    if (playMode === 'PVE' && turn === 2) return;
    const suggested = computeAIMove(cloneGrid(grid), turn, 'HARD');
    setHintCoord(suggested);
    soundFX.playSelect();
  };

  // Resign handler
  const handleResign = () => {
    if (winner !== null || history.length === 0) return;
    const victor: StoneColor = turn === 1 ? 2 : 1;
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

  const isWinningCell = (r: number, c: number) =>
    winningLine?.some((coord) => coord.r === r && coord.c === c) ?? false;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left / Main Board Area */}
      <div className="lg:col-span-8 flex flex-col items-center">
        {/* Top Status Banner */}
        <div className="w-full max-w-[620px] mb-4 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 rounded-xl bg-[#EFE9D8] border border-[#D8CBB8]">
          <div className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-full shadow-md flex items-center justify-center ${
                turn === 1
                  ? 'bg-gradient-to-br from-neutral-700 to-neutral-950 ring-2 ring-[#B91C1C]'
                  : 'bg-gradient-to-br from-white to-stone-200 border border-stone-400 ring-2 ring-[#0F766E]'
              }`}
            />
            <div>
              <div className="text-sm font-semibold text-[#291D16]">
                {winner === null
                  ? turn === 1
                    ? '当前执子：黑方（先手）'
                    : playMode === 'PVE'
                    ? '雅弈 AI 正在推演落子...'
                    : '当前执子：白方（后手）'
                  : winner === 'DRAW'
                  ? '对局结束：满盘和局'
                  : winner === 1
                  ? '对局结束：黑方五子连珠胜出！'
                  : '对局结束：白方五子连珠胜出！'}
              </div>
              <div className="text-xs text-[#6E5A4F]">
                总第 <span className="font-mono-tabular font-semibold">{history.length}</span> 手 · 对局用时{' '}
                <span className="font-mono-tabular font-semibold">{formatTime(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHint}
              disabled={winner !== null || (playMode === 'PVE' && turn === 2)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              支招提示
            </button>
            <button
              onClick={handleUndo}
              disabled={history.length === 0 || winner !== null || (playMode === 'PVE' && turn === 2)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              悔棋
            </button>
          </div>
        </div>

        {/* Wooden 15x15 Gomoku Board */}
        <div className="relative w-full max-w-[620px] aspect-square p-5 sm:p-8 rounded-2xl wood-board-surface border-2 border-[#7C5332] select-none">
          {/* Coordinate Labels along Top & Left */}
          <div className="relative w-full h-full">
            {/* SVG Grid Lines & Star Points */}
            <svg
              viewBox="0 0 1400 1400"
              className="w-full h-full overflow-visible"
              aria-label="五子棋盘"
            >
              {/* Outer decorative double frame */}
              <rect
                x="-28"
                y="-28"
                width="1456"
                height="1456"
                fill="none"
                stroke="#3E2723"
                strokeWidth="6"
                opacity="0.75"
              />

              {/* 15 Horizontal & Vertical Lines */}
              {Array.from({ length: BOARD_SIZE }).map((_, idx) => {
                const pos = idx * 100;
                return (
                  <g key={idx}>
                    <line
                      x1={0}
                      y1={pos}
                      x2={1400}
                      y2={pos}
                      stroke="#3E2723"
                      strokeWidth={idx === 0 || idx === 14 ? 4 : 2.5}
                      strokeOpacity="0.82"
                    />
                    <line
                      x1={pos}
                      y1={0}
                      x2={pos}
                      y2={1400}
                      stroke="#3E2723"
                      strokeWidth={idx === 0 || idx === 14 ? 4 : 2.5}
                      strokeOpacity="0.82"
                    />
                    {/* Coordinate text */}
                    <text
                      x={pos}
                      y={-42}
                      textAnchor="middle"
                      className="fill-[#4E342E] text-[26px] font-mono-tabular font-semibold"
                    >
                      {String.fromCharCode(65 + idx)}
                    </text>
                    <text
                      x={-52}
                      y={pos + 9}
                      textAnchor="end"
                      className="fill-[#4E342E] text-[26px] font-mono-tabular font-semibold"
                    >
                      {15 - idx}
                    </text>
                  </g>
                );
              })}

              {/* 5 Traditional Star Points (天元与四星) */}
              {STAR_POINTS.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.c * 100}
                  cy={pt.r * 100}
                  r={11}
                  fill="#3E2723"
                />
              ))}

              {/* Winning connection line */}
              {winningLine && winningLine.length >= 2 && (
                <line
                  x1={winningLine[0].c * 100}
                  y1={winningLine[0].r * 100}
                  x2={winningLine[winningLine.length - 1].c * 100}
                  y2={winningLine[winningLine.length - 1].r * 100}
                  stroke="#B91C1C"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
              )}
            </svg>

            {/* Interactive 15x15 Intersection Hitboxes & Stones */}
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                margin: '-3.33%',
              }}
            >
              {grid.map((row, r) =>
                row.map((cell, c) => {
                  const isLast = lastMove?.r === r && lastMove?.c === c;
                  const isWinStone = isWinningCell(r, c);
                  const isHint = hintCoord?.r === r && hintCoord?.c === c;
                  const isHovered =
                    hoverCoord?.r === r &&
                    hoverCoord?.c === c &&
                    cell === 0 &&
                    winner === null &&
                    !(playMode === 'PVE' && turn === 2);

                  const isFxTarget = stoneEffect?.r === r && stoneEffect?.c === c;

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => {
                        if (playMode === 'PVE' && turn === 2) return;
                        placeStone(r, c);
                      }}
                      onMouseEnter={() => setHoverCoord({ r, c })}
                      onMouseLeave={() => setHoverCoord(null)}
                      aria-label={`落子位置 ${String.fromCharCode(65 + c)}${15 - r}`}
                      className="relative flex items-center justify-center w-full h-full focus:outline-none cursor-pointer group"
                    >
                      {/* Concentric ink/jade ripple on new placement */}
                      {cell !== 0 && isFxTarget && stoneEffect && (
                        <span
                          key={`g-rip-${stoneEffect.key}`}
                          className={`absolute inset-0 rounded-full border-2 pointer-events-none animate-gomoku-ripple ${
                            cell === 1 ? 'border-[#3E2723]/75' : 'border-[#0F766E]/75'
                          }`}
                        />
                      )}

                      {/* Placed Black or White Stone */}
                      {cell !== 0 && (
                        <div
                          key={isFxTarget && stoneEffect ? `g-st-${stoneEffect.key}` : 'g-st'}
                          className={`w-[84%] h-[84%] rounded-full transition-transform duration-150 flex items-center justify-center ${
                            cell === 1
                              ? 'bg-radial-[at_32%_30%] from-neutral-600 via-neutral-900 to-black shadow-[0_3px_6px_rgba(0,0,0,0.55)]'
                              : 'bg-radial-[at_32%_30%] from-white via-stone-100 to-stone-300 border border-stone-400/70 shadow-[0_3px_6px_rgba(45,27,18,0.4)]'
                          } ${isFxTarget ? 'animate-gomoku-drop' : ''} ${
                            isWinStone ? 'ring-3 ring-[#B91C1C] scale-105 animate-gomoku-win-glow' : ''
                          }`}
                        >
                          {/* Last move marker */}
                          {isLast && (
                            <span
                              className={`w-2.5 h-2.5 rounded-sm ${
                                cell === 1 ? 'bg-[#EF4444]' : 'bg-[#B91C1C]'
                              }`}
                            />
                          )}
                        </div>
                      )}

                      {/* AI Hint Indicator */}
                      {cell === 0 && isHint && (
                        <div className="w-[70%] h-[70%] rounded-full border-2 border-dashed border-[#0F766E] bg-[#0F766E]/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-[#0F766E]">荐</span>
                        </div>
                      )}

                      {/* Hover Ghost Preview */}
                      {isHovered && (
                        <div
                          className={`w-[76%] h-[76%] rounded-full opacity-45 pointer-events-none ${
                            turn === 1 ? 'bg-black' : 'bg-white border border-stone-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Victory Overlay Modal */}
          {winner !== null && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] rounded-2xl flex items-center justify-center p-6 z-20">
              <div className="bg-[#F7F3E8] border-2 border-[#7C5332] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center">
                  <Award className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold font-serif-oriental text-[#291D16] mb-1">
                  {winner === 'DRAW'
                    ? '旗鼓相当 · 满盘和局'
                    : winner === 1
                    ? '黑方五子连珠获胜'
                    : '白方五子连珠获胜'}
                </h3>
                <p className="text-xs text-[#6E5A4F] mb-5">
                  共历时 {formatTime(elapsedSeconds)} · 交锋 {history.length} 手
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
        {/* Game Settings Card */}
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">五子连珠 · 案几设置</h2>
              <p className="text-xs text-[#6E5A4F]">15路标准棋盘 · 黑先白后 · 五子连线即胜</p>
            </div>
            <Sparkles className="w-5 h-5 text-[#8D6E63]" />
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

          {/* AI Difficulty Selector */}
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

          {/* Primary Action Controls */}
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

        {/* Move History Log */}
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 flex flex-col h-[310px]">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-2.5 mb-3">
            <h3 className="text-sm font-bold font-serif-oriental text-[#291D16]">实时棋谱记录</h3>
            <span className="text-xs text-[#6E5A4F] font-mono-tabular">共 {moveLogs.length} 手</span>
          </div>
          {moveLogs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#8D6E63]">
              棋局尚未开始，点击棋盘交叉点落下一子
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
                    <span className="font-semibold text-[#B91C1C]">{log.description}</span>
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
