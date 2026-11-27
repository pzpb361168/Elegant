import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AuthProfileStatus,
  ChatMessage,
  ClientToServerMessage,
  GomokuOnlineBoardState,
  JunqiSide,
  JunqiSubMode,
  OnlineGameType,
  OnlineMoveLog,
  PendingRequest,
  PublicRoomSummary,
  RoomStatus,
  SanitizedRoomState,
  SeatState,
  ServerToClientMessage,
  SpectatorInfo,
  XiangqiOnlineBoardState,
} from './src/shared/onlineTypes.ts';
import {
  applyGomokuMove,
  applyJunqiFlip,
  applyJunqiMove,
  applyXiangqiMove,
  canSwapJunqiSetup,
  cloneGomokuState,
  cloneServerJunqiState,
  cloneXiangqiState,
  createInitialGomokuState,
  createInitialServerJunqiState,
  createInitialXiangqiState,
  createJunqiHalfSetup,
  JUNQI_RANK_NAMES,
  sanitizeJunqiStateForViewer,
  type ServerJunqiState,
} from './src/shared/gameRules.ts';


interface ClientSession {
  ws: WebSocket;
  playerId: string;
  nickname: string;
  avatarUrl: string;
  authStatus: AuthProfileStatus;
  authenticated: boolean;
  authExpiresAt: number;
  currentRoomId: string | null;
  inLobby: boolean;
}

interface RoomHistorySnapshot {
  gomoku?: GomokuOnlineBoardState;
  xiangqi?: XiangqiOnlineBoardState;
  junqi?: ServerJunqiState;
}

interface ServerRoom {
  roomId: string;
  roomName: string;
  gameType: OnlineGameType;
  junqiSubMode: JunqiSubMode;
  isPublic: boolean;
  status: RoomStatus;
  createdAt: number;
  emptySince: number | null;
  seat1: SeatState;
  seat2: SeatState;
  spectators: Map<string, SpectatorInfo>;
  pendingRequest: PendingRequest | null;
  moveLogs: OnlineMoveLog[];
  chatMessages: ChatMessage[];
  history: RoomHistorySnapshot[];
  gomoku?: GomokuOnlineBoardState;
  xiangqi?: XiangqiOnlineBoardState;
  junqi?: ServerJunqiState;
}

const rooms = new Map<string, ServerRoom>();
const clients = new Map<WebSocket, ClientSession>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(id)) return generateRoomId();
  return id;
}

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  });
}

function sendToWs(ws: WebSocket, msg: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

interface OnlineTokenPayload {
  sub: string;
  nickname: string;
  avatarUrl: string;
  authStatus: AuthProfileStatus;
  exp: number;
  aud: 'yayi-online';
}

function sanitizeAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512 || /[\s\u0000-\u001F]/.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function verifyOnlineToken(token: string): OnlineTokenPayload | null {
  const secret = process.env.ONLINE_AUTH_SECRET;
  const [header, body, signature, ...extra] = token.split('.');
  if (!secret || !header || !body || !signature || extra.length) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<OnlineTokenPayload>;
    if (
      typeof payload.sub !== 'string' || !payload.sub ||
      typeof payload.nickname !== 'string' ||
      typeof payload.exp !== 'number' || payload.exp <= Date.now() ||
      payload.aud !== 'yayi-online'
    ) return null;
    return {
      sub: payload.sub,
      nickname: payload.nickname.trim().slice(0, 16) || '棋友',
      avatarUrl: sanitizeAvatarUrl(payload.avatarUrl),
      authStatus: payload.authStatus === 'AUTHORIZED' ? 'AUTHORIZED' : 'GUEST_ALIAS',
      exp: payload.exp,
      aud: 'yayi-online',
    };
  } catch {
    return null;
  }
}

function getGameTitle(gameType: OnlineGameType): string {
  if (gameType === 'GOMOKU') return '五子棋';
  if (gameType === 'XIANGQI') return '中国象棋';
  return '陆战军旗';
}

function buildInitialGameStateForRoom(room: ServerRoom): void {
  room.history = [];
  room.moveLogs = [];
  room.pendingRequest = null;
  if (room.gameType === 'GOMOKU') {
    room.gomoku = createInitialGomokuState();
    room.xiangqi = undefined;
    room.junqi = undefined;
  } else if (room.gameType === 'XIANGQI') {
    room.xiangqi = createInitialXiangqiState();
    room.gomoku = undefined;
    room.junqi = undefined;
  } else {
    room.junqi = createInitialServerJunqiState(room.junqiSubMode);
    room.gomoku = undefined;
    room.xiangqi = undefined;
  }
}

function getViewerRole(
  room: ServerRoom,
  playerId: string
): 'SEAT_1' | 'SEAT_2' | 'SPECTATOR' {
  if (room.seat1.playerId === playerId) return 'SEAT_1';
  if (room.seat2.playerId === playerId) return 'SEAT_2';
  return 'SPECTATOR';
}

function getRoleLabel(room: ServerRoom, playerId: string): string {
  const role = getViewerRole(room, playerId);
  if (role === 'SPECTATOR') return '观战';
  if (room.gameType === 'GOMOKU') return role === 'SEAT_1' ? '黑方' : '白方';
  if (room.gameType === 'XIANGQI') return role === 'SEAT_1' ? '红方' : '黑方';
  return role === 'SEAT_1' ? '红方' : '蓝方';
}

function sanitizeRoomForPlayer(room: ServerRoom, playerId: string): SanitizedRoomState {
  const viewerRole = getViewerRole(room, playerId);
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    gameType: room.gameType,
    junqiSubMode: room.junqiSubMode,
    isPublic: room.isPublic,
    status: room.status,
    viewerRole,
    seat1: { ...room.seat1 },
    seat2: { ...room.seat2 },
    spectators: Array.from(room.spectators.values()),
    pendingRequest: room.pendingRequest ? { ...room.pendingRequest } : null,
    moveLogs: [...room.moveLogs],
    chatMessages: [...room.chatMessages],
    gomoku: room.gomoku,
    xiangqi: room.xiangqi,
    junqi: room.junqi
      ? sanitizeJunqiStateForViewer(room.junqi, viewerRole, room.status)
      : undefined,
  };
}

function getPublicRoomSummaries(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    if (!room.isPublic) continue;
    const playerCount = (room.seat1.playerId ? 1 : 0) + (room.seat2.playerId ? 1 : 0);
    if (playerCount === 0 && room.spectators.size === 0) continue;
    list.push({
      roomId: room.roomId,
      roomName: room.roomName,
      gameType: room.gameType,
      junqiSubMode: room.gameType === 'JUNQI' ? room.junqiSubMode : undefined,
      status: room.status,
      hostNickname: room.seat1.nickname || room.seat2.nickname || '棋室房主',
      playerCount,
      spectatorCount: room.spectators.size,
      createdAt: room.createdAt,
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function broadcastLobbyUpdate(): void {
  const summaries = getPublicRoomSummaries();
  const onlineUsers = clients.size;
  for (const session of clients.values()) {
    if (session.inLobby) {
      sendToWs(session.ws, {
        type: 'lobby:rooms_update',
        rooms: summaries,
        onlineUsers,
      });
    }
  }
}

function broadcastRoomState(room: ServerRoom): void {
  for (const session of clients.values()) {
    if (session.currentRoomId === room.roomId) {
      sendToWs(session.ws, {
        type: 'room:state_sync',
        state: sanitizeRoomForPlayer(room, session.playerId),
      });
    }
  }
}

function broadcastChatMessage(room: ServerRoom, message: ChatMessage): void {
  room.chatMessages.push(message);
  if (room.chatMessages.length > 60) {
    room.chatMessages.shift();
  }
  for (const session of clients.values()) {
    if (session.currentRoomId === room.roomId) {
      sendToWs(session.ws, {
        type: 'room:chat_message',
        roomId: room.roomId,
        message,
      });
    }
  }
}

function addSystemChat(room: ServerRoom, text: string): void {
  const msg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: 'SYSTEM',
    senderName: '棋室司仪',
    roleLabel: '系统',
    text,
    timestamp: nowTimeStr(),
  };
  broadcastChatMessage(room, msg);
}

function detachPlayerFromRoom(session: ClientSession, explicitLeave: boolean): void {
  const roomId = session.currentRoomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  session.currentRoomId = null;

  if (!room) return;

  const pid = session.playerId;
  let changed = false;

  if (room.seat1.playerId === pid) {
    if (explicitLeave && (room.status === 'WAITING' || room.status === 'FINISHED')) {
      room.seat1 = {
        seatNumber: 1,
        playerId: null,
        nickname: null,
        avatarUrl: undefined,
        connected: false,
        ready: false,
        setupConfirmed: false,
      };
    } else {
      room.seat1.connected = false;
    }
    changed = true;
  } else if (room.seat2.playerId === pid) {
    if (explicitLeave && (room.status === 'WAITING' || room.status === 'FINISHED')) {
      room.seat2 = {
        seatNumber: 2,
        playerId: null,
        nickname: null,
        avatarUrl: undefined,
        connected: false,
        ready: false,
        setupConfirmed: false,
      };
    } else {
      room.seat2.connected = false;
    }
    changed = true;
  } else if (room.spectators.has(pid)) {
    if (explicitLeave) {
      room.spectators.delete(pid);
    } else {
      const spec = room.spectators.get(pid)!;
      spec.connected = false;
    }
    changed = true;
  }

  // Promote Seat 2 to Seat 1 if Seat 1 vacated in WAITING
  if (room.status === 'WAITING' && !room.seat1.playerId && room.seat2.playerId) {
    room.seat1 = { ...room.seat2, seatNumber: 1 };
    room.seat2 = {
      seatNumber: 2,
      playerId: null,
      nickname: null,
      avatarUrl: undefined,
      connected: false,
      ready: false,
      setupConfirmed: false,
    };
  }

  // Check if anyone is still connected in this room
  const anyoneConnected =
    room.seat1.connected ||
    room.seat2.connected ||
    Array.from(room.spectators.values()).some((s) => s.connected);

  if (!anyoneConnected) {
    room.emptySince = Date.now();
    // If still WAITING and explicitly left, delete immediately
    if (room.status === 'WAITING' && !room.seat1.playerId && !room.seat2.playerId) {
      rooms.delete(room.roomId);
      broadcastLobbyUpdate();
      return;
    }
  }

  if (changed) {
    if (explicitLeave) {
      addSystemChat(room, `${session.nickname} 离开了棋室`);
    }
    broadcastRoomState(room);
    broadcastLobbyUpdate();
  }
}

function tryStartMatchIfBothReady(room: ServerRoom): void {
  if (
    room.status === 'WAITING' &&
    room.seat1.playerId &&
    room.seat2.playerId &&
    room.seat1.ready &&
    room.seat2.ready
  ) {
    buildInitialGameStateForRoom(room);
    if (room.gameType === 'JUNQI' && room.junqiSubMode === 'DEPLOY') {
      room.status = 'DEPLOYING';
      room.seat1.setupConfirmed = false;
      room.seat2.setupConfirmed = false;
      addSystemChat(room, '双方已就位，请各自排兵布阵，点击「完成布阵」后正式开战！');
    } else {
      room.status = 'PLAYING';
      addSystemChat(room, '双方准备就绪，棋局正式开始！');
    }
  }
}

function handleMessage(session: ClientSession, msg: ClientToServerMessage): void {
  if (msg.type === 'auth:login') {
    const token = verifyOnlineToken(msg.token);
    if (!token) {
      sendToWs(session.ws, { type: 'auth:error', message: '微信身份验证已失效，请重新登录' });
      return;
    }
    session.playerId = token.sub;
    session.nickname = token.nickname;
    session.avatarUrl = token.avatarUrl;
    session.authStatus = token.authStatus;
    session.authenticated = true;
    session.authExpiresAt = token.exp;
    sendToWs(session.ws, {
      type: 'auth:ok',
      player: {
        playerId: session.playerId,
        nickname: session.nickname,
        avatarUrl: session.avatarUrl || undefined,
        authStatus: session.authStatus,
      },
      expiresAt: token.exp,
    });
    return;
  }
  if (!session.authenticated || session.authExpiresAt <= Date.now()) {
    session.authenticated = false;
    sendToWs(session.ws, { type: 'auth:error', message: '请先完成微信身份登录' });
    return;
  }
  switch (msg.type) {
    case 'lobby:subscribe': {
      session.inLobby = true;
      sendToWs(session.ws, {
        type: 'lobby:rooms_update',
        rooms: getPublicRoomSummaries(),
        onlineUsers: clients.size,
      });
      break;
    }

    case 'room:create': {
      if (session.currentRoomId) {
        detachPlayerFromRoom(session, true);
      }

      const roomId = generateRoomId();
      const junqiSub: JunqiSubMode = msg.junqiSubMode === 'DEPLOY' ? 'DEPLOY' : 'FLIP';
      const defaultName = `${session.nickname}的${getGameTitle(msg.gameType)}室`;
      const room: ServerRoom = {
        roomId,
        roomName: (msg.roomName || defaultName).trim().slice(0, 24) || defaultName,
        gameType: msg.gameType,
        junqiSubMode: junqiSub,
        isPublic: msg.isPublic,
        status: 'WAITING',
        createdAt: Date.now(),
        emptySince: null,
        seat1: {
          seatNumber: 1,
          playerId: session.playerId,
          nickname: session.nickname,
          avatarUrl: session.avatarUrl || undefined,
          connected: true,
          ready: true, // Host defaults to ready
          setupConfirmed: false,
        },
        seat2: {
          seatNumber: 2,
          playerId: null,
          nickname: null,
          avatarUrl: undefined,
          connected: false,
          ready: false,
          setupConfirmed: false,
        },
        spectators: new Map(),
        pendingRequest: null,
        moveLogs: [],
        chatMessages: [],
        history: [],
      };
      buildInitialGameStateForRoom(room);
      rooms.set(roomId, room);
      session.currentRoomId = roomId;

      addSystemChat(room, `${session.nickname} 创建了棋室（房间号 ${roomId}）`);
      sendToWs(session.ws, {
        type: 'room:joined',
        roomId,
        state: sanitizeRoomForPlayer(room, session.playerId),
      });
      broadcastLobbyUpdate();
      break;
    }

    case 'room:join': {
      const targetId = msg.roomId.trim().toUpperCase();
      const room = rooms.get(targetId);
      if (!room) {
        sendToWs(session.ws, { type: 'room:error', message: `未找到房间号「${targetId}」，可能已关闭` });
        return;
      }

      if (session.currentRoomId && session.currentRoomId !== targetId) {
        detachPlayerFromRoom(session, true);
      }

      room.emptySince = null;
      session.currentRoomId = targetId;

      // Reconnection check
      if (room.seat1.playerId === session.playerId) {
        room.seat1.connected = true;
        room.seat1.nickname = session.nickname;
        room.seat1.avatarUrl = session.avatarUrl || undefined;
      } else if (room.seat2.playerId === session.playerId) {
        room.seat2.connected = true;
        room.seat2.nickname = session.nickname;
        room.seat2.avatarUrl = session.avatarUrl || undefined;
      } else if (!room.seat1.playerId && room.status === 'WAITING') {
        room.seat1 = {
          seatNumber: 1,
          playerId: session.playerId,
          nickname: session.nickname,
          avatarUrl: session.avatarUrl || undefined,
          connected: true,
          ready: false,
          setupConfirmed: false,
        };
        addSystemChat(room, `${session.nickname} 入座成为主方`);
      } else if (!room.seat2.playerId && room.status === 'WAITING') {
        room.seat2 = {
          seatNumber: 2,
          playerId: session.playerId,
          nickname: session.nickname,
          avatarUrl: session.avatarUrl || undefined,
          connected: true,
          ready: false,
          setupConfirmed: false,
        };
        addSystemChat(room, `${session.nickname} 入座成为客方`);
      } else {
        const existingSpec = room.spectators.get(session.playerId);
        room.spectators.set(session.playerId, {
          playerId: session.playerId,
          nickname: session.nickname,
          avatarUrl: session.avatarUrl || undefined,
          connected: true,
        });
        if (!existingSpec) {
          addSystemChat(room, `${session.nickname} 进入棋室观战`);
        }
      }

      sendToWs(session.ws, {
        type: 'room:joined',
        roomId: targetId,
        state: sanitizeRoomForPlayer(room, session.playerId),
      });
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'room:leave': {
      detachPlayerFromRoom(session, true);
      sendToWs(session.ws, { type: 'room:left', roomId: msg.roomId });
      break;
    }

    case 'room:switch_to_seat': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'WAITING') return;
      const targetSeat = msg.seatNumber === 1 ? room.seat1 : room.seat2;
      if (targetSeat.playerId) {
        sendToWs(session.ws, { type: 'room:error', message: '该席位已被占用' });
        return;
      }
      // Vacate previous seat or spectator entry
      if (room.seat1.playerId === session.playerId) {
        room.seat1 = { seatNumber: 1, playerId: null, nickname: null, avatarUrl: undefined, connected: false, ready: false, setupConfirmed: false };
      } else if (room.seat2.playerId === session.playerId) {
        room.seat2 = { seatNumber: 2, playerId: null, nickname: null, avatarUrl: undefined, connected: false, ready: false, setupConfirmed: false };
      } else {
        room.spectators.delete(session.playerId);
      }

      targetSeat.playerId = session.playerId;
      targetSeat.nickname = session.nickname;
      targetSeat.avatarUrl = session.avatarUrl || undefined;
      targetSeat.connected = true;
      targetSeat.ready = false;
      targetSeat.setupConfirmed = false;
      addSystemChat(room, `${session.nickname} 入座第 ${msg.seatNumber} 席`);
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'room:ready': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'WAITING') return;
      if (room.seat1.playerId === session.playerId) {
        room.seat1.ready = msg.ready;
      } else if (room.seat2.playerId === session.playerId) {
        room.seat2.ready = msg.ready;
      } else {
        return;
      }
      tryStartMatchIfBothReady(room);
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'junqi:swap_setup': {
      const room = rooms.get(msg.roomId);
      if (!room || room.gameType !== 'JUNQI' || room.status !== 'DEPLOYING' || !room.junqi) return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;
      const side: JunqiSide = role === 'SEAT_1' ? 'RED' : 'BLUE';
      const seat = role === 'SEAT_1' ? room.seat1 : room.seat2;
      if (seat.setupConfirmed) return;

      const check = canSwapJunqiSetup(room.junqi.board, side, msg.c1, msg.c2);
      if (!check.ok) {
        sendToWs(session.ws, { type: 'room:error', message: check.error });
        return;
      }

      const temp = room.junqi.board[msg.c1.r][msg.c1.c];
      room.junqi.board[msg.c1.r][msg.c1.c] = room.junqi.board[msg.c2.r][msg.c2.c];
      room.junqi.board[msg.c2.r][msg.c2.c] = temp;
      broadcastRoomState(room);
      break;
    }

    case 'junqi:preset_setup': {
      const room = rooms.get(msg.roomId);
      if (!room || room.gameType !== 'JUNQI' || room.status !== 'DEPLOYING' || !room.junqi) return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;
      const side: JunqiSide = role === 'SEAT_1' ? 'RED' : 'BLUE';
      const seat = role === 'SEAT_1' ? room.seat1 : room.seat2;
      if (seat.setupConfirmed) return;

      const half = createJunqiHalfSetup(side, msg.preset, true);
      const offset = side === 'RED' ? 6 : 0;
      for (let lr = 0; lr < 6; lr++) {
        room.junqi.board[lr + offset] = half[lr];
      }
      broadcastRoomState(room);
      break;
    }

    case 'junqi:confirm_setup': {
      const room = rooms.get(msg.roomId);
      if (!room || room.gameType !== 'JUNQI' || room.status !== 'DEPLOYING' || !room.junqi) return;
      if (room.seat1.playerId === session.playerId) {
        room.seat1.setupConfirmed = true;
        addSystemChat(room, `${room.seat1.nickname}（红方）已完成排兵布阵`);
      } else if (room.seat2.playerId === session.playerId) {
        room.seat2.setupConfirmed = true;
        addSystemChat(room, `${room.seat2.nickname}（蓝方）已完成排兵布阵`);
      }

      if (room.seat1.setupConfirmed && room.seat2.setupConfirmed) {
        room.status = 'PLAYING';
        room.junqi.lastBanner = '双方布阵完毕，全军出击！红方先行';
        addSystemChat(room, '双方布阵均已就绪，战斗正式打响！');
      }
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'game:move': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'PLAYING') return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') {
        sendToWs(session.ws, { type: 'room:error', message: '观战者不可操作棋盘' });
        return;
      }

      const actorLabel = getRoleLabel(room, session.playerId);
      const p = msg.payload;

      if (p.kind === 'GOMOKU' && room.gameType === 'GOMOKU' && room.gomoku) {
        const side = role === 'SEAT_1' ? 1 : 2;
        const res = applyGomokuMove(room.gomoku, side, p.r, p.c);
        if (!res.ok) {
          sendToWs(session.ws, { type: 'room:error', message: res.error });
          return;
        }
        room.history.push({ gomoku: cloneGomokuState(room.gomoku) });
        room.gomoku = res.next;
        room.pendingRequest = null;
        room.moveLogs.unshift({
          step: room.moveLogs.length + 1,
          actor: actorLabel,
          description: res.desc,
          timestamp: nowTimeStr(),
        });
        if (room.gomoku.winner !== null) {
          room.status = 'FINISHED';
          const winText =
            room.gomoku.winner === 'DRAW'
              ? '棋局结束：满盘和局'
              : room.gomoku.winner === 1
              ? '棋局结束：黑方五子连珠胜出！'
              : '棋局结束：白方五子连珠胜出！';
          addSystemChat(room, winText);
        }
      } else if (p.kind === 'XIANGQI' && room.gameType === 'XIANGQI' && room.xiangqi) {
        const side = role === 'SEAT_1' ? 'RED' : 'BLACK';
        const res = applyXiangqiMove(room.xiangqi, side, p.from, p.to);
        if (!res.ok) {
          sendToWs(session.ws, { type: 'room:error', message: res.error });
          return;
        }
        room.history.push({ xiangqi: cloneXiangqiState(room.xiangqi) });
        room.xiangqi = res.next;
        room.pendingRequest = null;
        room.moveLogs.unshift({
          step: room.moveLogs.length + 1,
          actor: actorLabel,
          description: res.desc,
          timestamp: nowTimeStr(),
        });
        if (room.xiangqi.winner !== null) {
          room.status = 'FINISHED';
          addSystemChat(
            room,
            room.xiangqi.winner === 'RED' ? '棋局结束：红方绝杀获胜！' : '棋局结束：黑方绝杀获胜！'
          );
        }
      } else if (p.kind === 'JUNQI_FLIP' && room.gameType === 'JUNQI' && room.junqi) {
        const side: JunqiSide = role === 'SEAT_1' ? 'RED' : 'BLUE';
        const res = applyJunqiFlip(room.junqi, side, p.r, p.c);
        if (!res.ok) {
          sendToWs(session.ws, { type: 'room:error', message: res.error });
          return;
        }
        room.history.push({ junqi: cloneServerJunqiState(room.junqi) });
        room.junqi = res.next;
        room.pendingRequest = null;
        room.moveLogs.unshift({
          step: room.moveLogs.length + 1,
          actor: actorLabel,
          description: res.desc,
          timestamp: nowTimeStr(),
        });
      } else if (p.kind === 'JUNQI_MOVE' && room.gameType === 'JUNQI' && room.junqi) {
        const side: JunqiSide = role === 'SEAT_1' ? 'RED' : 'BLUE';
        const res = applyJunqiMove(room.junqi, side, p.from, p.to);
        if (!res.ok) {
          sendToWs(session.ws, { type: 'room:error', message: res.error });
          return;
        }
        room.history.push({ junqi: cloneServerJunqiState(room.junqi) });
        room.junqi = res.next;
        room.pendingRequest = null;
        room.moveLogs.unshift({
          step: room.moveLogs.length + 1,
          actor: actorLabel,
          description: res.desc,
          timestamp: nowTimeStr(),
        });
        if (room.junqi.winner !== null) {
          room.status = 'FINISHED';
          addSystemChat(
            room,
            room.junqi.winner === 'RED' ? '战役结束：红方夺旗获胜！' : '战役结束：蓝方夺旗获胜！'
          );
        }
      }

      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'game:request_action': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'PLAYING') return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;
      if (room.pendingRequest) {
        sendToWs(session.ws, { type: 'room:error', message: '已有待回应的协商请求' });
        return;
      }
      if (msg.action === 'UNDO' && room.history.length === 0) {
        sendToWs(session.ws, { type: 'room:error', message: '开局尚未行棋，无法悔棋' });
        return;
      }

      const fromSeat: 1 | 2 = role === 'SEAT_1' ? 1 : 2;
      const fromNick =
        (fromSeat === 1 ? room.seat1.nickname : room.seat2.nickname) || '对手';
      room.pendingRequest = {
        type: msg.action,
        fromSeat,
        fromNickname: fromNick,
      };
      addSystemChat(
        room,
        `${fromNick} 发起了「${msg.action === 'UNDO' ? '请求悔棋' : '提议和棋'}」`
      );
      broadcastRoomState(room);
      break;
    }

    case 'game:respond_action': {
      const room = rooms.get(msg.roomId);
      if (!room || !room.pendingRequest) return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;
      const mySeat: 1 | 2 = role === 'SEAT_1' ? 1 : 2;
      if (mySeat === room.pendingRequest.fromSeat) return; // Only opponent can respond

      const req = room.pendingRequest;
      room.pendingRequest = null;

      if (!msg.accept) {
        addSystemChat(
          room,
          `对方婉拒了「${req.type === 'UNDO' ? '悔棋' : '和棋'}」请求`
        );
        broadcastRoomState(room);
        return;
      }

      if (req.type === 'UNDO') {
        const snap = room.history.pop();
        if (snap) {
          if (snap.gomoku) room.gomoku = snap.gomoku;
          if (snap.xiangqi) room.xiangqi = snap.xiangqi;
          if (snap.junqi) room.junqi = snap.junqi;
          room.moveLogs.shift();
          addSystemChat(room, `双方同意悔棋，已退回上一步`);
        }
      } else if (req.type === 'DRAW') {
        room.status = 'FINISHED';
        if (room.gomoku) room.gomoku.winner = 'DRAW';
        if (room.xiangqi) room.xiangqi.winner = 'DRAW';
        if (room.junqi) {
          room.junqi.winner = 'DRAW';
          room.junqi.lastBanner = '双方握手言和，本局平局';
        }
        addSystemChat(room, '双方握手言和，本局判为和棋');
      }

      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'game:resign': {
      const room = rooms.get(msg.roomId);
      if (!room || (room.status !== 'PLAYING' && room.status !== 'DEPLOYING')) return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;

      const loserLabel = getRoleLabel(room, session.playerId);
      room.status = 'FINISHED';
      room.pendingRequest = null;

      if (room.gomoku) {
        room.gomoku.winner = role === 'SEAT_1' ? 2 : 1;
      } else if (room.xiangqi) {
        room.xiangqi.winner = role === 'SEAT_1' ? 'BLACK' : 'RED';
      } else if (room.junqi) {
        room.junqi.winner = role === 'SEAT_1' ? 'BLUE' : 'RED';
        room.junqi.lastBanner = `${loserLabel}投子认负，对局结束`;
      }

      addSystemChat(room, `${loserLabel} 投子认负，对局结束`);
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'game:rematch': {
      const room = rooms.get(msg.roomId);
      if (!room || room.status !== 'FINISHED') return;
      const role = getViewerRole(room, session.playerId);
      if (role === 'SPECTATOR') return;

      buildInitialGameStateForRoom(room);
      room.status = 'WAITING';
      room.seat1.ready = role === 'SEAT_1';
      room.seat2.ready = role === 'SEAT_2';
      room.seat1.setupConfirmed = false;
      room.seat2.setupConfirmed = false;
      addSystemChat(
        room,
        `${role === 'SEAT_1' ? room.seat1.nickname : room.seat2.nickname} 邀请再来一局，等待双方准备`
      );
      broadcastRoomState(room);
      broadcastLobbyUpdate();
      break;
    }

    case 'profile:update': {
      const nickname = typeof msg.nickname === 'string' ? msg.nickname.trim().slice(0, 16) : '';
      if (!nickname) {
        sendToWs(session.ws, { type: 'room:error', message: '昵称不能为空' });
        return;
      }
      if (typeof msg.avatarUrl === 'string' && msg.avatarUrl.trim() !== '') {
        const cleanAvatar = sanitizeAvatarUrl(msg.avatarUrl);
        if (!cleanAvatar) {
          sendToWs(session.ws, { type: 'room:error', message: '头像地址无效' });
          return;
        }
        session.avatarUrl = cleanAvatar;
      }
      session.nickname = nickname;
      const room = session.currentRoomId ? rooms.get(session.currentRoomId) : undefined;
      if (room) {
        if (room.seat1.playerId === session.playerId) {
          room.seat1.nickname = nickname;
          room.seat1.avatarUrl = session.avatarUrl || undefined;
        }
        if (room.seat2.playerId === session.playerId) {
          room.seat2.nickname = nickname;
          room.seat2.avatarUrl = session.avatarUrl || undefined;
        }
        const spectator = room.spectators.get(session.playerId);
        if (spectator) {
          spectator.nickname = nickname;
          spectator.avatarUrl = session.avatarUrl || undefined;
        }
        broadcastRoomState(room);
        broadcastLobbyUpdate();
      }
      break;
    }

    case 'chat:send': {
      const room = rooms.get(msg.roomId);
      if (!room) return;
      const cleanText = msg.text.trim().slice(0, 160);
      if (!cleanText) return;

      const chatMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        senderId: session.playerId,
        senderName: session.nickname,
        roleLabel: getRoleLabel(room, session.playerId),
        text: cleanText,
        timestamp: nowTimeStr(),
      };
      broadcastChatMessage(room, chatMsg);
      break;
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size, clients: clients.size });
  });

  wss.on('connection', (ws) => {
    const session: ClientSession = {
      ws,
      playerId: '',
      nickname: '雅弈访客',
      avatarUrl: '',
      authStatus: 'GUEST_ALIAS',
      authenticated: false,
      authExpiresAt: 0,
      currentRoomId: null,
      inLobby: false,
    };
    clients.set(ws, session);

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientToServerMessage;
        handleMessage(session, parsed);
      } catch {
        sendToWs(ws, { type: 'room:error', message: '指令格式有误' });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      detachPlayerFromRoom(session, false);
      broadcastLobbyUpdate();
    });
  });

  // Periodically clean up abandoned empty rooms (> 2 minutes empty)
  setInterval(() => {
    const now = Date.now();
    let removed = false;
    for (const [id, room] of rooms.entries()) {
      if (room.emptySince && now - room.emptySince > 120_000) {
        rooms.delete(id);
        removed = true;
      }
    }
    if (removed) broadcastLobbyUpdate();
  }, 30_000);

  app.get('/', (_req, res) => {
    res.json({
      service: 'YaYi Pavilion Mini Game WebSocket Server',
      status: 'ok',
      wsPath: '/ws',
      rooms: rooms.size,
      clients: clients.size,
    });
  });

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`YaYi Pavilion Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
