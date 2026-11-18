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
  getOrCreatePlayerIdentity,
  getSavedWsUrl,
  parseCloudContainerTarget,
  savePlayerNickname,
  saveWsUrl,
  showToast,
} from './platform.ts';
import { soundFX } from './sound.ts';

export type WsConnStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

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
  private connectSeq = 0;
  private initializedCloudEnv: string | null = null;
  private active = false;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.state = {
      wsUrl: getSavedWsUrl(),
      connStatus: 'DISCONNECTED',
      player: getOrCreatePlayerIdentity(),
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
    this.connectSeq++;
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
      this.send({ type: 'room:join', player: this.state.player, roomId: clean });
      this.state.pendingRoomJoin = null;
    }
    this.onChange();
  }

  public updateWsUrl(nextUrl: string): void {
    this.state.wsUrl = saveWsUrl(nextUrl);
    this.reconnectAttempts = 0;
    this.closeSocket();
    if (this.active) this.connect();
    this.onChange();
  }

  public updateNickname(nick: string): void {
    this.state.player = savePlayerNickname(nick);
    if (this.state.connStatus === 'CONNECTED') {
      this.send({ type: 'lobby:subscribe', player: this.state.player });
    }
    this.onChange();
  }

  public reconnectNow(): void {
    this.reconnectAttempts = 0;
    this.closeSocket();
    this.active = true;
    this.connect();
  }

  private closeSocket(): void {
    this.connectSeq++;
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
    const attemptId = ++this.connectSeq;
    this.state.connStatus = 'CONNECTING';
    this.onChange();

    const cloudTarget = parseCloudContainerTarget(this.state.wsUrl);
    if (cloudTarget) {
      if (!wx.cloud || typeof wx.cloud.connectContainer !== 'function') {
        this.state.connStatus = 'ERROR';
        showToast('当前环境不支持微信云托管容器连接');
        this.scheduleReconnect();
        this.onChange();
        return;
      }

      try {
        if (this.initializedCloudEnv !== cloudTarget.env) {
          wx.cloud.init({ env: cloudTarget.env });
          this.initializedCloudEnv = cloudTarget.env;
        }
      } catch {
        // Ignore duplicate cloud.init
      }

      wx.cloud
        .connectContainer({
          config: { env: cloudTarget.env },
          service: cloudTarget.service,
          path: cloudTarget.path,
        })
        .then(({ socketTask }) => {
          if (!this.active || this.connectSeq !== attemptId) {
            try {
              socketTask.close({ code: 1000, reason: 'stale_connect' });
            } catch {
              // Ignore
            }
            return;
          }
          this.bindSocketTask(socketTask);
        })
        .catch(() => {
          if (!this.active || this.connectSeq !== attemptId) return;
          this.state.connStatus = 'ERROR';
          this.scheduleReconnect();
          this.onChange();
        });
      return;
    }

    let task: WxSocketTask;
    try {
      task = wx.connectSocket({ url: this.state.wsUrl });
    } catch {
      this.state.connStatus = 'ERROR';
      this.scheduleReconnect();
      this.onChange();
      return;
    }

    this.bindSocketTask(task);
  }

  private bindSocketTask(task: WxSocketTask): void {
    this.socket = task;

    task.onOpen(() => {
      if (!this.active || this.socket !== task) return;
      this.reconnectAttempts = 0;
      this.state.connStatus = 'CONNECTED';
      this.send({ type: 'lobby:subscribe', player: this.state.player });
      const targetJoin = this.state.pendingRoomJoin || this.state.room?.roomId || null;
      if (targetJoin) {
        this.send({ type: 'room:join', player: this.state.player, roomId: targetJoin });
        this.state.pendingRoomJoin = null;
      }
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
        this.send({ type: 'lobby:subscribe', player: this.state.player });
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
      player: this.state.player,
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
    this.send({ type: 'room:join', player: this.state.player, roomId: clean });
  }

  public leaveRoom(): void {
    if (!this.state.room) return;
    this.send({
      type: 'room:leave',
      playerId: this.state.player.playerId,
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
      playerId: this.state.player.playerId,
      roomId: r.roomId,
      ready: !currentReady,
    });
  }

  public switchToSeat(seatNumber: 1 | 2): void {
    const r = this.state.room;
    if (!r) return;
    this.send({
      type: 'room:switch_to_seat',
      player: this.state.player,
      roomId: r.roomId,
      seatNumber,
    });
  }

  public refreshLobby(): void {
    this.send({ type: 'lobby:subscribe', player: this.state.player });
  }
}
