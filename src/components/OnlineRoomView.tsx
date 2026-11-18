import React, { useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Button, Input, ScrollView } from '@tarojs/components';
import type { Coord, PlayerIdentity, SanitizedRoomState } from '../shared/onlineTypes';
import { JUNQI_RANK_NAMES, XIANGQI_PIECE_LABELS } from '../shared/gameRules';
import { OnlineBoardRenderer } from './OnlineBoardRenderer';

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

  const gameTitle =
    room.gameType === 'GOMOKU'
      ? '五子棋'
      : room.gameType === 'XIANGQI'
      ? '中国象棋'
      : `陆战军旗 · ${room.junqiSubMode === 'FLIP' ? '翻棋模式' : '布阵模式'}`;

  const seat1RoleName = room.gameType === 'GOMOKU' ? '黑方 (先手)' : '红方 (先手)';
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

  const handleCopyRoomId = () => {
    Taro.setClipboardData({
      data: room.roomId,
      success: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
  };

  const handleSendChat = () => {
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
    <View className='page-container'>
      {/* Room Header Card */}
      <View className='card-panel'>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12rpx', marginBottom: '14rpx' }}>
          <View style={{ minWidth: 0, flex: 1 }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx' }}>
              <Text className='font-serif-oriental' style={{ fontSize: '30rpx', fontWeight: 700, color: '#291D16' }}>
                {room.roomName}
              </Text>
              <Text className='font-mono-tabular' style={{ fontSize: '26rpx', fontWeight: 700, color: '#B91C1C' }}>
                #{room.roomId}
              </Text>
            </View>
            <Text style={{ fontSize: '21rpx', color: '#6E5A4F', display: 'block', marginTop: '4rpx' }}>
              {gameTitle} · {room.isPublic ? '公开棋室' : '私密房间'} ·{' '}
              {room.viewerRole === 'SPECTATOR' ? '观战席位' : `第 ${mySeatNumber} 席`}
            </Text>
          </View>
          <Button onClick={onLeave} className='btn-soft'>
            退出房间
          </Button>
        </View>

        <View style={{ display: 'flex', gap: '14rpx' }}>
          <Button onClick={handleCopyRoomId} className='btn-primary-dark' style={{ flex: 1 }}>
            {copied ? '已复制房间号' : `复制房间号 #${room.roomId}`}
          </Button>
          <Button openType='share' className='btn-primary-red' style={{ flex: 1 }}>
            邀请微信好友
          </Button>
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

      {/* Pending Undo / Draw Negotiation */}
      {room.pendingRequest && (
        <View
          style={{
            backgroundColor: 'rgba(253, 230, 138, 0.5)',
            border: '2rpx solid rgba(180, 83, 9, 0.45)',
            borderRadius: '18rpx',
            padding: '20rpx',
          }}
        >
          <Text style={{ fontSize: '25rpx', fontWeight: 700, color: '#78350F', display: 'block', marginBottom: '12rpx' }}>
            {mySeatNumber === room.pendingRequest.fromSeat
              ? `已向对手发起「${room.pendingRequest.type === 'UNDO' ? '请求悔棋' : '提议和棋'}」，等待对方回应...`
              : `${room.pendingRequest.fromNickname} 发起了「${
                  room.pendingRequest.type === 'UNDO' ? '请求悔棋' : '提议和棋'
                }」，是否同意？`}
          </Text>
          {mySeatNumber !== null && mySeatNumber !== room.pendingRequest.fromSeat && (
            <View style={{ display: 'flex', gap: '14rpx' }}>
              <Button onClick={() => onRespondAction(true)} className='btn-jade' style={{ flex: 1 }}>
                同意请求
              </Button>
              <Button onClick={() => onRespondAction(false)} className='btn-soft' style={{ flex: 1 }}>
                婉言谢绝
              </Button>
            </View>
          )}
        </View>
      )}

      {/* Turn Status & Action Toolbar */}
      <View className='status-bar'>
        <View>
          <Text className='status-main-text' style={{ display: 'block' }}>
            {getTurnLabel()}
          </Text>
          <Text className='status-sub-text font-mono-tabular' style={{ display: 'block' }}>
            对局步数 {room.moveLogs.length}
          </Text>
          {room.gameType === 'JUNQI' && room.junqi && (
            <Text className='status-sub-text' style={{ display: 'block', color: '#5D4037' }}>
              红雷剩 {room.junqi.redMines} · 蓝雷剩 {room.junqi.blueMines} · 红扛旗：
              {room.junqi.redMinRank !== null ? JUNQI_RANK_NAMES[room.junqi.redMinRank] : '无'} · 蓝扛旗：
              {room.junqi.blueMinRank !== null ? JUNQI_RANK_NAMES[room.junqi.blueMinRank] : '无'}
            </Text>
          )}
        </View>

        <View className='status-toolbar'>
          {isWaiting && mySeat && (
            <Button
              onClick={() => onToggleReady(!mySeat.ready)}
              className={mySeat.ready ? 'btn-soft' : 'btn-primary-red'}
            >
              {mySeat.ready ? '取消准备' : '准备就绪'}
            </Button>
          )}

          {isPlaying && mySeatNumber !== null && (
            <>
              <Button
                disabled={room.moveLogs.length === 0 || room.pendingRequest !== null}
                onClick={() => onRequestAction('UNDO')}
                className={`btn-soft ${
                  room.moveLogs.length === 0 || room.pendingRequest !== null ? 'btn-disabled' : ''
                }`}
              >
                请求悔棋
              </Button>
              <Button
                disabled={room.pendingRequest !== null}
                onClick={() => onRequestAction('DRAW')}
                className={`btn-soft ${room.pendingRequest !== null ? 'btn-disabled' : ''}`}
              >
                提议和棋
              </Button>
              <Button onClick={onResign} className='btn-outline-red'>
                认负
              </Button>
            </>
          )}

          {isFinished && mySeatNumber !== null && (
            <Button onClick={onRematch} className='btn-primary-red'>
              再来一局
            </Button>
          )}
        </View>
      </View>

      {/* Interactive Game Board */}
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
        <View
          className='card-panel'
          style={{ border: '3rpx solid rgba(185, 28, 28, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16rpx' }}
        >
          <View style={{ flex: 1 }}>
            <Text className='font-serif-oriental' style={{ fontSize: '30rpx', fontWeight: 700, color: '#291D16', display: 'block' }}>
              {winnerTitle()}
            </Text>
            <Text style={{ fontSize: '22rpx', color: '#6E5A4F', display: 'block', marginTop: '4rpx' }}>
              共交锋 {room.moveLogs.length} 回合
            </Text>
          </View>
          {mySeatNumber !== null && (
            <Button onClick={onRematch} className='btn-primary-red'>
              发起再战
            </Button>
          )}
        </View>
      )}

      {/* Seats & Spectators */}
      <View className='card-panel'>
        <View className='section-header-row'>
          <Text className='section-title font-serif-oriental'>棋席对坐与观战</Text>
          <Text className='font-mono-tabular' style={{ fontSize: '22rpx', color: '#6E5A4F' }}>
            观战 {room.spectators.length} 人
          </Text>
        </View>

        <View style={{ display: 'flex', flexDirection: 'column', gap: '14rpx' }}>
          {([room.seat1, room.seat2] as const).map((seat) => {
            const roleLabel = seat.seatNumber === 1 ? seat1RoleName : seat2RoleName;
            const isMe = seat.playerId === me.playerId;
            return (
              <View
                key={seat.seatNumber}
                className='sub-panel'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderColor: isMe ? 'rgba(185, 28, 28, 0.65)' : '#D8CBB8',
                }}
              >
                <View>
                  <Text style={{ fontSize: '21rpx', color: '#6E5A4F', display: 'block' }}>
                    {roleLabel}
                    {seat.playerId ? (seat.connected ? ' · 在线' : ' · 重连中') : ''}
                  </Text>
                  <Text style={{ fontSize: '26rpx', fontWeight: 700, color: '#291D16', display: 'block', marginTop: '4rpx' }}>
                    {seat.nickname ? `${seat.nickname}${isMe ? ' (我)' : ''}` : '虚位以待'}
                  </Text>
                </View>

                <View>
                  {seat.playerId ? (
                    isWaiting && (
                      <Text
                        style={{
                          fontSize: '22rpx',
                          fontWeight: 700,
                          color: seat.ready ? '#0F766E' : '#8D6E63',
                        }}
                      >
                        {seat.ready ? '已准备' : '未准备'}
                      </Text>
                    )
                  ) : (
                    isWaiting &&
                    room.viewerRole === 'SPECTATOR' && (
                      <Button onClick={() => onSwitchSeat(seat.seatNumber)} className='btn-primary-dark'>
                        入座
                      </Button>
                    )
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {room.gameType === 'XIANGQI' && room.xiangqi && (
          <View className='sub-panel' style={{ marginTop: '14rpx' }}>
            <Text style={{ fontSize: '22rpx', color: '#B91C1C', fontWeight: 600, display: 'block', marginBottom: '6rpx' }}>
              红方斩获:{' '}
              {room.xiangqi.capturedBlack.length === 0
                ? '暂无'
                : room.xiangqi.capturedBlack.map((p) => XIANGQI_PIECE_LABELS.BLACK[p.type]).join(' ')}
            </Text>
            <Text style={{ fontSize: '22rpx', color: '#1E293B', fontWeight: 600, display: 'block' }}>
              黑方斩获:{' '}
              {room.xiangqi.capturedRed.length === 0
                ? '暂无'
                : room.xiangqi.capturedRed.map((p) => XIANGQI_PIECE_LABELS.RED[p.type]).join(' ')}
            </Text>
          </View>
        )}

        {room.spectators.length > 0 && (
          <Text style={{ fontSize: '22rpx', color: '#6E5A4F', display: 'block', marginTop: '14rpx' }}>
            观战棋友：{room.spectators.map((s) => s.nickname).join('、')}
          </Text>
        )}
      </View>

      {/* Chat & Move Log Panel */}
      <View className='card-panel'>
        <View className='segment-group' style={{ marginBottom: '18rpx' }}>
          <Button
            onClick={() => setRightTab('CHAT')}
            className={`segment-btn ${rightTab === 'CHAT' ? 'segment-btn--dark' : ''}`}
          >
            雅谈交流 ({room.chatMessages.length})
          </Button>
          <Button
            onClick={() => setRightTab('LOG')}
            className={`segment-btn ${rightTab === 'LOG' ? 'segment-btn--dark' : ''}`}
          >
            实时棋谱 ({room.moveLogs.length})
          </Button>
        </View>

        {rightTab === 'CHAT' ? (
          <View>
            <ScrollView scrollY style={{ height: '300rpx', marginBottom: '14rpx' }}>
              {room.chatMessages.length === 0 ? (
                <View style={{ padding: '40rpx 0', textAlign: 'center' }}>
                  <Text style={{ fontSize: '23rpx', color: '#8D6E63' }}>
                    暂无言谈，发一句「请多指教」致意吧
                  </Text>
                </View>
              ) : (
                room.chatMessages.map((msg) => {
                  const isSys = msg.senderId === 'SYSTEM';
                  const isMine = msg.senderId === me.playerId;
                  if (isSys) {
                    return (
                      <View
                        key={msg.id}
                        style={{
                          textAlign: 'center',
                          fontSize: '21rpx',
                          color: '#7C5332',
                          backgroundColor: 'rgba(228, 218, 195, 0.6)',
                          borderRadius: '10rpx',
                          padding: '8rpx 14rpx',
                          marginBottom: '10rpx',
                        }}
                      >
                        <Text>{msg.text}</Text>
                      </View>
                    );
                  }
                  return (
                    <View
                      key={msg.id}
                      style={{
                        borderRadius: '14rpx',
                        padding: '12rpx 18rpx',
                        marginBottom: '10rpx',
                        backgroundColor: isMine ? '#3E2723' : '#F7F3E8',
                        color: isMine ? '#F7F3E8' : '#291D16',
                        border: isMine ? 'none' : '2rpx solid #D8CBB8',
                        marginLeft: isMine ? '60rpx' : '0',
                        marginRight: isMine ? '0' : '60rpx',
                      }}
                    >
                      <Text style={{ fontSize: '19rpx', opacity: 0.78, display: 'block', marginBottom: '4rpx' }}>
                        {msg.senderName} · {msg.roleLabel} · {msg.timestamp}
                      </Text>
                      <Text style={{ fontSize: '24rpx', wordBreak: 'break-all' }}>{msg.text}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '10rpx', marginBottom: '14rpx' }}>
              {QUICK_PHRASES.map((phrase) => (
                <Button
                  key={phrase}
                  onClick={() => onSendChat(phrase)}
                  style={{
                    padding: '8rpx 16rpx',
                    borderRadius: '10rpx',
                    backgroundColor: '#E4DAC3',
                    color: '#3E2723',
                    fontSize: '21rpx',
                    fontWeight: 600,
                  }}
                >
                  {phrase}
                </Button>
              ))}
            </View>

            <View style={{ display: 'flex', gap: '12rpx', alignItems: 'center' }}>
              <Input
                value={chatText}
                onInput={(e) => setChatText(e.detail.value)}
                onConfirm={handleSendChat}
                maxlength={160}
                placeholder='输入雅谈内容...'
                className='input-field'
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleSendChat}
                disabled={!chatText.trim()}
                className={`btn-primary-red ${!chatText.trim() ? 'btn-disabled' : ''}`}
              >
                发送
              </Button>
            </View>
          </View>
        ) : (
          <ScrollView scrollY className='scroll-log-box'>
            {room.moveLogs.length === 0 ? (
              <View style={{ padding: '40rpx 0', textAlign: 'center' }}>
                <Text style={{ fontSize: '23rpx', color: '#8D6E63' }}>棋局尚未落子</Text>
              </View>
            ) : (
              room.moveLogs.map((log) => (
                <View key={log.step} className='log-item-row'>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '10rpx', flex: 1, minWidth: 0 }}>
                    <Text className='font-mono-tabular' style={{ fontWeight: 700, color: '#8D6E63' }}>
                      #{log.step}
                    </Text>
                    <Text style={{ fontWeight: 600 }}>{log.actor}</Text>
                    <Text style={{ color: '#6E5A4F' }}>·</Text>
                    <Text style={{ fontWeight: 700, color: '#291D16' }}>{log.description}</Text>
                  </View>
                  <Text className='font-mono-tabular' style={{ fontSize: '20rpx', color: '#8D6E63', marginLeft: '10rpx' }}>
                    {log.timestamp}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};
