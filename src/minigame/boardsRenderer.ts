import type {
  Coord,
  GomokuOnlineBoardState,
  JunqiOnlineBoardState,
  JunqiPieceView,
  JunqiRank,
  JunqiSide,
  XiangqiOnlineBoardState,
  XiangqiPiece,
} from '../shared/onlineTypes.ts';
import {
  GOMOKU_SIZE,
  isJunqiCamp,
  isJunqiHQ,
  JUNQI_COLS,
  JUNQI_RANK_NAMES,
  JUNQI_ROWS,
  XIANGQI_COLS,
  XIANGQI_PIECE_LABELS,
  XIANGQI_ROWS,
} from '../shared/gameRules.ts';
import {
  type BoardEffect,
  drawEllipsisText,
  fillRoundRect,
  PALETTE,
  type Rect,
  roundRectPath,
  strokeRoundRect,
  type UIRegistry,
} from './ui.ts';

const JUNQI_COL_X = [142, 241, 340, 439, 538];
const JUNQI_ROW_Y = [112, 174, 236, 298, 360, 422, 546, 608, 670, 732, 794, 856];

const JUNQI_SHORT_NAMES: Record<JunqiRank, string> = {
  9: '司',
  8: '军',
  7: '师',
  6: '旅',
  5: '团',
  4: '营',
  3: '连',
  2: '排',
  1: '工',
  10: '炸',
  0: '雷',
  [-1]: '旗',
};

function drawBoardEffects(
  ctx: CanvasRenderingContext2D,
  effects: BoardEffect[],
  getCenter: (r: number, c: number) => { cx: number; cy: number },
  baseRadius: number
): void {
  const now = Date.now();
  for (const ef of effects) {
    const t = (now - ef.startAt) / ef.durationMs;
    if (t < 0 || t >= 1) continue;
    const { cx, cy } = getCenter(ef.r, ef.c);
    const alpha = 1 - t;
    const rad = baseRadius * (0.7 + t * 1.45);
    const color =
      ef.kind === 'WIN'
        ? `rgba(180, 83, 9, ${alpha})`
        : ef.kind === 'BOMB'
        ? `rgba(220, 38, 38, ${alpha})`
        : ef.kind === 'LOSS'
        ? `rgba(107, 114, 128, ${alpha})`
        : ef.kind === 'FLIP'
        ? `rgba(15, 118, 110, ${alpha})`
        : `rgba(185, 28, 28, ${alpha * 0.85})`;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();

    if (ef.label) {
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(ef.label, cx, cy - baseRadius * (0.9 + t * 0.9));
    }
    ctx.restore();
  }
}

// ============================================================================
// 1. GOMOKU BOARD (15x15)
// ============================================================================

export function renderGomokuBoard(
  ctx: CanvasRenderingContext2D,
  ui: UIRegistry,
  area: Rect,
  state: GomokuOnlineBoardState,
  hintCoord: Coord | null,
  canInteract: boolean,
  onCellTap: (r: number, c: number) => void
): void {
  const size = Math.min(area.w, area.h);
  const bx = area.x + (area.w - size) / 2;
  const by = area.y + (area.h - size) / 2;

  fillRoundRect(ctx, bx, by, size, size, 12, PALETTE.woodBoard, '#A68B5B', 2);

  const pad = size * 0.065;
  const inner = size - pad * 2;
  const step = inner / (GOMOKU_SIZE - 1);
  const xOf = (c: number) => bx + pad + c * step;
  const yOf = (r: number) => by + pad + r * step;

  // Outer double border
  ctx.strokeStyle = 'rgba(62, 39, 35, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(xOf(0) - 4, yOf(0) - 4, inner + 8, inner + 8);

  ctx.font = `600 ${Math.max(8, Math.round(size * 0.026))}px monospace`;
  ctx.fillStyle = '#4E342E';

  for (let i = 0; i < GOMOKU_SIZE; i++) {
    const x = xOf(i);
    const y = yOf(i);
    ctx.strokeStyle = 'rgba(62, 39, 35, 0.85)';
    ctx.lineWidth = i === 0 || i === GOMOKU_SIZE - 1 ? 1.4 : 0.9;

    ctx.beginPath();
    ctx.moveTo(xOf(0), y);
    ctx.lineTo(xOf(GOMOKU_SIZE - 1), y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, yOf(0));
    ctx.lineTo(x, yOf(GOMOKU_SIZE - 1));
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String.fromCharCode(65 + i), x, yOf(0) - 6);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(15 - i), xOf(0) - 6, y);
  }

  // 5 Star points
  ctx.fillStyle = '#3E2723';
  [
    [3, 3],
    [3, 11],
    [7, 7],
    [11, 3],
    [11, 11],
  ].forEach(([r, c]) => {
    ctx.beginPath();
    ctx.arc(xOf(c), yOf(r), Math.max(2.3, size * 0.008), 0, Math.PI * 2);
    ctx.fill();
  });

  const stoneR = step * 0.43;
  const winSet = new Set((state.winningLine ?? []).map((p) => `${p.r},${p.c}`));

  // Stones & Hitboxes
  for (let r = 0; r < GOMOKU_SIZE; r++) {
    for (let c = 0; c < GOMOKU_SIZE; c++) {
      const cx = xOf(c);
      const cy = yOf(r);
      const cell = state.grid[r][c];

      if (cell !== 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.arc(cx + 1.2, cy + 1.8, stoneR, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(
          cx - stoneR * 0.3,
          cy - stoneR * 0.3,
          stoneR * 0.1,
          cx,
          cy,
          stoneR
        );
        if (cell === 1) {
          grad.addColorStop(0, '#55524F');
          grad.addColorStop(0.65, '#1D1B1A');
          grad.addColorStop(1, '#090909');
        } else {
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.75, '#F0EBE1');
          grad.addColorStop(1, '#CFC7B8');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
        ctx.fill();

        if (winSet.has(`${r},${c}`)) {
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (state.lastMove && state.lastMove.r === r && state.lastMove.c === c) {
          ctx.fillStyle = cell === 1 ? '#EF4444' : '#B91C1C';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2.5, stoneR * 0.25), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (hintCoord && hintCoord.r === r && hintCoord.c === c) {
        ctx.save();
        ctx.strokeStyle = PALETTE.teal;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, stoneR * 0.88, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (canInteract && cell === 0) {
        ui.addHit(
          `gomoku-${r}-${c}`,
          { x: cx - step / 2, y: cy - step / 2, w: step, h: step },
          () => onCellTap(r, c)
        );
      }
    }
  }

  // Winning line
  if (state.winningLine && state.winningLine.length >= 2) {
    const first = state.winningLine[0];
    const last = state.winningLine[state.winningLine.length - 1];
    ctx.save();
    ctx.strokeStyle = 'rgba(185, 28, 28, 0.82)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xOf(first.c), yOf(first.r));
    ctx.lineTo(xOf(last.c), yOf(last.r));
    ctx.stroke();
    ctx.restore();
  }

  drawBoardEffects(ctx, ui.effects, (r, c) => ({ cx: xOf(c), cy: yOf(r) }), stoneR * 1.15);
}

// ============================================================================
// 2. XIANGQI BOARD (10x9)
// ============================================================================

function drawXiangqiCapturedStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  pieces: XiangqiPiece[],
  sideColor: string
): void {
  fillRoundRect(ctx, x, y, w, h, 7, PALETTE.bgCard, PALETTE.lineHairline, 1);
  drawEllipsisText(ctx, label, x + 8, y + h / 2, 54, PALETTE.inkMuted, '600 10px sans-serif');
  let px = x + 64;
  const maxShow = Math.floor((w - 72) / 17);
  const shown = pieces.slice(0, maxShow);
  for (const p of shown) {
    ctx.save();
    ctx.fillStyle = '#FFF9EC';
    ctx.strokeStyle = sideColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + 7, y + h / 2, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sideColor;
    ctx.font = '700 9px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(XIANGQI_PIECE_LABELS[p.side][p.type], px + 7, y + h / 2 + 0.5);
    ctx.restore();
    px += 17;
  }
  if (pieces.length === 0) {
    drawEllipsisText(ctx, '尚无折损', x + 64, y + h / 2, w - 72, '#9A8B7A', '400 10px sans-serif');
  }
}

export function renderXiangqiBoard(
  ctx: CanvasRenderingContext2D,
  ui: UIRegistry,
  area: Rect,
  state: XiangqiOnlineBoardState,
  selected: Coord | null,
  legalTargets: Coord[],
  isFlipped: boolean,
  canInteract: boolean,
  onCellTap: (r: number, c: number) => void
): void {
  const stripH = 24;
  const gap = 5;
  const availH = area.h - (stripH + gap) * 2;
  const boardRatio = 9 / 10;
  let bw = Math.min(area.w, availH * boardRatio);
  let bh = bw / boardRatio;
  if (bh > availH) {
    bh = availH;
    bw = bh * boardRatio;
  }
  const bx = area.x + (area.w - bw) / 2;
  const by = area.y + stripH + gap + (availH - bh) / 2;

  const topPieces = isFlipped ? state.capturedRed : state.capturedBlack;
  const topLabel = isFlipped ? '红方阵亡' : '黑方阵亡';
  const topColor = isFlipped ? PALETTE.cinnabar : '#1F2937';
  const botPieces = isFlipped ? state.capturedBlack : state.capturedRed;
  const botLabel = isFlipped ? '黑方阵亡' : '红方阵亡';
  const botColor = isFlipped ? '#1F2937' : PALETTE.cinnabar;

  drawXiangqiCapturedStrip(ctx, bx, area.y, bw, stripH, topLabel, topPieces, topColor);
  drawXiangqiCapturedStrip(
    ctx,
    bx,
    area.y + area.h - stripH,
    bw,
    stripH,
    botLabel,
    botPieces,
    botColor
  );

  fillRoundRect(ctx, bx, by, bw, bh, 10, PALETTE.woodBoard, '#A68B5B', 2);

  const padX = bw * 0.07;
  const padY = bh * 0.065;
  const cellW = (bw - padX * 2) / (XIANGQI_COLS - 1);
  const cellH = (bh - padY * 2) / (XIANGQI_ROWS - 1);
  const xOf = (vc: number) => bx + padX + vc * cellW;
  const yOf = (vr: number) => by + padY + vr * cellH;

  // Outer Frame
  ctx.strokeStyle = 'rgba(62, 39, 35, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(xOf(0) - 4, yOf(0) - 4, xOf(8) - xOf(0) + 8, yOf(9) - yOf(0) + 8);

  // Horizontal lines
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = r === 0 || r === 9 || r === 4 || r === 5 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(r));
    ctx.lineTo(xOf(8), yOf(r));
    ctx.stroke();
  }

  // Vertical lines
  for (let c = 0; c < XIANGQI_COLS; c++) {
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = c === 0 || c === 8 ? 1.5 : 1;
    if (c === 0 || c === 8) {
      ctx.beginPath();
      ctx.moveTo(xOf(c), yOf(0));
      ctx.lineTo(xOf(c), yOf(9));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(xOf(c), yOf(0));
      ctx.lineTo(xOf(c), yOf(4));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xOf(c), yOf(5));
      ctx.lineTo(xOf(c), yOf(9));
      ctx.stroke();
    }
  }

  // Palace diagonals
  const drawDiag = (c1: number, r1: number, c2: number, r2: number) => {
    ctx.beginPath();
    ctx.moveTo(xOf(c1), yOf(r1));
    ctx.lineTo(xOf(c2), yOf(r2));
    ctx.stroke();
  };
  ctx.lineWidth = 1;
  drawDiag(3, 0, 5, 2);
  drawDiag(5, 0, 3, 2);
  drawDiag(3, 7, 5, 9);
  drawDiag(5, 7, 3, 9);

  // River calligraphy
  ctx.save();
  ctx.fillStyle = 'rgba(62, 39, 35, 0.8)';
  ctx.font = `700 ${Math.round(bw * 0.056)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const riverY = (yOf(4) + yOf(5)) / 2;
  ctx.fillText(isFlipped ? '漢 界' : '楚 河', (xOf(1) + xOf(3)) / 2, riverY);
  ctx.fillText(isFlipped ? '楚 河' : '漢 界', (xOf(5) + xOf(7)) / 2, riverY);
  ctx.restore();

  const legalSet = new Set(legalTargets.map((m) => `${m.r},${m.c}`));
  const pieceR = Math.min(cellW, cellH) * 0.43;

  const toVisual = (r: number, c: number) => ({
    vr: isFlipped ? 9 - r : r,
    vc: isFlipped ? 8 - c : c,
  });

  // Draw pieces & targets
  for (let r = 0; r < XIANGQI_ROWS; r++) {
    for (let c = 0; c < XIANGQI_COLS; c++) {
      const { vr, vc } = toVisual(r, c);
      const cx = xOf(vc);
      const cy = yOf(vr);
      const p = state.board[r][c];
      const isSelected = selected?.r === r && selected?.c === c;
      const isLegal = legalSet.has(`${r},${c}`);
      const isLast =
        (state.lastMove?.from.r === r && state.lastMove?.from.c === c) ||
        (state.lastMove?.to.r === r && state.lastMove?.to.c === c);

      if (isLast) {
        strokeRoundRect(
          ctx,
          cx - pieceR - 3,
          cy - pieceR - 3,
          (pieceR + 3) * 2,
          (pieceR + 3) * 2,
          6,
          'rgba(245, 158, 11, 0.85)',
          1.6
        );
      }

      if (p) {
        const isRed = p.side === 'RED';
        const inCheck = p.type === 'G' && state.inCheckSide === p.side;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 2, pieceR, 0, Math.PI * 2);
        ctx.fill();

        const g = ctx.createRadialGradient(cx - pieceR * 0.25, cy - pieceR * 0.25, 2, cx, cy, pieceR);
        g.addColorStop(0, '#FFFDF7');
        g.addColorStop(0.75, '#F5E7CC');
        g.addColorStop(1, '#D6BF96');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, pieceR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isSelected
          ? '#F59E0B'
          : inCheck
          ? '#DC2626'
          : isRed
          ? '#991B1B'
          : '#1F2937';
        ctx.lineWidth = isSelected || inCheck ? 2.5 : 1.5;
        ctx.stroke();

        ctx.strokeStyle = isRed ? 'rgba(185, 28, 28, 0.4)' : 'rgba(31, 41, 55, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, pieceR * 0.78, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isRed ? '#B91C1C' : '#1F2937';
        ctx.font = `700 ${Math.round(pieceR * 1.05)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(XIANGQI_PIECE_LABELS[p.side][p.type], cx, cy + 1);
        ctx.restore();
      }

      if (isLegal) {
        ctx.save();
        if (p) {
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, pieceR + 2.5, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(15, 118, 110, 0.85)';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(4, pieceR * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (canInteract) {
        ui.addHit(
          `xq-${r}-${c}`,
          { x: cx - cellW / 2, y: cy - cellH / 2, w: cellW, h: cellH },
          () => onCellTap(r, c)
        );
      }
    }
  }

  drawBoardEffects(
    ctx,
    ui.effects,
    (r, c) => {
      const { vr, vc } = toVisual(r, c);
      return { cx: xOf(vc), cy: yOf(vr) };
    },
    pieceR * 1.15
  );
}

// ============================================================================
// 3. JUNQI BOARD (12x5) + SYMMETRICAL CAPTURED TRAYS
// ============================================================================

function drawJunqiCapturedSideTray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  ranks: JunqiRank[],
  side: JunqiSide
): void {
  const isRed = side === 'RED';
  const accent = isRed ? PALETTE.cinnabar : PALETTE.indigo;
  fillRoundRect(ctx, x, y, w, h, 8, PALETTE.bgCard, PALETTE.lineHairline, 1);

  drawEllipsisText(
    ctx,
    title,
    x + w / 2,
    y + 11,
    w - 4,
    accent,
    '700 9px sans-serif',
    'center',
    'middle'
  );
  drawEllipsisText(
    ctx,
    `${ranks.length}子`,
    x + w / 2,
    y + 22,
    w - 4,
    PALETTE.inkMuted,
    '500 9px sans-serif',
    'center',
    'middle'
  );

  // Order ranks by importance (9 down to 1, 10, 0, -1)
  const order: JunqiRank[] = [9, 8, 7, 6, 5, 4, 3, 2, 1, 10, 0, -1];
  const counts = new Map<JunqiRank, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const items = order.filter((r) => (counts.get(r) ?? 0) > 0);

  let cy = y + 31;
  const rowH = Math.min(22, Math.max(15, (h - 36) / 11));
  for (const r of items) {
    if (cy + rowH > y + h - 3) break;
    const cnt = counts.get(r) ?? 0;
    fillRoundRect(
      ctx,
      x + 3,
      cy,
      w - 6,
      rowH - 2,
      4,
      isRed ? '#FEF2F2' : '#EFF6FF',
      isRed ? '#FCA5A5' : '#93C5FD',
      0.8
    );
    const label = cnt > 1 ? `${JUNQI_SHORT_NAMES[r]}×${cnt}` : JUNQI_RANK_NAMES[r];
    drawEllipsisText(
      ctx,
      label,
      x + w / 2,
      cy + (rowH - 2) / 2,
      w - 8,
      accent,
      `600 ${w >= 46 ? 9 : 8}px sans-serif`,
      'center',
      'middle'
    );
    cy += rowH;
  }

  if (items.length === 0) {
    drawEllipsisText(
      ctx,
      '无阵亡',
      x + w / 2,
      y + h / 2,
      w - 6,
      '#9A8B7A',
      '400 9px sans-serif',
      'center',
      'middle'
    );
  }
}

export function renderJunqiBoard(
  ctx: CanvasRenderingContext2D,
  ui: UIRegistry,
  area: Rect,
  state: JunqiOnlineBoardState,
  selected: Coord | null,
  legalTargets: Coord[],
  isFlipped: boolean,
  canInteract: boolean,
  viewerSide: JunqiSide | 'SPECTATOR',
  onCellTap: (r: number, c: number) => void
): void {
  const trayW = area.w >= 360 ? 46 : 38;
  const trayGap = 6;
  const maxBoardW = area.w - (trayW + trayGap) * 2;
  const aspect = 680 / 980;
  let bw = Math.min(maxBoardW, area.h * aspect);
  let bh = bw / aspect;
  if (bh > area.h) {
    bh = area.h;
    bw = bh * aspect;
  }
  const bx = area.x + (area.w - bw) / 2;
  const by = area.y + (area.h - bh) / 2;

  // Left & Right Symmetrical Captured Trays (All fallen pieces openly revealed!)
  drawJunqiCapturedSideTray(
    ctx,
    bx - trayGap - trayW,
    by,
    trayW,
    bh,
    '红阵亡',
    state.capturedRed,
    'RED'
  );
  drawJunqiCapturedSideTray(
    ctx,
    bx + bw + trayGap,
    by,
    trayW,
    bh,
    '蓝阵亡',
    state.capturedBlue,
    'BLUE'
  );

  const sx = bw / 680;
  const sy = bh / 980;
  const px = (x: number) => bx + x * sx;
  const py = (y: number) => by + y * sy;

  // Base cream board
  fillRoundRect(ctx, bx, by, bw, bh, 10, '#EFE6CE', '#B29666', 2);
  fillRoundRect(
    ctx,
    px(22),
    py(22),
    636 * sx,
    936 * sy,
    7,
    '#F1E9D4',
    '#A68B5B',
    1
  );

  // Header
  ctx.save();
  ctx.fillStyle = '#33271E';
  ctx.font = `700 ${Math.max(10, Math.round(32 * sx))}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('陆  战  棋', px(340), py(58));
  ctx.restore();

  // Frontline river band
  ctx.save();
  ctx.fillStyle = '#BAD4CE';
  ctx.fillRect(px(23.5), py(451), 633 * sx, 66 * sy);
  ctx.strokeStyle = '#638F8C';
  ctx.lineWidth = Math.max(1, 2.5 * sx);
  ctx.beginPath();
  ctx.moveTo(px(23.5), py(451));
  ctx.lineTo(px(656.5), py(451));
  ctx.moveTo(px(23.5), py(517));
  ctx.lineTo(px(656.5), py(517));
  ctx.stroke();

  ctx.fillStyle = '#33271E';
  ctx.font = `700 ${Math.max(9, Math.round(20 * sx))}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('前  线', px(340), py(484));
  ctx.restore();

  // Half roads
  const drawHalfRoads = (baseRow: number) => {
    ctx.strokeStyle = '#3B2E25';
    ctx.lineWidth = Math.max(0.8, 2 * sx);
    const roadRows = baseRow === 0 ? [0, 2, 3, 4] : [7, 8, 9, 11];
    roadRows.forEach((r) => {
      for (let c = 0; c < 4; c++) {
        ctx.beginPath();
        ctx.moveTo(px(JUNQI_COL_X[c]), py(JUNQI_ROW_Y[r]));
        ctx.lineTo(px(JUNQI_COL_X[c + 1]), py(JUNQI_ROW_Y[r]));
        ctx.stroke();
      }
    });
    for (let r = baseRow; r < baseRow + 5; r++) {
      for (let c = 1; c <= 3; c++) {
        ctx.beginPath();
        ctx.moveTo(px(JUNQI_COL_X[c]), py(JUNQI_ROW_Y[r]));
        ctx.lineTo(px(JUNQI_COL_X[c]), py(JUNQI_ROW_Y[r + 1]));
        ctx.stroke();
      }
    }
    const r1 = baseRow === 0 ? 2 : 7;
    const r2 = baseRow === 0 ? 4 : 9;
    [
      [r1, 1],
      [r1, 3],
      [r2, 1],
      [r2, 3],
    ].forEach(([cr, cc]) => {
      [
        [cr - 1, cc - 1],
        [cr - 1, cc + 1],
        [cr + 1, cc - 1],
        [cr + 1, cc + 1],
      ].forEach(([nr, nc]) => {
        ctx.beginPath();
        ctx.moveTo(px(JUNQI_COL_X[cc]), py(JUNQI_ROW_Y[cr]));
        ctx.lineTo(px(JUNQI_COL_X[nc]), py(JUNQI_ROW_Y[nr]));
        ctx.stroke();
      });
    });
  };
  drawHalfRoads(0);
  drawHalfRoads(6);

  // Railway tracks
  const drawRail = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.save();
    ctx.strokeStyle = '#3B2E25';
    ctx.lineWidth = Math.max(3, 8.5 * sx);
    ctx.beginPath();
    ctx.moveTo(px(x1), py(y1));
    ctx.lineTo(px(x2), py(y2));
    ctx.stroke();

    ctx.strokeStyle = '#F6F1E2';
    ctx.lineWidth = Math.max(1.2, 3 * sx);
    ctx.setLineDash([Math.max(2, 6 * sx), Math.max(2, 6 * sx)]);
    ctx.beginPath();
    ctx.moveTo(px(x1), py(y1));
    ctx.lineTo(px(x2), py(y2));
    ctx.stroke();
    ctx.restore();
  };

  [1, 5, 6, 10].forEach((r) => drawRail(JUNQI_COL_X[0], JUNQI_ROW_Y[r], JUNQI_COL_X[4], JUNQI_ROW_Y[r]));
  drawRail(JUNQI_COL_X[0], JUNQI_ROW_Y[0], JUNQI_COL_X[0], JUNQI_ROW_Y[11]);
  drawRail(JUNQI_COL_X[4], JUNQI_ROW_Y[0], JUNQI_COL_X[4], JUNQI_ROW_Y[11]);
  drawRail(JUNQI_COL_X[2], JUNQI_ROW_Y[5], JUNQI_COL_X[2], JUNQI_ROW_Y[6]);

  const topHqColor = isFlipped ? '#96352F' : '#26568B';
  const bottomHqColor = isFlipped ? '#26568B' : '#96352F';
  const legalSet = new Set(legalTargets.map((m) => `${m.r},${m.c}`));

  const toVisual = (r: number, c: number) => ({
    vr: isFlipped ? 11 - r : r,
    vc: isFlipped ? 4 - c : c,
  });

  // Draw station nodes
  for (let vr = 0; vr < JUNQI_ROWS; vr++) {
    for (let vc = 0; vc < JUNQI_COLS; vc++) {
      const cx = px(JUNQI_COL_X[vc]);
      const cy = py(JUNQI_ROW_Y[vr]);
      const isCamp = isJunqiCamp(vr, vc);
      const isHQ = isJunqiHQ(vr, vc);

      if (isCamp) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 24 * sx, 0, Math.PI * 2);
        ctx.fillStyle = '#F5EFE0';
        ctx.fill();
        ctx.strokeStyle = '#3B2E25';
        ctx.lineWidth = Math.max(1, 2 * sx);
        ctx.stroke();
        ctx.restore();
      } else if (isHQ) {
        fillRoundRect(
          ctx,
          cx - 42 * sx,
          cy - 21 * sy,
          84 * sx,
          42 * sy,
          5,
          vr === 0 ? topHqColor : bottomHqColor,
          '#3B2E25',
          Math.max(1, 2 * sx)
        );
        drawEllipsisText(
          ctx,
          '大本营',
          cx,
          cy,
          76 * sx,
          '#FFFDF9',
          `700 ${Math.max(8, Math.round(14 * sx))}px serif`,
          'center',
          'middle'
        );
      } else {
        fillRoundRect(
          ctx,
          cx - 38 * sx,
          cy - 18 * sy,
          76 * sx,
          36 * sy,
          4,
          '#F8F4E8',
          '#3B2E25',
          Math.max(0.9, 1.8 * sx)
        );
      }
    }
  }

  // Draw pieces + interaction targets
  const tileW = 78 * sx;
  const tileH = 38 * sy;
  const hitW = 94 * sx;
  const hitH = 54 * sy;

  for (let r = 0; r < JUNQI_ROWS; r++) {
    for (let c = 0; c < JUNQI_COLS; c++) {
      const { vr, vc } = toVisual(r, c);
      const cx = px(JUNQI_COL_X[vc]);
      const cy = py(JUNQI_ROW_Y[vr]);
      const p: JunqiPieceView | null = state.board[r][c];
      const isSelected = selected?.r === r && selected?.c === c;
      const isLegal = legalSet.has(`${r},${c}`);
      const isLast =
        (state.lastMove?.from.r === r && state.lastMove?.from.c === c) ||
        (state.lastMove?.to.r === r && state.lastMove?.to.c === c);

      if (p) {
        const showRank = p.rank !== null && (p.revealed || (state.subMode === 'DEPLOY' && p.side === viewerSide));
        let bg = '#6E5A4F';
        let border = '#3E2723';
        let txtColor = '#FFFDF9';
        let label = '军';

        if (p.side === 'RED') {
          bg = showRank ? '#96352F' : '#7D2924';
          border = '#FDE68A';
          label = showRank && p.rank !== null ? JUNQI_RANK_NAMES[p.rank] : '红军';
        } else if (p.side === 'BLUE') {
          bg = showRank ? '#26568B' : '#1E406B';
          border = '#BFDBFE';
          label = showRank && p.rank !== null ? JUNQI_RANK_NAMES[p.rank] : '蓝军';
        } else {
          bg = '#5E4B3C';
          border = '#D6C8B2';
          label = '暗棋';
        }

        if (p.carryingFlag) {
          strokeRoundRect(
            ctx,
            cx - tileW / 2 - 3,
            cy - tileH / 2 - 3,
            tileW + 6,
            tileH + 6,
            7,
            '#F59E0B',
            2.4
          );
        } else if (isSelected) {
          strokeRoundRect(
            ctx,
            cx - tileW / 2 - 3,
            cy - tileH / 2 - 3,
            tileW + 6,
            tileH + 6,
            7,
            '#FBBF24',
            2.4
          );
        } else if (isLast) {
          strokeRoundRect(
            ctx,
            cx - tileW / 2 - 2,
            cy - tileH / 2 - 2,
            tileW + 4,
            tileH + 4,
            6,
            'rgba(245, 158, 11, 0.7)',
            1.4
          );
        }

        fillRoundRect(ctx, cx - tileW / 2, cy - tileH / 2, tileW, tileH, 5, bg, border, 1.3);
        drawEllipsisText(
          ctx,
          label,
          cx,
          cy + (p.carryingFlag ? -3 : 0),
          tileW - 6,
          txtColor,
          `700 ${Math.max(9, Math.round(18 * sx))}px sans-serif`,
          'center',
          'middle'
        );

        if (p.carryingFlag) {
          drawEllipsisText(
            ctx,
            '扛旗',
            cx,
            cy + tileH * 0.29,
            tileW - 4,
            '#FDE68A',
            `700 ${Math.max(7, Math.round(11 * sx))}px sans-serif`,
            'center',
            'middle'
          );
        } else if (p.mineHits && p.mineHits > 0) {
          fillRoundRect(
            ctx,
            cx + tileW / 2 - 22 * sx,
            cy - tileH / 2 - 5 * sy,
            24 * sx,
            14 * sy,
            4,
            '#F59E0B',
            '#78350F',
            0.8
          );
          drawEllipsisText(
            ctx,
            `${p.mineHits}/3`,
            cx + tileW / 2 - 10 * sx,
            cy - tileH / 2 + 2 * sy,
            22 * sx,
            '#1F2937',
            `700 ${Math.max(7, Math.round(10 * sx))}px monospace`,
            'center',
            'middle'
          );
        }
      }

      if (isLegal) {
        ctx.save();
        if (p) {
          roundRectPath(ctx, cx - tileW / 2 - 3, cy - tileH / 2 - 3, tileW + 6, tileH + 6, 7);
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(15, 118, 110, 0.85)';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(4, 10 * sx), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (canInteract) {
        ui.addHit(
          `jq-${r}-${c}`,
          { x: cx - hitW / 2, y: cy - hitH / 2, w: hitW, h: hitH },
          () => onCellTap(r, c)
        );
      }
    }
  }

  drawBoardEffects(
    ctx,
    ui.effects,
    (r, c) => {
      const { vr, vc } = toVisual(r, c);
      return { cx: px(JUNQI_COL_X[vc]), cy: py(JUNQI_ROW_Y[vr]) };
    },
    28 * sx
  );
}
