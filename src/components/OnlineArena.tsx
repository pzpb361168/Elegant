import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ClientToServerMessage,
  JunqiSubMode,
  OnlineGameType,
  PlayerIdentity,
  PublicRoomSummary,
  SanitizedRoomState,
  ServerToClientMessage,
} from '../shared/onlineTypes';
import {
  generateRandomAlias,
  getOrCreatePlayerIdentity,
  savePlayerNickname,
} from '../utils/playerIdentity';
import { soundFX } from '../utils/sound';
import { OnlineRoomView } from './OnlineRoomView';
import {
  Plus,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  DoorOpen,
  Dice5,
  Eye,
  AlertCircle,
} from 'lucide-react';

interface OnlineArenaProps {
  initialRoomCode?: string | null;
  onRoomUrlSync?: (roomId: string | null) => void;
}

export const OnlineArena: React.FC<OnlineArenaProps> = ({
  initialRoomCode,
  onRoomUrlSync,
}) => {
  const [identity, setIdentity] = useState<PlayerIdentity>(() => getOrCreatePlayerIdentity());
  const [nicknameDraft, setNicknameDraft] = useState<string>(identity.nickname);
  const [nicknameSavedNotice, setNicknameSavedNotice] = useState<boolean>(false);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SanitizedRoomState | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Create room form state
  const [createGame, setCreateGame] = useState<OnlineGameType>('GOMOKU');
  const [createJunqiSub, setCreateJunqiSub] = useState<JunqiSubMode>('FLIP');
  const [createPublic, setCreatePublic] = useState<boolean>(true);
  const [createRoomName, setCreateRoomName] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>(initialRoomCode || '');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pendingRoomJoinRef = useRef<string | null>(initialRoomCode || null);
  const activeRoomRef = useRef<SanitizedRoomState | null>(null);
  const identityRef = useRef<PlayerIdentity>(identity);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const showError = useCallback((text: string) => {
    setErrorBanner(text);
    window.setTimeout(() => {
      setErrorBanner((curr) => (curr === text ? null : curr));
    }, 4000);
  }, []);

  // Connect WebSocket with automatic reconnection & state resync
  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) {
          ws.close();
          return;
        }
        setWsConnected(true);
        const me = identityRef.current;
        ws.send(JSON.stringify({ type: 'lobby:subscribe', player: me } satisfies ClientToServerMessage));

        const targetRoom = activeRoomRef.current?.roomId || pendingRoomJoinRef.current;
        if (targetRoom) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              player: me,
              roomId: targetRoom,
            } satisfies ClientToServerMessage)
          );
          pendingRoomJoinRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerToClientMessage;
          if (msg.type === 'lobby:rooms_update') {
            setPublicRooms(msg.rooms);
            setOnlineUsers(msg.onlineUsers);
          } else if (msg.type === 'room:joined') {
            setActiveRoom(msg.state);
            onRoomUrlSync?.(msg.roomId);
            soundFX.playSelect();
          } else if (msg.type === 'room:state_sync') {
            const prev = activeRoomRef.current;
            const next = msg.state;
            const prevSteps = prev?.moveLogs.length ?? 0;
            const nextSteps = next.moveLogs.length;

            if (nextSteps > prevSteps && prev?.roomId === next.roomId) {
              if (next.gameType === 'GOMOKU' && next.gomoku) {
                if (next.status === 'FINISHED' && next.gomoku.winner !== 'DRAW') {
                  soundFX.playGomokuWin();
                } else {
                  soundFX.playGomokuPlace();
                }
              } else if (next.gameType === 'XIANGQI' && next.xiangqi) {
                const prevCap =
                  (prev?.xiangqi?.capturedRed.length ?? 0) +
                  (prev?.xiangqi?.capturedBlack.length ?? 0);
                const nextCap =
                  next.xiangqi.capturedRed.length + next.xiangqi.capturedBlack.length;
                if (next.status === 'FINISHED' && next.xiangqi.winner !== null) {
                  soundFX.playVictory();
                } else if (next.xiangqi.inCheckSide !== null) {
                  soundFX.playXiangqiCheck();
                } else if (nextCap > prevCap) {
                  soundFX.playXiangqiCapture();
                } else {
                  soundFX.playXiangqiMove();
                }
              } else if (next.gameType === 'JUNQI' && next.junqi) {
                const jq = next.junqi;
                const isFlip =
                  jq.lastMove !== null &&
                  jq.lastMove.from.r === jq.lastMove.to.r &&
                  jq.lastMove.from.c === jq.lastMove.to.c;
                if (next.status === 'FINISHED' && jq.winner !== null) {
                  soundFX.playVictory();
                } else if (isFlip) {
                  soundFX.playJunqiFlip();
                } else if (
                  jq.lastBanner.includes('爆破清雷') ||
                  jq.lastBanner.includes('强行排雷成功') ||
                  jq.lastBanner.includes('同归于尽')
                ) {
                  soundFX.playJunqiClash('BOMB');
                } else if (
                  jq.lastBanner.includes('已受创') ||
                  jq.lastBanner.includes('阵亡') ||
                  jq.lastBanner.includes('失利')
                ) {
                  soundFX.playJunqiClash('LOSS');
                } else if (
                  jq.lastBanner.includes('拔得敌旗') ||
                  jq.lastBanner.includes('排雷成功') ||
                  jq.lastBanner.includes('击溃') ||
                  jq.lastBanner.includes('告捷') ||
                  jq.lastBanner.includes('得手')
                ) {
                  soundFX.playJunqiClash('WIN');
                } else {
                  soundFX.playJunqiMove();
                }
              }
            }
            setActiveRoom(next);
          } else if (msg.type === 'room:chat_message') {
            setActiveRoom((prev) => {
              if (!prev || prev.roomId !== msg.roomId) return prev;
              // Idempotency guard against duplicate message IDs
              if (prev.chatMessages.some((m) => m.id === msg.message.id)) return prev;
              return {
                ...prev,
                chatMessages: [...prev.chatMessages, msg.message],
              };
            });
          } else if (msg.type === 'room:left') {
            setActiveRoom(null);
            onRoomUrlSync?.(null);
          } else if (msg.type === 'room:error') {
            showError(msg.message);
            soundFX.playCheck();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          reconnectTimerRef.current = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [onRoomUrlSync, showError]);

  const handleSaveNickname = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = savePlayerNickname(nicknameDraft);
    setIdentity(updated);
    setNicknameDraft(updated.nickname);
    sendWs({ type: 'lobby:subscribe', player: updated });
    setNicknameSavedNotice(true);
    setTimeout(() => setNicknameSavedNotice(false), 1800);
    soundFX.playSelect();
  };

  const handleRandomAlias = () => {
    const alias = generateRandomAlias();
    setNicknameDraft(alias);
    const updated = savePlayerNickname(alias);
    setIdentity(updated);
    sendWs({ type: 'lobby:subscribe', player: updated });
    soundFX.playSelect();
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsConnected) {
      showError('正在连接联机服务器，请稍候...');
      return;
    }
    sendWs({
      type: 'room:create',
      player: identity,
      gameType: createGame,
      junqiSubMode: createGame === 'JUNQI' ? createJunqiSub : undefined,
      isPublic: createPublic,
      roomName: createRoomName.trim() || undefined,
    });
  };

  const handleJoinRoom = (roomId: string) => {
    const clean = roomId.trim().toUpperCase();
    if (!clean) return;
    if (!wsConnected) {
      pendingRoomJoinRef.current = clean;
      showError('正在连接联机服务器，连接成功后将自动入房');
      return;
    }
    sendWs({
      type: 'room:join',
      player: identity,
      roomId: clean,
    });
  };

  // Render active room if joined
  if (activeRoom) {
    return (
      <OnlineRoomView
        room={activeRoom}
        me={identity}
        errorBanner={errorBanner}
        onLeave={() => {
          sendWs({ type: 'room:leave', playerId: identity.playerId, roomId: activeRoom.roomId });
          setActiveRoom(null);
          onRoomUrlSync?.(null);
        }}
        onToggleReady={(ready) =>
          sendWs({ type: 'room:ready', playerId: identity.playerId, roomId: activeRoom.roomId, ready })
        }
        onSwitchSeat={(seatNumber) =>
          sendWs({
            type: 'room:switch_to_seat',
            player: identity,
            roomId: activeRoom.roomId,
            seatNumber,
          })
        }
        onGomokuMove={(r, c) =>
          sendWs({
            type: 'game:move',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            payload: { kind: 'GOMOKU', r, c },
          })
        }
        onXiangqiMove={(from, to) =>
          sendWs({
            type: 'game:move',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            payload: { kind: 'XIANGQI', from, to },
          })
        }
        onJunqiFlip={(r, c) =>
          sendWs({
            type: 'game:move',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            payload: { kind: 'JUNQI_FLIP', r, c },
          })
        }
        onJunqiMove={(from, to) =>
          sendWs({
            type: 'game:move',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            payload: { kind: 'JUNQI_MOVE', from, to },
          })
        }
        onJunqiSwapSetup={(c1, c2) =>
          sendWs({
            type: 'junqi:swap_setup',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            c1,
            c2,
          })
        }
        onJunqiPresetSetup={(preset) =>
          sendWs({
            type: 'junqi:preset_setup',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            preset,
          })
        }
        onJunqiConfirmSetup={() =>
          sendWs({
            type: 'junqi:confirm_setup',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
          })
        }
        onRequestAction={(action) =>
          sendWs({
            type: 'game:request_action',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            action,
          })
        }
        onRespondAction={(accept) =>
          sendWs({
            type: 'game:respond_action',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            accept,
          })
        }
        onResign={() =>
          sendWs({ type: 'game:resign', playerId: identity.playerId, roomId: activeRoom.roomId })
        }
        onRematch={() =>
          sendWs({ type: 'game:rematch', playerId: identity.playerId, roomId: activeRoom.roomId })
        }
        onSendChat={(text) =>
          sendWs({
            type: 'chat:send',
            playerId: identity.playerId,
            roomId: activeRoom.roomId,
            text,
          })
        }
      />
    );
  }

  // Render Online Multiplayer Lobby
  const gameNameMap: Record<OnlineGameType, string> = {
    GOMOKU: '五子棋',
    XIANGQI: '中国象棋',
    JUNQI: '陆战军旗',
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Identity & Connection Bar */}
      <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif-oriental text-[#291D16]">
              联机弈馆 · 跨海手谈
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                wsConnected ? 'text-[#0F766E]' : 'text-[#B91C1C]'
              }`}
            >
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wsConnected ? `已联机 · 在线 ${onlineUsers} 人` : '正在重连服务器...'}
            </span>
          </div>
          <p className="text-xs text-[#5D4037]">
            创建棋室分享邀请链接给好友，或直接加入下方公开对局；支持全棋种实时同步、悔棋协商与观战雅谈
          </p>
        </div>

        {/* Nickname Setter */}
        <form onSubmit={handleSaveNickname} className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-[#5D4037]">我的雅号：</label>
          <input
            type="text"
            value={nicknameDraft}
            onChange={(e) => setNicknameDraft(e.target.value)}
            maxLength={16}
            placeholder="输入对局昵称"
            className="px-3 py-2 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] text-xs font-semibold text-[#291D16] w-36 focus:outline-none focus:border-[#7C5332]"
          />
          <button
            type="button"
            onClick={handleRandomAlias}
            title="随机雅号"
            className="p-2 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] cursor-pointer"
          >
            <Dice5 className="w-4 h-4" />
          </button>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {nicknameSavedNotice ? '已更新' : '确认雅号'}
          </button>
        </form>
      </div>

      {errorBanner && (
        <div className="bg-[#B91C1C]/10 border border-[#B91C1C]/40 text-[#991B1B] px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 cols: Create Room & Join by Code */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Join by Code */}
          <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5">
            <h2 className="text-base font-bold font-serif-oriental text-[#291D16] mb-3">
              凭房间号入席
            </h2>
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="输入 6 位房间号 (如 A3B9K2)"
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] text-xs font-mono-tabular uppercase text-[#291D16] focus:outline-none focus:border-[#7C5332]"
              />
              <button
                type="button"
                disabled={!joinCodeInput.trim()}
                onClick={() => handleJoinRoom(joinCodeInput)}
                className="px-4 py-2.5 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <DoorOpen className="w-3.5 h-3.5" />
                加入房间
              </button>
            </div>
          </div>

          {/* Create New Room Form */}
          <form
            onSubmit={handleCreateRoom}
            className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 space-y-4"
          >
            <div className="border-b border-[#D8CBB8] pb-2.5">
              <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">
                开设新棋室
              </h2>
              <p className="text-xs text-[#6E5A4F]">选择棋种与规则，即刻生成邀请房间</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5D4037] mb-2">选择棋种</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
                {(['GOMOKU', 'XIANGQI', 'JUNQI'] as OnlineGameType[]).map((gt) => (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setCreateGame(gt)}
                    className={`py-2 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      createGame === gt
                        ? 'bg-[#B91C1C] text-white shadow-sm'
                        : 'text-[#4E342E] hover:text-[#291D16]'
                    }`}
                  >
                    {gameNameMap[gt]}
                  </button>
                ))}
              </div>
            </div>

            {createGame === 'JUNQI' && (
              <div>
                <label className="block text-xs font-semibold text-[#5D4037] mb-2">
                  军旗玩法规则
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCreateJunqiSub('FLIP')}
                    className={`py-1.5 px-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      createJunqiSub === 'FLIP'
                        ? 'bg-[#3E2723] text-[#F7F3E8]'
                        : 'text-[#4E342E]'
                    }`}
                  >
                    随机翻棋模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateJunqiSub('DEPLOY')}
                    className={`py-1.5 px-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      createJunqiSub === 'DEPLOY'
                        ? 'bg-[#3E2723] text-[#F7F3E8]'
                        : 'text-[#4E342E]'
                    }`}
                  >
                    暗棋布阵模式
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#5D4037] mb-2">
                房间名称（可选）
              </label>
              <input
                type="text"
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
                maxLength={24}
                placeholder={`${identity.nickname}的${gameNameMap[createGame]}室`}
                className="w-full px-3.5 py-2 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] text-xs text-[#291D16] focus:outline-none focus:border-[#7C5332]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5D4037] mb-2">房间可见性</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
                <button
                  type="button"
                  onClick={() => setCreatePublic(true)}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    createPublic ? 'bg-[#3E2723] text-[#F7F3E8]' : 'text-[#4E342E]'
                  }`}
                >
                  公开大厅可见
                </button>
                <button
                  type="button"
                  onClick={() => setCreatePublic(false)}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    !createPublic ? 'bg-[#3E2723] text-[#F7F3E8]' : 'text-[#4E342E]'
                  }`}
                >
                  私密（仅邀请链接）
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              创建房间并入座
            </button>
          </form>
        </div>

        {/* Right 7 cols: Public Room Lobby List */}
        <div className="lg:col-span-7 bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-6 min-h-[460px] flex flex-col">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">
                公开棋室大厅
              </h2>
              <p className="text-xs text-[#6E5A4F]">
                实时同步当前开放的棋局，点击即可入座对弈或旁观观战
              </p>
            </div>
            <button
              type="button"
              onClick={() => sendWs({ type: 'lobby:subscribe', player: identity })}
              className="px-3 py-1.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新列表
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-2">
              <Users className="w-8 h-8 text-[#8D6E63]/70" />
              <div className="text-sm font-semibold text-[#4E342E]">
                当前大厅暂无公开棋室
              </div>
              <p className="text-xs text-[#8D6E63]">
                您可在左侧开设一间公开棋室，或生成邀请链接邀好友前来手谈
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {publicRooms.map((room) => {
                const isJoinable = room.status === 'WAITING' && room.playerCount < 2;
                const statusLabel =
                  room.status === 'WAITING'
                    ? '等待棋友'
                    : room.status === 'DEPLOYING'
                    ? '布阵中'
                    : room.status === 'PLAYING'
                    ? '激战中'
                    : '已终局';

                return (
                  <div
                    key={room.roomId}
                    className="bg-[#F7F3E8] border border-[#D8CBB8] hover:border-[#8D6E63] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-serif-oriental font-bold text-base text-[#291D16]">
                          {room.roomName}
                        </span>
                        <span className="text-xs font-mono-tabular text-[#8D6E63]">
                          #{room.roomId}
                        </span>
                      </div>
                      <div className="text-xs text-[#6E5A4F]">
                        <span className="font-semibold text-[#B91C1C]">
                          {gameNameMap[room.gameType]}
                          {room.gameType === 'JUNQI' &&
                            ` (${room.junqiSubMode === 'DEPLOY' ? '布阵' : '翻棋'})`}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>房主：{room.hostNickname}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">{room.playerCount}/2 席</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">{room.spectatorCount} 人观战</span>
                        <span aria-hidden="true"> · </span>
                        <span className={isJoinable ? 'text-[#0F766E] font-semibold' : ''}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleJoinRoom(room.roomId)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                        isJoinable
                          ? 'bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8]'
                          : 'bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723]'
                      }`}
                    >
                      {isJoinable ? (
                        <>
                          <DoorOpen className="w-3.5 h-3.5" />
                          入座对弈
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          进入观战
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
