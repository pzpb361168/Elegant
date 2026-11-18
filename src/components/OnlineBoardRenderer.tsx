import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button } from '@tarojs/components';
import type { Coord, JunqiSide, SanitizedRoomState, XiangqiSide } from '../shared/onlineTypes';
import {
  getJunqiLegalMovesGeneric,
  getXiangqiLegalMoves,
  isJunqiCamp,
  JUNQI_COLS,
  JUNQI_RANK_NAMES,
  JUNQI_ROWS,
  XIANGQI_COLS,
  XIANGQI_PIECE_LABELS,
  XIANGQI_ROWS,
} from '../shared/gameRules';
import { soundFX } from '../utils/sound';
import { JunqiCapturedTray } from './JunqiCapturedTray';
import { GomokuBoardCanvas, XiangqiBoardCanvas, JunqiBoardCanvas } from './BoardCanvases';

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

const JUNQI_COL_X = [142, 241, 340, 439, 538];
const JUNQI_ROW_Y = [112, 174, 236, 298, 360, 422, 546, 608, 670, 732, 794, 856];

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

  const prevStepRef = useRef<{ roomId: string; step: number; capCount: number }>({
    roomId: room.roomId,
    step: room.gomoku?.stepCount ?? room.xiangqi?.stepCount ?? room.junqi?.stepCount ?? 0,
    capCount:
      (room.xiangqi?.capturedRed.length ?? 0) + (room.xiangqi?.capturedBlack.length ?? 0),
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
    room.gomoku?.stepCount ?? room.xiangqi?.stepCount ?? room.junqi?.stepCount ?? 0;
  const currentCapCount =
    (room.xiangqi?.capturedRed.length ?? 0) + (room.xiangqi?.capturedBlack.length ?? 0);

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

  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
  }, [room.status, room.gomoku?.stepCount, room.xiangqi?.stepCount, room.junqi?.stepCount]);

  const isSeat1 = room.viewerRole === 'SEAT_1';
  const isSeat2 = room.viewerRole === 'SEAT_2';
  const isSpectator = room.viewerRole === 'SPECTATOR';

  // ---------------- GOMOKU ----------------
  if (room.gameType === 'GOMOKU' && room.gomoku) {
    const g = room.gomoku;
    const myColor = isSeat1 ? 1 : isSeat2 ? 2 : null;
    const isMyTurn = room.status === 'PLAYING' && myColor !== null && g.turn === myColor;

    return (
      <View className='board-wrap-center'>
        <View className='gomoku-board-box wood-surface'>
          <GomokuBoardCanvas canvasId='gomoku-online-canvas' winningLine={g.winningLine} />
          <View className='board-overlay-gomoku'>
            {g.grid.map((row, r) =>
              row.map((cell, c) => {
                const isLast = g.lastMove?.r === r && g.lastMove?.c === c;
                const isWin = g.winningLine?.some((pt) => pt.r === r && pt.c === c) ?? false;
                const isFxTarget = gomokuFx?.r === r && gomokuFx?.c === c;

                return (
                  <View
                    key={`${r}-${c}`}
                    onClick={() => {
                      if (!isMyTurn || cell !== 0) return;
                      onGomokuMove(r, c);
                    }}
                    className='gomoku-cell'
                  >
                    {cell !== 0 && isFxTarget && gomokuFx && (
                      <View
                        key={`og-rip-${gomokuFx.key}`}
                        className='fx-ring-overlay animate-gomoku-ripple'
                        style={{
                          border:
                            cell === 1
                              ? '4rpx solid rgba(62,39,35,0.75)'
                              : '4rpx solid rgba(15,118,110,0.75)',
                        }}
                      />
                    )}
                    {cell !== 0 && (
                      <View
                        key={isFxTarget && gomokuFx ? `og-st-${gomokuFx.key}` : 'og-st'}
                        className={`gomoku-stone ${
                          cell === 1 ? 'gomoku-stone--black' : 'gomoku-stone--white'
                        } ${isFxTarget ? 'animate-gomoku-drop' : ''} ${
                          isWin ? 'gomoku-stone--win' : ''
                        }`}
                      >
                        {isLast && <View className='gomoku-last-dot' />}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </View>
    );
  }

  // ---------------- XIANGQI ----------------
  if (room.gameType === 'XIANGQI' && room.xiangqi) {
    const xq = room.xiangqi;
    const mySide: XiangqiSide | null = isSeat1 ? 'RED' : isSeat2 ? 'BLACK' : null;
    const isFlipped = isSeat2;
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
      <View className='board-wrap-center'>
        <View className='xiangqi-board-box wood-surface'>
          <XiangqiBoardCanvas canvasId='xiangqi-online-canvas' />

          <View className='board-overlay-xiangqi'>
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
                  <View
                    key={`${vr}-${vc}`}
                    onClick={() => handleXiangqiClick(vr, vc)}
                    className='xiangqi-cell'
                  >
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
                    {isFxTarget && xiangqiFx && (
                      <View
                        key={`oxq-ring-${xiangqiFx.key}`}
                        className={`fx-ring-overlay ${
                          xiangqiFx.isCapture ? 'animate-xiangqi-capture' : 'animate-xiangqi-ring'
                        }`}
                        style={{
                          border: xiangqiFx.isCapture
                            ? '5rpx solid #B91C1C'
                            : '3rpx solid rgba(154, 107, 50, 0.85)',
                          backgroundColor: xiangqiFx.isCapture
                            ? 'rgba(185, 28, 28, 0.16)'
                            : 'transparent',
                        }}
                      />
                    )}
                    {piece && (
                      <View
                        key={isFxTarget && xiangqiFx ? `oxq-pc-${xiangqiFx.key}` : 'oxq-pc'}
                        className={`xiangqi-piece ${
                          piece.side === 'RED' ? 'xiangqi-piece--red' : 'xiangqi-piece--black'
                        } ${isFxTarget ? 'animate-xiangqi-slam' : ''} ${
                          isSel ? 'xiangqi-piece--selected' : isTo ? 'xiangqi-piece--last' : ''
                        }`}
                      >
                        <View className='xiangqi-piece-inner'>
                          <Text className='font-serif-oriental'>
                            {XIANGQI_PIECE_LABELS[piece.side][piece.type]}
                          </Text>
                        </View>
                      </View>
                    )}
                    {isFxTarget && xiangqiFx?.isCapture && (
                      <View
                        key={`oxq-tag-${xiangqiFx.key}`}
                        className='fx-float-badge font-serif-oriental animate-fx-float-tag'
                        style={{ backgroundColor: '#B91C1C' }}
                      >
                        <Text>吃</Text>
                      </View>
                    )}
                    {isLegal && !piece && <View className='xiangqi-legal-dot' />}
                    {isLegal && piece && <View className='xiangqi-legal-capture' />}
                  </View>
                );
              })
            )}
          </View>

          {xiangqiFx?.isCheck && room.status === 'PLAYING' && (
            <View key={`oxq-check-${xiangqiFx.key}`} className='check-flash-overlay'>
              <View className='check-flash-banner font-serif-oriental animate-xiangqi-check-banner'>
                <Text>將 軍</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ---------------- JUNQI ----------------
  if (room.gameType === 'JUNQI' && room.junqi) {
    const jq = room.junqi;
    const mySide: JunqiSide | null = isSeat1 ? 'RED' : isSeat2 ? 'BLUE' : null;
    const isFlipped = isSeat2;
    const mySetupConfirmed =
      isSeat1 ? room.seat1.setupConfirmed : isSeat2 ? room.seat2.setupConfirmed : true;
    const isDeploying = room.status === 'DEPLOYING' && !isSpectator && !mySetupConfirmed;
    const isMyTurn = room.status === 'PLAYING' && mySide !== null && jq.turn === mySide;

    const toCanon = (vr: number, vc: number): Coord =>
      isFlipped ? { r: JUNQI_ROWS - 1 - vr, c: JUNQI_COLS - 1 - vc } : { r: vr, c: vc };

    const handleJunqiClick = (vr: number, vc: number) => {
      const canon = toCanon(vr, vc);
      const clicked = jq.board[canon.r][canon.c];

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
      <View style={{ display: 'flex', flexDirection: 'column', gap: '18rpx', width: '100%' }}>
        {room.status === 'DEPLOYING' && !isSpectator && (
          <View className='card-panel' style={{ padding: '20rpx' }}>
            <Text style={{ fontSize: '23rpx', color: '#3E2723', display: 'block', marginBottom: '12rpx' }}>
              {mySetupConfirmed
                ? '您已完成布阵，正在等待对手确认布阵...'
                : '布阵阶段：点击己方防区任意两枚棋子可互换位置'}
            </Text>
            {!mySetupConfirmed && (
              <View style={{ display: 'flex', gap: '12rpx' }}>
                <Button onClick={() => onJunqiPresetSetup('BALANCED')} className='btn-soft' style={{ flex: 1 }}>
                  机动阵
                </Button>
                <Button onClick={() => onJunqiPresetSetup('FORTRESS')} className='btn-soft' style={{ flex: 1 }}>
                  铁桶阵
                </Button>
                <Button onClick={onJunqiConfirmSetup} className='btn-primary-red' style={{ flex: 1 }}>
                  完成布阵
                </Button>
              </View>
            )}
          </View>
        )}

        <View className='board-wrap-center'>
          <View className='junqi-board-box'>
            <JunqiBoardCanvas canvasId='junqi-online-canvas' isFlipped={isFlipped} />

            <View className='junqi-overlay-layer'>
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
                    <View
                      key={`jc-${vr}-${vc}`}
                      onClick={() => handleJunqiClick(vr, vc)}
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                      className='junqi-cell-btn'
                    >
                      {piece && (
                        <View
                          key={isFxTarget && junqiFx ? `ojq-pc-${junqiFx.key}` : 'ojq-pc'}
                          className={`junqi-tile font-serif-oriental ${
                            piece.side === 'UNKNOWN'
                              ? 'junqi-tile--hidden'
                              : piece.side === 'RED'
                              ? 'junqi-tile--red'
                              : 'junqi-tile--blue'
                          } ${piece.carryingFlag ? 'junqi-tile--carrier' : ''} ${
                            isFxTarget && junqiFx?.kind === 'FLIP'
                              ? 'animate-junqi-flip'
                              : isFxTarget &&
                                (junqiFx?.kind === 'MOVE' || junqiFx?.kind === 'WIN')
                              ? 'animate-junqi-march'
                              : ''
                          } ${
                            isSel
                              ? 'junqi-tile--selected'
                              : isLastDest
                              ? 'junqi-tile--last'
                              : ''
                          }`}
                        >
                          <Text>
                            {piece.rank !== null
                              ? JUNQI_RANK_NAMES[piece.rank]
                              : piece.side === 'UNKNOWN'
                              ? '暗棋'
                              : piece.side === 'RED'
                              ? '红军'
                              : '蓝军'}
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
                        junqiFx &&
                        (junqiFx.kind === 'WIN' ||
                          junqiFx.kind === 'LOSS' ||
                          junqiFx.kind === 'BOMB') && (
                          <View
                            key={`ojq-exp-${junqiFx.key}`}
                            className='fx-ring-overlay animate-junqi-explosion'
                            style={{
                              borderRadius: '10rpx',
                              border:
                                junqiFx.kind === 'BOMB'
                                  ? '4rpx solid #EA580C'
                                  : junqiFx.kind === 'WIN'
                                  ? '4rpx solid #D97706'
                                  : '4rpx solid #991B1B',
                            }}
                          />
                        )}

                      {isFxTarget && junqiFx?.label && (
                        <View
                          key={`ojq-tag-${junqiFx.key}`}
                          className='fx-float-badge font-serif-oriental animate-fx-float-tag'
                          style={{
                            backgroundColor:
                              junqiFx.kind === 'WIN'
                                ? '#B45309'
                                : junqiFx.kind === 'BOMB'
                                ? '#C2410C'
                                : '#991B1B',
                          }}
                        >
                          <Text>{junqiFx.label}</Text>
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
          </View>
        </View>

        {/* Symmetrical Captured Trays directly below Junqi Board */}
        <View className='captured-grid-row'>
          <JunqiCapturedTray
            side={isFlipped ? 'RED' : 'BLUE'}
            captured={isFlipped ? jq.capturedRed : jq.capturedBlue}
          />
          <JunqiCapturedTray
            side={isFlipped ? 'BLUE' : 'RED'}
            captured={isFlipped ? jq.capturedBlue : jq.capturedRed}
          />
        </View>
      </View>
    );
  }

  return null;
};
