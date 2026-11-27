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
import type { WxSocketTask, WxUserInfo } from './wx.d.ts';
import {
  hasCompletedOnlineAuthPrompt,
  markOnlineAuthPromptCompleted,
  showToast,
} from './platform.ts';
import {
  fetchExistingWeChatUserInfo,
  loginWithWeChat,
  normalizeWeChatAvatarUrl,
  updateCloudProfile,
  type WeChatProfileSyncInput,
} from './cloudAuth.ts';
import {
  CLOUDRUN_SERVICE_NAME,
  CLOUDRUN_WS_PATH,
  getCloudRunEnvId,
  getCloudRunTargetLabel,
} from './cloudConfig.ts';
import { soundFX } from './sound.ts';

export type WsConnStatus =
  | 'AUTH_GATE'
  | 'DISCONNECTED'
  | 'AUTHENTICATING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ERROR';

export interface OnlineClientState {
  wsUrl: string;
  connStatus: WsConnStatus;
  authBusy: boolean;
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
  private authenticationInFlight = false;
  private active = false;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.state = {
      wsUrl: getCloudRunTargetLabel(),
      connStatus: 'DISCONNECTED',
      authBusy: false,
      player: { playerId: '', nickname: '微信棋友', authStatus: 'GUEST_ALIAS' },
      publicRooms: [],
      onlineUsers: 0,
      room: null,
      pendingRoomJoin: null,
      selectedCoord: null,
      legalTargets: [],
    };
  }

  public start(): void {
    if (this.active && this.state.connStatus !== 'DISCONNECTED') return;
    this.active = true;
    if (hasCompletedOnlineAuthPrompt()) {
      this.connect();
      return;
    }
    this.state.connStatus = 'AUTH_GATE';
    this.onChange();
    void this.trySilentRestoreIfAlreadyAuthorized();
  }

  private async trySilentRestoreIfAlreadyAuthorized(): Promise<void> {
    const check = await fetchExistingWeChatUserInfo();
    if (!this.active || this.state.connStatus !== 'AUTH_GATE' || this.state.authBusy) return;
    if (!check.authorized) return;

    markOnlineAuthPromptCompleted();
    const rawNick = typeof check.userInfo?.nickName === 'string' ? check.userInfo.nickName.trim() : '';
    const cleanAvatar = normalizeWeChatAvatarUrl(check.userInfo?.avatarUrl);
    const hasRealNick = rawNick.length > 0 && rawNick !== '微信用户';
    const hasRealAvatar = Boolean(cleanAvatar);

    this.connect({
      nickName: hasRealNick ? rawNick : undefined,
      avatarUrl: hasRealAvatar ? cleanAvatar : undefined,
      authStatus: hasRealNick || hasRealAvatar ? 'AUTHORIZED' : 'GUEST_ALIAS',
    });
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
      this.send({ type: 'room:join', roomId: clean });
      this.state.pendingRoomJoin = null;
    }
    this.onChange();
  }

  public async handleWeChatUserInfoTap(
    tapRes: { userInfo?: WxUserInfo; errMsg?: string } | null,
    fromLobbyReauth = false
  ): Promise<void> {
    if (this.state.authBusy) return;
    this.active = true;
    markOnlineAuthPromptCompleted();

    const userInfo = tapRes?.userInfo ?? null;
    const errMsg = typeof tapRes?.errMsg === 'string' ? tapRes.errMsg : '';
    const isPrivacyError = /privacy|104/i.test(errMsg);

    const rawNick = typeof userInfo?.nickName === 'string' ? userInfo.nickName.trim() : '';
    const cleanAvatar = normalizeWeChatAvatarUrl(userInfo?.avatarUrl);
    const hasRealNick = rawNick.length > 0 && rawNick !== '微信用户';
    const hasRealAvatar = Boolean(cleanAvatar);
    const gotRealWeChatProfile = hasRealNick || hasRealAvatar;

    if (fromLobbyReauth) {
      if (!userInfo) {
        if (isPrivacyError) {
          showToast('需先在微信公众平台配置隐私指引（昵称与头像）');
          this.onChange();
          return;
        }
        this.promptOpenWeChatSettings();
        this.onChange();
        return;
      }
      if (!gotRealWeChatProfile) {
        showToast('微信返回默认资料，保留当前专属雅号');
        this.onChange();
        return;
      }

      await this.syncLobbyWeChatProfile(
        hasRealNick ? rawNick : undefined,
        hasRealAvatar ? cleanAvatar : undefined
      );
      return;
    }

    if (!userInfo) {
      showToast(
        isPrivacyError
          ? '未配置微信隐私指引，已先用专属雅号进入'
          : '已为你分配专属雅号，大厅可随时重新授权'
      );
      this.connect({ authStatus: 'GUEST_ALIAS' });
      return;
    }

    if (!gotRealWeChatProfile) {
      showToast('微信返回匿名资料，已为你保留专属雅号');
      this.connect({ authStatus: 'GUEST_ALIAS' });
      return;
    }

    this.connect({
      nickName: hasRealNick ? rawNick : undefined,
      avatarUrl: hasRealAvatar ? cleanAvatar : undefined,
      authStatus: 'AUTHORIZED',
    });
  }

  private async syncLobbyWeChatProfile(
    nickName: string | undefined,
    avatarUrl: string | undefined
  ): Promise<void> {
    this.state.authBusy = true;
    this.onChange();
    try {
      const auth = await updateCloudProfile({
        nickName,
        avatarUrl,
        authStatus: 'AUTHORIZED',
      });
      const cloudReturnedAvatar = Boolean(auth.player.avatarUrl);
      this.state.player = {
        ...auth.player,
        avatarUrl: auth.player.avatarUrl || avatarUrl || undefined,
        authStatus:
          auth.player.authStatus === 'AUTHORIZED' || Boolean(avatarUrl)
            ? 'AUTHORIZED'
            : 'GUEST_ALIAS',
      };
      if (this.state.connStatus === 'CONNECTED') {
        this.send({
          type: 'profile:update',
          nickname: this.state.player.nickname,
          avatarUrl: this.state.player.avatarUrl,
        });
      }
      if (avatarUrl && !cloudReturnedAvatar) {
        showToast('头像已临时显示，请重新上传部署 authLogin 云函数');
      } else {
        showToast('已同步微信头像与昵称', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '同步微信资料失败');
    } finally {
      this.state.authBusy = false;
      this.onChange();
    }
  }

  private promptOpenWeChatSettings(): void {
    if (typeof wx.openSetting !== 'function') {
      showToast('已取消微信授权，继续使用当前雅号');
      return;
    }
    try {
      wx.showModal({
        title: '开启微信头像与昵称权限',
        content: '如之前拒绝过授权，请前往设置页打开「用户信息」开关后再同步头像。',
        confirmText: '去开启',
        cancelText: '暂不',
        success: (m) => {
          if (!m.confirm) return;
          wx.openSetting!({
            success: async (res) => {
              if (!res?.authSetting?.['scope.userInfo']) {
                showToast('尚未开启用户信息权限');
                this.onChange();
                return;
              }
              const check = await fetchExistingWeChatUserInfo();
              const rawNick =
                typeof check.userInfo?.nickName === 'string' ? check.userInfo.nickName.trim() : '';
              const cleanAvatar = normalizeWeChatAvatarUrl(check.userInfo?.avatarUrl);
              const hasRealNick = rawNick.length > 0 && rawNick !== '微信用户';
              if (hasRealNick || cleanAvatar) {
                await this.syncLobbyWeChatProfile(
                  hasRealNick ? rawNick : undefined,
                  cleanAvatar || undefined
                );
              } else {
                showToast('微信返回默认匿名资料，保留当前雅号');
                this.onChange();
              }
            },
            fail: () => {
              showToast('打开授权设置失败，请在真机重试');
              this.onChange();
            },
          });
        },
      });
    } catch {
      showToast('已取消微信授权，继续使用当前雅号');
    }
  }

  public async handleFallbackAuthTap(fromLobbyReauth: boolean): Promise<void> {
    if (this.state.authBusy) return;
    const check = await fetchExistingWeChatUserInfo();
    if (check.authorized && check.userInfo) {
      await this.handleWeChatUserInfoTap({ userInfo: check.userInfo }, fromLobbyReauth);
      return;
    }
    if (fromLobbyReauth) {
      this.promptOpenWeChatSettings();
      return;
    }
    showToast('当前环境未触发原生授权按钮，请用微信真机预览测试');
    await this.handleWeChatUserInfoTap(null, false);
  }

  public enterAsGuestAlias(): void {
    if (this.state.authBusy || this.authenticationInFlight) return;
    this.active = true;
    markOnlineAuthPromptCompleted();
    this.connect({ authStatus: 'GUEST_ALIAS' });
  }

  public updateNickname(nick: string): void {
    const nickname = nick.trim().slice(0, 16);
    if (!nickname) return;
    this.state.player = { ...this.state.player, nickname };
    if (this.state.connStatus === 'CONNECTED') {
      this.send({
        type: 'profile:update',
        nickname,
        avatarUrl: this.state.player.avatarUrl,
      });
    }
    this.onChange();

    void updateCloudProfile({ nickName: nickname })
      .then((auth) => {
        this.state.player = {
          ...this.state.player,
          ...auth.player,
          nickname,
        };
        this.onChange();
      })
      .catch(() => {
        // Keep responsive local/WS rename even if cloud persistence fails transiently
      });
  }

  /** The production CloudRun container endpoint is fixed at build time. */
  public updateWsUrl(_nextUrl: string): void {
    showToast('正式版已固定走微信云托管内网通道');
  }

  public reconnectNow(): void {
    this.reconnectAttempts = 0;
    this.closeSocket();
    this.active = true;
    markOnlineAuthPromptCompleted();
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

  private connect(profile?: WeChatProfileSyncInput): void {
    if (!this.active) return;
    if (this.authenticationInFlight) return;
    const attemptId = ++this.connectSeq;
    this.authenticationInFlight = true;
    this.state.authBusy = true;
    this.state.connStatus = 'AUTHENTICATING';
    this.onChange();

    void this.authenticateAndOpenSocket(attemptId, profile);
  }

  private async authenticateAndOpenSocket(
    attemptId: number,
    profile?: WeChatProfileSyncInput
  ): Promise<void> {
    let token: string;
    try {
      const auth = await loginWithWeChat(profile);
      if (!this.active || this.connectSeq !== attemptId) return;
      token = auth.token;
      const fallbackAvatar = normalizeWeChatAvatarUrl(profile?.avatarUrl);
      this.state.player = {
        ...auth.player,
        avatarUrl: auth.player.avatarUrl || fallbackAvatar || undefined,
        authStatus:
          auth.player.authStatus === 'AUTHORIZED' || Boolean(fallbackAvatar)
            ? 'AUTHORIZED'
            : 'GUEST_ALIAS',
      };
    } catch (err) {
      if (!this.active || this.connectSeq !== attemptId) return;
      this.state.connStatus = 'ERROR';
      showToast(err instanceof Error ? err.message : '微信身份认证失败');
      this.scheduleReconnect();
      this.onChange();
      return;
    } finally {
      this.authenticationInFlight = false;
      this.state.authBusy = false;
    }

    if (!wx.cloud || typeof wx.cloud.connectContainer !== 'function') {
      this.state.connStatus = 'ERROR';
      showToast('当前微信基础库不支持云托管内网连接，请升级基础库');
      this.scheduleReconnect();
      this.onChange();
      return;
    }

    this.state.connStatus = 'CONNECTING';
    this.onChange();

    let task: WxSocketTask;
    try {
      const res = await wx.cloud.connectContainer({
        config: { env: getCloudRunEnvId() },
        service: CLOUDRUN_SERVICE_NAME,
        path: CLOUDRUN_WS_PATH,
      });
      task = res.socketTask;
    } catch {
      if (!this.active || this.connectSeq !== attemptId) return;
      this.state.connStatus = 'ERROR';
      showToast('连接微信云托管容器失败，请稍后重试');
      this.scheduleReconnect();
      this.onChange();
      return;
    }

    if (!this.active || this.connectSeq !== attemptId) {
      try {
        task.close({ code: 1000, reason: 'stale_connect' });
      } catch {
        // Ignore
      }
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
        this.state.player = {
          ...this.state.player,
          ...msg.player,
          avatarUrl: msg.player.avatarUrl || this.state.player.avatarUrl,
          authStatus:
            msg.player.authStatus === 'AUTHORIZED' || this.state.player.authStatus === 'AUTHORIZED'
              ? 'AUTHORIZED'
              : 'GUEST_ALIAS',
        };
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
