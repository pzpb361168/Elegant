import React, { useState, useRef, useEffect } from 'react';
import type { Coord, PlayerIdentity, SanitizedRoomState } from '../shared/onlineTypes';
import { JUNQI_RANK_NAMES, XIANGQI_PIECE_LABELS } from '../shared/gameRules';
import { OnlineBoardRenderer } from './OnlineBoardRenderer';
import {
  Copy,
  Check,
  LogOut,
  Users,
  Send,
  RotateCcw,
  Handshake,
  Flag,
  Play,
  RefreshCw,
  Eye,
  Award,
  AlertCircle,
} from 'lucide-react';

interface OnlineRoomViewProps {
  room: SanitizedRoomState;
  me: PlayerIdentity;
  errorBanner: string | null;
  onLeave: () => void;
  onToggleReady: (ready: boolean) => void;
  onSwitchSeat: (seat: 1 | 2) => void;
  onGomokuMove: (r: number, c: number) => void;
  onXiangqiMove: (from: Coord, to: Coord) => void;
  onJunqiFlip: (r: number, c: number) => void;
  onJunqiMove: (from: Coord, to: Coord) => void;
  onJunqiSwapSetup: (c1: Coord, c2: Coord) => void;
  onJunqiPresetSetup: (preset: 'BALANCED' | 'FORTRESS') => void;
  onJunqiConfirmSetup: () => void;
  onRequestAction: (action: 'UNDO' | 'DRAW') => void;
  onRespondAction: (accept: boolean) => void;
  onResign: () => void;
  onRematch: () => void;
  onSendChat: (text: string) => void;
}

const QUICK_PHRASES = ['请多指教', '妙手好棋', '承让了', '容我三思', '再来一局'];

export const OnlineRoomView: React.FC<OnlineRoomViewProps> = ({
  room,
  me,
  errorBanner,
  onLeave,
  onToggleReady,
  onSwitchSeat,
  onGomokuMove,
  onXiangqiMove,
  onJunqiFlip,
  onJunqiMove,
  onJunqiSwapSetup,
  onJunqiPresetSetup,
  onJunqiConfirmSetup,
  onRequestAction,
  onRespondAction,
  onResign,
  onRematch,
  onSendChat,
}) => {
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState('');
  const [rightTab, setRightTab] = useState<'CHAT' | 'LOG'>('CHAT');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rightTab === 'CHAT') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room.chatMessages.length, rightTab]);

  const gameTitle =
    room.gameType === 'GOMOKU'
      ? '五子棋'
      : room.gameType === 'XIANGQI'
      ? '中国象棋'
      : `陆战军旗 · ${room.junqiSubMode === 'FLIP' ? '翻棋模式' : '布阵模式'}`;

  const seat1RoleName =
    room.gameType === 'GOMOKU' ? '黑方 (先手)' : '红方 (先手)';
  const seat2RoleName =
    room.gameType === 'GOMOKU'
      ? '白方 (后手)'
      : room.gameType === 'XIANGQI'
      ? '黑方 (后手)'
      : '蓝方 (后手)';

  const mySeatNumber: 1 | 2 | null =
    room.viewerRole === 'SEAT_1' ? 1 : room.viewerRole === 'SEAT_2' ? 2 : null;
  const mySeat = mySeatNumber === 1 ? room.seat1 : mySeatNumber === 2 ? room.seat2 : null;

  const isFinished = room.status === 'FINISHED';
  const isPlaying = room.status === 'PLAYING';
  const isWaiting = room.status === 'WAITING';

  const getTurnLabel = (): string => {
    if (room.status === 'WAITING') {
      if (!room.seat1.playerId || !room.seat2.playerId) return '等待棋友入座...';
      return '双方已入座，请点击「准备就绪」开始对局';
    }
    if (room.status === 'DEPLOYING') {
      return '双方正在各自半场排兵布阵...';
    }
    if (room.gameType === 'GOMOKU' && room.gomoku) {
      if (room.gomoku.winner !== null) {
        return room.gomoku.winner === 'DRAW'
          ? '对局结束：满盘和局'
          : room.gomoku.winner === 1
          ? '对局结束：黑方五子连珠获胜'
          : '对局结束：白方五子连珠获胜';
      }
      return room.gomoku.turn === 1 ? '当前行棋：黑方（主座）' : '当前行棋：白方（客座）';
    }
    if (room.gameType === 'XIANGQI' && room.xiangqi) {
      if (room.xiangqi.winner !== null) {
        return room.xiangqi.winner === 'DRAW'
          ? '对局结束：双方握手言和'
          : room.xiangqi.winner === 'RED'
          ? '对局结束：红方绝杀获胜'
          : '对局结束：黑方绝杀获胜';
      }
      const checkWarn = room.xiangqi.inCheckSide ? ' · 将军！' : '';
      return (room.xiangqi.turn === 'RED' ? '当前行棋：红方' : '当前行棋：黑方') + checkWarn;
    }
    if (room.gameType === 'JUNQI' && room.junqi) {
      return room.junqi.lastBanner;
    }
    return '';
  };

  const handleCopyInvite = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.roomId);
    navigator.clipboard
      ?.writeText(url.toString())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText.trim());
    setChatText('');
  };

  const winnerTitle = (): string | null => {
    if (!isFinished) return null;
    if (room.gameType === 'GOMOKU' && room.gomoku) {
      if (room.gomoku.winner === 'DRAW') return '旗鼓相当 · 满盘和局';
      return room.gomoku.winner === 1 ? '黑方五子连珠胜出' : '白方五子连珠胜出';
    }
    if (room.gameType === 'XIANGQI' && room.xiangqi) {
      if (room.xiangqi.winner === 'DRAW') return '双方握手言和';
      return room.xiangqi.winner === 'RED' ? '红方运筹帷幄胜出' : '黑方运筹帷幄胜出';
    }
    if (room.gameType === 'JUNQI' && room.junqi) {
      if (room.junqi.winner === 'DRAW') return '双方握手言和';
      return room.junqi.winner === 'RED' ? '红方军团夺旗凯旋' : '蓝方军团夺旗凯旋';
    }
    return '对局结束';
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Room Top Header Bar */}
      <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="px-3 py-1.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出房间
          </button>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold font-serif-oriental text-[#291D16]">
              <span>{room.roomName}</span>
              <span className="text-[#8D6E63] font-normal">·</span>
              <span className="font-mono-tabular text-[#B91C1C]">#{room.roomId}</span>
            </div>
            <div className="text-xs text-[#6E5A4F]">
              {gameTitle} · {room.isPublic ? '公开棋室' : '私密房间'} ·{' '}
              {room.viewerRole === 'SPECTATOR' ? '您当前为观战席位' : `您坐镇第 ${mySeatNumber} 席`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3.5 py-2 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制邀请链接' : '复制邀请链接'}
          </button>
        </div>
      </div>

      {/* Error Toast / Banner */}
      {errorBanner && (
        <div className="bg-[#B91C1C]/10 border border-[#B91C1C]/40 text-[#991B1B] px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Pending Undo / Draw Negotiation Banner */}
      {room.pendingRequest && (
        <div className="bg-[#FDE68A]/45 border border-[#B45309]/40 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#78350F]">
            {mySeatNumber === room.pendingRequest.fromSeat
              ? `已向对手发起「${room.pendingRequest.type === 'UNDO' ? '请求悔棋' : '提议和棋'}」，等待对方回应...`
              : `${room.pendingRequest.fromNickname} 发起了「${
                  room.pendingRequest.type === 'UNDO' ? '请求悔棋' : '提议和棋'
                }」，是否同意？`}
          </div>
          {mySeatNumber !== null && mySeatNumber !== room.pendingRequest.fromSeat && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRespondAction(true)}
                className="px-4 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                同意请求
              </button>
              <button
                type="button"
                onClick={() => onRespondAction(false)}
                className="px-4 py-1.5 rounded-lg bg-[#EFE9D8] hover:bg-[#E4DAC3] border border-[#D8CBB8] text-[#3E2723] text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                婉言谢绝
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Two-Column Grid: Board (Left 8 cols) + Desk Panel (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 flex flex-col items-center space-y-4">
          {/* Turn Status & Action Bar */}
          <div
            className={`w-full ${
              room.gameType === 'JUNQI' ? 'max-w-[760px]' : 'max-w-[600px]'
            } px-5 py-3.5 rounded-xl bg-[#EFE9D8] border border-[#D8CBB8] flex flex-wrap items-center justify-between gap-3`}
          >
            <div>
              <div className="text-sm font-semibold text-[#291D16]">{getTurnLabel()}</div>
              <div className="text-xs text-[#6E5A4F]">
                对局步数{' '}
                <span className="font-mono-tabular font-semibold">
                  {room.moveLogs.length}
                </span>
              </div>
              {room.gameType === 'JUNQI' && room.junqi && (
                <div className="text-[11px] text-[#5D4037] mt-0.5 font-medium">
                  红雷剩{' '}
                  <span className="font-mono-tabular font-bold text-[#98352E]">
                    {room.junqi.redMines}
                  </span>{' '}
                  · 蓝雷剩{' '}
                  <span className="font-mono-tabular font-bold text-[#26568B]">
                    {room.junqi.blueMines}
                  </span>{' '}
                  · 红扛旗手：
                  <span className="font-bold text-[#291D16]">
                    {room.junqi.redMinRank !== null ? JUNQI_RANK_NAMES[room.junqi.redMinRank] : '无'}
                  </span>{' '}
                  · 蓝扛旗手：
                  <span className="font-bold text-[#291D16]">
                    {room.junqi.blueMinRank !== null ? JUNQI_RANK_NAMES[room.junqi.blueMinRank] : '无'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isWaiting && mySeat && (
                <button
                  type="button"
                  onClick={() => onToggleReady(!mySeat.ready)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                    mySeat.ready
                      ? 'bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723]'
                      : 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {mySeat.ready ? '取消准备' : '准备就绪'}
                </button>
              )}

              {isPlaying && mySeatNumber !== null && (
                <>
                  <button
                    type="button"
                    disabled={room.moveLogs.length === 0 || room.pendingRequest !== null}
                    onClick={() => onRequestAction('UNDO')}
                    className="px-3 py-1.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] disabled:opacity-40 text-[#3E2723] text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    请求悔棋
                  </button>
                  <button
                    type="button"
                    disabled={room.pendingRequest !== null}
                    onClick={() => onRequestAction('DRAW')}
                    className="px-3 py-1.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] disabled:opacity-40 text-[#3E2723] text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Handshake className="w-3.5 h-3.5" />
                    提议和棋
                  </button>
                  <button
                    type="button"
                    onClick={onResign}
                    className="px-3 py-1.5 rounded-lg border border-[#B91C1C]/50 text-[#B91C1C] hover:bg-[#B91C1C]/10 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    认负
                  </button>
                </>
              )}

              {isFinished && mySeatNumber !== null && (
                <button
                  type="button"
                  onClick={onRematch}
                  className="px-4 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  再来一局
                </button>
              )}
            </div>
          </div>

          {/* Interactive Board + Post-Match Summary Banner */}
          <div className="relative w-full flex flex-col items-center">
            <OnlineBoardRenderer
              room={room}
              onGomokuMove={onGomokuMove}
              onXiangqiMove={onXiangqiMove}
              onJunqiFlip={onJunqiFlip}
              onJunqiMove={onJunqiMove}
              onJunqiSwapSetup={onJunqiSwapSetup}
              onJunqiPresetSetup={onJunqiPresetSetup}
              onJunqiConfirmSetup={onJunqiConfirmSetup}
            />

            {isFinished && (
              <div className="mt-4 w-full max-w-[600px] bg-[#EFE9D8] border-2 border-[#B91C1C]/60 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-base font-bold font-serif-oriental text-[#291D16]">
                      {winnerTitle()}
                    </div>
                    <div className="text-xs text-[#6E5A4F]">
                      共交锋 {room.moveLogs.length} 回合 · 可在棋盘检视终局或直接邀请再战
                    </div>
                  </div>
                </div>
                {mySeatNumber !== null && (
                  <button
                    type="button"
                    onClick={onRematch}
                    className="px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    发起再来一局
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Desk Panel: Seats, Spectators, Chat & Move Logs */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Two Player Seats + Spectators Card */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-2.5">
              <h2 className="text-base font-bold font-serif-oriental text-[#291D16]">
                棋席对坐与观战
              </h2>
              <span className="text-xs text-[#6E5A4F] flex items-center gap-1 font-mono-tabular">
                <Eye className="w-3.5 h-3.5" />
                观战 {room.spectators.length} 人
              </span>
            </div>

            {/* Seat 1 & Seat 2 */}
            {([room.seat1, room.seat2] as const).map((seat) => {
              const roleLabel = seat.seatNumber === 1 ? seat1RoleName : seat2RoleName;
              const isMe = seat.playerId === me.playerId;
              return (
                <div
                  key={seat.seatNumber}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                    isMe
                      ? 'bg-[#F7F3E8] border-[#B91C1C]/60'
                      : 'bg-[#F7F3E8]/70 border-[#D8CBB8]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#6E5A4F]">
                      <span className="font-semibold text-[#3E2723]">{roleLabel}</span>
                      {seat.playerId && (
                        <span>
                          · {seat.connected ? '在线' : '离线重连中'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-[#291D16] truncate mt-0.5">
                      {seat.nickname ? (
                        <>
                          {seat.nickname}
                          {isMe && <span className="text-xs font-normal text-[#B91C1C] ml-1.5">(我)</span>}
                        </>
                      ) : (
                        <span className="text-xs font-normal text-[#8D6E63]">虚位以待</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {seat.playerId ? (
                      isWaiting && (
                        <span
                          className={`text-xs font-semibold ${
                            seat.ready ? 'text-[#0F766E]' : 'text-[#8D6E63]'
                          }`}
                        >
                          {seat.ready ? '已准备' : '未准备'}
                        </span>
                      )
                    ) : (
                      isWaiting &&
                      room.viewerRole === 'SPECTATOR' && (
                        <button
                          type="button"
                          onClick={() => onSwitchSeat(seat.seatNumber)}
                          className="px-3 py-1 rounded bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-medium cursor-pointer whitespace-nowrap"
                        >
                          入座
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {/* Xiangqi Captured Pieces Summary */}
            {room.gameType === 'XIANGQI' && room.xiangqi && (
              <div className="p-2.5 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[#B91C1C] font-medium">红方斩获:</span>
                  {room.xiangqi.capturedBlack.length === 0 ? (
                    <span className="text-[#8D6E63]">暂无</span>
                  ) : (
                    room.xiangqi.capturedBlack.map((p, i) => (
                      <span key={i} className="font-serif-oriental font-bold text-[#1E293B]">
                        {XIANGQI_PIECE_LABELS.BLACK[p.type]}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[#1E293B] font-medium">黑方斩获:</span>
                  {room.xiangqi.capturedRed.length === 0 ? (
                    <span className="text-[#8D6E63]">暂无</span>
                  ) : (
                    room.xiangqi.capturedRed.map((p, i) => (
                      <span key={i} className="font-serif-oriental font-bold text-[#B91C1C]">
                        {XIANGQI_PIECE_LABELS.RED[p.type]}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Spectators list */}
            {room.spectators.length > 0 && (
              <div className="text-xs text-[#6E5A4F] pt-1 flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>观战棋友：</span>
                {room.spectators.map((s) => (
                  <span key={s.playerId} className="text-[#3E2723] font-medium">
                    {s.nickname}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right Bottom Panel: Segmented Tabs for Chat vs Move Log */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 flex flex-col h-[410px]">
            <div className="flex items-center gap-1 p-1 bg-[#E4DAC3] rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setRightTab('CHAT')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  rightTab === 'CHAT'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                雅谈交流 ({room.chatMessages.length})
              </button>
              <button
                type="button"
                onClick={() => setRightTab('LOG')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  rightTab === 'LOG'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                实时棋谱 ({room.moveLogs.length})
              </button>
            </div>

            {rightTab === 'CHAT' ? (
              <>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
                  {room.chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-[#8D6E63]">
                      暂无言谈，发一句「请多指教」致意吧
                    </div>
                  ) : (
                    room.chatMessages.map((msg) => {
                      const isSys = msg.senderId === 'SYSTEM';
                      const isMine = msg.senderId === me.playerId;
                      if (isSys) {
                        return (
                          <div
                            key={msg.id}
                            className="text-[11px] text-center text-[#7C5332] bg-[#E4DAC3]/50 rounded py-1 px-2"
                          >
                            {msg.text}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={msg.id}
                          className={`rounded-lg px-3 py-2 text-xs ${
                            isMine
                              ? 'bg-[#3E2723] text-[#F7F3E8] ml-6'
                              : 'bg-[#F7F3E8] text-[#291D16] mr-6 border border-[#D8CBB8]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 mb-0.5">
                            <span>
                              {msg.senderName} · {msg.roleLabel}
                            </span>
                            <span className="font-mono-tabular">{msg.timestamp}</span>
                          </div>
                          <div className="break-words">{msg.text}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Phrases */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {QUICK_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => onSendChat(phrase)}
                      className="px-2 py-1 rounded bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-[11px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                {/* Chat Input */}
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    maxLength={160}
                    placeholder="输入雅谈内容..."
                    className="flex-1 px-3 py-2 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] text-xs text-[#291D16] focus:outline-none focus:border-[#7C5332]"
                  />
                  <button
                    type="submit"
                    disabled={!chatText.trim()}
                    className="px-3 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    发送
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {room.moveLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[#8D6E63]">
                    棋局尚未落子
                  </div>
                ) : (
                  room.moveLogs.map((log) => (
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
                      <span className="text-[11px] font-mono-tabular text-[#8D6E63]">
                        {log.timestamp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
