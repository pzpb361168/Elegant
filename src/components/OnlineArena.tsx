import React, { useState, useEffect, useRef, useCallback } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Button, Input } from '@tarojs/components';
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
import { DEFAULT_WS_SERVER_URL, getSavedWsUrl, saveWsUrl } from '../utils/wsConfig';
import { soundFX } from '../utils/sound';
import { OnlineRoomView } from './OnlineRoomView';

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

  const [wsUrl, setWsUrl] = useState<string>(getSavedWsUrl);
  const [wsUrlDraft, setWsUrlDraft] = useState<string>(getSavedWsUrl);
  const [showWsConfig, setShowWsConfig] = useState<boolean>(false);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SanitizedRoomState | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [createGame, setCreateGame] = useState<OnlineGameType>('GOMOKU');
  const [createJunqiSub, setCreateJunqiSub] = useState<JunqiSubMode>('FLIP');
  const [createPublic, setCreatePublic] = useState<boolean>(true);
  const [createRoomName, setCreateRoomName] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>(initialRoomCode || '');

  const socketTaskRef = useRef<Taro.SocketTask | null>(null);
  const isOpenRef = useRef<boolean>(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRoomJoinRef = useRef<string | null>(initialRoomCode || null);
  const activeRoomRef = useRef<SanitizedRoomState | null>(null);
  const identityRef = useRef<PlayerIdentity>(identity);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    if (initialRoomCode) {
      setJoinCodeInput(initialRoomCode);
      pendingRoomJoinRef.current = initialRoomCode;
    }
  }, [initialRoomCode]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const task = socketTaskRef.current;
    if (task && isOpenRef.current) {
      task.send({ data: JSON.stringify(msg) });
    }
  }, []);

  const showError = useCallback((text: string) => {
    setErrorBanner(text);
    setTimeout(() => {
      setErrorBanner((curr) => (curr === text ? null : curr));
    }, 4000);
  }, []);

  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      if (socketTaskRef.current) {
        try {
          socketTaskRef.current.close({});
        } catch {
          // Ignore
        }
        socketTaskRef.current = null;
      }
      isOpenRef.current = false;

      Promise.resolve(Taro.connectSocket({ url: wsUrl }))
        .then((task) => {
          if (unmounted) {
            try {
              task.close({});
            } catch {
              // Ignore
            }
            return;
          }
          socketTaskRef.current = task;

          task.onOpen(() => {
            if (unmounted) {
              task.close({});
              return;
            }
            isOpenRef.current = true;
            setWsConnected(true);
            const me = identityRef.current;
            task.send({
              data: JSON.stringify({
                type: 'lobby:subscribe',
                player: me,
              } satisfies ClientToServerMessage),
            });

            const targetRoom = activeRoomRef.current?.roomId || pendingRoomJoinRef.current;
            if (targetRoom) {
              task.send({
                data: JSON.stringify({
                  type: 'room:join',
                  player: me,
                  roomId: targetRoom,
                } satisfies ClientToServerMessage),
              });
              pendingRoomJoinRef.current = null;
            }
          });

          task.onMessage((res) => {
            try {
              const rawStr = typeof res.data === 'string' ? res.data : '';
              if (!rawStr) return;
              const msg = JSON.parse(rawStr) as ServerToClientMessage;
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
              // Ignore malformed message
            }
          });

          task.onClose(() => {
            isOpenRef.current = false;
            setWsConnected(false);
            if (!unmounted) {
              reconnectTimerRef.current = setTimeout(connect, 2500);
            }
          });

          task.onError(() => {
            isOpenRef.current = false;
            setWsConnected(false);
          });
        })
        .catch(() => {
          isOpenRef.current = false;
          setWsConnected(false);
          if (!unmounted) {
            reconnectTimerRef.current = setTimeout(connect, 2500);
          }
        });
    };

    connect();

    return () => {
      unmounted = true;
      isOpenRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketTaskRef.current) {
        try {
          socketTaskRef.current.close({});
        } catch {
          // Ignore
        }
        socketTaskRef.current = null;
      }
    };
  }, [wsUrl, onRoomUrlSync, showError]);

  const handleSaveNickname = () => {
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

  const handleApplyWsUrl = () => {
    const res = saveWsUrl(wsUrlDraft);
    if (!res.ok) {
      showError(res.error);
      return;
    }
    setWsUrl(res.url);
    setWsUrlDraft(res.url);
    setShowWsConfig(false);
    soundFX.playSelect();
  };

  const handleCreateRoom = () => {
    if (!wsConnected) {
      showError('尚未连上联机服务器，请在上方检查服务端 WS 地址并确认 server.ts 已启动');
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
      showError('正在连接联机服务器，连上后将自动加入房间');
      return;
    }
    sendWs({
      type: 'room:join',
      player: identity,
      roomId: clean,
    });
  };

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

  const gameNameMap: Record<OnlineGameType, string> = {
    GOMOKU: '五子棋',
    XIANGQI: '中国象棋',
    JUNQI: '陆战军旗',
  };

  return (
    <View className='page-container'>
      {/* Connection & Identity Card */}
      <View className='card-panel'>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12rpx' }}>
          <Text className='font-serif-oriental' style={{ fontSize: '34rpx', fontWeight: 700, color: '#291D16' }}>
            联机弈馆 · 跨海手谈
          </Text>
          <Text
            style={{
              fontSize: '22rpx',
              fontWeight: 600,
              color: wsConnected ? '#0F766E' : '#B91C1C',
            }}
          >
            {wsConnected ? `已联机 · 在线 ${onlineUsers} 人` : '未连上服务器'}
          </Text>
        </View>
        <Text style={{ fontSize: '22rpx', color: '#5D4037', display: 'block', lineHeight: '1.55', marginBottom: '18rpx' }}>
          开设棋室并转发给微信好友，或输入房间号直接入座；支持全棋种实时同步、悔棋和棋协商与观战雅谈。
        </Text>

        {/* Nickname Row */}
        <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx', marginBottom: '16rpx' }}>
          <Input
            value={nicknameDraft}
            onInput={(e) => setNicknameDraft(e.detail.value)}
            maxlength={16}
            placeholder='输入我的雅号'
            className='input-field'
            style={{ flex: 1 }}
          />
          <Button onClick={handleRandomAlias} className='btn-soft'>
            随机
          </Button>
          <Button onClick={handleSaveNickname} className='btn-primary-dark'>
            {nicknameSavedNotice ? '已更新' : '保存'}
          </Button>
        </View>

        {/* Configurable WebSocket Endpoint Panel */}
        <View className='sub-panel'>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12rpx' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: '21rpx', color: '#6E5A4F', display: 'block' }}>
                当前联机服务端 (WebSocket)
              </Text>
              <Text className='font-mono-tabular' style={{ fontSize: '21rpx', color: '#291D16', wordBreak: 'break-all' }}>
                {wsUrl}
              </Text>
            </View>
            <Button onClick={() => setShowWsConfig(!showWsConfig)} className='btn-soft'>
              {showWsConfig ? '收起' : '设置地址'}
            </Button>
          </View>

          {showWsConfig && (
            <View style={{ marginTop: '14rpx', paddingTop: '14rpx', borderTop: '2rpx solid #D8CBB8' }}>
              <Input
                value={wsUrlDraft}
                onInput={(e) => setWsUrlDraft(e.detail.value)}
                placeholder='ws://127.0.0.1:3000/ws 或 wss://域名/ws'
                className='input-field'
                style={{ width: '100%', marginBottom: '12rpx' }}
              />
              <View style={{ display: 'flex', gap: '12rpx' }}>
                <Button
                  onClick={() => setWsUrlDraft(DEFAULT_WS_SERVER_URL)}
                  className='btn-soft'
                  style={{ flex: 1 }}
                >
                  恢复默认
                </Button>
                <Button onClick={handleApplyWsUrl} className='btn-jade' style={{ flex: 1 }}>
                  保存并重连
                </Button>
              </View>
            </View>
          )}
        </View>
      </View>

      {errorBanner && (
        <View
          style={{
            backgroundColor: 'rgba(185, 28, 28, 0.1)',
            border: '2rpx solid rgba(185, 28, 28, 0.45)',
            color: '#991B1B',
            padding: '18rpx 22rpx',
            borderRadius: '16rpx',
            fontSize: '23rpx',
            fontWeight: 600,
          }}
        >
          <Text>{errorBanner}</Text>
        </View>
      )}

      {/* Join by Room Code */}
      <View className='card-panel'>
        <Text className='section-title font-serif-oriental' style={{ display: 'block', marginBottom: '14rpx' }}>
          凭房间号入席
        </Text>
        <View style={{ display: 'flex', gap: '12rpx', alignItems: 'center' }}>
          <Input
            value={joinCodeInput}
            onInput={(e) => setJoinCodeInput(e.detail.value.toUpperCase())}
            maxlength={8}
            placeholder='输入 6 位房间号 (如 A3B9K2)'
            className='input-field font-mono-tabular'
            style={{ flex: 1 }}
          />
          <Button
            disabled={!joinCodeInput.trim()}
            onClick={() => handleJoinRoom(joinCodeInput)}
            className={`btn-jade ${!joinCodeInput.trim() ? 'btn-disabled' : ''}`}
          >
            加入房间
          </Button>
        </View>
      </View>

      {/* Create New Room */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <View>
            <Text className='section-title font-serif-oriental'>开设新棋室</Text>
            <Text className='section-subtitle' style={{ display: 'block' }}>
              选择棋种与规则，即刻生成邀请房间
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: '18rpx' }}>
          <Text style={{ fontSize: '23rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '8rpx' }}>
            选择棋种
          </Text>
          <View className='segment-group'>
            {(['GOMOKU', 'XIANGQI', 'JUNQI'] as OnlineGameType[]).map((gt) => (
              <Button
                key={gt}
                onClick={() => setCreateGame(gt)}
                className={`segment-btn ${createGame === gt ? 'segment-btn--red' : ''}`}
              >
                {gameNameMap[gt]}
              </Button>
            ))}
          </View>
        </View>

        {createGame === 'JUNQI' && (
          <View style={{ marginBottom: '18rpx' }}>
            <Text style={{ fontSize: '23rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '8rpx' }}>
              军旗玩法规则
            </Text>
            <View className='segment-group'>
              <Button
                onClick={() => setCreateJunqiSub('FLIP')}
                className={`segment-btn ${createJunqiSub === 'FLIP' ? 'segment-btn--dark' : ''}`}
              >
                随机翻棋模式
              </Button>
              <Button
                onClick={() => setCreateJunqiSub('DEPLOY')}
                className={`segment-btn ${createJunqiSub === 'DEPLOY' ? 'segment-btn--dark' : ''}`}
              >
                暗棋布阵模式
              </Button>
            </View>
          </View>
        )}

        <View style={{ marginBottom: '18rpx' }}>
          <Text style={{ fontSize: '23rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '8rpx' }}>
            房间名称（可选）
          </Text>
          <Input
            value={createRoomName}
            onInput={(e) => setCreateRoomName(e.detail.value)}
            maxlength={24}
            placeholder={`${identity.nickname}的${gameNameMap[createGame]}室`}
            className='input-field'
            style={{ width: '100%' }}
          />
        </View>

        <View style={{ marginBottom: '22rpx' }}>
          <Text style={{ fontSize: '23rpx', fontWeight: 600, color: '#5D4037', display: 'block', marginBottom: '8rpx' }}>
            房间可见性
          </Text>
          <View className='segment-group'>
            <Button
              onClick={() => setCreatePublic(true)}
              className={`segment-btn ${createPublic ? 'segment-btn--dark' : ''}`}
            >
              公开大厅可见
            </Button>
            <Button
              onClick={() => setCreatePublic(false)}
              className={`segment-btn ${!createPublic ? 'segment-btn--dark' : ''}`}
            >
              私密（仅邀请）
            </Button>
          </View>
        </View>

        <Button onClick={handleCreateRoom} className='btn-primary-red' style={{ width: '100%' }}>
          创建房间并入座
        </Button>
      </View>

      {/* Public Rooms List */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <View>
            <Text className='section-title font-serif-oriental'>公开棋室大厅</Text>
            <Text className='section-subtitle' style={{ display: 'block' }}>
              实时同步当前开放的棋局
            </Text>
          </View>
          <Button
            onClick={() => sendWs({ type: 'lobby:subscribe', player: identity })}
            className='btn-soft'
          >
            刷新
          </Button>
        </View>

        {publicRooms.length === 0 ? (
          <View style={{ padding: '44rpx 0', textAlign: 'center' }}>
            <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#4E342E', display: 'block', marginBottom: '8rpx' }}>
              当前大厅暂无公开棋室
            </Text>
            <Text style={{ fontSize: '22rpx', color: '#8D6E63' }}>
              请在上方开设新棋室，或邀请微信好友入座
            </Text>
          </View>
        ) : (
          <View style={{ display: 'flex', flexDirection: 'column', gap: '14rpx' }}>
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
                <View
                  key={room.roomId}
                  className='sub-panel'
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14rpx' }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx' }}>
                      <Text className='font-serif-oriental' style={{ fontSize: '27rpx', fontWeight: 700, color: '#291D16' }}>
                        {room.roomName}
                      </Text>
                      <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#8D6E63' }}>
                        #{room.roomId}
                      </Text>
                    </View>
                    <Text style={{ fontSize: '21rpx', color: '#6E5A4F', display: 'block', marginTop: '6rpx' }}>
                      {gameNameMap[room.gameType]}
                      {room.gameType === 'JUNQI' &&
                        `(${room.junqiSubMode === 'DEPLOY' ? '布阵' : '翻棋'})`}
                      {' · '}
                      房主：{room.hostNickname}
                      {' · '}
                      {room.playerCount}/2 席 · {statusLabel}
                    </Text>
                  </View>

                  <Button
                    onClick={() => handleJoinRoom(room.roomId)}
                    className={isJoinable ? 'btn-primary-dark' : 'btn-soft'}
                  >
                    {isJoinable ? '入座' : '观战'}
                  </Button>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};
