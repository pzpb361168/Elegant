import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import { AIDifficulty, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { GomokuBoardCanvas } from './BoardCanvases';

export type StoneColor = 1 | 2;
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

function nowClock(): string {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function createEmptyGrid(): BoardGrid {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function cloneGrid(grid: BoardGrid): BoardGrid {
  return grid.map((row) => [...row]);
}

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

function evaluateLineScore(
  grid: BoardGrid,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: StoneColor
): number {
  let count = 1;
  let openEnds = 0;

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
    if (openEnds === 2) return 15000;
    if (openEnds === 1) return 3500;
  }
  if (count === 3) {
    if (openEnds === 2) return 2200;
    if (openEnds === 1) return 300;
  }
  if (count === 2) {
    if (openEnds === 2) return 260;
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
  const centerDist = Math.abs(r - 7) + Math.abs(c - 7);
  total += Math.max(0, 14 - centerDist);
  return total;
}

function computeAIMove(grid: BoardGrid, aiColor: StoneColor, difficulty: AIDifficulty): Coord {
  const humanColor: StoneColor = aiColor === 1 ? 2 : 1;

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
        combined = 999999;
      } else if (defenseScore >= 100000) {
        combined = 500000;
      } else if (difficulty === 'EASY') {
        combined = attackScore * 0.9 + defenseScore * 0.75 + Math.random() * 180;
      } else if (difficulty === 'MEDIUM') {
        combined = attackScore * 1.05 + defenseScore * 1.0 + Math.random() * 25;
      } else {
        combined =
          attackScore * 1.15 + (defenseScore >= 2000 ? defenseScore * 1.25 : defenseScore * 1.05);
      }

      candidates.push({ r, c, score: combined });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === 'HARD' && candidates.length > 1 && candidates[0].score < 400000) {
    const topN = candidates.slice(0, 6);
    let bestCoord = topN[0];
    let bestValue = -Infinity;

    for (const cand of topN) {
      grid[cand.r][cand.c] = aiColor;
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
  const [turn, setTurn] = useState<StoneColor>(1);
  const [lastMove, setLastMove] = useState<Coord | null>(null);
  const [winningLine, setWinningLine] = useState<Coord[] | null>(null);
  const [winner, setWinner] = useState<StoneColor | 'DRAW' | null>(null);
  const [history, setHistory] = useState<GomokuHistoryItem[]>([]);
  const [moveLogs, setMoveLogs] = useState<MoveLogEntry[]>([]);
  const [hintCoord, setHintCoord] = useState<Coord | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [stoneEffect, setStoneEffect] = useState<{ r: number; c: number; key: number } | null>(
    null
  );

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (winner !== null) return;
    const timer = setInterval(() => {
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

      setHistory((prev) => [...prev, { grid: cloneGrid(grid), lastMove, turn }]);
      setGrid(nextGrid);
      setLastMove({ r, c });
      setStoneEffect({ r, c, key: Date.now() + Math.random() });
      setHintCoord(null);

      const colLabel = String.fromCharCode(65 + c);
      const rowLabel = 15 - r;
      const actorName =
        turn === 1 ? '黑方 (先手)' : playMode === 'PVE' ? '白方 (雅弈AI)' : '白方 (后手)';

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorName,
          description: `落子于 ${colLabel}${rowLabel}`,
          timestamp: nowClock(),
        },
        ...prev,
      ]);

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

  useEffect(() => {
    if (playMode === 'PVE' && turn === 2 && winner === null) {
      aiTimeoutRef.current = setTimeout(() => {
        const aiCoord = computeAIMove(cloneGrid(grid), 2, difficulty);
        placeStone(aiCoord.r, aiCoord.c);
      }, 420);
    }
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [playMode, turn, winner, grid, difficulty, placeStone]);

  const handleUndo = () => {
    if (history.length === 0 || winner !== null) return;
    if (playMode === 'PVE' && turn === 2) return;

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

  const handleHint = () => {
    if (winner !== null) return;
    if (playMode === 'PVE' && turn === 2) return;
    const suggested = computeAIMove(cloneGrid(grid), turn, 'HARD');
    setHintCoord(suggested);
    soundFX.playSelect();
  };

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

  const isDisabledPlay = winner !== null || (playMode === 'PVE' && turn === 2);

  return (
    <View className='page-container'>
      {/* Status Banner */}
      <View className='status-bar'>
        <View className='status-bar-top'>
          <View className='status-title-row'>
            <View
              className={`gomoku-stone ${
                turn === 1 ? 'gomoku-stone--black' : 'gomoku-stone--white'
              }`}
              style={{ width: '42rpx', height: '42rpx', flexShrink: 0 }}
            />
            <View style={{ minWidth: 0 }}>
              <Text className='status-main-text' style={{ display: 'block' }}>
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
              </Text>
              <Text className='status-sub-text font-mono-tabular' style={{ display: 'block' }}>
                总第 {history.length} 手 · 对局用时 {formatTime(elapsedSeconds)}
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

      {/* Wooden 15x15 Gomoku Board */}
      <View className='board-wrap-center'>
        <View className='gomoku-board-box wood-surface'>
          <GomokuBoardCanvas canvasId='gomoku-local-canvas' winningLine={winningLine} />

          <View className='board-overlay-gomoku'>
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isLast = lastMove?.r === r && lastMove?.c === c;
                const isWinStone = isWinningCell(r, c);
                const isHint = hintCoord?.r === r && hintCoord?.c === c;
                const isFxTarget = stoneEffect?.r === r && stoneEffect?.c === c;

                return (
                  <View
                    key={`${r}-${c}`}
                    onClick={() => {
                      if (playMode === 'PVE' && turn === 2) return;
                      placeStone(r, c);
                    }}
                    className='gomoku-cell'
                  >
                    {cell !== 0 && isFxTarget && stoneEffect && (
                      <View
                        key={`g-rip-${stoneEffect.key}`}
                        className='fx-ring-overlay animate-gomoku-ripple'
                        style={{
                          border: cell === 1 ? '4rpx solid rgba(62,39,35,0.75)' : '4rpx solid rgba(15,118,110,0.75)',
                        }}
                      />
                    )}

                    {cell !== 0 && (
                      <View
                        key={isFxTarget && stoneEffect ? `g-st-${stoneEffect.key}` : 'g-st'}
                        className={`gomoku-stone ${
                          cell === 1 ? 'gomoku-stone--black' : 'gomoku-stone--white'
                        } ${isFxTarget ? 'animate-gomoku-drop' : ''} ${
                          isWinStone ? 'gomoku-stone--win' : ''
                        }`}
                      >
                        {isLast && <View className='gomoku-last-dot' />}
                      </View>
                    )}

                    {cell === 0 && isHint && (
                      <View className='gomoku-hint-ring'>
                        <Text>荐</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* Victory Modal */}
          {winner !== null && (
            <View className='board-modal-mask'>
              <View className='board-modal-card'>
                <Text
                  className='font-serif-oriental'
                  style={{ display: 'block', fontSize: '36rpx', fontWeight: 700, color: '#291D16', marginBottom: '10rpx' }}
                >
                  {winner === 'DRAW'
                    ? '旗鼓相当 · 满盘和局'
                    : winner === 1
                    ? '黑方五子连珠获胜'
                    : '白方五子连珠获胜'}
                </Text>
                <Text style={{ display: 'block', fontSize: '24rpx', color: '#6E5A4F', marginBottom: '26rpx' }}>
                  共历时 {formatTime(elapsedSeconds)} · 交锋 {history.length} 手
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

      {/* Settings Card */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <View>
            <Text className='section-title font-serif-oriental'>五子连珠 · 案几设置</Text>
            <Text className='section-subtitle' style={{ display: 'block' }}>
              15路标准棋盘 · 黑先白后 · 五子连线即胜
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

      {/* Move History Log */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <Text className='section-title font-serif-oriental'>实时棋谱记录</Text>
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            共 {moveLogs.length} 手
          </Text>
        </View>
        {moveLogs.length === 0 ? (
          <View style={{ padding: '36rpx 0', textAlign: 'center' }}>
            <Text style={{ fontSize: '24rpx', color: '#8D6E63' }}>
              棋局尚未开始，点击棋盘交叉点落下一子
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
