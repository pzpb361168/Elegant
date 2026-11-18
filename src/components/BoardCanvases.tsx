import React, { useEffect } from 'react';
import Taro from '@tarojs/taro';
import { Canvas } from '@tarojs/components';
import type { Coord } from '../shared/onlineTypes';

const JUNQI_COL_X = [142, 241, 340, 439, 538];
const JUNQI_ROW_Y = [112, 174, 236, 298, 360, 422, 546, 608, 670, 732, 794, 856];

function getDpr(): number {
  try {
    const winInfo = (Taro as unknown as { getWindowInfo?: () => { pixelRatio?: number } })
      .getWindowInfo;
    if (typeof winInfo === 'function') {
      return winInfo().pixelRatio || 2;
    }
    return Taro.getSystemInfoSync().pixelRatio || 2;
  } catch {
    return 2;
  }
}

function withCanvas2d(
  canvasId: string,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): () => void {
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const attempt = (triesLeft: number) => {
    Taro.nextTick(() => {
      if (cancelled) return;
      const query = Taro.createSelectorQuery();
      query
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (cancelled) return;
          const item = res?.[0];
          const node = item?.node;
          const width = item?.width;
          const height = item?.height;
          if (!node || !width || !height) {
            if (triesLeft > 0) {
              retryTimer = setTimeout(() => attempt(triesLeft - 1), 100);
            }
            return;
          }
          const dpr = getDpr();
          node.width = Math.round(width * dpr);
          node.height = Math.round(height * dpr);
          const ctx = node.getContext('2d') as CanvasRenderingContext2D | null;
          if (!ctx) return;
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, width, height);
          draw(ctx, width, height);
          ctx.restore();
        });
    });
  };

  attempt(3);

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
  };
}

// ==================== 1. GOMOKU BOARD CANVAS (15x15) ====================
interface GomokuBoardCanvasProps {
  canvasId: string;
  winningLine: Coord[] | null;
}

export const GomokuBoardCanvas: React.FC<GomokuBoardCanvasProps> = ({
  canvasId,
  winningLine,
}) => {
  useEffect(() => {
    return withCanvas2d(canvasId, (ctx, w, h) => {
      const padX = w * 0.05;
      const padY = h * 0.05;
      const innerW = w * 0.9;
      const innerH = h * 0.9;

      const xOf = (c: number) => padX + ((c + 0.5) / 15) * innerW;
      const yOf = (r: number) => padY + ((r + 0.5) / 15) * innerH;

      // Outer decorative double frame
      ctx.strokeStyle = 'rgba(62, 39, 35, 0.72)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        xOf(0) - 6,
        yOf(0) - 6,
        xOf(14) - xOf(0) + 12,
        yOf(14) - yOf(0) + 12
      );

      // 15x15 Lines & Edge Labels
      ctx.font = `600 ${Math.max(8, Math.round(w * 0.024))}px monospace`;
      ctx.fillStyle = '#4E342E';

      for (let i = 0; i < 15; i++) {
        const x = xOf(i);
        const y = yOf(i);
        ctx.strokeStyle = 'rgba(62, 39, 35, 0.85)';
        ctx.lineWidth = i === 0 || i === 14 ? 1.6 : 1;

        ctx.beginPath();
        ctx.moveTo(xOf(0), y);
        ctx.lineTo(xOf(14), y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, yOf(0));
        ctx.lineTo(x, yOf(14));
        ctx.stroke();

        // Top column labels (A..O)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String.fromCharCode(65 + i), x, yOf(0) - 8);

        // Left row labels (15..1)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(15 - i), xOf(0) - 8, y);
      }

      // 5 Star points
      const stars: Coord[] = [
        { r: 3, c: 3 },
        { r: 3, c: 11 },
        { r: 7, c: 7 },
        { r: 11, c: 3 },
        { r: 11, c: 11 },
      ];
      ctx.fillStyle = '#3E2723';
      stars.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(xOf(pt.c), yOf(pt.r), Math.max(2.5, w * 0.008), 0, Math.PI * 2);
        ctx.fill();
      });

      // Winning line highlight
      if (winningLine && winningLine.length >= 2) {
        const first = winningLine[0];
        const last = winningLine[winningLine.length - 1];
        ctx.strokeStyle = 'rgba(185, 28, 28, 0.85)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xOf(first.c), yOf(first.r));
        ctx.lineTo(xOf(last.c), yOf(last.r));
        ctx.stroke();
      }
    });
  }, [canvasId, winningLine]);

  return <Canvas id={canvasId} canvasId={canvasId} type="2d" className="board-canvas-layer" />;
};

// ==================== 2. XIANGQI BOARD CANVAS (10x9) ====================
interface XiangqiBoardCanvasProps {
  canvasId: string;
}

export const XiangqiBoardCanvas: React.FC<XiangqiBoardCanvasProps> = ({ canvasId }) => {
  useEffect(() => {
    return withCanvas2d(canvasId, (ctx, w, h) => {
      const padX = w * 0.04;
      const padY = h * 0.04;
      const innerW = w * 0.92;
      const innerH = h * 0.92;

      const xOf = (c: number) => padX + ((c + 0.5) / 9) * innerW;
      const yOf = (r: number) => padY + ((r + 0.5) / 10) * innerH;

      // Outer Thick Frame
      ctx.strokeStyle = 'rgba(62, 39, 35, 0.85)';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(xOf(0) - 6, yOf(0) - 6, xOf(8) - xOf(0) + 12, yOf(9) - yOf(0) + 12);

      // 10 Horizontal lines
      for (let r = 0; r < 10; r++) {
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = r === 0 || r === 9 || r === 4 || r === 5 ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(r));
        ctx.lineTo(xOf(8), yOf(r));
        ctx.stroke();
      }

      // 9 Vertical lines (broken across river for cols 1..7)
      for (let c = 0; c < 9; c++) {
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = c === 0 || c === 8 ? 1.8 : 1.1;
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
      const drawLine = (c1: number, r1: number, c2: number, r2: number) => {
        ctx.beginPath();
        ctx.moveTo(xOf(c1), yOf(r1));
        ctx.lineTo(xOf(c2), yOf(r2));
        ctx.stroke();
      };
      ctx.lineWidth = 1.1;
      drawLine(3, 0, 5, 2);
      drawLine(5, 0, 3, 2);
      drawLine(3, 7, 5, 9);
      drawLine(5, 7, 3, 9);

      // Chu River & Han Border Calligraphy
      ctx.fillStyle = 'rgba(62, 39, 35, 0.82)';
      ctx.font = `700 ${Math.round(w * 0.064)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const riverY = (yOf(4) + yOf(5)) / 2;
      ctx.fillText('楚 河', (xOf(1) + xOf(3)) / 2, riverY);
      ctx.fillText('漢 界', (xOf(5) + xOf(7)) / 2, riverY);
    });
  }, [canvasId]);

  return <Canvas id={canvasId} canvasId={canvasId} type="2d" className="board-canvas-layer" />;
};

// ==================== 3. JUNQI BOARD CANVAS (12x5) ====================
interface JunqiBoardCanvasProps {
  canvasId: string;
  isFlipped?: boolean;
}

export const JunqiBoardCanvas: React.FC<JunqiBoardCanvasProps> = ({
  canvasId,
  isFlipped = false,
}) => {
  useEffect(() => {
    return withCanvas2d(canvasId, (ctx, w, h) => {
      const sx = w / 680;
      const sy = h / 980;
      const px = (x: number) => x * sx;
      const py = (y: number) => y * sy;

      const drawRoundRect = (
        x: number,
        y: number,
        rw: number,
        rh: number,
        rad: number,
        fill?: string,
        stroke?: string,
        lw: number = 1
      ) => {
        const r = Math.min(rad, rw / 2, rh / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + rw, y, x + rw, y + rh, r);
        ctx.arcTo(x + rw, y + rh, x, y + rh, r);
        ctx.arcTo(x, y + rh, x, y, r);
        ctx.arcTo(x, y, x + rw, y, r);
        ctx.closePath();
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      };

      // Base Cream Card
      drawRoundRect(0, 0, w, h, px(26), '#EFE6CE', '#B29666', px(6));
      drawRoundRect(px(22), py(22), px(636), py(936), px(18), '#F1E9D4', '#A68B5B', px(2.5));

      // Corner medallions
      const corners: [number, number][] = [
        [48, 48],
        [632, 48],
        [48, 932],
        [632, 932],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(px(cx), py(cy), px(9), 0, Math.PI * 2);
        ctx.strokeStyle = '#A68B5B';
        ctx.lineWidth = px(2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px(cx), py(cy), px(2.5), 0, Math.PI * 2);
        ctx.fillStyle = '#A68B5B';
        ctx.fill();
      });

      // Top Header Calligraphy
      ctx.fillStyle = '#33271E';
      ctx.font = `700 ${Math.round(px(34))}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('陆  战  棋', px(340), py(58));

      // Frontline River Band
      ctx.fillStyle = '#BAD4CE';
      ctx.fillRect(px(23.5), py(451), px(633), py(66));
      ctx.strokeStyle = '#638F8C';
      ctx.lineWidth = px(3);
      ctx.beginPath();
      ctx.moveTo(px(23.5), py(451));
      ctx.lineTo(px(656.5), py(451));
      ctx.moveTo(px(23.5), py(517));
      ctx.lineTo(px(656.5), py(517));
      ctx.stroke();

      // River waves
      ctx.strokeStyle = '#85ADA8';
      ctx.lineWidth = px(1.8);
      [468, 501].forEach((wy) => {
        ctx.beginPath();
        ctx.moveTo(px(45), py(wy));
        for (let wx = 45; wx < 635; wx += 40) {
          ctx.quadraticCurveTo(px(wx + 20), py(wy - 7), px(wx + 40), py(wy));
        }
        ctx.stroke();
      });

      // Twin Mountains
      const drawMountain = (offsetX: number) => {
        ctx.beginPath();
        ctx.moveTo(px(offsetX), py(502));
        ctx.lineTo(px(offsetX + 24), py(462));
        ctx.lineTo(px(offsetX + 40), py(482));
        ctx.lineTo(px(offsetX + 52), py(468));
        ctx.lineTo(px(offsetX + 70), py(502));
        ctx.closePath();
        ctx.fillStyle = '#707D5B';
        ctx.fill();
        ctx.strokeStyle = '#3B2E25';
        ctx.lineWidth = px(2);
        ctx.stroke();
      };
      drawMountain(206);
      drawMountain(406);

      ctx.fillStyle = '#33271E';
      ctx.font = `700 ${Math.round(px(21))}px serif`;
      ctx.fillText('前', px(308), py(486));
      ctx.fillText('线', px(372), py(486));

      // Roads (both halves)
      const drawHalfRoads = (baseRow: number) => {
        ctx.strokeStyle = '#3B2E25';
        ctx.lineWidth = px(2.2);
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

      // Railway sleeper tracks
      const drawRailway = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.strokeStyle = '#3B2E25';
        ctx.lineWidth = px(9.5);
        ctx.beginPath();
        ctx.moveTo(px(x1), py(y1));
        ctx.lineTo(px(x2), py(y2));
        ctx.stroke();

        ctx.strokeStyle = '#F6F1E2';
        ctx.lineWidth = px(3.5);
        ctx.setLineDash([px(7), px(7)]);
        ctx.beginPath();
        ctx.moveTo(px(x1), py(y1));
        ctx.lineTo(px(x2), py(y2));
        ctx.stroke();
        ctx.restore();
      };

      [1, 5, 6, 10].forEach((r) => {
        drawRailway(JUNQI_COL_X[0], JUNQI_ROW_Y[r], JUNQI_COL_X[4], JUNQI_ROW_Y[r]);
      });
      drawRailway(JUNQI_COL_X[0], JUNQI_ROW_Y[0], JUNQI_COL_X[0], JUNQI_ROW_Y[11]);
      drawRailway(JUNQI_COL_X[4], JUNQI_ROW_Y[0], JUNQI_COL_X[4], JUNQI_ROW_Y[11]);
      drawRailway(JUNQI_COL_X[2], JUNQI_ROW_Y[5], JUNQI_COL_X[2], JUNQI_ROW_Y[6]);

      // Station nodes
      const topHqColor = isFlipped ? '#96352F' : '#26568B';
      const bottomHqColor = isFlipped ? '#26568B' : '#96352F';

      for (let vr = 0; vr < 12; vr++) {
        for (let vc = 0; vc < 5; vc++) {
          const cx = px(JUNQI_COL_X[vc]);
          const cy = py(JUNQI_ROW_Y[vr]);
          const isCampNode =
            ((vr === 2 || vr === 4 || vr === 7 || vr === 9) && (vc === 1 || vc === 3)) ||
            ((vr === 3 || vr === 8) && vc === 2);
          const isHqNode = (vr === 0 || vr === 11) && (vc === 1 || vc === 3);

          if (isCampNode) {
            ctx.beginPath();
            ctx.arc(cx, cy, px(26), 0, Math.PI * 2);
            ctx.fillStyle = '#F5EFE0';
            ctx.fill();
            ctx.strokeStyle = '#3B2E25';
            ctx.lineWidth = px(2.2);
            ctx.stroke();

            ctx.save();
            ctx.setLineDash([px(3), px(3)]);
            ctx.beginPath();
            ctx.arc(cx, cy, px(19.5), 0, Math.PI * 2);
            ctx.strokeStyle = '#6E5A4F';
            ctx.lineWidth = px(1.3);
            ctx.stroke();
            ctx.restore();
          } else if (isHqNode) {
            const fill = vr === 0 ? topHqColor : bottomHqColor;
            drawRoundRect(cx - px(43), cy - py(22), px(86), py(44), px(9), fill, '#3B2E25', px(2.4));
            drawRoundRect(
              cx - px(38),
              cy - py(17),
              px(76),
              py(34),
              px(6),
              undefined,
              'rgba(245, 239, 224, 0.85)',
              px(1.2)
            );
            ctx.fillStyle = '#FFFDF9';
            ctx.font = `700 ${Math.round(px(15))}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('大本营', cx, cy + py(1));
          } else {
            drawRoundRect(cx - px(38), cy - py(18), px(76), py(36), px(6), '#F8F4E8', '#3B2E25', px(2));
          }
        }
      }

      // Bottom English subtitle
      ctx.fillStyle = '#7E6849';
      ctx.font = `600 ${Math.round(px(14))}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JUNQI · LAND BATTLE CHESS', px(340), py(936));
    });
  }, [canvasId, isFlipped]);

  return <Canvas id={canvasId} canvasId={canvasId} type="2d" className="board-canvas-layer" />;
};
