export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HitRegion {
  id: string;
  rect: Rect;
  onTap: (localX: number, localY: number) => void;
}

export interface ScrollRegion {
  id: string;
  rect: Rect;
  getOffset: () => number;
  setOffset: (next: number) => void;
  maxOffset: number;
}

export interface BoardEffect {
  r: number;
  c: number;
  kind: 'GOMOKU' | 'FLIP' | 'MOVE' | 'WIN' | 'LOSS' | 'BOMB' | 'CHECK';
  label?: string;
  startAt: number;
  durationMs: number;
}

export const PALETTE = {
  bgPaper: '#F7F3E8',
  bgPanel: '#EFE9D8',
  bgCard: '#FAF7EE',
  bgCardAlt: '#E9DFC9',
  woodBoard: '#E4C490',
  woodBorder: '#8D6E63',
  woodDark: '#3E2723',
  inkPrimary: '#291D16',
  inkMuted: '#6E5A4F',
  lineHairline: '#D6C8B2',
  cinnabar: '#B91C1C',
  cinnabarSoft: '#FEE2E2',
  indigo: '#1D4ED8',
  indigoSoft: '#DBEAFE',
  teal: '#0F766E',
  tealSoft: '#CCFBF1',
  gold: '#B45309',
  goldBright: '#F59E0B',
  goldSoft: '#FEF3C7',
  white: '#FFFDF8',
};

export class UIRegistry {
  public hits: HitRegion[] = [];
  public scrolls: ScrollRegion[] = [];
  public effects: BoardEffect[] = [];

  public resetFrame(): void {
    this.hits = [];
    this.scrolls = [];
  }

  public addHit(id: string, rect: Rect, onTap: (lx: number, ly: number) => void): void {
    this.hits.push({ id, rect, onTap });
  }

  public addScroll(
    id: string,
    rect: Rect,
    maxOffset: number,
    getOffset: () => number,
    setOffset: (next: number) => void
  ): void {
    this.scrolls.push({ id, rect, maxOffset, getOffset, setOffset });
  }

  public pushEffect(
    kind: BoardEffect['kind'],
    r: number,
    c: number,
    label?: string,
    durationMs = 520
  ): void {
    this.effects.push({ r, c, kind, label, startAt: Date.now(), durationMs });
  }

  public hasActiveEffects(): boolean {
    const now = Date.now();
    this.effects = this.effects.filter((e) => now - e.startAt < e.durationMs);
    return this.effects.length > 0;
  }

  public handleTap(x: number, y: number): boolean {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.rect.x && x <= h.rect.x + h.rect.w && y >= h.rect.y && y <= h.rect.y + h.rect.h) {
        h.onTap(x - h.rect.x, y - h.rect.y);
        return true;
      }
    }
    return false;
  }

  public handleScrollDrag(x: number, y: number, deltaY: number): boolean {
    for (let i = this.scrolls.length - 1; i >= 0; i--) {
      const s = this.scrolls[i];
      if (x >= s.rect.x && x <= s.rect.x + s.rect.w && y >= s.rect.y && y <= s.rect.y + s.rect.h) {
        const next = Math.max(0, Math.min(s.maxOffset, s.getOffset() - deltaY));
        s.setOffset(next);
        return true;
      }
    }
    return false;
  }
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 1
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth = 1
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function drawEllipsisText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  color: string,
  font: string,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'middle'
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped}…`, x, y);
  ctx.restore();
}

export interface ButtonStyle {
  bg?: string;
  border?: string;
  color?: string;
  radius?: number;
  fontSize?: number;
  bold?: boolean;
  disabled?: boolean;
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  ui: UIRegistry,
  id: string,
  rect: Rect,
  label: string,
  onTap: () => void,
  style: ButtonStyle = {}
): void {
  const {
    bg = PALETTE.bgCard,
    border = PALETTE.lineHairline,
    color = PALETTE.inkPrimary,
    radius = 8,
    fontSize = 12,
    bold = false,
    disabled = false,
  } = style;

  ctx.save();
  if (disabled) ctx.globalAlpha = 0.45;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius, bg, border, 1);
  drawEllipsisText(
    ctx,
    label,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    rect.w - 10,
    color,
    `${bold ? '600' : '500'} ${fontSize}px sans-serif`,
    'center',
    'middle'
  );
  ctx.restore();

  if (!disabled) {
    ui.addHit(id, rect, onTap);
  }
}

export function drawSegmented(
  ctx: CanvasRenderingContext2D,
  ui: UIRegistry,
  idPrefix: string,
  rect: Rect,
  items: { key: string; label: string }[],
  activeKey: string,
  onSelect: (key: string) => void,
  fontSize = 11
): void {
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8, PALETTE.bgCardAlt, PALETTE.lineHairline, 1);
  const pad = 3;
  const itemW = (rect.w - pad * 2) / items.length;
  items.forEach((item, idx) => {
    const ix = rect.x + pad + idx * itemW;
    const iy = rect.y + pad;
    const ih = rect.h - pad * 2;
    const isActive = item.key === activeKey;
    if (isActive) {
      fillRoundRect(ctx, ix, iy, itemW, ih, 6, PALETTE.white, '#CBBBA2', 1);
    }
    drawEllipsisText(
      ctx,
      item.label,
      ix + itemW / 2,
      iy + ih / 2,
      itemW - 6,
      isActive ? PALETTE.cinnabar : PALETTE.inkMuted,
      `${isActive ? '600' : '500'} ${fontSize}px sans-serif`,
      'center',
      'middle'
    );
    ui.addHit(`${idPrefix}-${item.key}`, { x: ix, y: iy, w: itemW, h: ih }, () => onSelect(item.key));
  });
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.save();
  ctx.font = font;
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}

interface AvatarCacheEntry {
  img: { src: string; width: number; height: number; onload: (() => void) | null; onerror: ((err?: unknown) => void) | null };
  status: 'loading' | 'loaded' | 'error';
}

const avatarCache = new Map<string, AvatarCacheEntry>();
const MAX_AVATAR_CACHE = 64;

function getOrLoadAvatar(url: string, onLoaded: () => void): AvatarCacheEntry | null {
  if (!url || !url.startsWith('https://')) return null;
  const existing = avatarCache.get(url);
  if (existing) return existing;
  if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') return null;

  if (avatarCache.size >= MAX_AVATAR_CACHE) {
    const oldestKey = avatarCache.keys().next().value;
    if (oldestKey) avatarCache.delete(oldestKey);
  }

  const img = wx.createImage();
  const entry: AvatarCacheEntry = { img, status: 'loading' };
  avatarCache.set(url, entry);

  img.onload = () => {
    entry.status = 'loaded';
    onLoaded();
  };
  img.onerror = () => {
    entry.status = 'error';
  };
  img.src = url;
  return entry;
}

export function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  avatarUrl: string | undefined,
  nickname: string | null | undefined,
  accentColor: string,
  onLoaded: () => void
): void {
  const entry = avatarUrl ? getOrLoadAvatar(avatarUrl, onLoaded) : null;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();

  if (entry && entry.status === 'loaded') {
    ctx.save();
    ctx.clip();
    ctx.drawImage(
      entry.img as unknown as CanvasImageSource,
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2
    );
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.fillStyle = PALETTE.bgCardAlt;
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const ch = (nickname || '弈').trim().slice(0, 1) || '弈';
    ctx.fillStyle = accentColor;
    ctx.font = `700 ${Math.max(10, Math.round(radius * 0.95))}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, cx, cy + 0.5);
  }
  ctx.restore();
}
