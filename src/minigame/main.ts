import { getScreenMetrics, type ScreenMetrics } from './platform.ts';
import { MiniGameApp } from './scenes.ts';

function bootstrap(): void {
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[minigame] Failed to obtain 2D context');
    return;
  }

  let metrics: ScreenMetrics = getScreenMetrics();
  canvas.width = Math.round(metrics.width * metrics.dpr);
  canvas.height = Math.round(metrics.height * metrics.dpr);

  let scheduledRaf = false;
  const app = new MiniGameApp(() => {
    scheduleRender();
  });

  const renderFrame = () => {
    scheduledRaf = false;
    if (!app.consumeDirty()) return;
    metrics = getScreenMetrics();
    const targetW = Math.round(metrics.width * metrics.dpr);
    const targetH = Math.round(metrics.height * metrics.dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
    app.render(ctx, metrics);
    ctx.restore();

    if (app.ui.hasActiveEffects()) {
      scheduleRender();
    }
  };

  function scheduleRender(): void {
    if (scheduledRaf) return;
    scheduledRaf = true;
    requestAnimationFrame(renderFrame);
  }

  // Initial render
  app.markDirty();

  // Touch & scroll handling
  let touchStartX = 0;
  let touchStartY = 0;
  let lastMoveY = 0;
  let isDraggingScroll = false;

  wx.onTouchStart((e) => {
    const t = e.touches[0] || e.changedTouches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    lastMoveY = t.clientY;
    isDraggingScroll = false;
  });

  wx.onTouchMove((e) => {
    const t = e.touches[0] || e.changedTouches[0];
    if (!t) return;
    const dy = t.clientY - lastMoveY;
    lastMoveY = t.clientY;
    if (Math.abs(t.clientY - touchStartY) > 6) {
      if (app.ui.handleScrollDrag(touchStartX, touchStartY, dy)) {
        isDraggingScroll = true;
      }
    }
  });

  wx.onTouchEnd((e) => {
    const t = e.changedTouches[0] || e.touches[0];
    if (!t) return;
    if (!isDraggingScroll && Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) < 16) {
      app.ui.handleTap(t.clientX, t.clientY);
    }
    isDraggingScroll = false;
  });

  // Launch & Share support (?room=CODE)
  if (typeof wx.showShareMenu === 'function') {
    try {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    } catch {
      // Ignore
    }
  }

  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(() => {
      const room = app.online.state.room;
      if (room) {
        return {
          title: `${app.online.state.player.nickname} 邀你来雅弈阁-方寸之间对弈（房号 ${room.roomId}）`,
          query: `room=${room.roomId}`,
        };
      }
      return {
        title: '雅弈阁-方寸之间 — 五子棋 · 中国象棋 · 陆战军旗',
        query: '',
      };
    });
  }

  if (typeof wx.getLaunchOptionsSync === 'function') {
    try {
      const opts = wx.getLaunchOptionsSync();
      if (opts?.query?.room) {
        app.handleJoinFromLaunch(opts.query.room);
      }
    } catch {
      // Ignore
    }
  }

  if (typeof wx.onShow === 'function') {
    wx.onShow((res) => {
      if (res?.query?.room) {
        app.handleJoinFromLaunch(res.query.room);
      }
      app.markDirty();
    });
  }
}

bootstrap();
