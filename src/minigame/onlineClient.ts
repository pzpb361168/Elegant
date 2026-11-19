import type {
  ClientToServerMessage,
  Coord,
  JunqiSubMode,
  OnlineGameType,
  PlayerIdentity,
  PublicRoomSummary,
  SanitizedRoomState,
  ServerToClientMessage,
} from '../shared/onlineTypes.ts';
import type { WxSocketTask } from './wx.d.ts';
import {
  showToast,
} from './platform.ts';
import { loginWithWeChat } from './cloudAuth.ts';
import { ONLINE_WSS_URL } from './cloudConfig.ts';
import { soundFX } from './sound.ts';

export type WsConnStatus = 'DISCONNECTED' | 'AUTHENTICATING' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface OnlineClientState {
  wsUrl: string;
  connStatus: WsConnStatus;
  player: PlayerIdentity;
  publicRooms: PublicRoomSummary[];
  onlineUsers: number;
  room: SanitizedRoomState | null;
  pendingRoomJoin: string | null;
  selectedCoord: Coord | null;
  legalTargets: Coord[];
}

export class MiniGameOnlineClient {
  public state: OnlineClientState;
  private socket: WxSocketTask | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private authenticationInFlight = false;
  private active = false;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.state = {
      wsUrl: ONLINE_WSS_URL,
      connStatus: 'DISCONNECTED',
      player: { playerId: '', nickname: '微信棋友' },
      publicRooms: [],
      onlineUsers: 0,
      room: null,
      pendingRoomJoin: null,
      selectedCoord: null,
      legalTargets: [],
    };
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.connect();
  }

  public stop(): void {
    this.active = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();
  }

  public queueJoinRoom(roomId: string): void {
    const clean = roomId.trim().toUpperCase();
    if (!clean) return;
    this.state.pendingRoomJoin = clean;
    if (!this.active) this.start();
    else if (this.state.connStatus === 'CONNECTED') {
      this.send({ type: 'room:join', roomId: clean });
      this.state.pendingRoomJoin = null;
    }
    this.onChange();
  }

  public updateNickname(nick: string): void {
    const nickname = nick.trim().slice(0, 16);
    if (!nickname) return;
    this.state.player = { ...this.state.player, nickname };
    if (this.state.connStatus === 'CONNECTED') {
      this.send({ type: 'profile:update', nickname });
    }
    this.onChange();
  }

  /** The production endpoint is fixed at build time; keep UI compatibility without accepting arbitrary hosts. */
  public updateWsUrl(_nextUrl: string): void {
    showToast('正式版联机服务地址不可修改');
  }

  public reconnectNow(): void {
    this.reconnectAttempts = 0;
    this.closeSocket();
    this.active = true;
    this.connect();
  }

  private closeSocket(): void {
    if (this.socket) {
      try {
        this.socket.close({ code: 1000, reason: 'client_reset' });
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    this.state.connStatus = 'DISCONNECTED';
  }

  private connect(): void {
    if (!this.active) return;
    if (this.authenticationInFlight) return;
    this.authenticationInFlight = true;
    this.state.connStatus = 'AUTHENTICATING';
    this.onChange();

    void this.authenticateAndOpenSocket();
  }

  private async authenticateAndOpenSocket(): Promise<void> {
    let token: string;
    try {
      const auth = await loginWithWeChat();
      if (!this.active) return;
      token = auth.token;
      this.state.player = auth.player;
    } catch (err) {
      if (!this.active) return;
      this.state.connStatus = 'ERROR';
      showToast(err instanceof Error ? err.message : '微信身份认证失败');
      this.scheduleReconnect();
      this.onChange();
      return;
    } finally {
      this.authenticationInFlight = false;
    }

    this.state.connStatus = 'CONNECTING';
    this.onChange();

    let task: WxSocketTask;
    try {
      task = wx.connectSocket({ url: this.state.wsUrl });
    } catch {
      this.state.connStatus = 'ERROR';
      this.scheduleReconnect();
      this.onChange();
      return;
    }

    this.socket = task;

    task.onOpen(() => {
      if (!this.active || this.socket !== task) return;
      this.reconnectAttempts = 0;
      this.state.connStatus = 'CONNECTED';
      this.send({ type: 'auth:login', token });
      this.onChange();
    });

    task.onMessage((res) => {
      if (!this.active || this.socket !== task) return;
      try {
        const rawStr = typeof res.data === 'string' ? res.data : '';
        if (!rawStr) return;
        const msg = JSON.parse(rawStr) as ServerToClientMessage;
        this.handleServerMessage(msg);
      } catch {
        // Ignore malformed frame
      }
    });

    task.onError(() => {
      if (!this.active || this.socket !== task) return;
      this.state.connStatus = 'ERROR';
      this.onChange();
    });

    task.onClose(() => {
      if (!this.active || this.socket !== task) return;
      this.socket = null;
      this.state.connStatus = 'DISCONNECTED';
      this.scheduleReconnect();
      this.onChange();
    });
  }

  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer) return;
    const delay = Math.min(8000, 1200 * Math.pow(1.4, this.reconnectAttempts++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.active) this.connect();
    }, delay);
  }

  private handleServerMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case 'auth:ok': {
        this.state.player = msg.player;
        this.send({ type: 'lobby:subscribe' });
        const targetJoin = this.state.pendingRoomJoin || this.state.room?.roomId || null;
        if (targetJoin) {
          this.send({ type: 'room:join', roomId: targetJoin });
          this.state.pendingRoomJoin = null;
        }
        break;
      }
      case 'auth:error':
        this.state.connStatus = 'ERROR';
        showToast(msg.message);
        this.closeSocket();
        this.scheduleReconnect();
        break;
      case 'lobby:rooms_update':
        this.state.publicRooms = msg.rooms;
        this.state.onlineUsers = msg.onlineUsers;
        break;
      case 'room:joined':
        this.state.room = msg.state;
        this.state.selectedCoord = null;
        this.state.legalTargets = [];
        soundFX.playSelect();
        break;
      case 'room:state_sync': {
        const prevRoom = this.state.room;
        this.state.room = msg.state;
        this.state.selectedCoord = null;
        this.state.legalTargets = [];
        const prevStep =
          prevRoom?.gomoku?.stepCount ??
          prevRoom?.xiangqi?.stepCount ??
          prevRoom?.junqi?.stepCount ??
          0;
        const nextStep =
          msg.state.gomoku?.stepCount ??
          msg.state.xiangqi?.stepCount ??
          msg.state.junqi?.stepCount ??
          0;
        if (prevRoom && nextStep > prevStep) {
          if (msg.state.gameType === 'GOMOKU') soundFX.playGomokuPlace();
          else if (msg.state.gameType === 'XIANGQI') soundFX.playXiangqiMove();
          else soundFX.playJunqiMove();
        }
        const winner =
          msg.state.gomoku?.winner ?? msg.state.xiangqi?.winner ?? msg.state.junqi?.winner ?? null;
        if (prevRoom && prevRoom.status !== 'FINISHED' && winner !== null) {
          soundFX.playVictory();
        }
        break;
      }
      case 'room:chat_message':
        if (this.state.room && this.state.room.roomId === msg.roomId) {
          this.state.room = {
            ...this.state.room,
            chatMessages: [...this.state.room.chatMessages, msg.message].slice(-60),
          };
        }
        break;
      case 'room:left':
        this.state.room = null;
        this.state.selectedCoord = null;
        this.state.legalTargets = [];
        this.send({ type: 'lobby:subscribe' });
        break;
      case 'room:error':
        showToast(msg.message);
        break;
    }
    this.onChange();
  }

  public send(msg: ClientToServerMessage): void {
    if (!this.socket || this.state.connStatus !== 'CONNECTED') {
      showToast('联机通道未连接，请检查服务端地址');
      return;
    }
    try {
      this.socket.send({ data: JSON.stringify(msg) });
    } catch {
      showToast('指令发送失败');
    }
  }

  public createRoom(gameType: OnlineGameType, junqiSubMode: JunqiSubMode, isPublic: boolean): void {
    this.send({
      type: 'room:create',
      gameType,
      junqiSubMode,
      isPublic,
    });
  }

  public joinRoom(roomId: string): void {
    const clean = roomId.trim().toUpperCase();
    if (!clean) {
      showToast('请输入房间号');
      return;
    }
    this.send({ type: 'room:join', roomId: clean });
  }

  public leaveRoom(): void {
    if (!this.state.room) return;
    this.send({
      type: 'room:leave',
      roomId: this.state.room.roomId,
    });
  }

  public toggleReady(): void {
    const r = this.state.room;
    if (!r) return;
    const isSeat1 = r.viewerRole === 'SEAT_1';
    const currentReady = isSeat1 ? r.seat1.ready : r.seat2.ready;
    this.send({
      type: 'room:ready',
      roomId: r.roomId,
      ready: !currentReady,
    });
  }

  public switchToSeat(seatNumber: 1 | 2): void {
    const r = this.state.room;
    if (!r) return;
    this.send({
      type: 'room:switch_to_seat',
      roomId: r.roomId,
      seatNumber,
    });
  }

  public refreshLobby(): void {
    this.send({ type: 'lobby:subscribe' });
  }
}
