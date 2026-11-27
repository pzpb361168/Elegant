import type {
  Coord,
  JunqiOnlineBoardState,
  JunqiSide,
  JunqiSubMode,
  OnlineGameType,
} from '../shared/onlineTypes.ts';
import {
  countJunqiMines,
  getJunqiLegalMovesGeneric,
  getJunqiMinAliveOfficerRank,
  getXiangqiLegalMoves,
  JUNQI_RANK_NAMES,
} from '../shared/gameRules.ts';
import type { AIDifficulty, AllGameStats, GameTab, PlayMode } from '../types/game.ts';
import {
  applyJunqiLocalPreset,
  computeGomokuAIMove,
  computeJunqiAIAction,
  computeXiangqiAIMove,
  createGomokuSession,
  createJunqiSession,
  createXiangqiSession,
  type GomokuLocalSession,
  type JunqiLocalSession,
  stepGomokuLocal,
  stepJunqiFlipLocal,
  stepJunqiMoveLocal,
  stepXiangqiLocal,
  swapJunqiLocalSetup,
  undoGomokuLocal,
  undoJunqiLocal,
  undoXiangqiLocal,
  type XiangqiLocalSession,
} from './engines.ts';
import { renderGomokuBoard, renderJunqiBoard, renderXiangqiBoard } from './boardsRenderer.ts';
import { MiniGameOnlineClient } from './onlineClient.ts';
import {
  confirmModal,
  isSystemModalOpen,
  loadGameStats,
  promptEditableModal,
  recordGameOutcome,
  resetAllGameStats,
  type ScreenMetrics,
  setSystemModalChangeListener,
  setupWeChatPrivacyHandler,
  showToast,
} from './platform.ts';
import { soundFX } from './sound.ts';
import {
  drawButton,
  drawCircularAvatar,
  drawEllipsisText,
  drawSegmented,
  fillRoundRect,
  PALETTE,
  type Rect,
  UIRegistry,
  wrapLines,
} from './ui.ts';
import type { WxUserInfoButton } from './wx.d.ts';

type ActiveTab = Exclude<GameTab, 'LOBBY'>;
type ModalKind = 'NONE' | 'RULES' | 'STATS' | 'CREATE_ROOM' | 'CHAT';

const RULES_SECTIONS = [
  '一、五子棋（15×15 标准盘）',
  '黑先白后，先在横、竖或斜向连成五子及以上者获胜；支持 AI 支招提示与悔棋。',
  '',
  '二、中国象棋（10×9 楚河汉界）',
  '完整遵循将帅不可照面、蹩马腿、塞象眼、炮打隔山、过河卒可横行及绝杀/困毙判定。',
  '',
  '三、陆战军旗（新版核心规则）',
  '1. 排雷前置：必须清空敌方全部 3 颗地雷后，方能拔取敌方军旗。',
  '2. 排雷方式：工兵可直接排雷占领；炸弹可直接炸雷同归于尽；己方已无工兵存活时，连续 3 枚棋子撞击同一颗地雷亦可清除该雷（显示 1/3、2/3 标记）。',
  '3. 动态最低官阶扛旗回营：敌雷清零后，仅己方当前存活最低官阶棋子（工兵全亡则顺延排长等）可拔取敌军旗，并须将其扛回己方大本营方能获胜。',
  '4. 带旗免吃仅可堵截：扛旗中的棋子不可被吃且不可主动攻敌，只能被敌方卡位堵截。',
  '5. 严禁小打大：常规官阶（工兵～司令）间仅允许大吃小或同级同归，禁止低官阶主动撞击高官阶。',
  '6. 无子判输与亮明阵亡：任一方场上无任何可移动棋子即直接判负；所有模式下棋盘左右两侧均亮明双方阵亡兵种。',
];

export class MiniGameApp {
  public ui = new UIRegistry();
  public online: MiniGameOnlineClient;
  public activeTab: ActiveTab = 'GOMOKU';
  public modal: ModalKind = 'NONE';
  public stats: AllGameStats = loadGameStats();

  // Local Preferences
  public gomokuMode: PlayMode = 'PVE';
  public gomokuDiff: AIDifficulty = 'MEDIUM';
  public xiangqiMode: PlayMode = 'PVE';
  public xiangqiDiff: AIDifficulty = 'MEDIUM';
  public junqiMode: PlayMode = 'PVE';
  public junqiSubMode: JunqiSubMode = 'FLIP';
  public junqiDiff: AIDifficulty = 'MEDIUM';

  // Local Sessions
  public gomoku: GomokuLocalSession = createGomokuSession();
  public xiangqi: XiangqiLocalSession = createXiangqiSession();
  public junqi: JunqiLocalSession = createJunqiSession('FLIP');

  // Create Room draft
  public draftGameType: OnlineGameType = 'GOMOKU';
  public draftJunqiSub: JunqiSubMode = 'FLIP';
  public draftIsPublic = true;

  // Scroll offsets
  public lobbyScrollY = 0;
  public rulesScrollY = 0;
  public chatScrollY = 0;

  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = true;
  private onNeedRender: () => void;
  private nativeAuthBtn: WxUserInfoButton | null = null;
  private nativeAuthTarget: { kind: 'AUTH_GATE' | 'LOBBY_REAUTH'; rect: Rect } | null = null;
  private pendingNativeAuthTarget: { kind: 'AUTH_GATE' | 'LOBBY_REAUTH'; rect: Rect } | null = null;
  private lastNativeAuthTapAt = 0;

  constructor(onNeedRender: () => void) {
    this.onNeedRender = onNeedRender;
    this.online = new MiniGameOnlineClient(() => this.markDirty());
    setSystemModalChangeListener(() => {
      if (isSystemModalOpen()) {
        this.destroyNativeAuthButton();
      }
      this.markDirty();
    });
    setupWeChatPrivacyHandler();
  }

  public markDirty(): void {
    this.dirty = true;
    this.onNeedRender();
  }

  public consumeDirty(): boolean {
    const d = this.dirty || this.ui.hasActiveEffects();
    this.dirty = false;
    return d;
  }

  public switchTab(tab: ActiveTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.modal = 'NONE';
    if (tab !== 'ONLINE') {
      this.destroyNativeAuthButton();
    } else {
      this.online.start();
    }
    soundFX.playSelect();
    this.markDirty();
  }

  public handleJoinFromLaunch(roomId?: string): void {
    if (!roomId) return;
    this.activeTab = 'ONLINE';
    this.modal = 'NONE';
    this.online.queueJoinRoom(roomId);
    this.markDirty();
  }

  public destroyNativeAuthButton(): void {
    if (this.nativeAuthBtn) {
      try {
        this.nativeAuthBtn.hide();
        this.nativeAuthBtn.destroy();
      } catch {
        // Ignore
      }
      this.nativeAuthBtn = null;
    }
    this.nativeAuthTarget = null;
  }

  private syncNativeAuthButton(): void {
    const target =
      this.activeTab === 'ONLINE' &&
      this.modal === 'NONE' &&
      !isSystemModalOpen() &&
      !this.online.state.room &&
      !this.online.state.authBusy
        ? this.pendingNativeAuthTarget
        : null;

    if (!target || typeof wx.createUserInfoButton !== 'function') {
      this.destroyNativeAuthButton();
      return;
    }

    if (
      this.nativeAuthBtn &&
      this.nativeAuthTarget &&
      this.nativeAuthTarget.kind === target.kind &&
      Math.abs(this.nativeAuthTarget.rect.x - target.rect.x) < 1 &&
      Math.abs(this.nativeAuthTarget.rect.y - target.rect.y) < 1 &&
      Math.abs(this.nativeAuthTarget.rect.w - target.rect.w) < 1 &&
      Math.abs(this.nativeAuthTarget.rect.h - target.rect.h) < 1
    ) {
      return;
    }

    this.destroyNativeAuthButton();

    try {
      const left = Math.round(target.rect.x);
      const top = Math.round(target.rect.y);
      const width = Math.round(target.rect.w);
      const height = Math.round(target.rect.h);
      const isGate = target.kind === 'AUTH_GATE';
      const btn = wx.createUserInfoButton({
        type: 'text',
        text: isGate ? '微信授权登录' : '微信授权',
        lang: 'zh_CN',
        style: {
          left,
          top,
          width,
          height,
          backgroundColor: isGate ? PALETTE.cinnabar : PALETTE.white,
          borderColor: PALETTE.cinnabar,
          borderWidth: 1,
          borderRadius: isGate ? 10 : 6,
          color: isGate ? PALETTE.white : PALETTE.cinnabar,
          fontSize: isGate ? 14 : 11,
          lineHeight: height,
          textAlign: 'center',
        },
      });
      const isLobbyReauth = !isGate;
      btn.onTap((res) => {
        this.lastNativeAuthTapAt = Date.now();
        this.destroyNativeAuthButton();
        void this.online.handleWeChatUserInfoTap(res ?? null, isLobbyReauth);
        this.markDirty();
      });
      btn.show();
      this.nativeAuthBtn = btn;
      this.nativeAuthTarget = {
        kind: target.kind,
        rect: { x: target.rect.x, y: target.rect.y, w: target.rect.w, h: target.rect.h },
      };
    } catch (err) {
      console.warn('[auth] createUserInfoButton failed:', err);
      this.destroyNativeAuthButton();
    }
  }

  private clearAiTimer(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }

  private scheduleGomokuAI(): void {
    this.clearAiTimer();
    if (this.gomokuMode !== 'PVE' || this.gomoku.board.turn !== 2 || this.gomoku.board.winner !== null) {
      return;
    }
    this.aiTimer = setTimeout(() => {
      const coord = computeGomokuAIMove(this.gomoku.board.grid, 2, this.gomokuDiff);
      const res = stepGomokuLocal(this.gomoku, coord.r, coord.c, 'PVE');
      if (res.ok) {
        this.gomoku = res.next;
        this.ui.pushEffect('GOMOKU', coord.r, coord.c);
        if (this.gomoku.board.winner !== null) {
          soundFX.playGomokuWin();
          this.stats = recordGameOutcome(
            'GOMOKU',
            this.gomoku.board.winner === 'DRAW' ? 'DRAW' : 'LOSS'
          );
        } else {
          soundFX.playGomokuPlace();
        }
        this.markDirty();
      }
    }, 420);
  }

  private scheduleXiangqiAI(): void {
    this.clearAiTimer();
    if (
      this.xiangqiMode !== 'PVE' ||
      this.xiangqi.board.turn !== 'BLACK' ||
      this.xiangqi.board.winner !== null
    ) {
      return;
    }
    this.aiTimer = setTimeout(() => {
      const mv = computeXiangqiAIMove(this.xiangqi.board.board, 'BLACK', this.xiangqiDiff);
      if (!mv) return;
      const res = stepXiangqiLocal(this.xiangqi, mv.from, mv.to, 'PVE');
      if (res.ok) {
        this.xiangqi = res.next;
        this.ui.pushEffect(
          res.checked ? 'CHECK' : 'MOVE',
          mv.to.r,
          mv.to.c,
          res.checked ? '将军' : undefined
        );
        if (this.xiangqi.board.winner !== null) {
          soundFX.playVictory();
          this.stats = recordGameOutcome('XIANGQI', 'LOSS');
        } else if (res.checked) {
          soundFX.playCheck();
        } else if (res.captured) {
          soundFX.playXiangqiCapture();
        } else {
          soundFX.playXiangqiMove();
        }
        this.markDirty();
      }
    }, 450);
  }

  private scheduleJunqiAI(): void {
    this.clearAiTimer();
    if (
      this.junqiMode !== 'PVE' ||
      this.junqi.phase !== 'PLAYING' ||
      this.junqi.state.turn !== 'BLUE' ||
      this.junqi.state.winner !== null
    ) {
      return;
    }
    this.aiTimer = setTimeout(() => {
      const act = computeJunqiAIAction(this.junqi.state, this.junqiDiff);
      if (!act) return;
      if (act.kind === 'FLIP') {
        const res = stepJunqiFlipLocal(this.junqi, act.r, act.c, 'PVE');
        if (res.ok) {
          this.junqi = res.next;
          this.ui.pushEffect('FLIP', act.r, act.c);
          soundFX.playJunqiFlip();
        }
      } else {
        const res = stepJunqiMoveLocal(this.junqi, act.from, act.to, 'PVE');
        if (res.ok) {
          this.junqi = res.next;
          this.ui.pushEffect(res.outcomeKind, act.to.r, act.to.c);
          if (this.junqi.state.winner !== null) {
            soundFX.playVictory();
            this.stats = recordGameOutcome(
              'JUNQI',
              this.junqi.state.winner === 'DRAW'
                ? 'DRAW'
                : this.junqi.state.winner === 'RED'
                ? 'WIN'
                : 'LOSS'
            );
          } else if (res.outcomeKind === 'MOVE') {
            soundFX.playJunqiMove();
          } else {
            soundFX.playJunqiClash(res.outcomeKind);
          }
        }
      }
      this.markDirty();
    }, 480);
  }

  // ============================================================================
  // MASTER RENDER PIPELINE
  // ============================================================================

  public render(ctx: CanvasRenderingContext2D, m: ScreenMetrics): void {
    this.ui.resetFrame();
    this.pendingNativeAuthTarget = null;
    ctx.fillStyle = PALETTE.bgPaper;
    ctx.fillRect(0, 0, m.width, m.height);

    const headerTop = m.safeTop + 4;
    const headerH = 38;
    const headerBottom = headerTop + headerH;
    const navH = 52 + m.safeBottom;
    const contentTop = headerBottom + 6;
    const contentH = m.height - contentTop - navH - 4;
    const padX = 10;
    const contentRect: Rect = { x: padX, y: contentTop, w: m.width - padX * 2, h: contentH };

    this.renderHeader(ctx, m, headerTop, headerH);

    if (this.activeTab === 'GOMOKU') {
      this.renderGomokuScene(ctx, contentRect);
    } else if (this.activeTab === 'XIANGQI') {
      this.renderXiangqiScene(ctx, contentRect);
    } else if (this.activeTab === 'JUNQI') {
      this.renderJunqiScene(ctx, contentRect);
    } else {
      this.renderOnlineScene(ctx, contentRect);
    }

    this.renderBottomNav(ctx, m, navH);

    if (this.modal !== 'NONE') {
      this.renderModal(ctx, m);
    }

    this.syncNativeAuthButton();
  }

  private renderHeader(
    ctx: CanvasRenderingContext2D,
    m: ScreenMetrics,
    top: number,
    h: number
  ): void {
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fillRect(0, 0, m.width, top + h + 4);
    ctx.strokeStyle = PALETTE.lineHairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top + h + 4);
    ctx.lineTo(m.width, top + h + 4);
    ctx.stroke();

    // Action buttons placed safely to the left of WeChat top-right capsule
    const rightLimit = Math.min(m.width - 10, m.capsuleLeft);
    const btnH = 26;
    const btnY = top + (h - btnH) / 2;
    const btnW = 38;
    const gap = 4;

    const soundX = rightLimit - btnW;
    const rulesX = soundX - gap - btnW;
    const statsX = rulesX - gap - btnW;

    // Brand Title (must match official registered Mini Game name "雅弈阁-方寸之间" without truncation)
    const titleMaxW = Math.max(108, statsX - 14);
    const titleFontSize = titleMaxW < 116 ? 13 : 15;
    drawEllipsisText(
      ctx,
      '雅弈阁-方寸之间',
      10,
      top + h / 2,
      titleMaxW,
      PALETTE.woodDark,
      `700 ${titleFontSize}px serif`,
      'left',
      'middle'
    );

    drawButton(
      ctx,
      this.ui,
      'hdr-sound',
      { x: soundX, y: btnY, w: btnW, h: btnH },
      soundFX.isEnabled() ? '声开' : '静音',
      () => {
        soundFX.toggle();
        this.markDirty();
      },
      { fontSize: 11, color: soundFX.isEnabled() ? PALETTE.teal : PALETTE.inkMuted }
    );

    drawButton(
      ctx,
      this.ui,
      'hdr-rules',
      { x: rulesX, y: btnY, w: btnW, h: btnH },
      '规则',
      () => {
        this.rulesScrollY = 0;
        this.modal = 'RULES';
        soundFX.playSelect();
        this.markDirty();
      },
      { fontSize: 11 }
    );

    drawButton(
      ctx,
      this.ui,
      'hdr-stats',
      { x: statsX, y: btnY, w: btnW, h: btnH },
      '战绩',
      () => {
        this.modal = 'STATS';
        soundFX.playSelect();
        this.markDirty();
      },
      { fontSize: 11 }
    );
  }

  private renderBottomNav(ctx: CanvasRenderingContext2D, m: ScreenMetrics, navH: number): void {
    const y = m.height - navH;
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fillRect(0, y, m.width, navH);
    ctx.strokeStyle = PALETTE.lineHairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(m.width, y);
    ctx.stroke();

    const items: { key: ActiveTab; label: string; sub: string }[] = [
      { key: 'GOMOKU', label: '五子棋', sub: '15×15' },
      { key: 'XIANGQI', label: '中国象棋', sub: '楚河汉界' },
      { key: 'JUNQI', label: '陆战军旗', sub: '排雷扛旗' },
      { key: 'ONLINE', label: '联机弈馆', sub: this.online.state.room ? '对局中' : '实时房间' },
    ];

    const colW = m.width / items.length;
    const itemH = 48;
    items.forEach((it, idx) => {
      const ix = idx * colW;
      const active = this.activeTab === it.key;
      if (active) {
        fillRoundRect(ctx, ix + 6, y + 4, colW - 12, itemH - 6, 8, PALETTE.white, '#CBBBA2', 1);
      }
      drawEllipsisText(
        ctx,
        it.label,
        ix + colW / 2,
        y + 20,
        colW - 12,
        active ? PALETTE.cinnabar : PALETTE.inkPrimary,
        `${active ? '700' : '500'} 13px sans-serif`,
        'center',
        'middle'
      );
      drawEllipsisText(
        ctx,
        it.sub,
        ix + colW / 2,
        y + 35,
        colW - 12,
        active ? PALETTE.cinnabar : PALETTE.inkMuted,
        '500 9px sans-serif',
        'center',
        'middle'
      );
      this.ui.addHit(`nav-${it.key}`, { x: ix, y, w: colW, h: itemH }, () => this.switchTab(it.key));
    });
  }

  // ============================================================================
  // SCENE 1: GOMOKU
  // ============================================================================

  private renderGomokuScene(ctx: CanvasRenderingContext2D, r: Rect): void {
    let y = r.y;
    const rowH = 30;
    const halfW = (r.w - 6) / 2;

    drawSegmented(
      ctx,
      this.ui,
      'gm-mode',
      { x: r.x, y, w: halfW, h: rowH },
      [
        { key: 'PVE', label: '人机对战' },
        { key: 'PVP', label: '同屏双人' },
      ],
      this.gomokuMode,
      (k) => {
        this.gomokuMode = k as PlayMode;
        this.gomoku = createGomokuSession();
        this.clearAiTimer();
        soundFX.playSelect();
        this.markDirty();
      }
    );

    if (this.gomokuMode === 'PVE') {
      drawSegmented(
        ctx,
        this.ui,
        'gm-diff',
        { x: r.x + halfW + 6, y, w: halfW, h: rowH },
        [
          { key: 'EASY', label: '初级' },
          { key: 'MEDIUM', label: '中级' },
          { key: 'HARD', label: '高级' },
        ],
        this.gomokuDiff,
        (k) => {
          this.gomokuDiff = k as AIDifficulty;
          soundFX.playSelect();
          this.markDirty();
        }
      );
    } else {
      fillRoundRect(ctx, r.x + halfW + 6, y, halfW, rowH, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
      drawEllipsisText(
        ctx,
        `第 ${this.gomoku.board.stepCount} 手`,
        r.x + halfW + 6 + halfW / 2,
        y + rowH / 2,
        halfW - 10,
        PALETTE.inkMuted,
        '600 11px monospace',
        'center',
        'middle'
      );
    }
    y += rowH + 6;

    // Status Banner
    const b = this.gomoku.board;
    const statusText =
      b.winner === null
        ? b.turn === 1
          ? '黑方落子（先手）'
          : this.gomokuMode === 'PVE'
          ? '雅弈 AI 思考中…'
          : '白方落子（后手）'
        : b.winner === 'DRAW'
        ? '满盘和局'
        : b.winner === 1
        ? '黑方五子连珠胜出！'
        : '白方五子连珠胜出！';

    fillRoundRect(ctx, r.x, y, r.w, 30, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawEllipsisText(
      ctx,
      statusText,
      r.x + 10,
      y + 15,
      r.w - 86,
      b.winner !== null ? PALETTE.cinnabar : PALETTE.inkPrimary,
      '600 12px sans-serif'
    );
    drawEllipsisText(
      ctx,
      `步数 ${b.stepCount}`,
      r.x + r.w - 10,
      y + 15,
      70,
      PALETTE.inkMuted,
      '600 11px monospace',
      'right'
    );
    y += 36;

    // Bottom Action Row
    const actH = 34;
    const actY = r.y + r.h - actH;
    const btnW = (r.w - 18) / 4;

    drawButton(
      ctx,
      this.ui,
      'gm-undo',
      { x: r.x, y: actY, w: btnW, h: actH },
      '悔棋',
      () => {
        const next = undoGomokuLocal(this.gomoku, this.gomokuMode);
        if (next) {
          this.gomoku = next;
          soundFX.playSelect();
          this.markDirty();
        }
      },
      {
        disabled:
          this.gomoku.history.length === 0 ||
          b.winner !== null ||
          (this.gomokuMode === 'PVE' && b.turn === 2),
      }
    );

    drawButton(
      ctx,
      this.ui,
      'gm-hint',
      { x: r.x + (btnW + 6), y: actY, w: btnW, h: actH },
      '支招',
      () => {
        if (b.winner !== null || (this.gomokuMode === 'PVE' && b.turn === 2)) return;
        const coord = computeGomokuAIMove(b.grid, b.turn, 'HARD');
        this.gomoku = { ...this.gomoku, hint: coord };
        soundFX.playSelect();
        this.markDirty();
      },
      { disabled: b.winner !== null || (this.gomokuMode === 'PVE' && b.turn === 2), color: PALETTE.teal }
    );

    drawButton(
      ctx,
      this.ui,
      'gm-reset',
      { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
      '新局',
      () => {
        this.clearAiTimer();
        this.gomoku = createGomokuSession();
        soundFX.playSelect();
        this.markDirty();
      },
      { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, bold: true }
    );

    drawButton(
      ctx,
      this.ui,
      'gm-resign',
      { x: r.x + (btnW + 6) * 3, y: actY, w: btnW, h: actH },
      '认负',
      () => {
        if (b.winner !== null || b.stepCount === 0) return;
        const victor = b.turn === 1 ? 2 : 1;
        this.gomoku = { ...this.gomoku, board: { ...b, winner: victor } };
        soundFX.playCheck();
        if (this.gomokuMode === 'PVE') this.stats = recordGameOutcome('GOMOKU', 'LOSS');
        this.markDirty();
      },
      { disabled: b.winner !== null || b.stepCount === 0 }
    );

    const boardArea: Rect = { x: r.x, y, w: r.w, h: actY - y - 8 };
    const canTap = b.winner === null && !(this.gomokuMode === 'PVE' && b.turn === 2);

    renderGomokuBoard(ctx, this.ui, boardArea, b, this.gomoku.hint, canTap, (row, col) => {
      const res = stepGomokuLocal(this.gomoku, row, col, this.gomokuMode);
      if (!res.ok) return;
      this.gomoku = res.next;
      this.ui.pushEffect('GOMOKU', row, col);
      if (this.gomoku.board.winner !== null) {
        soundFX.playGomokuWin();
        const w = this.gomoku.board.winner;
        if (w === 'DRAW') this.stats = recordGameOutcome('GOMOKU', 'DRAW');
        else if (this.gomokuMode === 'PVE') this.stats = recordGameOutcome('GOMOKU', w === 1 ? 'WIN' : 'LOSS');
        else this.stats = recordGameOutcome('GOMOKU', 'WIN');
      } else {
        soundFX.playGomokuPlace();
        this.scheduleGomokuAI();
      }
      this.markDirty();
    });
  }

  // ============================================================================
  // SCENE 2: XIANGQI
  // ============================================================================

  private renderXiangqiScene(ctx: CanvasRenderingContext2D, r: Rect): void {
    let y = r.y;
    const rowH = 30;
    const halfW = (r.w - 6) / 2;

    drawSegmented(
      ctx,
      this.ui,
      'xq-mode',
      { x: r.x, y, w: halfW, h: rowH },
      [
        { key: 'PVE', label: '人机对战' },
        { key: 'PVP', label: '同屏双人' },
      ],
      this.xiangqiMode,
      (k) => {
        this.xiangqiMode = k as PlayMode;
        this.xiangqi = createXiangqiSession();
        this.clearAiTimer();
        soundFX.playSelect();
        this.markDirty();
      }
    );

    if (this.xiangqiMode === 'PVE') {
      drawSegmented(
        ctx,
        this.ui,
        'xq-diff',
        { x: r.x + halfW + 6, y, w: halfW, h: rowH },
        [
          { key: 'EASY', label: '初级' },
          { key: 'MEDIUM', label: '中级' },
          { key: 'HARD', label: '高级' },
        ],
        this.xiangqiDiff,
        (k) => {
          this.xiangqiDiff = k as AIDifficulty;
          soundFX.playSelect();
          this.markDirty();
        }
      );
    } else {
      fillRoundRect(ctx, r.x + halfW + 6, y, halfW, rowH, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
      drawEllipsisText(
        ctx,
        `回合 ${this.xiangqi.board.stepCount}`,
        r.x + halfW + 6 + halfW / 2,
        y + rowH / 2,
        halfW - 10,
        PALETTE.inkMuted,
        '600 11px monospace',
        'center',
        'middle'
      );
    }
    y += rowH + 6;

    const b = this.xiangqi.board;
    const checkSuffix = b.inCheckSide && b.winner === null ? ' · 将军！' : '';
    const statusText =
      b.winner === null
        ? (b.turn === 'RED'
            ? '红方走子'
            : this.xiangqiMode === 'PVE'
            ? '雅弈 AI 推演中…'
            : '黑方走子') + checkSuffix
        : b.winner === 'RED'
        ? '红方绝杀获胜！'
        : '黑方绝杀获胜！';

    fillRoundRect(
      ctx,
      r.x,
      y,
      r.w,
      30,
      8,
      b.inCheckSide ? PALETTE.cinnabarSoft : PALETTE.bgCard,
      b.inCheckSide ? '#FCA5A5' : PALETTE.lineHairline,
      1
    );
    drawEllipsisText(
      ctx,
      statusText,
      r.x + 10,
      y + 15,
      r.w - 86,
      b.inCheckSide || b.winner !== null ? PALETTE.cinnabar : PALETTE.inkPrimary,
      '600 12px sans-serif'
    );
    drawEllipsisText(
      ctx,
      `步数 ${b.stepCount}`,
      r.x + r.w - 10,
      y + 15,
      70,
      PALETTE.inkMuted,
      '600 11px monospace',
      'right'
    );
    y += 36;

    const actH = 34;
    const actY = r.y + r.h - actH;
    const btnW = (r.w - 12) / 3;

    drawButton(
      ctx,
      this.ui,
      'xq-undo',
      { x: r.x, y: actY, w: btnW, h: actH },
      '悔棋',
      () => {
        const next = undoXiangqiLocal(this.xiangqi, this.xiangqiMode);
        if (next) {
          this.xiangqi = next;
          soundFX.playSelect();
          this.markDirty();
        }
      },
      {
        disabled:
          this.xiangqi.history.length === 0 ||
          b.winner !== null ||
          (this.xiangqiMode === 'PVE' && b.turn === 'BLACK'),
      }
    );

    drawButton(
      ctx,
      this.ui,
      'xq-reset',
      { x: r.x + btnW + 6, y: actY, w: btnW, h: actH },
      '重开棋局',
      () => {
        this.clearAiTimer();
        this.xiangqi = createXiangqiSession();
        soundFX.playSelect();
        this.markDirty();
      },
      { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, bold: true }
    );

    drawButton(
      ctx,
      this.ui,
      'xq-resign',
      { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
      '投子认负',
      () => {
        if (b.winner !== null || b.stepCount === 0) return;
        const victor = b.turn === 'RED' ? 'BLACK' : 'RED';
        this.xiangqi = { ...this.xiangqi, board: { ...b, winner: victor } };
        soundFX.playCheck();
        if (this.xiangqiMode === 'PVE') this.stats = recordGameOutcome('XIANGQI', 'LOSS');
        this.markDirty();
      },
      { disabled: b.winner !== null || b.stepCount === 0 }
    );

    const boardArea: Rect = { x: r.x, y, w: r.w, h: actY - y - 6 };
    const canTap = b.winner === null && !(this.xiangqiMode === 'PVE' && b.turn === 'BLACK');

    renderXiangqiBoard(
      ctx,
      this.ui,
      boardArea,
      b,
      this.xiangqi.selected,
      this.xiangqi.legalTargets,
      false,
      canTap,
      (row, col) => {
        const p = b.board[row][col];
        if (p && p.side === b.turn) {
          this.xiangqi = {
            ...this.xiangqi,
            selected: { r: row, c: col },
            legalTargets: getXiangqiLegalMoves(b.board, row, col),
          };
          soundFX.playSelect();
          this.markDirty();
          return;
        }
        if (this.xiangqi.selected) {
          const isTarget = this.xiangqi.legalTargets.some((m) => m.r === row && m.c === col);
          if (isTarget) {
            const res = stepXiangqiLocal(this.xiangqi, this.xiangqi.selected, { r: row, c: col }, this.xiangqiMode);
            if (res.ok) {
              this.xiangqi = res.next;
              this.ui.pushEffect(
                res.checked ? 'CHECK' : 'MOVE',
                row,
                col,
                res.checked ? '将军' : undefined
              );
              if (this.xiangqi.board.winner !== null) {
                soundFX.playVictory();
                if (this.xiangqiMode === 'PVE') {
                  this.stats = recordGameOutcome(
                    'XIANGQI',
                    this.xiangqi.board.winner === 'RED' ? 'WIN' : 'LOSS'
                  );
                } else {
                  this.stats = recordGameOutcome('XIANGQI', 'WIN');
                }
              } else {
                if (res.checked) soundFX.playCheck();
                else if (res.captured) soundFX.playXiangqiCapture();
                else soundFX.playXiangqiMove();
                this.scheduleXiangqiAI();
              }
              this.markDirty();
              return;
            }
          }
          this.xiangqi = { ...this.xiangqi, selected: null, legalTargets: [] };
          this.markDirty();
        }
      }
    );
  }

  // ============================================================================
  // SCENE 3: JUNQI
  // ============================================================================

  private toJunqiViewState(): JunqiOnlineBoardState {
    const s = this.junqi.state;
    const hideBlue =
      this.junqi.phase === 'SETUP' ||
      (s.subMode === 'DEPLOY' && !this.junqi.openFaceDeploy && s.winner === null);

    return {
      subMode: s.subMode,
      board: s.board.map((row) =>
        row.map((p) => {
          if (!p) return null;
          if (s.subMode === 'FLIP' && !p.revealed && s.winner === null) {
            return { id: p.id, side: 'UNKNOWN', rank: null, revealed: false };
          }
          if (hideBlue && p.side === 'BLUE') {
            return {
              id: p.id,
              side: 'BLUE',
              rank: null,
              revealed: p.revealed,
              carryingFlag: p.carryingFlag,
              mineHits: p.mineHits,
            };
          }
          return { ...p };
        })
      ),
      turn: s.turn,
      lastBanner: s.lastBanner,
      lastMove: s.lastMove,
      winner: s.winner,
      stepCount: s.stepCount,
      redMines: countJunqiMines(s.board, 'RED'),
      blueMines: countJunqiMines(s.board, 'BLUE'),
      redMinRank: getJunqiMinAliveOfficerRank(s.board, 'RED'),
      blueMinRank: getJunqiMinAliveOfficerRank(s.board, 'BLUE'),
      capturedRed: s.capturedRed,
      capturedBlue: s.capturedBlue,
    };
  }

  private renderJunqiScene(ctx: CanvasRenderingContext2D, r: Rect): void {
    let y = r.y;
    const rowH = 28;
    const thirdW = (r.w - 10) / 3;

    drawSegmented(
      ctx,
      this.ui,
      'jq-mode',
      { x: r.x, y, w: thirdW, h: rowH },
      [
        { key: 'PVE', label: '人机' },
        { key: 'PVP', label: '双人' },
      ],
      this.junqiMode,
      (k) => {
        this.junqiMode = k as PlayMode;
        this.clearAiTimer();
        this.junqi = createJunqiSession(this.junqiSubMode, this.junqi.openFaceDeploy);
        soundFX.playSelect();
        this.markDirty();
      },
      10
    );

    drawSegmented(
      ctx,
      this.ui,
      'jq-sub',
      { x: r.x + thirdW + 5, y, w: thirdW, h: rowH },
      [
        { key: 'FLIP', label: '翻棋' },
        { key: 'DEPLOY', label: '布阵' },
      ],
      this.junqiSubMode,
      (k) => {
        this.junqiSubMode = k as JunqiSubMode;
        this.clearAiTimer();
        this.junqi = createJunqiSession(this.junqiSubMode, this.junqi.openFaceDeploy);
        soundFX.playSelect();
        this.markDirty();
      },
      10
    );

    if (this.junqiMode === 'PVE') {
      drawSegmented(
        ctx,
        this.ui,
        'jq-diff',
        { x: r.x + (thirdW + 5) * 2, y, w: thirdW, h: rowH },
        [
          { key: 'EASY', label: '初' },
          { key: 'MEDIUM', label: '中' },
          { key: 'HARD', label: '高' },
        ],
        this.junqiDiff,
        (k) => {
          this.junqiDiff = k as AIDifficulty;
          soundFX.playSelect();
          this.markDirty();
        },
        10
      );
    } else {
      drawButton(
        ctx,
        this.ui,
        'jq-open',
        { x: r.x + (thirdW + 5) * 2, y, w: thirdW, h: rowH },
        this.junqi.openFaceDeploy ? '明牌:开' : '暗棋',
        () => {
          this.junqi = { ...this.junqi, openFaceDeploy: !this.junqi.openFaceDeploy };
          this.markDirty();
        },
        { fontSize: 10 }
      );
    }
    y += rowH + 5;

    // Banner + Mines/Min-Rank Telemetry Line
    const s = this.junqi.state;
    const redMines = countJunqiMines(s.board, 'RED');
    const blueMines = countJunqiMines(s.board, 'BLUE');
    const redMin = getJunqiMinAliveOfficerRank(s.board, 'RED');
    const blueMin = getJunqiMinAliveOfficerRank(s.board, 'BLUE');
    const redMinStr = redMin !== null ? JUNQI_RANK_NAMES[redMin] : '无';
    const blueMinStr = blueMin !== null ? JUNQI_RANK_NAMES[blueMin] : '无';

    fillRoundRect(ctx, r.x, y, r.w, 38, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawEllipsisText(
      ctx,
      s.lastBanner,
      r.x + 8,
      y + 12,
      r.w - 16,
      s.winner !== null ? PALETTE.cinnabar : PALETTE.inkPrimary,
      '600 11px sans-serif'
    );
    drawEllipsisText(
      ctx,
      `红雷:${redMines}(扛:${redMinStr}) · 蓝雷:${blueMines}(扛:${blueMinStr}) · ${
        s.turn === 'RED' ? '红方回合' : '蓝方回合'
      }`,
      r.x + 8,
      y + 28,
      r.w - 16,
      PALETTE.inkMuted,
      '500 10px sans-serif'
    );
    y += 43;

    // Bottom Actions Row
    const actH = 32;
    const actY = r.y + r.h - actH;

    if (this.junqi.phase === 'SETUP') {
      const btnW = (r.w - 18) / 4;
      drawButton(
        ctx,
        this.ui,
        'jq-bal',
        { x: r.x, y: actY, w: btnW, h: actH },
        '均衡阵',
        () => {
          this.junqi = applyJunqiLocalPreset(this.junqi, 'BALANCED');
          soundFX.playSelect();
          this.markDirty();
        }
      );
      drawButton(
        ctx,
        this.ui,
        'jq-fort',
        { x: r.x + btnW + 6, y: actY, w: btnW, h: actH },
        '铁桶阵',
        () => {
          this.junqi = applyJunqiLocalPreset(this.junqi, 'FORTRESS');
          soundFX.playSelect();
          this.markDirty();
        }
      );
      drawButton(
        ctx,
        this.ui,
        'jq-open-setup',
        { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
        this.junqi.openFaceDeploy ? '明棋中' : '暗棋中',
        () => {
          this.junqi = { ...this.junqi, openFaceDeploy: !this.junqi.openFaceDeploy };
          this.markDirty();
        }
      );
      drawButton(
        ctx,
        this.ui,
        'jq-start',
        { x: r.x + (btnW + 6) * 3, y: actY, w: btnW, h: actH },
        '开战',
        () => {
          this.junqi = {
            ...this.junqi,
            phase: 'PLAYING',
            selected: null,
            legalTargets: [],
            state: { ...this.junqi.state, lastBanner: '布阵完成，红方率先出击！' },
          };
          soundFX.playJunqiFlip();
          this.markDirty();
        },
        { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, bold: true }
      );
    } else {
      const btnW = (r.w - 12) / 3;
      drawButton(
        ctx,
        this.ui,
        'jq-undo',
        { x: r.x, y: actY, w: btnW, h: actH },
        '悔棋',
        () => {
          const next = undoJunqiLocal(this.junqi, this.junqiMode);
          if (next) {
            this.junqi = next;
            soundFX.playSelect();
            this.markDirty();
          }
        },
        {
          disabled:
            this.junqi.history.length === 0 ||
            s.winner !== null ||
            (this.junqiMode === 'PVE' && s.turn === 'BLUE'),
        }
      );
      drawButton(
        ctx,
        this.ui,
        'jq-reset',
        { x: r.x + btnW + 6, y: actY, w: btnW, h: actH },
        '新战役',
        () => {
          this.clearAiTimer();
          this.junqi = createJunqiSession(this.junqiSubMode, this.junqi.openFaceDeploy);
          soundFX.playSelect();
          this.markDirty();
        },
        { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, bold: true }
      );
      drawButton(
        ctx,
        this.ui,
        'jq-resign',
        { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
        '认负',
        () => {
          if (s.winner !== null || s.stepCount === 0) return;
          const victor = s.turn === 'RED' ? 'BLUE' : 'RED';
          this.junqi = {
            ...this.junqi,
            phase: 'GAME_OVER',
            state: { ...s, winner: victor, lastBanner: '投子认负，战役结束！' },
          };
          soundFX.playCheck();
          if (this.junqiMode === 'PVE') this.stats = recordGameOutcome('JUNQI', 'LOSS');
          this.markDirty();
        },
        { disabled: s.winner !== null || s.stepCount === 0 }
      );
    }

    const boardArea: Rect = { x: r.x, y, w: r.w, h: actY - y - 5 };
    const viewState = this.toJunqiViewState();
    const canTap =
      this.junqi.phase !== 'GAME_OVER' &&
      !(this.junqi.phase === 'PLAYING' && this.junqiMode === 'PVE' && s.turn === 'BLUE');

    renderJunqiBoard(
      ctx,
      this.ui,
      boardArea,
      viewState,
      this.junqi.selected,
      this.junqi.legalTargets,
      false,
      canTap,
      'RED',
      (row, col) => this.handleJunqiLocalTap(row, col)
    );
  }

  private handleJunqiLocalTap(row: number, col: number): void {
    const s = this.junqi.state;
    const p = s.board[row][col];

    if (this.junqi.phase === 'SETUP') {
      if (!p || p.side !== 'RED') {
        showToast('请点击下方红方棋子调整阵型');
        return;
      }
      if (!this.junqi.selected) {
        this.junqi = { ...this.junqi, selected: { r: row, c: col } };
        soundFX.playSelect();
        this.markDirty();
        return;
      }
      if (this.junqi.selected.r === row && this.junqi.selected.c === col) {
        this.junqi = { ...this.junqi, selected: null };
        this.markDirty();
        return;
      }
      const swapped = swapJunqiLocalSetup(this.junqi, this.junqi.selected, { r: row, c: col });
      if (swapped.ok) {
        this.junqi = swapped.next;
        soundFX.playJunqiMove();
      } else {
        showToast(swapped.error);
        this.junqi = { ...this.junqi, selected: null };
      }
      this.markDirty();
      return;
    }

    // PLAYING
    if (s.subMode === 'FLIP' && p && !p.revealed) {
      const res = stepJunqiFlipLocal(this.junqi, row, col, this.junqiMode);
      if (res.ok) {
        this.junqi = res.next;
        this.ui.pushEffect('FLIP', row, col);
        soundFX.playJunqiFlip();
        this.scheduleJunqiAI();
        this.markDirty();
      }
      return;
    }

    if (this.junqi.selected) {
      if (this.junqi.selected.r === row && this.junqi.selected.c === col) {
        this.junqi = { ...this.junqi, selected: null, legalTargets: [] };
        this.markDirty();
        return;
      }
      const isTarget = this.junqi.legalTargets.some((m) => m.r === row && m.c === col);
      if (isTarget) {
        const res = stepJunqiMoveLocal(this.junqi, this.junqi.selected, { r: row, c: col }, this.junqiMode);
        if (res.ok) {
          this.junqi = res.next;
          this.ui.pushEffect(res.outcomeKind, row, col);
          if (this.junqi.state.winner !== null) {
            soundFX.playVictory();
            const w = this.junqi.state.winner;
            if (w === 'DRAW') this.stats = recordGameOutcome('JUNQI', 'DRAW');
            else if (this.junqiMode === 'PVE') this.stats = recordGameOutcome('JUNQI', w === 'RED' ? 'WIN' : 'LOSS');
            else this.stats = recordGameOutcome('JUNQI', 'WIN');
          } else {
            if (res.outcomeKind === 'MOVE') soundFX.playJunqiMove();
            else soundFX.playJunqiClash(res.outcomeKind);
            this.scheduleJunqiAI();
          }
          this.markDirty();
          return;
        } else {
          showToast(res.error);
        }
      }
    }

    if (p && p.revealed && p.side === s.turn) {
      const moves = getJunqiLegalMovesGeneric(s.board, row, col, s.subMode);
      this.junqi = { ...this.junqi, selected: { r: row, c: col }, legalTargets: moves };
      soundFX.playSelect();
      this.markDirty();
    } else {
      this.junqi = { ...this.junqi, selected: null, legalTargets: [] };
      this.markDirty();
    }
  }

  // ============================================================================
  // SCENE 4: ONLINE MULTIPLAYER (LOBBY + ROOM)
  // ============================================================================

  private renderOnlineScene(ctx: CanvasRenderingContext2D, r: Rect): void {
    const os = this.online.state;
    if (os.room) {
      this.renderOnlineRoom(ctx, r);
      return;
    }
    if (os.connStatus === 'AUTH_GATE' || (os.connStatus === 'AUTHENTICATING' && !os.player.playerId)) {
      this.renderOnlineAuthGate(ctx, r);
      return;
    }
    this.renderOnlineLobby(ctx, r);
  }

  private renderOnlineAuthGate(ctx: CanvasRenderingContext2D, r: Rect): void {
    const os = this.online.state;
    const cardW = Math.min(340, r.w - 8);
    const inviteExtra = os.pendingRoomJoin ? 36 : 0;
    const descFont = '400 12px sans-serif';
    const descLines = wrapLines(
      ctx,
      '授权后将同步你的微信头像与昵称用于棋室席位展示，仅保存于雅弈阁云端档案；拒绝授权也可使用随机雅号正常联机。',
      cardW - 44,
      descFont
    );
    const descH = descLines.length * 19;
    const cardH = Math.min(r.h - 12, 276 + descH + inviteExtra);
    const cardX = r.x + (r.w - cardW) / 2;
    const cardY = r.y + Math.max(8, (r.h - cardH) * 0.42);

    fillRoundRect(ctx, cardX, cardY, cardW, cardH, 12, PALETTE.bgCard, PALETTE.lineHairline, 1);

    let cy = cardY + 38;
    // Vermilion seal crest
    ctx.save();
    ctx.beginPath();
    ctx.arc(cardX + cardW / 2, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.cinnabar;
    ctx.fill();
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cardX + cardW / 2, cy, 20.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.white;
    ctx.font = '700 22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('弈', cardX + cardW / 2, cy + 1);
    ctx.restore();

    cy += 42;
    drawEllipsisText(
      ctx,
      '雅弈阁-方寸之间',
      cardX + cardW / 2,
      cy,
      cardW - 32,
      PALETTE.woodDark,
      '700 18px serif',
      'center',
      'middle'
    );

    cy += 22;
    drawEllipsisText(
      ctx,
      '五子棋 · 中国象棋 · 陆战军旗实时对战',
      cardX + cardW / 2,
      cy,
      cardW - 32,
      PALETTE.inkMuted,
      '500 12px sans-serif',
      'center',
      'middle'
    );

    if (os.pendingRoomJoin) {
      cy += 18;
      fillRoundRect(ctx, cardX + 20, cy, cardW - 40, 28, 7, PALETTE.goldSoft, PALETTE.goldBright, 1);
      drawEllipsisText(
        ctx,
        `受邀加入棋室 ${os.pendingRoomJoin} · 登录后自动入座`,
        cardX + cardW / 2,
        cy + 14,
        cardW - 56,
        PALETTE.gold,
        '600 11px sans-serif',
        'center',
        'middle'
      );
      cy += 34;
    } else {
      cy += 18;
    }

    // Subtle hairline divider
    ctx.save();
    ctx.strokeStyle = PALETTE.lineHairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 22, cy);
    ctx.lineTo(cardX + cardW - 22, cy);
    ctx.stroke();
    ctx.restore();

    cy += 16;
    ctx.save();
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.font = descFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    descLines.forEach((line, idx) => {
      ctx.fillText(line, cardX + cardW / 2, cy + idx * 19);
    });
    ctx.restore();

    const btnW = cardW - 44;
    const btnX = cardX + 22;
    const primaryY = cardY + cardH - 108;
    const primaryRect: Rect = { x: btnX, y: primaryY, w: btnW, h: 44 };
    const isBusy = os.connStatus === 'AUTHENTICATING' || os.authBusy;

    ctx.save();
    if (isBusy) ctx.globalAlpha = 0.65;
    fillRoundRect(
      ctx,
      primaryRect.x,
      primaryRect.y,
      primaryRect.w,
      primaryRect.h,
      10,
      PALETTE.cinnabar,
      PALETTE.cinnabar,
      1
    );
    drawEllipsisText(
      ctx,
      isBusy ? '正在同步微信身份…' : '微信授权登录',
      primaryRect.x + primaryRect.w / 2,
      primaryRect.y + primaryRect.h / 2,
      primaryRect.w - 16,
      PALETTE.white,
      '600 14px sans-serif',
      'center',
      'middle'
    );
    ctx.restore();

    if (!isBusy) {
      this.pendingNativeAuthTarget = { kind: 'AUTH_GATE', rect: primaryRect };
      this.ui.addHit('ol-auth-wechat-fallback', primaryRect, () => {
        if (Date.now() - this.lastNativeAuthTapAt < 600) return;
        void this.online.handleFallbackAuthTap(false);
      });
    }

    const secondaryRect: Rect = { x: btnX, y: primaryY + 54, w: btnW, h: 38 };
    drawButton(
      ctx,
      this.ui,
      'ol-auth-guest',
      secondaryRect,
      '先用随机雅号进入',
      () => this.online.enterAsGuestAlias(),
      {
        bg: PALETTE.white,
        border: PALETTE.lineHairline,
        color: PALETTE.inkPrimary,
        radius: 10,
        fontSize: 13,
        disabled: isBusy,
      }
    );
  }

  private renderOnlineLobby(ctx: CanvasRenderingContext2D, r: Rect): void {
    const os = this.online.state;
    let y = r.y;

    // Connection Status + Refresh/Reconnect
    const statusLabel =
      os.connStatus === 'CONNECTED'
        ? `已连接 · 在线 ${os.onlineUsers} 人`
        : os.connStatus === 'AUTHENTICATING'
        ? '正在进行微信身份认证…'
        : os.connStatus === 'CONNECTING'
        ? '正在连接微信云托管联机服务…'
        : '未连接（请核对云开发与云托管服务配置）';
    const statusColor =
      os.connStatus === 'CONNECTED'
        ? PALETTE.teal
        : os.connStatus === 'AUTHENTICATING' || os.connStatus === 'CONNECTING'
        ? PALETTE.gold
        : PALETTE.cinnabar;

    fillRoundRect(ctx, r.x, y, r.w, 34, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawEllipsisText(ctx, statusLabel, r.x + 10, y + 17, r.w - 86, statusColor, '600 11px sans-serif');
    drawButton(
      ctx,
      this.ui,
      'ol-reconn',
      { x: r.x + r.w - 70, y: y + 4, w: 64, h: 26 },
      os.connStatus === 'CONNECTED' ? '刷新' : '重连',
      () => {
        if (os.connStatus === 'CONNECTED') this.online.refreshLobby();
        else this.online.reconnectNow();
      },
      { fontSize: 11 }
    );
    y += 40;

    // Player Identity + Avatar + Optional WeChat Re-auth Card
    const profileCardH = 72;
    fillRoundRect(ctx, r.x, y, r.w, profileCardH, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawCircularAvatar(
      ctx,
      r.x + 28,
      y + profileCardH / 2,
      19,
      os.player.avatarUrl,
      os.player.nickname,
      PALETTE.cinnabar,
      () => this.markDirty()
    );

    const hasWeChatAvatar = os.player.authStatus === 'AUTHORIZED' && Boolean(os.player.avatarUrl);
    drawEllipsisText(
      ctx,
      os.player.nickname,
      r.x + 56,
      y + 23,
      r.w - 134,
      PALETTE.inkPrimary,
      '700 13px sans-serif'
    );
    drawEllipsisText(
      ctx,
      hasWeChatAvatar
        ? '已同步微信头像 · 云托管内网直连'
        : '随机雅号模式 · 可随时同步微信头像',
      r.x + 56,
      y + 48,
      r.w - 134,
      hasWeChatAvatar ? PALETTE.teal : PALETTE.inkMuted,
      '500 10px sans-serif'
    );

    drawButton(
      ctx,
      this.ui,
      'ol-nick',
      { x: r.x + r.w - 72, y: y + 8, w: 64, h: 24 },
      '改雅号',
      () => {
        promptEditableModal('修改棋士雅号', os.player.nickname, '请输入最多16字雅号', (val) => {
          this.online.updateNickname(val);
        });
      },
      { fontSize: 10 }
    );

    if (!hasWeChatAvatar) {
      const reauthRect: Rect = { x: r.x + r.w - 72, y: y + 40, w: 64, h: 24 };
      ctx.save();
      if (os.authBusy) ctx.globalAlpha = 0.55;
      fillRoundRect(
        ctx,
        reauthRect.x,
        reauthRect.y,
        reauthRect.w,
        reauthRect.h,
        6,
        PALETTE.white,
        PALETTE.cinnabar,
        1
      );
      drawEllipsisText(
        ctx,
        os.authBusy ? '同步中…' : '微信授权',
        reauthRect.x + reauthRect.w / 2,
        reauthRect.y + reauthRect.h / 2,
        reauthRect.w - 6,
        PALETTE.cinnabar,
        '600 10px sans-serif',
        'center',
        'middle'
      );
      ctx.restore();

      if (!os.authBusy) {
        this.pendingNativeAuthTarget = { kind: 'LOBBY_REAUTH', rect: reauthRect };
        this.ui.addHit('ol-reauth-fallback', reauthRect, () => {
          if (Date.now() - this.lastNativeAuthTapAt < 600) return;
          void this.online.handleFallbackAuthTap(true);
        });
      }
    } else {
      drawEllipsisText(
        ctx,
        '微信已同步',
        r.x + r.w - 40,
        y + 52,
        64,
        PALETTE.teal,
        '600 10px sans-serif',
        'center',
        'middle'
      );
    }
    y += profileCardH + 8;

    // Create / Join Buttons
    const halfW = (r.w - 8) / 2;
    drawButton(
      ctx,
      this.ui,
      'ol-create',
      { x: r.x, y, w: halfW, h: 38 },
      '创建新棋室',
      () => {
        this.modal = 'CREATE_ROOM';
        soundFX.playSelect();
        this.markDirty();
      },
      { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, fontSize: 13, bold: true }
    );
    drawButton(
      ctx,
      this.ui,
      'ol-join-code',
      { x: r.x + halfW + 8, y, w: halfW, h: 38 },
      '房号直达',
      () => {
        promptEditableModal('输入 6 位房间号', '', '例如 A7K9P2', (code) => {
          this.online.joinRoom(code);
        });
      },
      { bg: PALETTE.bgCard, border: PALETTE.cinnabar, color: PALETTE.cinnabar, fontSize: 13, bold: true }
    );
    y += 46;

    // Public Rooms List Header
    drawEllipsisText(
      ctx,
      `公开棋室大厅（${os.publicRooms.length}）`,
      r.x + 2,
      y + 10,
      r.w,
      PALETTE.inkPrimary,
      '700 13px sans-serif'
    );
    y += 24;

    const listRect: Rect = { x: r.x, y, w: r.w, h: r.y + r.h - y };
    fillRoundRect(ctx, listRect.x, listRect.y, listRect.w, listRect.h, 8, PALETTE.bgPanel, PALETTE.lineHairline, 1);

    if (os.publicRooms.length === 0) {
      drawEllipsisText(
        ctx,
        os.connStatus === 'CONNECTED'
          ? '暂无公开棋室，点击上方「创建新棋室」开局'
          : '连接服务端后将自动同步公开房间列表',
        listRect.x + listRect.w / 2,
        listRect.y + listRect.h / 2,
        listRect.w - 24,
        PALETTE.inkMuted,
        '500 12px sans-serif',
        'center',
        'middle'
      );
      return;
    }

    const cardH = 58;
    const gap = 6;
    const totalH = os.publicRooms.length * (cardH + gap) + 8;
    const maxScroll = Math.max(0, totalH - listRect.h);
    this.lobbyScrollY = Math.min(this.lobbyScrollY, maxScroll);
    this.ui.addScroll('lobby-scroll', listRect, maxScroll, () => this.lobbyScrollY, (next) => {
      this.lobbyScrollY = next;
      this.markDirty();
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(listRect.x + 2, listRect.y + 2, listRect.w - 4, listRect.h - 4);
    ctx.clip();

    os.publicRooms.forEach((rm, idx) => {
      const cy = listRect.y + 6 + idx * (cardH + gap) - this.lobbyScrollY;
      if (cy + cardH < listRect.y || cy > listRect.y + listRect.h) return;
      fillRoundRect(ctx, listRect.x + 6, cy, listRect.w - 12, cardH, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);

      const gameLabel =
        rm.gameType === 'GOMOKU'
          ? '五子棋'
          : rm.gameType === 'XIANGQI'
          ? '象棋'
          : rm.junqiSubMode === 'DEPLOY'
          ? '军旗·布阵'
          : '军旗·翻棋';
      const statusTxt =
        rm.status === 'WAITING'
          ? '等待中'
          : rm.status === 'DEPLOYING'
          ? '布阵中'
          : rm.status === 'PLAYING'
          ? '对弈中'
          : '已结束';

      drawEllipsisText(
        ctx,
        rm.roomName,
        listRect.x + 14,
        cy + 18,
        listRect.w - 92,
        PALETTE.inkPrimary,
        '600 12px sans-serif'
      );
      drawEllipsisText(
        ctx,
        `${gameLabel} · ${statusTxt} · 席位 ${rm.playerCount}/2 · 观战 ${rm.spectatorCount}`,
        listRect.x + 14,
        cy + 39,
        listRect.w - 92,
        PALETTE.inkMuted,
        '500 10px sans-serif'
      );

      drawButton(
        ctx,
        this.ui,
        `join-${rm.roomId}`,
        { x: listRect.x + listRect.w - 72, y: cy + 14, w: 58, h: 30 },
        rm.playerCount < 2 && rm.status === 'WAITING' ? '入座' : '观战',
        () => this.online.joinRoom(rm.roomId),
        {
          bg: rm.playerCount < 2 && rm.status === 'WAITING' ? PALETTE.cinnabar : PALETTE.bgPanel,
          border: rm.playerCount < 2 && rm.status === 'WAITING' ? PALETTE.cinnabar : PALETTE.lineHairline,
          color: rm.playerCount < 2 && rm.status === 'WAITING' ? PALETTE.white : PALETTE.inkPrimary,
          fontSize: 11,
          bold: true,
        }
      );
    });
    ctx.restore();
  }

  private renderOnlineRoom(ctx: CanvasRenderingContext2D, r: Rect): void {
    const os = this.online.state;
    const room = os.room!;
    let y = r.y;

    // Room Top Bar: Room ID, Copy, Share, Leave
    fillRoundRect(ctx, r.x, y, r.w, 32, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawEllipsisText(
      ctx,
      `房号 ${room.roomId} · ${
        room.gameType === 'GOMOKU' ? '五子棋' : room.gameType === 'XIANGQI' ? '象棋' : '军旗'
      }`,
      r.x + 8,
      y + 16,
      r.w - 166,
      PALETTE.inkPrimary,
      '600 11px sans-serif'
    );

    drawButton(
      ctx,
      this.ui,
      'rm-copy',
      { x: r.x + r.w - 152, y: y + 4, w: 46, h: 24 },
      '复制',
      () => {
        wx.setClipboardData({
          data: room.roomId,
          success: () => showToast(`已复制房号 ${room.roomId}`, 'success'),
        });
      },
      { fontSize: 10 }
    );

    drawButton(
      ctx,
      this.ui,
      'rm-share',
      { x: r.x + r.w - 102, y: y + 4, w: 46, h: 24 },
      '邀请',
      () => {
        if (typeof wx.shareAppMessage === 'function') {
          wx.shareAppMessage({
            title: `${os.player.nickname} 邀你来雅弈阁-方寸之间对弈（房号 ${room.roomId}）`,
            query: `room=${room.roomId}`,
          });
        } else {
          wx.setClipboardData({ data: room.roomId });
          showToast(`请发送房号 ${room.roomId} 给好友`);
        }
      },
      { fontSize: 10, color: PALETTE.teal }
    );

    drawButton(
      ctx,
      this.ui,
      'rm-leave',
      { x: r.x + r.w - 52, y: y + 4, w: 46, h: 24 },
      '离开',
      () => {
        confirmModal('离开棋室', '确认退出当前联机棋室？', () => this.online.leaveRoom());
      },
      { fontSize: 10, color: PALETTE.cinnabar }
    );
    y += 37;

    // Seats Info Bar
    const s1Label = room.gameType === 'GOMOKU' ? '黑' : '红';
    const s2Label = room.gameType === 'GOMOKU' ? '白' : room.gameType === 'XIANGQI' ? '黑' : '蓝';
    const seatBoxW = (r.w - 6) / 2;

    const drawSeat = (
      sx: number,
      seatNum: 1 | 2,
      nick: string | null,
      avatarUrl: string | undefined,
      ready: boolean,
      roleColor: string,
      sideChar: string
    ) => {
      const isMine = (seatNum === 1 && room.viewerRole === 'SEAT_1') || (seatNum === 2 && room.viewerRole === 'SEAT_2');
      fillRoundRect(
        ctx,
        sx,
        y,
        seatBoxW,
        30,
        7,
        isMine ? PALETTE.white : PALETTE.bgCard,
        isMine ? roleColor : PALETTE.lineHairline,
        isMine ? 1.4 : 1
      );
      drawCircularAvatar(
        ctx,
        sx + 15,
        y + 15,
        10,
        nick ? avatarUrl : undefined,
        nick || sideChar,
        nick ? roleColor : PALETTE.inkMuted,
        () => this.markDirty()
      );
      const txt = nick ? `${sideChar}:${nick}${ready && room.status === 'WAITING' ? '(就绪)' : ''}` : `${sideChar}:空席位`;
      drawEllipsisText(ctx, txt, sx + 30, y + 15, seatBoxW - 36, nick ? roleColor : PALETTE.inkMuted, '600 11px sans-serif');
      if (!nick && room.status === 'WAITING') {
        this.ui.addHit(`seat-${seatNum}`, { x: sx, y, w: seatBoxW, h: 30 }, () =>
          this.online.switchToSeat(seatNum)
        );
      }
    };

    drawSeat(r.x, 1, room.seat1.nickname, room.seat1.avatarUrl, room.seat1.ready, PALETTE.cinnabar, s1Label);
    drawSeat(r.x + seatBoxW + 6, 2, room.seat2.nickname, room.seat2.avatarUrl, room.seat2.ready, PALETTE.indigo, s2Label);
    y += 35;

    // Pending Request Banner OR Turn/Deploy Banner
    const mySeatNum: 1 | 2 | null =
      room.viewerRole === 'SEAT_1' ? 1 : room.viewerRole === 'SEAT_2' ? 2 : null;

    if (room.pendingRequest && mySeatNum && room.pendingRequest.fromSeat !== mySeatNum) {
      fillRoundRect(ctx, r.x, y, r.w, 30, 8, PALETTE.goldSoft, PALETTE.goldBright, 1.2);
      drawEllipsisText(
        ctx,
        `${room.pendingRequest.fromNickname} 请求${
          room.pendingRequest.type === 'UNDO' ? '悔棋' : '和棋'
        }`,
        r.x + 8,
        y + 15,
        r.w - 116,
        PALETTE.inkPrimary,
        '600 11px sans-serif'
      );
      drawButton(
        ctx,
        this.ui,
        'req-ok',
        { x: r.x + r.w - 102, y: y + 3, w: 46, h: 24 },
        '同意',
        () =>
          this.online.send({
            type: 'game:respond_action',
            roomId: room.roomId,
            accept: true,
          }),
        { bg: PALETTE.teal, border: PALETTE.teal, color: PALETTE.white, fontSize: 10 }
      );
      drawButton(
        ctx,
        this.ui,
        'req-no',
        { x: r.x + r.w - 52, y: y + 3, w: 46, h: 24 },
        '婉拒',
        () =>
          this.online.send({
            type: 'game:respond_action',
            roomId: room.roomId,
            accept: false,
          }),
        { fontSize: 10 }
      );
      y += 35;
    } else if (room.gameType === 'JUNQI' && room.junqi) {
      fillRoundRect(ctx, r.x, y, r.w, 26, 7, PALETTE.bgCard, PALETTE.lineHairline, 1);
      drawEllipsisText(
        ctx,
        `${room.junqi.lastBanner}（红雷:${room.junqi.redMines} 蓝雷:${room.junqi.blueMines}）`,
        r.x + 8,
        y + 13,
        r.w - 16,
        PALETTE.inkPrimary,
        '600 10px sans-serif'
      );
      y += 31;
    }

    // Bottom Chat Strip + Action Bar
    const actH = 32;
    const chatH = 26;
    const actY = r.y + r.h - actH;
    const chatY = actY - chatH - 4;

    const latestMsg = room.chatMessages[room.chatMessages.length - 1];
    fillRoundRect(ctx, r.x, chatY, r.w, chatH, 6, PALETTE.bgCard, PALETTE.lineHairline, 1);
    drawEllipsisText(
      ctx,
      latestMsg ? `${latestMsg.senderName}：${latestMsg.text}` : '点击打开聊天与战报面板',
      r.x + 8,
      chatY + chatH / 2,
      r.w - 64,
      PALETTE.inkMuted,
      '500 10px sans-serif'
    );
    drawButton(
      ctx,
      this.ui,
      'rm-chat-btn',
      { x: r.x + r.w - 52, y: chatY + 2, w: 48, h: chatH - 4 },
      '聊天',
      () => {
        this.chatScrollY = 0;
        this.modal = 'CHAT';
        this.markDirty();
      },
      { fontSize: 10 }
    );

    // Contextual Bottom Buttons
    if (room.status === 'WAITING') {
      const halfW = (r.w - 6) / 2;
      if (room.viewerRole !== 'SPECTATOR') {
        const isReady = room.viewerRole === 'SEAT_1' ? room.seat1.ready : room.seat2.ready;
        drawButton(
          ctx,
          this.ui,
          'rm-ready',
          { x: r.x, y: actY, w: halfW, h: actH },
          isReady ? '取消准备' : '准备开局',
          () => this.online.toggleReady(),
          {
            bg: isReady ? PALETTE.bgCard : PALETTE.cinnabar,
            border: PALETTE.cinnabar,
            color: isReady ? PALETTE.cinnabar : PALETTE.white,
            bold: true,
          }
        );
      } else {
        drawButton(ctx, this.ui, 'rm-spec-w', { x: r.x, y: actY, w: halfW, h: actH }, '观战等待中', () => {}, {
          disabled: true,
        });
      }
      drawButton(
        ctx,
        this.ui,
        'rm-say',
        { x: r.x + halfW + 6, y: actY, w: halfW, h: actH },
        '发消息',
        () => this.promptChatSend()
      );
    } else if (room.status === 'DEPLOYING' && room.gameType === 'JUNQI') {
      const isConfirmed =
        (room.viewerRole === 'SEAT_1' && room.seat1.setupConfirmed) ||
        (room.viewerRole === 'SEAT_2' && room.seat2.setupConfirmed);
      const btnW = (r.w - 18) / 4;
      drawButton(
        ctx,
        this.ui,
        'rm-jq-bal',
        { x: r.x, y: actY, w: btnW, h: actH },
        '均衡',
        () =>
          this.online.send({
            type: 'junqi:preset_setup',
            roomId: room.roomId,
            preset: 'BALANCED',
          }),
        { disabled: room.viewerRole === 'SPECTATOR' || isConfirmed }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-jq-fort',
        { x: r.x + btnW + 6, y: actY, w: btnW, h: actH },
        '铁桶',
        () =>
          this.online.send({
            type: 'junqi:preset_setup',
            roomId: room.roomId,
            preset: 'FORTRESS',
          }),
        { disabled: room.viewerRole === 'SPECTATOR' || isConfirmed }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-jq-done',
        { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
        isConfirmed ? '已就绪' : '完成布阵',
        () =>
          this.online.send({
            type: 'junqi:confirm_setup',
            roomId: room.roomId,
          }),
        {
          bg: isConfirmed ? PALETTE.bgCard : PALETTE.cinnabar,
          border: PALETTE.cinnabar,
          color: isConfirmed ? PALETTE.cinnabar : PALETTE.white,
          disabled: room.viewerRole === 'SPECTATOR' || isConfirmed,
          bold: true,
        }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-say-dep',
        { x: r.x + (btnW + 6) * 3, y: actY, w: btnW, h: actH },
        '聊天',
        () => this.promptChatSend()
      );
    } else if (room.status === 'PLAYING') {
      const btnW = (r.w - 18) / 4;
      const isPlayer = room.viewerRole !== 'SPECTATOR';
      drawButton(
        ctx,
        this.ui,
        'rm-undo',
        { x: r.x, y: actY, w: btnW, h: actH },
        '悔棋',
        () =>
          this.online.send({
            type: 'game:request_action',
            roomId: room.roomId,
            action: 'UNDO',
          }),
        { disabled: !isPlayer || room.pendingRequest !== null }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-draw',
        { x: r.x + btnW + 6, y: actY, w: btnW, h: actH },
        '和棋',
        () =>
          this.online.send({
            type: 'game:request_action',
            roomId: room.roomId,
            action: 'DRAW',
          }),
        { disabled: !isPlayer || room.pendingRequest !== null }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-resign',
        { x: r.x + (btnW + 6) * 2, y: actY, w: btnW, h: actH },
        '认负',
        () =>
          confirmModal('确认认负', '确定投子认负并结束本局？', () =>
            this.online.send({
              type: 'game:resign',
              roomId: room.roomId,
            })
          ),
        { disabled: !isPlayer, color: PALETTE.cinnabar }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-say-pl',
        { x: r.x + (btnW + 6) * 3, y: actY, w: btnW, h: actH },
        '发消息',
        () => this.promptChatSend()
      );
    } else {
      // FINISHED
      const halfW = (r.w - 6) / 2;
      drawButton(
        ctx,
        this.ui,
        'rm-rematch',
        { x: r.x, y: actY, w: halfW, h: actH },
        '再来一局',
        () =>
          this.online.send({
            type: 'game:rematch',
            roomId: room.roomId,
          }),
        {
          bg: PALETTE.cinnabar,
          border: PALETTE.cinnabar,
          color: PALETTE.white,
          bold: true,
          disabled: room.viewerRole === 'SPECTATOR',
        }
      );
      drawButton(
        ctx,
        this.ui,
        'rm-say-fin',
        { x: r.x + halfW + 6, y: actY, w: halfW, h: actH },
        '发消息',
        () => this.promptChatSend()
      );
    }

    // Online Interactive Board Area
    const boardArea: Rect = { x: r.x, y, w: r.w, h: chatY - y - 5 };
    const isFlipped = room.viewerRole === 'SEAT_2';
    const isMyTurn =
      room.status === 'PLAYING' &&
      room.viewerRole !== 'SPECTATOR' &&
      ((room.gameType === 'GOMOKU' &&
        room.gomoku?.turn === (room.viewerRole === 'SEAT_1' ? 1 : 2)) ||
        (room.gameType === 'XIANGQI' &&
          room.xiangqi?.turn === (room.viewerRole === 'SEAT_1' ? 'RED' : 'BLACK')) ||
        (room.gameType === 'JUNQI' &&
          room.junqi?.turn === (room.viewerRole === 'SEAT_1' ? 'RED' : 'BLUE')));

    if (room.gameType === 'GOMOKU' && room.gomoku) {
      renderGomokuBoard(
        ctx,
        this.ui,
        boardArea,
        room.gomoku,
        null,
        isMyTurn,
        (row, col) => {
          this.online.send({
            type: 'game:move',
            roomId: room.roomId,
            payload: { kind: 'GOMOKU', r: row, c: col },
          });
        }
      );
    } else if (room.gameType === 'XIANGQI' && room.xiangqi) {
      const mySide = room.viewerRole === 'SEAT_1' ? 'RED' : 'BLACK';
      renderXiangqiBoard(
        ctx,
        this.ui,
        boardArea,
        room.xiangqi,
        os.selectedCoord,
        os.legalTargets,
        isFlipped,
        isMyTurn,
        (row, col) => {
          const p = room.xiangqi!.board[row][col];
          if (p && p.side === mySide) {
            this.online.state.selectedCoord = { r: row, c: col };
            this.online.state.legalTargets = getXiangqiLegalMoves(room.xiangqi!.board, row, col);
            soundFX.playSelect();
            this.markDirty();
            return;
          }
          if (os.selectedCoord) {
            const isTarget = os.legalTargets.some((m) => m.r === row && m.c === col);
            if (isTarget) {
              this.online.send({
                type: 'game:move',
                roomId: room.roomId,
                payload: { kind: 'XIANGQI', from: os.selectedCoord, to: { r: row, c: col } },
              });
            } else {
              this.online.state.selectedCoord = null;
              this.online.state.legalTargets = [];
              this.markDirty();
            }
          }
        }
      );
    } else if (room.gameType === 'JUNQI' && room.junqi) {
      const mySide: JunqiSide | 'SPECTATOR' =
        room.viewerRole === 'SEAT_1' ? 'RED' : room.viewerRole === 'SEAT_2' ? 'BLUE' : 'SPECTATOR';
      const canInteractJunqi =
        room.viewerRole !== 'SPECTATOR' &&
        (room.status === 'DEPLOYING' || isMyTurn);

      renderJunqiBoard(
        ctx,
        this.ui,
        boardArea,
        room.junqi,
        os.selectedCoord,
        os.legalTargets,
        isFlipped,
        canInteractJunqi,
        mySide,
        (row, col) => this.handleOnlineJunqiTap(row, col, mySide)
      );
    }
  }

  private handleOnlineJunqiTap(row: number, col: number, mySide: JunqiSide | 'SPECTATOR'): void {
    const os = this.online.state;
    const room = os.room;
    if (!room || !room.junqi || mySide === 'SPECTATOR') return;
    const jq = room.junqi;
    const p = jq.board[row][col];

    if (room.status === 'DEPLOYING') {
      const seatConfirmed = mySide === 'RED' ? room.seat1.setupConfirmed : room.seat2.setupConfirmed;
      if (seatConfirmed || !p || p.side !== mySide) return;
      if (!os.selectedCoord) {
        os.selectedCoord = { r: row, c: col };
        soundFX.playSelect();
        this.markDirty();
      } else if (os.selectedCoord.r === row && os.selectedCoord.c === col) {
        os.selectedCoord = null;
        this.markDirty();
      } else {
        this.online.send({
          type: 'junqi:swap_setup',
          roomId: room.roomId,
          c1: os.selectedCoord,
          c2: { r: row, c: col },
        });
        os.selectedCoord = null;
        this.markDirty();
      }
      return;
    }

    if (jq.subMode === 'FLIP' && p && !p.revealed) {
      this.online.send({
        type: 'game:move',
        roomId: room.roomId,
        payload: { kind: 'JUNQI_FLIP', r: row, c: col },
      });
      return;
    }

    if (os.selectedCoord) {
      if (os.selectedCoord.r === row && os.selectedCoord.c === col) {
        os.selectedCoord = null;
        os.legalTargets = [];
        this.markDirty();
        return;
      }
      if (os.legalTargets.some((m) => m.r === row && m.c === col)) {
        this.online.send({
          type: 'game:move',
          roomId: room.roomId,
          payload: { kind: 'JUNQI_MOVE', from: os.selectedCoord, to: { r: row, c: col } },
        });
        return;
      }
    }

    if (p && p.revealed && p.side === mySide) {
      os.selectedCoord = { r: row, c: col };
      os.legalTargets = getJunqiLegalMovesGeneric(jq.board, row, col, jq.subMode, {
        enemyMinesCount: mySide === 'RED' ? jq.blueMines : jq.redMines,
        ownMinRank: mySide === 'RED' ? jq.redMinRank : jq.blueMinRank,
      });
      soundFX.playSelect();
      this.markDirty();
    } else {
      os.selectedCoord = null;
      os.legalTargets = [];
      this.markDirty();
    }
  }

  private promptChatSend(): void {
    const os = this.online.state;
    if (!os.room) return;
    const roomId = os.room.roomId;
    promptEditableModal('发送棋室消息', '', '输入想说的话…', (text) => {
      if (!text.trim()) return;
      this.online.send({
        type: 'chat:send',
        roomId,
        text: text.trim().slice(0, 120),
      });
    });
  }

  // ============================================================================
  // MODALS (RULES / STATS / CREATE ROOM / CHAT)
  // ============================================================================

  private renderModal(ctx: CanvasRenderingContext2D, m: ScreenMetrics): void {
    ctx.fillStyle = 'rgba(25, 16, 10, 0.55)';
    ctx.fillRect(0, 0, m.width, m.height);

    const mw = Math.min(340, m.width - 28);
    const mh = Math.min(460, m.height - m.safeTop - m.safeBottom - 80);
    const mx = (m.width - mw) / 2;
    const my = (m.height - mh) / 2;

    // Swallow backdrop taps cleanly
    this.ui.addHit('modal-backdrop', { x: 0, y: 0, w: m.width, h: m.height }, () => {
      this.modal = 'NONE';
      this.markDirty();
    });

    fillRoundRect(ctx, mx, my, mw, mh, 14, PALETTE.bgPaper, '#CBBBA2', 1.5);
    this.ui.addHit('modal-body', { x: mx, y: my, w: mw, h: mh }, () => {});

    const titleMap: Record<Exclude<ModalKind, 'NONE'>, string> = {
      RULES: '棋道规则典籍',
      STATS: '本地战绩录',
      CREATE_ROOM: '创建联机棋室',
      CHAT: '棋室聊天与战报',
    };

    drawEllipsisText(
      ctx,
      titleMap[this.modal as Exclude<ModalKind, 'NONE'>],
      mx + 16,
      my + 24,
      mw - 76,
      PALETTE.woodDark,
      '700 15px serif'
    );
    drawButton(
      ctx,
      this.ui,
      'modal-close',
      { x: mx + mw - 56, y: my + 10, w: 44, h: 28 },
      '关闭',
      () => {
        this.modal = 'NONE';
        this.markDirty();
      },
      { fontSize: 11 }
    );

    const bodyRect: Rect = { x: mx + 14, y: my + 48, w: mw - 28, h: mh - 62 };

    if (this.modal === 'RULES') {
      const wrapped: { text: string; isHeader: boolean }[] = [];
      for (const sec of RULES_SECTIONS) {
        const isHeader = /^[一二三]、/.test(sec);
        if (!sec) {
          wrapped.push({ text: '', isHeader: false });
          continue;
        }
        const lines = wrapLines(
          ctx,
          sec,
          bodyRect.w - 8,
          `${isHeader ? '700 13px' : '400 11px'} sans-serif`
        );
        lines.forEach((l) => wrapped.push({ text: l, isHeader }));
      }
      const lineH = 19;
      const totalH = wrapped.length * lineH + 10;
      const maxScroll = Math.max(0, totalH - bodyRect.h);
      this.rulesScrollY = Math.min(this.rulesScrollY, maxScroll);
      this.ui.addScroll('rules-scroll', bodyRect, maxScroll, () => this.rulesScrollY, (next) => {
        this.rulesScrollY = next;
        this.markDirty();
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(bodyRect.x, bodyRect.y, bodyRect.w, bodyRect.h);
      ctx.clip();
      wrapped.forEach((item, idx) => {
        const ly = bodyRect.y + 8 + idx * lineH - this.rulesScrollY;
        if (ly < bodyRect.y - 20 || ly > bodyRect.y + bodyRect.h + 10) return;
        drawEllipsisText(
          ctx,
          item.text,
          bodyRect.x + 2,
          ly,
          bodyRect.w - 4,
          item.isHeader ? PALETTE.cinnabar : PALETTE.inkPrimary,
          `${item.isHeader ? '700 12px' : '400 11px'} sans-serif`
        );
      });
      ctx.restore();
    } else if (this.modal === 'STATS') {
      const entries: { title: string; rec: { wins: number; losses: number; draws: number } }[] = [
        { title: '五子棋', rec: this.stats.GOMOKU },
        { title: '中国象棋', rec: this.stats.XIANGQI },
        { title: '陆战军旗', rec: this.stats.JUNQI },
      ];
      entries.forEach((en, idx) => {
        const cy = bodyRect.y + idx * 72;
        fillRoundRect(ctx, bodyRect.x, cy, bodyRect.w, 62, 10, PALETTE.bgCard, PALETTE.lineHairline, 1);
        drawEllipsisText(ctx, en.title, bodyRect.x + 12, cy + 20, bodyRect.w - 24, PALETTE.woodDark, '700 14px serif');
        drawEllipsisText(
          ctx,
          `胜 ${en.rec.wins}  ·  负 ${en.rec.losses}  ·  和 ${en.rec.draws}`,
          bodyRect.x + 12,
          cy + 44,
          bodyRect.w - 24,
          PALETTE.inkMuted,
          '600 12px monospace'
        );
      });
      drawButton(
        ctx,
        this.ui,
        'stats-clear',
        { x: bodyRect.x, y: bodyRect.y + 230, w: bodyRect.w, h: 36 },
        '重置本地战绩',
        () => {
          this.stats = resetAllGameStats();
          showToast('已重置战绩', 'success');
          this.markDirty();
        },
        { color: PALETTE.cinnabar }
      );
    } else if (this.modal === 'CREATE_ROOM') {
      let cy = bodyRect.y + 6;
      drawEllipsisText(ctx, '选择棋类', bodyRect.x, cy + 10, bodyRect.w, PALETTE.inkMuted, '600 11px sans-serif');
      cy += 22;
      drawSegmented(
        ctx,
        this.ui,
        'cr-game',
        { x: bodyRect.x, y: cy, w: bodyRect.w, h: 34 },
        [
          { key: 'GOMOKU', label: '五子棋' },
          { key: 'XIANGQI', label: '中国象棋' },
          { key: 'JUNQI', label: '陆战军旗' },
        ],
        this.draftGameType,
        (k) => {
          this.draftGameType = k as OnlineGameType;
          this.markDirty();
        }
      );
      cy += 48;

      if (this.draftGameType === 'JUNQI') {
        drawEllipsisText(ctx, '军旗玩法', bodyRect.x, cy + 10, bodyRect.w, PALETTE.inkMuted, '600 11px sans-serif');
        cy += 22;
        drawSegmented(
          ctx,
          this.ui,
          'cr-jq',
          { x: bodyRect.x, y: cy, w: bodyRect.w, h: 34 },
          [
            { key: 'FLIP', label: '翻棋混战' },
            { key: 'DEPLOY', label: '暗棋布阵' },
          ],
          this.draftJunqiSub,
          (k) => {
            this.draftJunqiSub = k as JunqiSubMode;
            this.markDirty();
          }
        );
        cy += 48;
      }

      drawEllipsisText(ctx, '房间可见性', bodyRect.x, cy + 10, bodyRect.w, PALETTE.inkMuted, '600 11px sans-serif');
      cy += 22;
      drawSegmented(
        ctx,
        this.ui,
        'cr-vis',
        { x: bodyRect.x, y: cy, w: bodyRect.w, h: 34 },
        [
          { key: 'PUBLIC', label: '公开大厅可见' },
          { key: 'PRIVATE', label: '仅房号邀请' },
        ],
        this.draftIsPublic ? 'PUBLIC' : 'PRIVATE',
        (k) => {
          this.draftIsPublic = k === 'PUBLIC';
          this.markDirty();
        }
      );

      drawButton(
        ctx,
        this.ui,
        'cr-submit',
        { x: bodyRect.x, y: bodyRect.y + bodyRect.h - 42, w: bodyRect.w, h: 40 },
        '立即创建并进入',
        () => {
          this.online.createRoom(this.draftGameType, this.draftJunqiSub, this.draftIsPublic);
          this.modal = 'NONE';
          this.markDirty();
        },
        { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, fontSize: 13, bold: true }
      );
    } else if (this.modal === 'CHAT') {
      const room = this.online.state.room;
      const listH = bodyRect.h - 44;
      const listRect: Rect = { x: bodyRect.x, y: bodyRect.y, w: bodyRect.w, h: listH };
      fillRoundRect(ctx, listRect.x, listRect.y, listRect.w, listRect.h, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);

      const msgs = room?.chatMessages ?? [];
      const lines: { text: string; isSys: boolean }[] = [];
      msgs.forEach((cm) => {
        const wrapped = wrapLines(
          ctx,
          `${cm.senderName}: ${cm.text}`,
          listRect.w - 16,
          '500 11px sans-serif'
        );
        wrapped.forEach((wl) => lines.push({ text: wl, isSys: cm.senderId === 'SYSTEM' }));
      });
      const lineH = 18;
      const maxScroll = Math.max(0, lines.length * lineH + 12 - listH);
      this.chatScrollY = Math.min(this.chatScrollY, maxScroll);
      this.ui.addScroll('chat-scroll', listRect, maxScroll, () => this.chatScrollY, (next) => {
        this.chatScrollY = next;
        this.markDirty();
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(listRect.x + 2, listRect.y + 2, listRect.w - 4, listRect.h - 4);
      ctx.clip();
      lines.forEach((ln, i) => {
        const ly = listRect.y + 12 + i * lineH - this.chatScrollY;
        if (ly < listRect.y - 16 || ly > listRect.y + listRect.h + 10) return;
        drawEllipsisText(
          ctx,
          ln.text,
          listRect.x + 8,
          ly,
          listRect.w - 16,
          ln.isSys ? PALETTE.gold : PALETTE.inkPrimary,
          '500 11px sans-serif'
        );
      });
      ctx.restore();

      drawButton(
        ctx,
        this.ui,
        'chat-send-modal',
        { x: bodyRect.x, y: bodyRect.y + bodyRect.h - 36, w: bodyRect.w, h: 36 },
        '输入聊天消息',
        () => this.promptChatSend(),
        { bg: PALETTE.cinnabar, border: PALETTE.cinnabar, color: PALETTE.white, bold: true }
      );
    }
  }
}
