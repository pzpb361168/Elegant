import React, { useState, useEffect, useRef } from 'react';
import type {
  Coord,
  JunqiSide,
  SanitizedRoomState,
  XiangqiSide,
} from '../shared/onlineTypes';
import {
  getJunqiLegalMovesGeneric,
  getXiangqiLegalMoves,
  GOMOKU_SIZE,
  isJunqiCamp,
  isJunqiHQ,
  JUNQI_COLS,
  JUNQI_RANK_NAMES,
  JUNQI_ROWS,
  XIANGQI_COLS,
  XIANGQI_PIECE_LABELS,
  XIANGQI_ROWS,
} from '../shared/gameRules';
import { soundFX } from '../utils/sound';
import { JunqiCapturedTray } from './JunqiCapturedTray';
import { Shield, Shuffle, CheckCircle2 } from 'lucide-react';

interface OnlineBoardRendererProps {
  room: SanitizedRoomState;
  onGomokuMove: (r: number, c: number) => void;
  onXiangqiMove: (from: Coord, to: Coord) => void;
  onJunqiFlip: (r: number, c: number) => void;
  onJunqiMove: (from: Coord, to: Coord) => void;
  onJunqiSwapSetup: (c1: Coord, c2: Coord) => void;
  onJunqiPresetSetup: (preset: 'BALANCED' | 'FORTRESS') => void;
  onJunqiConfirmSetup: () => void;
}

const GOMOKU_STARS: Coord[] = [
  { r: 3, c: 3 },
  { r: 3, c: 11 },
  { r: 7, c: 7 },
  { r: 11, c: 3 },
  { r: 11, c: 11 },
];

const JUNQI_COL_X = [142, 241, 340, 439, 538];
const JUNQI_ROW_Y = [112, 174, 236, 298, 360, 422, 546, 608, 670, 732, 794, 856];

const JunqiBoardNetworkSVG: React.FC = () => {
  const renderHalfRoads = (baseRow: number) => {
    const lines: React.ReactElement[] = [];
    const roadRows = baseRow === 0 ? [0, 2, 3, 4] : [7, 8, 9, 11];
    roadRows.forEach((r) => {
      for (let c = 0; c < 4; c++) {
        lines.push(
          <line
            key={`h-road-${r}-${c}`}
            x1={JUNQI_COL_X[c]}
            y1={JUNQI_ROW_Y[r]}
            x2={JUNQI_COL_X[c + 1]}
            y2={JUNQI_ROW_Y[r]}
            stroke="#3B2E25"
            strokeWidth="2.2"
          />
        );
      }
    });
    for (let r = baseRow; r < baseRow + 5; r++) {
      for (let c = 1; c <= 3; c++) {
        lines.push(
          <line
            key={`v-road-${r}-${c}`}
            x1={JUNQI_COL_X[c]}
            y1={JUNQI_ROW_Y[r]}
            x2={JUNQI_COL_X[c]}
            y2={JUNQI_ROW_Y[r + 1]}
            stroke="#3B2E25"
            strokeWidth="2.2"
          />
        );
      }
    }
    const r1 = baseRow === 0 ? 2 : 7;
    const r2 = baseRow === 0 ? 4 : 9;
    [
      [r1, 1],
      [r1, 3],
      [r2, 1],
      [r2, 3],
    ].forEach(([cr, cc]) => {
      [
        [cr - 1, cc - 1],
        [cr - 1, cc + 1],
        [cr + 1, cc - 1],
        [cr + 1, cc + 1],
      ].forEach(([nr, nc]) => {
        lines.push(
          <line
            key={`diag-${cr}-${cc}-${nr}-${nc}`}
            x1={JUNQI_COL_X[cc]}
            y1={JUNQI_ROW_Y[cr]}
            x2={JUNQI_COL_X[nc]}
            y2={JUNQI_ROW_Y[nr]}
            stroke="#3B2E25"
            strokeWidth="2"
          />
        );
      });
    });
    return lines;
  };

  const renderRailway = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <g key={key}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3B2E25" strokeWidth="9.5" />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#F6F1E2"
        strokeWidth="3.5"
        strokeDasharray="7 7"
      />
    </g>
  );

  return (
    <g>
      {renderHalfRoads(0)}
      {renderHalfRoads(6)}
      {[1, 5, 6, 10].map((r) =>
        renderRailway(JUNQI_COL_X[0], JUNQI_ROW_Y[r], JUNQI_COL_X[4], JUNQI_ROW_Y[r], `hr-${r}`)
      )}
      {renderRailway(JUNQI_COL_X[0], JUNQI_ROW_Y[0], JUNQI_COL_X[0], JUNQI_ROW_Y[11], 'vr-l')}
      {renderRailway(JUNQI_COL_X[4], JUNQI_ROW_Y[0], JUNQI_COL_X[4], JUNQI_ROW_Y[11], 'vr-r')}
      {renderRailway(JUNQI_COL_X[2], JUNQI_ROW_Y[5], JUNQI_COL_X[2], JUNQI_ROW_Y[6], 'vr-c')}
    </g>
  );
};

export const OnlineBoardRenderer: React.FC<OnlineBoardRendererProps> = ({
  room,
  onGomokuMove,
  onXiangqiMove,
  onJunqiFlip,
  onJunqiMove,
  onJunqiSwapSetup,
  onJunqiPresetSetup,
  onJunqiConfirmSetup,
}) => {
  const [selected, setSelected] = useState<Coord | null>(null);
  const [legalTargets, setLegalTargets] = useState<Coord[]>([]);
  const [hoverCoord, setHoverCoord] = useState<Coord | null>(null);

  // Track board transitions to trigger game-specific animations cleanly on each new step
  const prevStepRef = useRef<{ roomId: string; step: number; capCount: number }>({
    roomId: room.roomId,
    step:
      room.gomoku?.stepCount ??
      room.xiangqi?.stepCount ??
      room.junqi?.stepCount ??
      0,
    capCount:
      (room.xiangqi?.capturedRed.length ?? 0) +
      (room.xiangqi?.capturedBlack.length ?? 0),
  });

  const [gomokuFx, setGomokuFx] = useState<{ r: number; c: number; key: number } | null>(null);
  const [xiangqiFx, setXiangqiFx] = useState<{
    to: Coord;
    isCapture: boolean;
    isCheck: boolean;
    key: number;
  } | null>(null);
  const [junqiFx, setJunqiFx] = useState<{
    r: number;
    c: number;
    kind: 'FLIP' | 'MOVE' | 'WIN' | 'LOSS' | 'BOMB';
    label?: string;
    key: number;
  } | null>(null);

  const currentStep =
    room.gomoku?.stepCount ??
    room.xiangqi?.stepCount ??
    room.junqi?.stepCount ??
    0;
  const currentCapCount =
    (room.xiangqi?.capturedRed.length ?? 0) +
    (room.xiangqi?.capturedBlack.length ?? 0);

  useEffect(() => {
    const prev = prevStepRef.current;
    if (prev.roomId !== room.roomId || currentStep < prev.step) {
      prevStepRef.current = { roomId: room.roomId, step: currentStep, capCount: currentCapCount };
      setGomokuFx(null);
      setXiangqiFx(null);
      setJunqiFx(null);
      return;
    }

    if (currentStep > prev.step) {
      const fxKey = Date.now() + Math.random();
      if (room.gameType === 'GOMOKU' && room.gomoku?.lastMove) {
        setGomokuFx({
          r: room.gomoku.lastMove.r,
          c: room.gomoku.lastMove.c,
          key: fxKey,
        });
      } else if (room.gameType === 'XIANGQI' && room.xiangqi?.lastMove) {
        setXiangqiFx({
          to: room.xiangqi.lastMove.to,
          isCapture: currentCapCount > prev.capCount,
          isCheck: room.xiangqi.inCheckSide !== null,
          key: fxKey,
        });
      } else if (room.gameType === 'JUNQI' && room.junqi?.lastMove) {
        const jq = room.junqi;
        const { from, to } = jq.lastMove!;
        const isFlip = from.r === to.r && from.c === to.c;
        let kind: 'FLIP' | 'MOVE' | 'WIN' | 'LOSS' | 'BOMB' = 'MOVE';
        let label: string | undefined;

        if (isFlip) {
          kind = 'FLIP';
        } else if (jq.winner !== null) {
          kind = 'WIN';
          label = jq.lastBanner.includes('扛回大本营') ? '凯旋' : '制胜';
        } else if (jq.lastBanner.includes('拔得敌旗')) {
          kind = 'WIN';
          label = '扛旗';
        } else if (jq.lastBanner.includes('排雷成功')) {
          if (jq.lastBanner.includes('强行排雷')) {
            kind = 'BOMB';
            label = '清雷';
          } else {
            kind = 'WIN';
            label = '排雷';
          }
        } else if (jq.lastBanner.includes('爆破清雷')) {
          kind = 'BOMB';
          label = '炸雷';
        } else if (jq.lastBanner.includes('同归于尽')) {
          kind = 'BOMB';
          label = '同归';
        } else if (jq.lastBanner.includes('已受创')) {
          kind = 'LOSS';
          label = '受创';
        } else if (jq.lastBanner.includes('触雷阵亡')) {
          kind = 'LOSS';
          label = '触雷';
        } else if (jq.lastBanner.includes('阵亡') || jq.lastBanner.includes('失利')) {
          kind = 'LOSS';
          label = '阵亡';
        } else if (
          jq.lastBanner.includes('击溃') ||
          jq.lastBanner.includes('告捷') ||
          jq.lastBanner.includes('得手')
        ) {
          kind = 'WIN';
          label = '破敌';
        }
        setJunqiFx({ r: to.r, c: to.c, kind, label, key: fxKey });
      }
      prevStepRef.current = { roomId: room.roomId, step: currentStep, capCount: currentCapCount };
    }
  }, [room, currentStep, currentCapCount]);

  // Clear selection whenever room step changes or status changes
  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
  }, [
    room.status,
    room.gomoku?.stepCount,
    room.xiangqi?.stepCount,
    room.junqi?.stepCount,
  ]);

  const isSeat1 = room.viewerRole === 'SEAT_1';
  const isSeat2 = room.viewerRole === 'SEAT_2';
  const isSpectator = room.viewerRole === 'SPECTATOR';

  // ---------------- GOMOKU BOARD ----------------
  if (room.gameType === 'GOMOKU' && room.gomoku) {
    const g = room.gomoku;
    const myColor = isSeat1 ? 1 : isSeat2 ? 2 : null;
    const isMyTurn = room.status === 'PLAYING' && myColor !== null && g.turn === myColor;

    return (
      <div className="relative w-full max-w-[600px] aspect-square p-5 sm:p-8 rounded-2xl wood-board-surface border-2 border-[#7C5332] select-none">
        <div className="relative w-full h-full">
          <svg viewBox="0 0 1400 1400" className="w-full h-full overflow-visible" aria-label="联机五子棋盘">
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
            {Array.from({ length: GOMOKU_SIZE }).map((_, idx) => {
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
            {GOMOKU_STARS.map((pt, idx) => (
              <circle key={idx} cx={pt.c * 100} cy={pt.r * 100} r={11} fill="#3E2723" />
            ))}
            {g.winningLine && g.winningLine.length >= 2 && (
              <line
                x1={g.winningLine[0].c * 100}
                y1={g.winningLine[0].r * 100}
                x2={g.winningLine[g.winningLine.length - 1].c * 100}
                y2={g.winningLine[g.winningLine.length - 1].r * 100}
                stroke="#B91C1C"
                strokeWidth="12"
                strokeLinecap="round"
                strokeOpacity="0.85"
              />
            )}
          </svg>

          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`,
              margin: '-3.33%',
            }}
          >
            {g.grid.map((row, r) =>
              row.map((cell, c) => {
                const isLast = g.lastMove?.r === r && g.lastMove?.c === c;
                const isWin = g.winningLine?.some((pt) => pt.r === r && pt.c === c) ?? false;
                const isHovered =
                  isMyTurn && cell === 0 && hoverCoord?.r === r && hoverCoord?.c === c;
                const isFxTarget = gomokuFx?.r === r && gomokuFx?.c === c;

                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    disabled={!isMyTurn || cell !== 0}
                    onClick={() => {
                      if (!isMyTurn || cell !== 0) return;
                      onGomokuMove(r, c);
                    }}
                    onMouseEnter={() => setHoverCoord({ r, c })}
                    onMouseLeave={() => setHoverCoord(null)}
                    aria-label={`五子棋落子 ${String.fromCharCode(65 + c)}${15 - r}`}
                    className={`relative flex items-center justify-center w-full h-full focus:outline-none ${
                      isMyTurn && cell === 0 ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {cell !== 0 && isFxTarget && gomokuFx && (
                      <span
                        key={`og-rip-${gomokuFx.key}`}
                        className={`absolute inset-0 rounded-full border-2 pointer-events-none animate-gomoku-ripple ${
                          cell === 1 ? 'border-[#3E2723]/75' : 'border-[#0F766E]/75'
                        }`}
                      />
                    )}
                    {cell !== 0 && (
                      <div
                        key={isFxTarget && gomokuFx ? `og-st-${gomokuFx.key}` : 'og-st'}
                        className={`w-[84%] h-[84%] rounded-full flex items-center justify-center transition-transform duration-150 ${
                          cell === 1
                            ? 'bg-radial-[at_32%_30%] from-neutral-600 via-neutral-900 to-black shadow-[0_3px_6px_rgba(0,0,0,0.55)]'
                            : 'bg-radial-[at_32%_30%] from-white via-stone-100 to-stone-300 border border-stone-400/70 shadow-[0_3px_6px_rgba(45,27,18,0.4)]'
                        } ${isFxTarget ? 'animate-gomoku-drop' : ''} ${
                          isWin ? 'ring-3 ring-[#B91C1C] scale-105 animate-gomoku-win-glow' : ''
                        }`}
                      >
                        {isLast && (
                          <span
                            className={`w-2.5 h-2.5 rounded-sm ${
                              cell === 1 ? 'bg-[#EF4444]' : 'bg-[#B91C1C]'
                            }`}
                          />
                        )}
                      </div>
                    )}
                    {isHovered && (
                      <div
                        className={`w-[76%] h-[76%] rounded-full opacity-45 pointer-events-none ${
                          myColor === 1 ? 'bg-black' : 'bg-white border border-stone-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- XIANGQI BOARD ----------------
  if (room.gameType === 'XIANGQI' && room.xiangqi) {
    const xq = room.xiangqi;
    const mySide: XiangqiSide | null = isSeat1 ? 'RED' : isSeat2 ? 'BLACK' : null;
    const isFlipped = isSeat2; // Black sits at bottom in Seat 2 view
    const isMyTurn = room.status === 'PLAYING' && mySide !== null && xq.turn === mySide;

    const toCanon = (vr: number, vc: number): Coord =>
      isFlipped ? { r: XIANGQI_ROWS - 1 - vr, c: XIANGQI_COLS - 1 - vc } : { r: vr, c: vc };

    const handleXiangqiClick = (vr: number, vc: number) => {
      if (!isMyTurn) return;
      const canon = toCanon(vr, vc);
      const clicked = xq.board[canon.r][canon.c];

      if (selected && legalTargets.some((t) => t.r === canon.r && t.c === canon.c)) {
        onXiangqiMove(selected, canon);
        return;
      }

      if (clicked && clicked.side === mySide) {
        soundFX.playSelect();
        setSelected(canon);
        const boardCopy = xq.board.map((row) => row.map((p) => (p ? { ...p } : null)));
        setLegalTargets(getXiangqiLegalMoves(boardCopy, canon.r, canon.c));
        return;
      }

      setSelected(null);
      setLegalTargets([]);
    };

    return (
      <div className="relative w-full max-w-[580px] aspect-[9/10] p-6 sm:p-8 rounded-2xl wood-board-surface border-2 border-[#7C5332] select-none">
        <div className="relative w-full h-full">
          <svg viewBox="0 0 800 900" className="w-full h-full overflow-visible" aria-label="联机中国象棋盘">
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
            {Array.from({ length: XIANGQI_ROWS }).map((_, r) => (
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
            {Array.from({ length: XIANGQI_COLS }).map((_, c) =>
              c === 0 || c === 8 ? (
                <line
                  key={`v-${c}`}
                  x1={c * 100}
                  y1={0}
                  x2={c * 100}
                  y2={900}
                  stroke="#3E2723"
                  strokeWidth={3.5}
                />
              ) : (
                <g key={`v-${c}`}>
                  <line x1={c * 100} y1={0} x2={c * 100} y2={400} stroke="#3E2723" strokeWidth={2.2} />
                  <line x1={c * 100} y1={500} x2={c * 100} y2={900} stroke="#3E2723" strokeWidth={2.2} />
                </g>
              )
            )}
            <line x1={300} y1={0} x2={500} y2={200} stroke="#3E2723" strokeWidth={2.2} />
            <line x1={500} y1={0} x2={300} y2={200} stroke="#3E2723" strokeWidth={2.2} />
            <line x1={300} y1={700} x2={500} y2={900} stroke="#3E2723" strokeWidth={2.2} />
            <line x1={500} y1={700} x2={300} y2={900} stroke="#3E2723" strokeWidth={2.2} />
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

          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${XIANGQI_COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${XIANGQI_ROWS}, minmax(0, 1fr))`,
              marginLeft: '-6.25%',
              marginRight: '-6.25%',
              marginTop: '-5.55%',
              marginBottom: '-5.55%',
            }}
          >
            {Array.from({ length: XIANGQI_ROWS }).map((_, vr) =>
              Array.from({ length: XIANGQI_COLS }).map((__, vc) => {
                const canon = toCanon(vr, vc);
                const piece = xq.board[canon.r][canon.c];
                const isSel = selected?.r === canon.r && selected?.c === canon.c;
                const isLegal = legalTargets.some((t) => t.r === canon.r && t.c === canon.c);
                const isFrom = xq.lastMove?.from.r === canon.r && xq.lastMove?.from.c === canon.c;
                const isTo = xq.lastMove?.to.r === canon.r && xq.lastMove?.to.c === canon.c;
                const isFxTarget = xiangqiFx?.to.r === canon.r && xiangqiFx?.to.c === canon.c;
                const isCheckedGeneral =
                  piece?.type === 'G' && xq.inCheckSide !== null && piece.side === xq.inCheckSide;

                return (
                  <button
                    key={`${vr}-${vc}`}
                    type="button"
                    onClick={() => handleXiangqiClick(vr, vc)}
                    className={`relative flex items-center justify-center w-full h-full focus:outline-none ${
                      isMyTurn ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {isFrom && !piece && <span className="w-3 h-3 rounded-full bg-[#7C5332]/50" />}
                    {isCheckedGeneral && (
                      <span className="absolute inset-0 rounded-full border-3 border-[#B91C1C] bg-[#B91C1C]/20 pointer-events-none animate-xiangqi-general-pulse" />
                    )}
                    {isFxTarget && xiangqiFx && (
                      <span
                        key={`oxq-ring-${xiangqiFx.key}`}
                        className={`absolute inset-0 rounded-full pointer-events-none ${
                          xiangqiFx.isCapture
                            ? 'border-[3px] border-[#B91C1C] bg-[#B91C1C]/15 animate-xiangqi-capture'
                            : 'border-2 border-[#9A6B32]/85 animate-xiangqi-ring'
                        }`}
                      />
                    )}
                    {piece && (
                      <div
                        key={isFxTarget && xiangqiFx ? `oxq-pc-${xiangqiFx.key}` : 'oxq-pc'}
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
                            {XIANGQI_PIECE_LABELS[piece.side][piece.type]}
                          </span>
                        </div>
                      </div>
                    )}
                    {isFxTarget && xiangqiFx?.isCapture && (
                      <span
                        key={`oxq-tag-${xiangqiFx.key}`}
                        className="absolute -top-2 z-20 px-1.5 py-0.5 rounded bg-[#B91C1C] text-[#FFFDF7] font-serif-oriental font-bold text-xs shadow-md pointer-events-none animate-fx-float-tag"
                      >
                        吃
                      </span>
                    )}
                    {isLegal && !piece && (
                      <span className="w-4 h-4 rounded-full bg-[#0F766E] shadow-sm ring-2 ring-white/70 pointer-events-none" />
                    )}
                    {isLegal && piece && (
                      <span className="absolute inset-1 rounded-full border-3 border-[#0F766E] bg-[#0F766E]/15 pointer-events-none" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          {xiangqiFx?.isCheck && room.status === 'PLAYING' && (
            <div
              key={`oxq-check-${xiangqiFx.key}`}
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              <div className="px-7 py-3 rounded-xl bg-[#7F1D1D]/92 border-2 border-[#FDE68A] shadow-2xl animate-xiangqi-check-banner">
                <span className="font-serif-oriental font-bold text-3xl sm:text-4xl tracking-[0.35em] text-[#FEF3C7]">
                  將 軍
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- JUNQI BOARD ----------------
  if (room.gameType === 'JUNQI' && room.junqi) {
    const jq = room.junqi;
    const mySide: JunqiSide | null = isSeat1 ? 'RED' : isSeat2 ? 'BLUE' : null;
    const isFlipped = isSeat2; // Blue sits at bottom in Seat 2 view
    const mySetupConfirmed =
      isSeat1 ? room.seat1.setupConfirmed : isSeat2 ? room.seat2.setupConfirmed : true;
    const isDeploying = room.status === 'DEPLOYING' && !isSpectator && !mySetupConfirmed;
    const isMyTurn = room.status === 'PLAYING' && mySide !== null && jq.turn === mySide;

    const toCanon = (vr: number, vc: number): Coord =>
      isFlipped ? { r: JUNQI_ROWS - 1 - vr, c: JUNQI_COLS - 1 - vc } : { r: vr, c: vc };

    // Top HQ color vs Bottom HQ color matches visual orientation
    const topHqColor = isFlipped ? '#96352F' : '#26568B';
    const bottomHqColor = isFlipped ? '#26568B' : '#96352F';

    const handleJunqiClick = (vr: number, vc: number) => {
      const canon = toCanon(vr, vc);
      const clicked = jq.board[canon.r][canon.c];

      // 1. Setup swap during DEPLOYING
      if (isDeploying) {
        if (!clicked || clicked.side !== mySide) return;
        if (!selected) {
          soundFX.playSelect();
          setSelected(canon);
          return;
        }
        if (selected.r === canon.r && selected.c === canon.c) {
          setSelected(null);
          return;
        }
        onJunqiSwapSetup(selected, canon);
        setSelected(null);
        return;
      }

      // 2. Active gameplay
      if (!isMyTurn) return;

      if (selected && legalTargets.some((t) => t.r === canon.r && t.c === canon.c)) {
        onJunqiMove(selected, canon);
        return;
      }

      if (jq.subMode === 'FLIP' && clicked && !clicked.revealed) {
        onJunqiFlip(canon.r, canon.c);
        return;
      }

      if (clicked && clicked.revealed && clicked.side === mySide) {
        soundFX.playSelect();
        setSelected(canon);
        setLegalTargets(
          getJunqiLegalMovesGeneric(jq.board, canon.r, canon.c, jq.subMode, {
            enemyMinesCount: mySide === 'RED' ? jq.blueMines : jq.redMines,
            ownMinRank: mySide === 'RED' ? jq.redMinRank : jq.blueMinRank,
          })
        );
        return;
      }

      setSelected(null);
      setLegalTargets([]);
    };

    return (
      <div className="w-full flex flex-col items-center gap-3">
        {/* Deployment Toolbar when in DEPLOYING phase */}
        {room.status === 'DEPLOYING' && !isSpectator && (
          <div className="w-full max-w-[760px] p-3.5 rounded-xl bg-[#EFE9D8] border border-[#D8CBB8] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#3E2723]">
              {mySetupConfirmed ? (
                <span className="font-semibold text-[#0F766E]">
                  您已完成布阵，正在等待对手确认布阵...
                </span>
              ) : (
                <span>
                  <strong>布阵阶段：</strong>点击己方防区任意两枚棋子可互换位置
                </span>
              )}
            </div>
            {!mySetupConfirmed && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJunqiPresetSetup('BALANCED')}
                  className="px-2.5 py-1.5 rounded-md bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  机动阵
                </button>
                <button
                  type="button"
                  onClick={() => onJunqiPresetSetup('FORTRESS')}
                  className="px-2.5 py-1.5 rounded-md bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Shield className="w-3.5 h-3.5" />
                  铁桶阵
                </button>
                <button
                  type="button"
                  onClick={onJunqiConfirmSetup}
                  className="px-3.5 py-1.5 rounded-md bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  完成布阵
                </button>
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-[780px] flex flex-col md:flex-row items-center md:items-stretch justify-center gap-3">
          <div className="hidden md:flex">
            <JunqiCapturedTray
              side={isFlipped ? 'RED' : 'BLUE'}
              captured={isFlipped ? jq.capturedRed : jq.capturedBlue}
              layout="vertical"
            />
          </div>

          <div className="relative w-full max-w-[520px] aspect-[680/980] rounded-[28px] shadow-2xl overflow-hidden select-none border-4 border-[#1E2E26]">
          <svg viewBox="0 0 680 980" className="w-full h-full block" aria-label="联机陆战棋盘">
            <rect
              x="0"
              y="0"
              width="680"
              height="980"
              rx="26"
              fill="#EFE6CE"
              stroke="#B29666"
              strokeWidth="8"
            />
            <rect
              x="22"
              y="22"
              width="636"
              height="936"
              rx="18"
              fill="#F1E9D4"
              stroke="#A68B5B"
              strokeWidth="2.5"
            />
            {(
              [
                [48, 48],
                [632, 48],
                [48, 932],
                [632, 932],
              ] as [number, number][]
            ).map(([cx, cy], idx) => (
              <g key={`c-${idx}`}>
                <circle cx={cx} cy={cy} r="9" fill="none" stroke="#A68B5B" strokeWidth="2" />
                <circle cx={cx} cy={cy} r="2.5" fill="#A68B5B" />
              </g>
            ))}

            <text
              x="340"
              y="69"
              textAnchor="middle"
              className="fill-[#33271E] font-serif-oriental font-bold text-[38px] tracking-[0.55em]"
            >
              陆战棋
            </text>

            {/* Frontline River */}
            <g>
              <rect x="23.5" y="451" width="633" height="66" fill="#BAD4CE" />
              <line x1="23.5" y1="451" x2="656.5" y2="451" stroke="#638F8C" strokeWidth="3" />
              <line x1="23.5" y1="517" x2="656.5" y2="517" stroke="#638F8C" strokeWidth="3" />
              <path
                d="M 45 468 Q 75 458, 105 468 T 165 468 T 225 468 T 285 468 T 345 468 T 405 468 T 465 468 T 525 468 T 585 468 T 635 468"
                fill="none"
                stroke="#85ADA8"
                strokeWidth="2"
              />
              <path
                d="M 45 501 Q 75 491, 105 501 T 165 501 T 225 501 T 285 501 T 345 501 T 405 501 T 465 501 T 525 501 T 585 501 T 635 501"
                fill="none"
                stroke="#85ADA8"
                strokeWidth="2"
              />
              <polygon
                points="206,502 230,462 246,482 258,468 276,502"
                fill="#707D5B"
                stroke="#3B2E25"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <polygon
                points="406,502 430,462 446,482 458,468 476,502"
                fill="#707D5B"
                stroke="#3B2E25"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <text
                x="308"
                y="495"
                textAnchor="middle"
                className="fill-[#33271E] font-serif-oriental font-bold text-[22px]"
              >
                前
              </text>
              <text
                x="372"
                y="495"
                textAnchor="middle"
                className="fill-[#33271E] font-serif-oriental font-bold text-[22px]"
              >
                线
              </text>
            </g>

            <JunqiBoardNetworkSVG />

            {JUNQI_ROW_Y.map((cy, vr) =>
              JUNQI_COL_X.map((cx, vc) => {
                const camp = isJunqiCamp(vr, vc);
                const hq = isJunqiHQ(vr, vc);
                if (camp) {
                  return (
                    <g key={`n-${vr}-${vc}`}>
                      <circle cx={cx} cy={cy} r="26" fill="#F5EFE0" stroke="#3B2E25" strokeWidth="2.2" />
                      <circle
                        cx={cx}
                        cy={cy}
                        r="19.5"
                        fill="none"
                        stroke="#6E5A4F"
                        strokeWidth="1.3"
                        strokeDasharray="3 3"
                      />
                    </g>
                  );
                }
                if (hq) {
                  const fillColor = vr === 0 ? topHqColor : bottomHqColor;
                  return (
                    <g key={`n-${vr}-${vc}`}>
                      <rect
                        x={cx - 43}
                        y={cy - 22}
                        width="86"
                        height="44"
                        rx="9"
                        fill={fillColor}
                        stroke="#3B2E25"
                        strokeWidth="2.4"
                      />
                      <rect
                        x={cx - 38}
                        y={cy - 17}
                        width="76"
                        height="34"
                        rx="6"
                        fill="none"
                        stroke="#F5EFE0"
                        strokeWidth="1.2"
                        opacity="0.85"
                      />
                      <text
                        x={cx}
                        y={cy + 6}
                        textAnchor="middle"
                        className="fill-[#FFFDF9] font-serif-oriental font-bold text-[16px] tracking-widest"
                      >
                        大本营
                      </text>
                    </g>
                  );
                }
                return (
                  <rect
                    key={`n-${vr}-${vc}`}
                    x={cx - 38}
                    y={cy - 18}
                    width="76"
                    height="36"
                    rx="6"
                    fill="#F8F4E8"
                    stroke="#3B2E25"
                    strokeWidth="2"
                  />
                );
              })
            )}

            <text
              x="340"
              y="936"
              textAnchor="middle"
              className="fill-[#7E6849] font-serif-oriental text-[15px] tracking-[0.36em]"
            >
              JUNQI · LAND BATTLE CHESS
            </text>
          </svg>

          <div className="absolute inset-0">
            {Array.from({ length: JUNQI_ROWS }).map((_, vr) =>
              Array.from({ length: JUNQI_COLS }).map((__, vc) => {
                const canon = toCanon(vr, vc);
                const piece = jq.board[canon.r][canon.c];
                const leftPct = (JUNQI_COL_X[vc] / 680) * 100;
                const topPct = (JUNQI_ROW_Y[vr] / 980) * 100;
                const camp = isJunqiCamp(vr, vc);
                const isSel = selected?.r === canon.r && selected?.c === canon.c;
                const isLegal = legalTargets.some((t) => t.r === canon.r && t.c === canon.c);
                const isLastDest =
                  jq.lastMove?.to.r === canon.r && jq.lastMove?.to.c === canon.c;
                const isFxTarget = junqiFx?.r === canon.r && junqiFx?.c === canon.c;

                return (
                  <button
                    key={`jc-${vr}-${vc}`}
                    type="button"
                    onClick={() => handleJunqiClick(vr, vc)}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: '11.2%',
                      height: '3.75%',
                    }}
                    aria-label={`联机军旗 (${canon.r + 1},${canon.c + 1})`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none ${
                      isDeploying || isMyTurn ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {piece && (
                      <div
                        key={isFxTarget && junqiFx ? `ojq-pc-${junqiFx.key}` : 'ojq-pc'}
                        className={`relative w-full h-full rounded-[6px] flex items-center justify-center font-serif-oriental font-bold text-[11px] sm:text-[13px] tracking-wider shadow-[0_2px_5px_rgba(0,0,0,0.4)] transition-transform duration-150 border ${
                          piece.side === 'UNKNOWN'
                            ? 'bg-gradient-to-b from-[#5D4B3C] to-[#3B2E25] text-[#F1E9D4] border-[#B29666]'
                            : piece.side === 'RED'
                            ? 'bg-gradient-to-b from-[#9E342C] to-[#7D241E] text-[#FFFDF9] border-[#F5D0C5]/75'
                            : 'bg-gradient-to-b from-[#2B629E] to-[#1B416C] text-[#FFFDF9] border-[#BFDBFE]/75'
                        } ${
                          piece.carryingFlag
                            ? 'ring-2 ring-[#F59E0B] shadow-[0_0_10px_rgba(245,158,11,0.7)]'
                            : ''
                        } ${
                          isFxTarget && junqiFx?.kind === 'FLIP'
                            ? 'animate-junqi-flip'
                            : isFxTarget &&
                              (junqiFx?.kind === 'MOVE' || junqiFx?.kind === 'WIN')
                            ? 'animate-junqi-march'
                            : ''
                        } ${isSel ? '-translate-y-1 ring-2 ring-[#0F766E] scale-105 z-10' : ''} ${
                          isLastDest && !isSel ? 'ring-2 ring-[#F59E0B]' : ''
                        }`}
                      >
                        {piece.rank !== null
                          ? JUNQI_RANK_NAMES[piece.rank]
                          : piece.side === 'UNKNOWN'
                          ? '暗棋'
                          : piece.side === 'RED'
                          ? '红军'
                          : '蓝军'}
                        {piece.carryingFlag && (
                          <span
                            title="扛旗中（不可被吃，只能堵截）"
                            className="absolute -top-2 -right-1.5 px-1 py-0.2 rounded bg-[#D97706] text-[#FFFDF9] text-[9px] leading-tight font-bold border border-[#FEF3C7] shadow-sm pointer-events-none"
                          >
                            扛旗
                          </span>
                        )}
                        {piece.mineHits !== undefined && piece.mineHits > 0 && (
                          <span
                            title={`地雷受创 ${piece.mineHits}/3`}
                            className="absolute -bottom-1.5 -right-1 px-1 rounded bg-[#7F1D1D] text-[#FEF3C7] text-[9px] leading-tight font-mono-tabular font-bold border border-[#FCA5A5] shadow-sm pointer-events-none"
                          >
                            {piece.mineHits}/3
                          </span>
                        )}
                      </div>
                    )}
                    {isFxTarget && junqiFx && junqiFx.kind === 'MOVE' && (
                      <span
                        key={`ojq-ret-${junqiFx.key}`}
                        className="absolute -inset-1 rounded-[8px] border-2 border-[#D97706] pointer-events-none z-20 animate-junqi-reticle"
                      />
                    )}
                    {isFxTarget &&
                      junqiFx &&
                      (junqiFx.kind === 'WIN' ||
                        junqiFx.kind === 'LOSS' ||
                        junqiFx.kind === 'BOMB') && (
                        <span
                          key={`ojq-exp-${junqiFx.key}`}
                          className={`absolute -inset-1 rounded-[10px] border-3 pointer-events-none z-20 animate-junqi-explosion ${
                            junqiFx.kind === 'BOMB'
                              ? 'border-[#EA580C] bg-[#F97316]/30'
                              : junqiFx.kind === 'WIN'
                              ? 'border-[#D97706] bg-[#F59E0B]/25'
                              : 'border-[#991B1B] bg-[#DC2626]/25'
                          }`}
                        />
                      )}
                    {isFxTarget && junqiFx?.label && (
                      <span
                        key={`ojq-tag-${junqiFx.key}`}
                        className={`absolute -top-3 z-30 px-1.5 py-0.5 rounded font-serif-oriental font-bold text-[10px] sm:text-xs text-white shadow-md pointer-events-none whitespace-nowrap animate-fx-float-tag ${
                          junqiFx.kind === 'WIN'
                            ? 'bg-[#B45309]'
                            : junqiFx.kind === 'BOMB'
                            ? 'bg-[#C2410C]'
                            : 'bg-[#991B1B]'
                        }`}
                      >
                        {junqiFx.label}
                      </span>
                    )}
                    {isLegal && (
                      <span
                        className={`pointer-events-none z-20 ring-3 ring-[#0F766E] bg-[#0F766E]/30 ${
                          camp && !piece
                            ? 'w-[72%] h-[142%] rounded-full'
                            : 'w-full h-full rounded-[6px]'
                        }`}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="hidden md:flex">
          <JunqiCapturedTray
            side={isFlipped ? 'BLUE' : 'RED'}
            captured={isFlipped ? jq.capturedBlue : jq.capturedRed}
            layout="vertical"
          />
        </div>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
          <JunqiCapturedTray
            side={isFlipped ? 'RED' : 'BLUE'}
            captured={isFlipped ? jq.capturedRed : jq.capturedBlue}
            layout="horizontal"
          />
          <JunqiCapturedTray
            side={isFlipped ? 'BLUE' : 'RED'}
            captured={isFlipped ? jq.capturedBlue : jq.capturedRed}
            layout="horizontal"
          />
        </div>
      </div>
    </div>
    );
  }

  return null;
};
