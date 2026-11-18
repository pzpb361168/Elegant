import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIDifficulty, JunqiSubMode, MoveLogEntry, PlayMode } from '../types/game';
import { soundFX } from '../utils/sound';
import { hasJunqiPlayableForce, isJunqiOfficerAttackForbidden } from '../shared/gameRules';
import { JunqiCapturedTray } from './JunqiCapturedTray';
import { RotateCcw, RefreshCw, Flag, Award, Shield, Shuffle, Play, Eye } from 'lucide-react';

export type JunqiSide = 'RED' | 'BLUE';

// Rank power: 9=司令, 8=军长, 7=师长, 6=旅长, 5=团长, 4=营长, 3=连长, 2=排长, 1=工兵, 0=地雷, 10=炸弹, -1=军旗
export type JunqiRank = 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 | 10 | -1;

export interface JunqiPiece {
  id: string;
  side: JunqiSide;
  rank: JunqiRank;
  revealed: boolean;
  carryingFlag?: boolean;
  mineHits?: number;
}

export type JunqiBoardGrid = (JunqiPiece | null)[][]; // 12 rows x 5 cols

interface Coord {
  r: number;
  c: number;
}

interface JunqiHistoryItem {
  board: JunqiBoardGrid;
  turn: JunqiSide;
  lastBanner: string;
  capturedRed: JunqiRank[];
  capturedBlue: JunqiRank[];
}

interface JunqiGameProps {
  playMode: PlayMode;
  subMode: JunqiSubMode;
  difficulty: AIDifficulty;
  onModeChange: (mode: PlayMode) => void;
  onSubModeChange: (sub: JunqiSubMode) => void;
  onDifficultyChange: (diff: AIDifficulty) => void;
  onRecordResult: (outcome: 'WIN' | 'LOSS' | 'DRAW') => void;
}

const ROWS = 12;
const COLS = 5;

export const RANK_NAMES: Record<JunqiRank, string> = {
  9: '司令',
  8: '军长',
  7: '师长',
  6: '旅长',
  5: '团长',
  4: '营长',
  3: '连长',
  2: '排长',
  1: '工兵',
  10: '炸弹',
  0: '地雷',
  [-1]: '军旗',
};

// Standard 25 pieces per side
const ARMY_ROSTER: JunqiRank[] = [
  9,             // 司令 x1
  8,             // 军长 x1
  7, 7,          // 师长 x2
  6, 6,          // 旅长 x2
  5, 5,          // 团长 x2
  4, 4,          // 营长 x2
  3, 3, 3,       // 连长 x3
  2, 2, 2,       // 排长 x3
  1, 1, 1,       // 工兵 x3
  10, 10,        // 炸弹 x2
  0, 0, 0,       // 地雷 x3
  -1,            // 军旗 x1
];

// Coordinate mapping on the 680 x 980 SVG canvas matching the user's reference board
const COL_X = [142, 241, 340, 439, 538];
const ROW_Y = [
  112, // r=0  (Top HQ row)
  174, // r=1  (Top Railway row)
  236, // r=2  (Camp row)
  298, // r=3  (Center Camp row)
  360, // r=4  (Camp row)
  422, // r=5  (Riverbank North Railway row)
  546, // r=6  (Riverbank South Railway row)
  608, // r=7  (Camp row)
  670, // r=8  (Center Camp row)
  732, // r=9  (Camp row)
  794, // r=10 (Bottom Railway row)
  856, // r=11 (Bottom HQ row)
];

// Check if (r, c) is a Safe Camp (行营)
// Top Half (rows 0..5): outer rows 0 (HQ) and 1 (Railway), inner 3 rows are 2, 3, 4, frontline railway is 5 -> Camps at (2,1), (2,3), (3,2), (4,1), (4,3)
// Bottom Half (rows 6..11): frontline railway is 6, inner 3 rows are 7, 8, 9, outer railway is 10, HQ is 11 -> Camps at (7,1), (7,3), (8,2), (9,1), (9,3)
export function isCamp(r: number, c: number): boolean {
  if ((r === 2 || r === 4 || r === 7 || r === 9) && (c === 1 || c === 3)) return true;
  if ((r === 3 || r === 8) && c === 2) return true;
  return false;
}

// Check if (r, c) is a Headquarters (大本营)
export function isHQ(r: number, c: number): boolean {
  return (r === 0 || r === 11) && (c === 1 || c === 3);
}

export function isOwnHQ(side: JunqiSide, r: number, c: number): boolean {
  return side === 'RED' ? r === 11 && (c === 1 || c === 3) : r === 0 && (c === 1 || c === 3);
}

function countSideMines(board: JunqiBoardGrid, side: JunqiSide): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 0) count++;
    }
  }
  return count;
}

function hasSideEngineer(board: JunqiBoardGrid, side: JunqiSide): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank === 1) return true;
    }
  }
  return false;
}

function getMinAliveOfficerRank(board: JunqiBoardGrid, side: JunqiSide): JunqiRank | null {
  let minRank: number | null = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.rank >= 1 && p.rank <= 9) {
        if (minRank === null || p.rank < minRank) {
          minRank = p.rank;
        }
      }
    }
  }
  return minRank as JunqiRank | null;
}

// Check if (r, c) is on the Railway network (铁路线)
export function isRailwayNode(r: number, c: number): boolean {
  if (r === 1 || r === 5 || r === 6 || r === 10) return true;
  if (r >= 1 && r <= 10 && (c === 0 || c === 4)) return true;
  return false;
}

// Check if two adjacent cells are connected by a Railway segment
function isRailwayEdge(r1: number, c1: number, r2: number, c2: number): boolean {
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  // Horizontal railway rows: 1, 5, 6, 10
  if (r1 === r2 && (r1 === 1 || r1 === 5 || r1 === 6 || r1 === 10)) {
    return true;
  }
  // Vertical railway columns: 0, 4 (between rows 1 and 10, plus cross-river bridges at col 0, 2, 4 between row 5 and 6)
  if (c1 === c2) {
    if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
      return c1 === 0 || c1 === 2 || c1 === 4;
    }
    if ((c1 === 0 || c1 === 4) && r1 >= 1 && r1 <= 10 && r2 >= 1 && r2 <= 10) {
      return true;
    }
  }
  return false;
}

// Check if two cells have a valid 1-step road or diagonal camp connection
function isOneStepConnected(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (dr === 0 && dc === 0) return false;

  // River crossing between row 5 and row 6 is only allowed at columns 0, 2, 4
  if ((r1 === 5 && r2 === 6) || (r1 === 6 && r2 === 5)) {
    return dc === 0 && (c1 === 0 || c1 === 2 || c1 === 4);
  }

  // In the reference board, outer vertical edges (r=0..1 and r=10..11 at col 0 and col 4) are connected
  // Orthogonal adjacent on the same half of the board
  if (dr + dc === 1) return true;

  // Diagonal adjacent is valid IF at least one endpoint is a Camp (行营) and both stay on the same side of the river
  if (dr === 1 && dc === 1) {
    const sameHalf = (r1 <= 5 && r2 <= 5) || (r1 >= 6 && r2 >= 6);
    if (sameHalf && (isCamp(r1, c1) || isCamp(r2, c2))) {
      return true;
    }
  }

  return false;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Generate Flip Mode Board (all 50 pieces shuffled face-down onto non-camp cells)
function createFlipModeBoard(): JunqiBoardGrid {
  const board: JunqiBoardGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const allPieces: JunqiPiece[] = [];

  (['RED', 'BLUE'] as JunqiSide[]).forEach((side) => {
    ARMY_ROSTER.forEach((rank, idx) => {
      allPieces.push({
        id: `${side}-${rank}-${idx}`,
        side,
        rank,
        revealed: false,
      });
    });
  });

  const shuffled = shuffleArray(allPieces);
  let ptr = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isCamp(r, c) && ptr < shuffled.length) {
        board[r][c] = shuffled[ptr++];
      }
    }
  }
  return board;
}

// Generate Deploy Mode Board (RED on rows 0..5 top or BLUE on rows 6..11 bottom, matching player at bottom)
// Note: In our board, Top (rows 0..5) has Cinnabar Red HQ in the board artwork and Bottom (rows 6..11) has Royal Blue HQ,
// OR we allow human player at bottom (rows 6..11) and AI at top (rows 0..5). Let's place RED (Top Territory, rows 0..5) as AI/Top and BLUE (Bottom Territory, rows 6..11) or keep RED at Bottom with matching styling.
// Wait: let's look closely at the user's image:
// Top row (r=0) has 2 Red "大本营" boxes (#93332E), and Bottom row (r=11) has 2 Blue "大本营" boxes (#27568B).
// Let's keep RED pieces for the Red side and BLUE pieces for the Blue side, and let the player at the bottom command their army (or let RED/BLUE match the board). Even better: let's support RED at bottom or let the bottom HQ be RED/BLUE! Actually, why not render the exact board from the image (Top HQ in Red `#96352F`, Bottom HQ in Blue `#25568B`), and let the player at the bottom play either Red or Blue, OR make the player at the bottom control the Bottom Army and top control the Top Army!
// Let's make sure the user's familiar Red vs Blue works seamlessly: in `createDeployModeBoard`, let's place `RED` at the bottom (rows 6..11) and `BLUE` at the top (rows 0..5), and in the board graphic, let's follow the exact visual design of the image (with top & bottom "大本营" styled with the double inner white border and rounded pill-rectangle frame!).
function createDeployModeBoard(
  presetStyle: 'BALANCED' | 'FORTRESS' = 'BALANCED',
  revealOpponent: boolean = false
): JunqiBoardGrid {
  const board: JunqiBoardGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  const deployHalf = (side: JunqiSide, revealed: boolean) => {
    const isBottom = side === 'RED';
    const hqRow = isBottom ? 11 : 0;
    const backTwoRows = isBottom ? [10, 11] : [0, 1];
    const frontRow = isBottom ? 6 : 5;
    const allRows = isBottom ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];

    const slots: Coord[] = [];
    for (const r of allRows) {
      for (let c = 0; c < COLS; c++) {
        if (!isCamp(r, c)) {
          slots.push({ r, c });
        }
      }
    }

    let idCounter = 0;
    const placeAt = (r: number, c: number, rank: JunqiRank) => {
      board[r][c] = {
        id: `${side}-${rank}-${idCounter++}`,
        side,
        rank,
        revealed,
      };
      const idx = slots.findIndex((s) => s.r === r && s.c === c);
      if (idx !== -1) slots.splice(idx, 1);
    };

    // 1. Place Flag (-1) in one of the two HQ slots
    const flagCol = presetStyle === 'FORTRESS' ? 1 : Math.random() < 0.5 ? 1 : 3;
    const otherHqCol = flagCol === 1 ? 3 : 1;
    placeAt(hqRow, flagCol, -1);

    // 2. Place a minor officer in the other HQ
    placeAt(hqRow, otherHqCol, 2);

    // 3. Place 3 Landmines (0) in back two rows
    const mineCandidates = shuffleArray(slots.filter((s) => backTwoRows.includes(s.r)));
    for (let i = 0; i < 3; i++) {
      placeAt(mineCandidates[i].r, mineCandidates[i].c, 0);
    }

    // 4. Place 2 Bombs (10) not on the front-most row
    const bombCandidates = shuffleArray(slots.filter((s) => s.r !== frontRow));
    for (let i = 0; i < 2; i++) {
      placeAt(bombCandidates[i].r, bombCandidates[i].c, 10);
    }

    // 5. Remaining 18 pieces
    const remainingRanks: JunqiRank[] = [
      9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1,
    ];
    const shuffledRanks = shuffleArray(remainingRanks);
    const remainingSlots = shuffleArray(slots);

    remainingSlots.forEach((slot, idx) => {
      placeAt(slot.r, slot.c, shuffledRanks[idx]);
    });
  };

  deployHalf('BLUE', revealOpponent);
  deployHalf('RED', true);

  return board;
}

function cloneJunqiBoard(board: JunqiBoardGrid): JunqiBoardGrid {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function resolveStandardCombat(
  attacker: JunqiPiece,
  defender: JunqiPiece
): 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'BOTH_DIE' {
  if (attacker.rank === 10 || defender.rank === 10) {
    return 'BOTH_DIE';
  }
  if (attacker.rank > defender.rank) return 'ATTACKER_WINS';
  if (attacker.rank < defender.rank) return 'DEFENDER_WINS';
  return 'BOTH_DIE';
}

export function getJunqiLegalMoves(
  board: JunqiBoardGrid,
  r: number,
  c: number,
  subMode: JunqiSubMode,
  isTargetFaceVisible?: (p: JunqiPiece) => boolean
): Coord[] {
  const piece = board[r][c];
  if (!piece || !piece.revealed) return [];

  if (piece.rank === -1 || piece.rank === 0) return [];
  if (subMode === 'DEPLOY' && isHQ(r, c) && !piece.carryingFlag) return [];

  const mySide = piece.side;
  const enemySide: JunqiSide = mySide === 'RED' ? 'BLUE' : 'RED';
  const enemyMines = countSideMines(board, enemySide);
  const minRank = getMinAliveOfficerRank(board, mySide);

  const legal: Coord[] = [];
  const addedKey = new Set<string>();

  const tryAddTarget = (nr: number, nc: number): boolean => {
    const key = `${nr},${nc}`;
    const occ = board[nr][nc];

    if (!occ) {
      if (!addedKey.has(key)) {
        addedKey.add(key);
        legal.push({ r: nr, c: nc });
      }
      return true;
    }

    // Own piece: flag-carrier may enter own HQ even if occupied by own Flag/guard
    if (occ.side === mySide) {
      if (piece.carryingFlag && isOwnHQ(mySide, nr, nc)) {
        if (!addedKey.has(key)) {
          addedKey.add(key);
          legal.push({ r: nr, c: nc });
        }
      }
      return false;
    }

    // Flag-carrier is strictly non-combatant (cannot capture or be captured, only blocked)
    if (piece.carryingFlag) return false;

    if (isCamp(nr, nc)) return false;
    if (!occ.revealed) return false;

    // Enemy carrying a flag cannot be captured — only blocked!
    if (occ.carryingFlag) return false;

    // If enemy Flag is visible to the current actor, enforce mine & lowest-rank check upfront
    const canSeeOcc = isTargetFaceVisible ? isTargetFaceVisible(occ) : subMode === 'FLIP';
    if (occ.rank === -1 && canSeeOcc) {
      if (enemyMines > 0 || minRank === null || piece.rank !== minRank) {
        return false;
      }
    }

    // If enemy officer rank is visible, smaller officer (1..9) cannot proactively attack larger officer (1..9)
    if (canSeeOcc && isJunqiOfficerAttackForbidden(piece.rank, occ.rank)) {
      return false;
    }

    if (!addedKey.has(key)) {
      addedKey.add(key);
      legal.push({ r: nr, c: nc });
    }
    return false;
  };

  for (let nr = Math.max(0, r - 1); nr <= Math.min(ROWS - 1, r + 1); nr++) {
    for (let nc = Math.max(0, c - 1); nc <= Math.min(COLS - 1, c + 1); nc++) {
      if (isOneStepConnected(r, c, nr, nc)) {
        tryAddTarget(nr, nc);
      }
    }
  }

  if (isRailwayNode(r, c)) {
    if (piece.rank === 1) {
      const visited = new Set<string>([`${r},${c}`]);
      const queue: Coord[] = [{ r, c }];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const dirs = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];
        for (const [dr, dc] of dirs) {
          const nr = curr.r + dr;
          const nc = curr.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const nKey = `${nr},${nc}`;
          if (visited.has(nKey)) continue;
          if (!isRailwayEdge(curr.r, curr.c, nr, nc)) continue;

          visited.add(nKey);
          const canContinue = tryAddTarget(nr, nc);
          if (canContinue) {
            queue.push({ r: nr, c: nc });
          }
        }
      }
    } else {
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        let cr = r;
        let cc = c;
        while (true) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (!isRailwayEdge(cr, cc, nr, nc)) break;
          const canContinue = tryAddTarget(nr, nc);
          if (!canContinue) break;
          cr = nr;
          cc = nc;
        }
      }
    }
  }

  return legal;
}

function hasAnyLegalAction(board: JunqiBoardGrid, side: JunqiSide, subMode: JunqiSubMode): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (subMode === 'FLIP' && !p.revealed) return true;
      if (p.revealed && p.side === side) {
        if (getJunqiLegalMoves(board, r, c, subMode, () => true).length > 0) return true;
      }
    }
  }
  return false;
}

// Helper to render all road lines and railway sleeper tracks on the SVG board
// Both Top Half (rows 0..5) and Bottom Half (rows 6..11) have identical 5-camp road and diagonal network geometry
const BoardNetworkLayer: React.FC = () => {
  const renderHalfRoads = (baseRow: number) => {
    const lines: React.ReactElement[] = [];

    // 1. Horizontal road segments on the 4 non-horizontal-railway rows:
    // Top half: rows 0 (HQ), 2, 3, 4 (while 1 and 5 are horizontal railways)
    // Bottom half: rows 7, 8, 9, 11 (HQ) (while 6 and 10 are horizontal railways)
    const roadRows =
      baseRow === 0
        ? [0, 2, 3, 4]
        : [7, 8, 9, 11];

    roadRows.forEach((r) => {
      for (let c = 0; c < 4; c++) {
        lines.push(
          <line
            key={`h-road-${r}-${c}`}
            x1={COL_X[c]}
            y1={ROW_Y[r]}
            x2={COL_X[c + 1]}
            y2={ROW_Y[r]}
            stroke="#3B2E25"
            strokeWidth="2.2"
          />
        );
      }
    });

    // 2. Vertical road segments for internal columns (1, 2, 3) across all 5 row intervals in the half
    for (let r = baseRow; r < baseRow + 5; r++) {
      for (let c = 1; c <= 3; c++) {
        lines.push(
          <line
            key={`v-road-${r}-${c}`}
            x1={COL_X[c]}
            y1={ROW_Y[r]}
            x2={COL_X[c]}
            y2={ROW_Y[r + 1]}
            stroke="#3B2E25"
            strokeWidth="2.2"
          />
        );
      }
    }

    // 3. Diagonal Camp lines radiating from the 4 corner Camps through the center Camp and surrounding stations
    // Top half camp rows: 2, 3, 4 (offset +2, +3, +4 from baseRow=0)
    // Bottom half camp rows: 7, 8, 9 (offset +1, +2, +3 from baseRow=6)
    const firstCampRow = baseRow === 0 ? 2 : 7;
    const secondCampRow = baseRow === 0 ? 4 : 9;

    const campCoords: [number, number][] = [
      [firstCampRow, 1],
      [firstCampRow, 3],
      [secondCampRow, 1],
      [secondCampRow, 3],
    ];
    campCoords.forEach(([cr, cc]) => {
      const neighbors: [number, number][] = [
        [cr - 1, cc - 1],
        [cr - 1, cc + 1],
        [cr + 1, cc - 1],
        [cr + 1, cc + 1],
      ];
      neighbors.forEach(([nr, nc]) => {
        lines.push(
          <line
            key={`diag-${cr}-${cc}-to-${nr}-${nc}`}
            x1={COL_X[cc]}
            y1={ROW_Y[cr]}
            x2={COL_X[nc]}
            y2={ROW_Y[nr]}
            stroke="#3B2E25"
            strokeWidth="2"
          />
        );
      });
    });

    return lines;
  };

  // Render double-track railway line with white sleeper dashes matching the reference image
  const renderRailwayTrack = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <g key={key}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3B2E25" strokeWidth="9.5" strokeLinecap="butt" />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#F6F1E2"
        strokeWidth="3.5"
        strokeDasharray="7 7"
        strokeLinecap="butt"
      />
    </g>
  );

  const railwayTracks: React.ReactElement[] = [];

  // Horizontal railway rows: 1, 5, 6, 10
  [1, 5, 6, 10].forEach((r) => {
    railwayTracks.push(
      renderRailwayTrack(COL_X[0], ROW_Y[r], COL_X[4], ROW_Y[r], `h-rail-${r}`)
    );
  });

  // Vertical railway columns on Top Half (r=0 to r=5 on col 0 and col 4, just like the image where track goes all the way from r=0 to r=11 on col 0 and col 4!)
  // Notice in the user's reference image: the railway track on col 0 and col 4 goes between r=0..5 and r=6..11, AND crosses the river!
  railwayTracks.push(
    renderRailwayTrack(COL_X[0], ROW_Y[0], COL_X[0], ROW_Y[11], 'v-rail-left-full'),
    renderRailwayTrack(COL_X[4], ROW_Y[0], COL_X[4], ROW_Y[11], 'v-rail-right-full'),
    // Center cross-river bridge between (5, 2) and (6, 2)
    renderRailwayTrack(COL_X[2], ROW_Y[5], COL_X[2], ROW_Y[6], 'v-rail-center-bridge')
  );

  return (
    <g>
      {renderHalfRoads(0)}
      {renderHalfRoads(6)}
      {railwayTracks}
    </g>
  );
};

export const JunqiGame: React.FC<JunqiGameProps> = ({
  playMode,
  subMode,
  difficulty,
  onModeChange,
  onSubModeChange,
  onDifficultyChange,
  onRecordResult,
}) => {
  const [board, setBoard] = useState<JunqiBoardGrid>(() =>
    subMode === 'FLIP' ? createFlipModeBoard() : createDeployModeBoard('BALANCED', false)
  );
  const [phase, setPhase] = useState<'SETUP' | 'PLAYING' | 'GAME_OVER'>(
    subMode === 'DEPLOY' ? 'SETUP' : 'PLAYING'
  );
  const [turn, setTurn] = useState<JunqiSide>('RED');
  const [selected, setSelected] = useState<Coord | null>(null);
  const [legalTargets, setLegalTargets] = useState<Coord[]>([]);
  const [lastBanner, setLastBanner] = useState<string>('点击棋子开始行军');
  const [winner, setWinner] = useState<JunqiSide | 'DRAW' | null>(null);
  const [capturedRed, setCapturedRed] = useState<JunqiRank[]>([]);
  const [capturedBlue, setCapturedBlue] = useState<JunqiRank[]>([]);
  const [history, setHistory] = useState<JunqiHistoryItem[]>([]);
  const [moveLogs, setMoveLogs] = useState<MoveLogEntry[]>([]);
  const [openFaceDeploy, setOpenFaceDeploy] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [junqiEffect, setJunqiEffect] = useState<{
    r: number;
    c: number;
    kind: 'FLIP' | 'MOVE' | 'WIN' | 'LOSS' | 'BOMB';
    label?: string;
    key: number;
  } | null>(null);

  const aiTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== 'PLAYING') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const initNewGame = useCallback(
    (targetSubMode: JunqiSubMode = subMode, openView: boolean = openFaceDeploy) => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      if (targetSubMode === 'FLIP') {
        setBoard(createFlipModeBoard());
        setPhase('PLAYING');
        setLastBanner('翻棋开局：须先排完敌雷，再由最低官阶将敌旗扛回己方大本营');
      } else {
        setBoard(createDeployModeBoard('BALANCED', openView));
        setPhase('SETUP');
        setLastBanner('布阵阶段：点击下方己方任意两枚棋子可互换位置，就绪后点击「开始交锋」');
      }
      setTurn('RED');
      setSelected(null);
      setLegalTargets([]);
      setWinner(null);
      setCapturedRed([]);
      setCapturedBlue([]);
      setHistory([]);
      setMoveLogs([]);
      setElapsedSeconds(0);
      setJunqiEffect(null);
      soundFX.playSelect();
    },
    [openFaceDeploy, subMode]
  );

  const canSwapSetupPieces = (
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ): { ok: boolean; reason?: string } => {
    const p1 = board[r1][c1];
    const p2 = board[r2][c2];
    if (!p1 || !p2 || p1.side !== 'RED' || p2.side !== 'RED') {
      return { ok: false, reason: '只能在下方己方防区棋子之间互换布阵' };
    }

    const checkPlacement = (rank: JunqiRank, r: number, c: number): string | null => {
      if (rank === -1 && !isHQ(r, c)) return '军旗必须部署在底线「大本营」内';
      if (rank === 0 && r !== 10 && r !== 11) return '地雷只能部署在最后两排';
      if (rank === 10 && r === 6) return '炸弹不可部署在前线第一排';
      return null;
    };

    const err1 = checkPlacement(p1.rank, r2, c2);
    if (err1) return { ok: false, reason: err1 };
    const err2 = checkPlacement(p2.rank, r1, c1);
    if (err2) return { ok: false, reason: err2 };

    return { ok: true };
  };

  const performFlip = useCallback(
    (r: number, c: number) => {
      const piece = board[r][c];
      if (!piece || piece.revealed) return;

      const nextBoard = cloneJunqiBoard(board);
      nextBoard[r][c]!.revealed = true;

      setHistory((prev) => [
        ...prev,
        {
          board: cloneJunqiBoard(board),
          turn,
          lastBanner,
          capturedRed: [...capturedRed],
          capturedBlue: [...capturedBlue],
        },
      ]);
      setBoard(nextBoard);
      setSelected(null);
      setLegalTargets([]);

      const actorLabel = turn === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方 (AI)' : '蓝方';
      const pieceDesc = `${piece.side === 'RED' ? '红' : '蓝'}【${RANK_NAMES[piece.rank]}】`;
      const msg = `${actorLabel}翻出 ${pieceDesc}`;
      setLastBanner(msg);

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorLabel,
          description: `于 (${r + 1},${c + 1}) 翻出 ${pieceDesc}`,
          timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);

      soundFX.playJunqiFlip();
      setJunqiEffect({ r, c, kind: 'FLIP', key: Date.now() + Math.random() });
      setTurn(turn === 'RED' ? 'BLUE' : 'RED');
    },
    [board, lastBanner, playMode, turn]
  );

  const performMoveOrAttack = useCallback(
    (from: Coord, to: Coord) => {
      const attacker = board[from.r][from.c];
      if (!attacker) return;
      const defender = board[to.r][to.c];
      const enemySide: JunqiSide = turn === 'RED' ? 'BLUE' : 'RED';

      // Authoritative check for Flag pickup (handles hidden DEPLOY fog-of-war clicks cleanly)
      if (defender && defender.side === enemySide && defender.rank === -1) {
        const enemyMines = countSideMines(board, enemySide);
        if (enemyMines > 0) {
          setLastBanner(`敌方尚余 ${enemyMines} 颗地雷未清除，须先排空全部地雷方能夺旗！`);
          soundFX.playJunqiClash('LOSS');
          setSelected(null);
          setLegalTargets([]);
          return;
        }
        const minRank = getMinAliveOfficerRank(board, turn);
        if (minRank === null || attacker.rank !== minRank) {
          const reqName = minRank !== null ? RANK_NAMES[minRank] : '最低官阶';
          setLastBanner(`须由己方当前存活最低官阶【${reqName}】前往扛取敌方军旗！`);
          soundFX.playJunqiClash('LOSS');
          setSelected(null);
          setLegalTargets([]);
          return;
        }
      }

      // Enforce "no smaller officer proactively attacking larger officer" (especially in DEPLOY fog-of-war)
      if (
        defender &&
        defender.side === enemySide &&
        isJunqiOfficerAttackForbidden(attacker.rank, defender.rank)
      ) {
        setLastBanner('敌军官阶高于己方，只能大吃小或同级对兑，不可小打大主动阵亡！');
        soundFX.playCheck();
        setSelected(null);
        setLegalTargets([]);
        return;
      }

      const nextBoard = cloneJunqiBoard(board);
      const nextCapturedRed = [...capturedRed];
      const nextCapturedBlue = [...capturedBlue];
      const recordCaptured = (fallenSide: JunqiSide, rank: JunqiRank) => {
        if (fallenSide === 'RED') nextCapturedRed.push(rank);
        else nextCapturedBlue.push(rank);
      };

      setHistory((prev) => [
        ...prev,
        {
          board: cloneJunqiBoard(board),
          turn,
          lastBanner,
          capturedRed: [...capturedRed],
          capturedBlue: [...capturedBlue],
        },
      ]);

      const actorLabel = turn === 'RED' ? '红方' : playMode === 'PVE' ? '蓝方 (AI)' : '蓝方';
      let logDesc = '';
      let flagReturnedWinner: JunqiSide | null = null;

      if (attacker.carryingFlag && isOwnHQ(turn, to.r, to.c)) {
        nextBoard[from.r][from.c] = null;
        nextBoard[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
        logDesc = `【${RANK_NAMES[attacker.rank]}】将敌方【军旗】成功扛回大本营！`;
        setLastBanner(`${actorLabel}${logDesc}`);
        setJunqiEffect({
          r: to.r,
          c: to.c,
          kind: 'WIN',
          label: '凯旋',
          key: Date.now() + Math.random(),
        });
        flagReturnedWinner = turn;
      } else if (!defender) {
        nextBoard[to.r][to.c] = { ...attacker };
        nextBoard[from.r][from.c] = null;
        if (attacker.carryingFlag) {
          logDesc = `扛旗【${RANK_NAMES[attacker.rank]}】突围进驻 (${to.r + 1},${to.c + 1})`;
          setLastBanner(`${actorLabel}扛旗部队正撤向己方大本营！`);
        } else {
          logDesc = `【${RANK_NAMES[attacker.rank]}】进驻 (${to.r + 1},${to.c + 1})`;
          setLastBanner(`${actorLabel}${logDesc}`);
        }
        setJunqiEffect({ r: to.r, c: to.c, kind: 'MOVE', key: Date.now() + Math.random() });
        soundFX.playJunqiMove();
      } else if (defender.rank === -1) {
        nextBoard[from.r][from.c] = null;
        nextBoard[to.r][to.c] = { ...attacker, revealed: true, carryingFlag: true };
        logDesc = `最低官阶【${RANK_NAMES[attacker.rank]}】拔得敌方【军旗】！正扛回己方大本营`;
        setLastBanner(`${actorLabel}拔得敌旗！请护送返回己方大本营（不可被吃，谨防堵截）`);
        setJunqiEffect({
          r: to.r,
          c: to.c,
          kind: 'WIN',
          label: '扛旗',
          key: Date.now() + Math.random(),
        });
        soundFX.playJunqiClash('WIN');
      } else if (defender.rank === 0) {
        nextBoard[from.r][from.c] = null;
        if (attacker.rank === 1) {
          nextBoard[to.r][to.c] = { ...attacker };
          recordCaptured(enemySide, 0);
          logDesc = `【工兵】成功排除敌方【地雷】`;
          setLastBanner(`${actorLabel}工兵精准排雷成功！`);
          setJunqiEffect({
            r: to.r,
            c: to.c,
            kind: 'WIN',
            label: '排雷',
            key: Date.now() + Math.random(),
          });
          soundFX.playJunqiClash('WIN');
        } else if (attacker.rank === 10) {
          nextBoard[to.r][to.c] = null;
          recordCaptured(turn, 10);
          recordCaptured(enemySide, 0);
          logDesc = `【炸弹】直接炸毁敌方【地雷】（同归于尽）`;
          setLastBanner(`${actorLabel}炸弹爆破清雷（同归于尽）！`);
          setJunqiEffect({
            r: to.r,
            c: to.c,
            kind: 'BOMB',
            label: '炸雷',
            key: Date.now() + Math.random(),
          });
          soundFX.playJunqiClash('BOMB');
        } else {
          recordCaptured(turn, attacker.rank);
          const attackerHasEng = hasSideEngineer(board, turn);
          if (!attackerHasEng) {
            const hits = (defender.mineHits ?? 0) + 1;
            if (hits >= 3) {
              nextBoard[to.r][to.c] = null;
              recordCaptured(enemySide, 0);
              logDesc = `无工兵三子换雷（3/3）：部队牺牲并清除敌方【地雷】`;
              setLastBanner(`${actorLabel}连撞三子强行排雷成功，地雷已清除！`);
              setJunqiEffect({
                r: to.r,
                c: to.c,
                kind: 'BOMB',
                label: '清雷',
                key: Date.now() + Math.random(),
              });
              soundFX.playJunqiClash('BOMB');
            } else {
              nextBoard[to.r][to.c] = { ...defender, mineHits: hits };
              logDesc = `无工兵撞雷（${hits}/3）：部队阵亡，敌方地雷已受创`;
              setLastBanner(`${actorLabel}强行撞雷牺牲，该地雷已受创（${hits}/3）`);
              setJunqiEffect({
                r: to.r,
                c: to.c,
                kind: 'LOSS',
                label: `受创 ${hits}/3`,
                key: Date.now() + Math.random(),
              });
              soundFX.playJunqiClash('LOSS');
            }
          } else {
            logDesc = `部队触及敌方地雷阵亡（己方尚有工兵可排雷）`;
            setLastBanner(`${actorLabel}普通部队触雷阵亡，地雷依然存在！`);
            setJunqiEffect({
              r: to.r,
              c: to.c,
              kind: 'LOSS',
              label: '触雷',
              key: Date.now() + Math.random(),
            });
            soundFX.playJunqiClash('LOSS');
          }
        }
      } else {
        const result = resolveStandardCombat(attacker, defender);
        nextBoard[from.r][from.c] = null;

        if (result === 'ATTACKER_WINS') {
          nextBoard[to.r][to.c] = { ...attacker };
          recordCaptured(enemySide, defender.rank);
          const defLabel = `【${RANK_NAMES[defender.rank]}】`;
          logDesc = `【${RANK_NAMES[attacker.rank]}】击溃敌方${defLabel}`;
          setLastBanner(`${actorLabel}交战告捷：${logDesc}`);
          setJunqiEffect({
            r: to.r,
            c: to.c,
            kind: 'WIN',
            label: '破敌',
            key: Date.now() + Math.random(),
          });
          soundFX.playJunqiClash('WIN');
        } else if (result === 'DEFENDER_WINS') {
          recordCaptured(turn, attacker.rank);
          logDesc = `进攻受挫，不敌敌方驻军`;
          setLastBanner(`${actorLabel}进攻失利，部队阵亡`);
          setJunqiEffect({
            r: to.r,
            c: to.c,
            kind: 'LOSS',
            label: '阵亡',
            key: Date.now() + Math.random(),
          });
          soundFX.playJunqiClash('LOSS');
        } else {
          nextBoard[to.r][to.c] = null;
          recordCaptured(turn, attacker.rank);
          recordCaptured(enemySide, defender.rank);
          logDesc = `于 (${to.r + 1},${to.c + 1}) 与敌军同归于尽`;
          setLastBanner(`激烈交火：双方棋子同归于尽！`);
          setJunqiEffect({
            r: to.r,
            c: to.c,
            kind: 'BOMB',
            label: '同归',
            key: Date.now() + Math.random(),
          });
          soundFX.playJunqiClash('BOMB');
        }
      }

      setBoard(nextBoard);
      setCapturedRed(nextCapturedRed);
      setCapturedBlue(nextCapturedBlue);
      setSelected(null);
      setLegalTargets([]);

      setMoveLogs((prev) => [
        {
          step: prev.length + 1,
          actor: actorLabel,
          description: logDesc,
          timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ]);

      const nextSide: JunqiSide = turn === 'RED' ? 'BLUE' : 'RED';

      const finishGame = (winSide: JunqiSide | 'DRAW', bannerMsg?: string) => {
        if (bannerMsg) setLastBanner(bannerMsg);
        setWinner(winSide);
        setPhase('GAME_OVER');
        soundFX.playVictory();
        if (winSide === 'DRAW') {
          onRecordResult('DRAW');
        } else if (playMode === 'PVE') {
          onRecordResult(winSide === 'RED' ? 'WIN' : 'LOSS');
        } else {
          onRecordResult('WIN');
        }
      };

      if (flagReturnedWinner) {
        finishGame(flagReturnedWinner);
        return;
      }

      const nextHasForce = hasJunqiPlayableForce(nextBoard, nextSide, subMode);
      const actorHasForce = hasJunqiPlayableForce(nextBoard, turn, subMode);

      if (!nextHasForce && !actorHasForce) {
        finishGame('DRAW', '双方有生作战力量均已耗尽，本局判和！');
        return;
      }

      if (!nextHasForce) {
        const loserLabel = nextSide === 'RED' ? '红方' : '蓝方';
        finishGame(turn, `${loserLabel}已无任何可用棋子，${actorLabel}赢得战役胜利！`);
        return;
      }

      if (!actorHasForce) {
        const winnerLabel = nextSide === 'RED' ? '红方' : '蓝方';
        finishGame(nextSide, `${actorLabel}已无任何可用棋子，${winnerLabel}赢得战役胜利！`);
        return;
      }

      if (!hasAnyLegalAction(nextBoard, nextSide, subMode)) {
        finishGame(turn, `${actorLabel}封锁敌军全部行动，赢得战役胜利！`);
        return;
      }

      setTurn(nextSide);
    },
    [board, capturedBlue, capturedRed, lastBanner, onRecordResult, playMode, subMode, turn]
  );

  // AI Turn Logic when turn === 'BLUE' in PvE
  useEffect(() => {
    if (playMode === 'PVE' && phase === 'PLAYING' && turn === 'BLUE' && winner === null) {
      aiTimeoutRef.current = window.setTimeout(() => {
        const candidateMoves: { from: Coord; to: Coord; score: number }[] = [];
        const redMines = countSideMines(board, 'RED');
        const blueHasEng = hasSideEngineer(board, 'BLUE');
        const blueMinRank = getMinAliveOfficerRank(board, 'BLUE');

        // Locate Red Flag & Red Flag-carrier (if any) for strategic AI guidance
        let redFlagPos: Coord | null = null;
        let redCarrierPos: Coord | null = null;
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            const tp = board[rr][cc];
            if (tp && tp.side === 'RED') {
              if (tp.rank === -1 && (tp.revealed || subMode === 'DEPLOY')) redFlagPos = { r: rr, c: cc };
              if (tp.carryingFlag) redCarrierPos = { r: rr, c: cc };
            }
          }
        }

        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const p = board[r][c];
            if (p && p.revealed && p.side === 'BLUE') {
              const targets = getJunqiLegalMoves(board, r, c, subMode, () => true);
              for (const to of targets) {
                const def = board[to.r][to.c];
                let score = 0;

                if (p.carryingFlag) {
                  // Guide Blue's flag-carrier straight back to Blue HQ (r=0, c=1 or 3)
                  if (isOwnHQ('BLUE', to.r, to.c)) {
                    score = 999999;
                  } else {
                    const distBefore = Math.min(
                      Math.abs(r - 0) + Math.abs(c - 1),
                      Math.abs(r - 0) + Math.abs(c - 3)
                    );
                    const distAfter = Math.min(
                      Math.abs(to.r - 0) + Math.abs(to.c - 1),
                      Math.abs(to.r - 0) + Math.abs(to.c - 3)
                    );
                    score = 4500 + (distBefore - distAfter) * 650 + (isCamp(to.r, to.c) ? 180 : 0);
                  }
                } else if (def) {
                  if (def.rank === -1) {
                    if (redMines === 0 && blueMinRank !== null && p.rank === blueMinRank) {
                      score = 99999;
                    } else {
                      score = -9999;
                    }
                  } else if (def.rank === 0) {
                    if (p.rank === 1) {
                      score = 1600; // Engineer clears mine directly!
                    } else if (p.rank === 10) {
                      score = 900; // Bomb blasts mine!
                    } else if (!blueHasEng) {
                      score = 320 + (def.mineHits ?? 0) * 300 - p.rank * 35; // 3-hit clearance with lowest expendable rank
                    } else {
                      score = -950; // Don't waste officers while Engineer is alive
                    }
                  } else {
                    const outcome = resolveStandardCombat(p, def);
                    if (outcome === 'ATTACKER_WINS') {
                      score = 520 + def.rank * 80;
                    } else if (outcome === 'BOTH_DIE') {
                      score = def.rank >= p.rank ? 220 : -150;
                    } else {
                      score = -600;
                    }
                    // Protect Blue's lowest-rank flag carrier if mines are nearly cleared
                    if (blueMinRank !== null && p.rank === blueMinRank && redMines <= 1) {
                      score -= 220;
                    }
                  }
                } else {
                  score = (to.r - r) * 18 + (isCamp(to.r, to.c) ? 65 : 0);

                  // If Red is carrying Blue's flag, rush to block Red's carrier or Red HQ gates!
                  if (redCarrierPos) {
                    const distToCarrier = Math.abs(to.r - redCarrierPos.r) + Math.abs(to.c - redCarrierPos.c);
                    score += Math.max(0, 8 - distToCarrier) * 110;
                    if ((to.r === 10 || to.r === 11) && (to.c === 1 || to.c === 3 || to.c === 2)) {
                      score += 360;
                    }
                  } else if (redMines === 0 && redFlagPos && blueMinRank !== null && p.rank === blueMinRank) {
                    const dBefore = Math.abs(r - redFlagPos.r) + Math.abs(c - redFlagPos.c);
                    const dAfter = Math.abs(to.r - redFlagPos.r) + Math.abs(to.c - redFlagPos.c);
                    score += (dBefore - dAfter) * 280;
                  }
                }

                if (difficulty === 'EASY') score += Math.random() * 220;
                else if (difficulty === 'MEDIUM') score += Math.random() * 60;

                candidateMoves.push({ from: { r, c }, to, score });
              }
            }
          }
        }

        candidateMoves.sort((a, b) => b.score - a.score);

        if (subMode === 'FLIP') {
          const unrevealedCoords: Coord[] = [];
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (board[r][c] && !board[r][c]!.revealed) {
                unrevealedCoords.push({ r, c });
              }
            }
          }

          if (
            unrevealedCoords.length > 0 &&
            (candidateMoves.length === 0 || candidateMoves[0].score < 120)
          ) {
            const pick = unrevealedCoords[Math.floor(Math.random() * unrevealedCoords.length)];
            performFlip(pick.r, pick.c);
            return;
          }
        }

        if (candidateMoves.length > 0) {
          performMoveOrAttack(candidateMoves[0].from, candidateMoves[0].to);
        }
      }, 480);
    }

    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [playMode, phase, turn, winner, board, subMode, difficulty, performFlip, performMoveOrAttack]);

  const handleCellClick = (r: number, c: number) => {
    if (phase === 'GAME_OVER') return;

    if (phase === 'SETUP') {
      const clicked = board[r][c];
      if (!clicked || clicked.side !== 'RED') return;

      if (!selected) {
        setSelected({ r, c });
        soundFX.playSelect();
        return;
      }

      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }

      const check = canSwapSetupPieces(selected.r, selected.c, r, c);
      if (!check.ok) {
        setLastBanner(`布阵限制：${check.reason}`);
        soundFX.playCheck();
        setSelected(null);
        return;
      }

      const nextBoard = cloneJunqiBoard(board);
      const temp = nextBoard[selected.r][selected.c];
      nextBoard[selected.r][selected.c] = nextBoard[r][c];
      nextBoard[r][c] = temp;
      setBoard(nextBoard);
      setSelected(null);
      setLastBanner(`已互换【${RANK_NAMES[temp!.rank]}】与【${RANK_NAMES[board[r][c]!.rank]}】位置`);
      soundFX.playJunqiMove();
      return;
    }

    if (playMode === 'PVE' && turn === 'BLUE') return;

    const clickedPiece = board[r][c];

    if (selected && legalTargets.some((t) => t.r === r && t.c === c)) {
      performMoveOrAttack(selected, { r, c });
      return;
    }

    if (subMode === 'FLIP' && clickedPiece && !clickedPiece.revealed) {
      performFlip(r, c);
      return;
    }

    if (clickedPiece && clickedPiece.revealed && clickedPiece.side === turn) {
      soundFX.playSelect();
      setSelected({ r, c });
      setLegalTargets(getJunqiLegalMoves(board, r, c, subMode, isPieceFaceVisible));
      return;
    }

    setSelected(null);
    setLegalTargets([]);
  };

  const handleUndo = () => {
    if (history.length === 0 || phase !== 'PLAYING') return;
    if (playMode === 'PVE' && turn === 'BLUE') return;

    const steps = playMode === 'PVE' && history.length >= 2 ? 2 : 1;
    const idx = history.length - steps;
    const snap = history[idx];

    setBoard(snap.board);
    setTurn(snap.turn);
    setLastBanner(snap.lastBanner);
    setCapturedRed(snap.capturedRed);
    setCapturedBlue(snap.capturedBlue);
    setSelected(null);
    setLegalTargets([]);
    setJunqiEffect(null);
    setHistory((prev) => prev.slice(0, idx));
    setMoveLogs((prev) => prev.slice(steps));
    soundFX.playSelect();
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isPieceFaceVisible = (piece: JunqiPiece): boolean => {
    if (phase === 'GAME_OVER') return true;
    if (subMode === 'FLIP') return piece.revealed;
    if (openFaceDeploy) return true;
    if (playMode === 'PVE') {
      return piece.side === 'RED';
    }
    return piece.side === turn;
  };

  const redMinesLeft = countSideMines(board, 'RED');
  const blueMinesLeft = countSideMines(board, 'BLUE');
  const redMinRank = getMinAliveOfficerRank(board, 'RED');
  const blueMinRank = getMinAliveOfficerRank(board, 'BLUE');
  const currentMinRank = turn === 'RED' ? redMinRank : blueMinRank;
  const currentEnemyMines = turn === 'RED' ? blueMinesLeft : redMinesLeft;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Board Area */}
      <div className="lg:col-span-8 flex flex-col items-center">
        {/* Top Status Header */}
        <div className="w-full max-w-[760px] mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 rounded-xl bg-[#EFE9D8] border border-[#D8CBB8]">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold tracking-wider text-white ${
                phase === 'SETUP'
                  ? 'bg-[#7C5332]'
                  : turn === 'RED'
                  ? 'bg-[#98352E]'
                  : 'bg-[#26568B]'
              }`}
            >
              {phase === 'SETUP' ? '排兵布阵' : turn === 'RED' ? '红方指挥' : '蓝方指挥'}
            </span>
            <div>
              <div className="text-sm font-semibold text-[#291D16]">{lastBanner}</div>
              <div className="text-xs text-[#6E5A4F]">
                模式：{subMode === 'FLIP' ? '随机翻棋' : '经典布阵'} · 步数{' '}
                <span className="font-mono-tabular font-semibold">{history.length}</span> · 用时{' '}
                <span className="font-mono-tabular font-semibold">{formatTime(elapsedSeconds)}</span>
              </div>
              <div className="text-[11px] text-[#5D4037] mt-0.5 font-medium">
                红雷剩 <span className="font-mono-tabular font-bold text-[#98352E]">{redMinesLeft}</span> · 蓝雷剩{' '}
                <span className="font-mono-tabular font-bold text-[#26568B]">{blueMinesLeft}</span> · 扛旗最低官阶：
                <span className="font-bold text-[#291D16]">
                  {currentMinRank !== null ? RANK_NAMES[currentMinRank] : '无'}
                </span>
                {currentEnemyMines === 0 ? '（敌雷已清，可扛旗）' : '（须先清雷）'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {phase === 'SETUP' ? (
              <button
                onClick={() => {
                  setPhase('PLAYING');
                  setSelected(null);
                  setLastBanner('全军出击！红方先行');
                  soundFX.playMove();
                }}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#98352E] hover:bg-[#7D2923] text-white transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                开始交锋
              </button>
            ) : (
              <button
                onClick={handleUndo}
                disabled={
                  history.length === 0 ||
                  phase !== 'PLAYING' ||
                  (playMode === 'PVE' && turn === 'BLUE')
                }
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                悔棋
              </button>
            )}
          </div>
        </div>

        {/* 3-Zone Tabletop: Left Blue Fallen Tray | Center 12x5 Junqi Board | Right Red Fallen Tray */}
        <div className="w-full max-w-[780px] flex flex-col md:flex-row items-center md:items-stretch justify-center gap-3">
          <div className="hidden md:flex">
            <JunqiCapturedTray side="BLUE" captured={capturedBlue} layout="vertical" />
          </div>

          {/* Authentic Illustrated Land Battle Chess (陆战棋) Board matching the user's reference image */}
          <div className="relative w-full max-w-[520px] aspect-[680/980] rounded-[28px] shadow-2xl overflow-hidden select-none border-4 border-[#1E2E26]">
          <svg
            viewBox="0 0 680 980"
            className="w-full h-full block"
            aria-label="陆战棋棋盘"
          >
            {/* Outer Cream Card Board Base */}
            <rect
              x="0"
              y="0"
              width="680"
              height="980"
              rx="26"
              fill="#EFE6CE"
              stroke="#B29666"
              strokeWidth="8"
            />

            {/* Inner Gold Frame Border */}
            <rect
              x="22"
              y="22"
              width="636"
              height="936"
              rx="18"
              fill="#F1E9D4"
              stroke="#A68B5B"
              strokeWidth="2.5"
            />

            {/* Four Corner Bullseye Medallions */}
            {(
              [
                [48, 48],
                [632, 48],
                [48, 932],
                [632, 932],
              ] as [number, number][]
            ).map(([cx, cy], idx) => (
              <g key={`corner-${idx}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="9"
                  fill="none"
                  stroke="#A68B5B"
                  strokeWidth="2"
                />
                <circle cx={cx} cy={cy} r="2.5" fill="#A68B5B" />
              </g>
            ))}

            {/* Top Header Calligraphy: 陆 战 棋 */}
            <text
              x="340"
              y="69"
              textAnchor="middle"
              className="fill-[#33271E] font-serif-oriental font-bold text-[38px] tracking-[0.55em]"
            >
              陆战棋
            </text>

            {/* Central River Frontline Band (前线) */}
            <g>
              <rect
                x="23.5"
                y="451"
                width="633"
                height="66"
                fill="#BAD4CE"
              />
              <line
                x1="23.5"
                y1="451"
                x2="656.5"
                y2="451"
                stroke="#638F8C"
                strokeWidth="3"
              />
              <line
                x1="23.5"
                y1="517"
                x2="656.5"
                y2="517"
                stroke="#638F8C"
                strokeWidth="3"
              />

              {/* Subtle Wavy Water Ripples */}
              <path
                d="M 45 468 Q 75 458, 105 468 T 165 468 T 225 468 T 285 468 T 345 468 T 405 468 T 465 468 T 525 468 T 585 468 T 635 468"
                fill="none"
                stroke="#85ADA8"
                strokeWidth="2"
              />
              <path
                d="M 45 501 Q 75 491, 105 501 T 165 501 T 225 501 T 285 501 T 345 501 T 405 501 T 465 501 T 525 501 T 585 501 T 635 501"
                fill="none"
                stroke="#85ADA8"
                strokeWidth="2"
              />

              {/* Left Double-Peak Olive Mountain */}
              <polygon
                points="206,502 230,462 246,482 258,468 276,502"
                fill="#707D5B"
                stroke="#3B2E25"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />

              {/* Right Double-Peak Olive Mountain */}
              <polygon
                points="406,502 430,462 446,482 458,468 476,502"
                fill="#707D5B"
                stroke="#3B2E25"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />

              {/* Frontline Text: 前  线 (flanking the center railway bridge) */}
              <text
                x="308"
                y="495"
                textAnchor="middle"
                className="fill-[#33271E] font-serif-oriental font-bold text-[22px]"
              >
                前
              </text>
              <text
                x="372"
                y="495"
                textAnchor="middle"
                className="fill-[#33271E] font-serif-oriental font-bold text-[22px]"
              >
                线
              </text>
            </g>

            {/* All Connecting Roads, Diagonals & Railway Sleeper Tracks */}
            <BoardNetworkLayer />

            {/* 60 Station Nodes (兵站 rectangles, 行营 circles with dashed inner ring, 大本营 badges) */}
            {ROW_Y.map((cy, r) =>
              COL_X.map((cx, c) => {
                const camp = isCamp(r, c);
                const hq = isHQ(r, c);

                if (camp) {
                  return (
                    <g key={`node-${r}-${c}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="26"
                        fill="#F5EFE0"
                        stroke="#3B2E25"
                        strokeWidth="2.2"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r="19.5"
                        fill="none"
                        stroke="#6E5A4F"
                        strokeWidth="1.3"
                        strokeDasharray="3 3"
                      />
                    </g>
                  );
                }

                if (hq) {
                  const isTopHQ = r === 0;
                  const fillColor = isTopHQ ? '#26568B' : '#96352F';
                  return (
                    <g key={`node-${r}-${c}`}>
                      <rect
                        x={cx - 43}
                        y={cy - 22}
                        width="86"
                        height="44"
                        rx="9"
                        fill={fillColor}
                        stroke="#3B2E25"
                        strokeWidth="2.4"
                      />
                      <rect
                        x={cx - 38}
                        y={cy - 17}
                        width="76"
                        height="34"
                        rx="6"
                        fill="none"
                        stroke="#F5EFE0"
                        strokeWidth="1.2"
                        opacity="0.85"
                      />
                      <text
                        x={cx}
                        y={cy + 6}
                        textAnchor="middle"
                        className="fill-[#FFFDF9] font-serif-oriental font-bold text-[16px] tracking-widest"
                      >
                        大本营
                      </text>
                    </g>
                  );
                }

                // Standard Pill-Rounded Rectangular Station (兵站)
                return (
                  <rect
                    key={`node-${r}-${c}`}
                    x={cx - 38}
                    y={cy - 18}
                    width="76"
                    height="36"
                    rx="6"
                    fill="#F8F4E8"
                    stroke="#3B2E25"
                    strokeWidth="2"
                  />
                );
              })
            )}

            {/* Bottom English Subtitle */}
            <text
              x="340"
              y="936"
              textAnchor="middle"
              className="fill-[#7E6849] font-serif-oriental text-[15px] tracking-[0.36em]"
            >
              JUNQI · LAND BATTLE CHESS
            </text>
          </svg>

          {/* Interactive Hitboxes & Pieces Overlay Positioned Precisely at (COL_X[c], ROW_Y[r]) */}
          <div className="absolute inset-0">
            {board.map((row, r) =>
              row.map((piece, c) => {
                const leftPct = (COL_X[c] / 680) * 100;
                const topPct = (ROW_Y[r] / 980) * 100;
                const camp = isCamp(r, c);
                const isSel = selected?.r === r && selected?.c === c;
                const isLegal = legalTargets.some((t) => t.r === r && t.c === c);
                const isFxTarget = junqiEffect?.r === r && junqiEffect?.c === c;

                return (
                  <button
                    key={`cell-${r}-${c}`}
                    type="button"
                    onClick={() => handleCellClick(r, c)}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: '11.2%',
                      height: '3.75%',
                    }}
                    aria-label={`军旗坐标 (${r + 1},${c + 1})`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none cursor-pointer group"
                  >
                    {/* Piece Tile - always uniform horizontal rectangular badge even inside a Camp */}
                    {piece && (
                      <div
                        key={isFxTarget && junqiEffect ? `jq-pc-${junqiEffect.key}` : 'jq-pc'}
                        className={`relative w-full h-full rounded-[6px] flex items-center justify-center font-serif-oriental font-bold text-[11px] sm:text-[13px] tracking-wider shadow-[0_2px_5px_rgba(0,0,0,0.4)] transition-transform duration-150 border ${
                          !piece.revealed && subMode === 'FLIP'
                            ? 'bg-gradient-to-b from-[#5D4B3C] to-[#3B2E25] text-[#F1E9D4] border-[#B29666]'
                            : piece.side === 'RED'
                            ? 'bg-gradient-to-b from-[#9E342C] to-[#7D241E] text-[#FFFDF9] border-[#F5D0C5]/75'
                            : 'bg-gradient-to-b from-[#2B629E] to-[#1B416C] text-[#FFFDF9] border-[#BFDBFE]/75'
                        } ${
                          piece.carryingFlag
                            ? 'ring-2 ring-[#F59E0B] shadow-[0_0_10px_rgba(245,158,11,0.7)]'
                            : ''
                        } ${
                          isFxTarget && junqiEffect?.kind === 'FLIP'
                            ? 'animate-junqi-flip'
                            : isFxTarget &&
                              (junqiEffect?.kind === 'MOVE' || junqiEffect?.kind === 'WIN')
                            ? 'animate-junqi-march'
                            : ''
                        } ${isSel ? '-translate-y-1 ring-2 ring-[#0F766E] scale-105 z-10' : ''}`}
                      >
                        {isPieceFaceVisible(piece)
                          ? RANK_NAMES[piece.rank]
                          : subMode === 'FLIP'
                          ? '暗棋'
                          : '敌军'}
                        {piece.carryingFlag && (
                          <span
                            title="扛旗中（不可被吃，只能堵截）"
                            className="absolute -top-2 -right-1.5 px-1 py-0.2 rounded bg-[#D97706] text-[#FFFDF9] text-[9px] leading-tight font-bold border border-[#FEF3C7] shadow-sm pointer-events-none"
                          >
                            扛旗
                          </span>
                        )}
                        {piece.mineHits !== undefined && piece.mineHits > 0 && (
                          <span
                            title={`地雷受创 ${piece.mineHits}/3`}
                            className="absolute -bottom-1.5 -right-1 px-1 rounded bg-[#7F1D1D] text-[#FEF3C7] text-[9px] leading-tight font-mono-tabular font-bold border border-[#FCA5A5] shadow-sm pointer-events-none"
                          >
                            {piece.mineHits}/3
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tactical Reticle / Explosion Overlay (works even if cell emptied by BOTH_DIE) */}
                    {isFxTarget && junqiEffect && junqiEffect.kind === 'MOVE' && (
                      <span
                        key={`jq-ret-${junqiEffect.key}`}
                        className="absolute -inset-1 rounded-[8px] border-2 border-[#D97706] pointer-events-none z-20 animate-junqi-reticle"
                      />
                    )}
                    {isFxTarget &&
                      junqiEffect &&
                      (junqiEffect.kind === 'WIN' ||
                        junqiEffect.kind === 'LOSS' ||
                        junqiEffect.kind === 'BOMB') && (
                        <span
                          key={`jq-exp-${junqiEffect.key}`}
                          className={`absolute -inset-1 rounded-[10px] border-3 pointer-events-none z-20 animate-junqi-explosion ${
                            junqiEffect.kind === 'BOMB'
                              ? 'border-[#EA580C] bg-[#F97316]/30'
                              : junqiEffect.kind === 'WIN'
                              ? 'border-[#D97706] bg-[#F59E0B]/25'
                              : 'border-[#991B1B] bg-[#DC2626]/25'
                          }`}
                        />
                      )}
                    {isFxTarget && junqiEffect?.label && (
                      <span
                        key={`jq-tag-${junqiEffect.key}`}
                        className={`absolute -top-3 z-30 px-1.5 py-0.5 rounded font-serif-oriental font-bold text-[10px] sm:text-xs text-white shadow-md pointer-events-none whitespace-nowrap animate-fx-float-tag ${
                          junqiEffect.kind === 'WIN'
                            ? 'bg-[#B45309]'
                            : junqiEffect.kind === 'BOMB'
                            ? 'bg-[#C2410C]'
                            : 'bg-[#991B1B]'
                        }`}
                      >
                        {junqiEffect.label}
                      </span>
                    )}

                    {/* Legal Destination Indicator */}
                    {isLegal && (
                      <span
                        className={`pointer-events-none z-20 ring-3 ring-[#0F766E] bg-[#0F766E]/30 ${
                          camp && !piece
                            ? 'w-[72%] h-[142%] rounded-full'
                            : 'w-full h-full rounded-[6px]'
                        }`}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Victory Modal */}
          {phase === 'GAME_OVER' && winner && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-6 z-30">
              <div className="bg-[#F7F3E8] border-2 border-[#7C5332] rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#98352E]/10 text-[#98352E] flex items-center justify-center">
                  <Award className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold font-serif-oriental text-[#291D16] mb-1">
                  {winner === 'DRAW'
                    ? '双方力竭和局'
                    : winner === 'RED'
                    ? '红方军团赢得胜利'
                    : '蓝方军团赢得胜利'}
                </h3>
                <p className="text-xs text-[#6E5A4F] mb-5">
                  {lastBanner} · 共历时 {formatTime(elapsedSeconds)} · {history.length} 回合
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => initNewGame(subMode, openFaceDeploy)}
                    className="px-5 py-2.5 rounded-lg bg-[#98352E] hover:bg-[#7D2923] text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    再来一局
                  </button>
                  <button
                    onClick={() => setWinner(null)}
                    className="px-4 py-2.5 rounded-lg bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#291D16] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    检视战场
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

          <div className="hidden md:flex">
            <JunqiCapturedTray side="RED" captured={capturedRed} layout="vertical" />
          </div>

          {/* Mobile compact trays directly beneath the board */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
            <JunqiCapturedTray side="BLUE" captured={capturedBlue} layout="horizontal" />
            <JunqiCapturedTray side="RED" captured={capturedRed} layout="horizontal" />
          </div>
        </div>
      </div>

      {/* Right Desk Control Panel */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-3 mb-4">
            <div>
              <h2 className="text-lg font-bold font-serif-oriental text-[#291D16]">陆战军旗 · 沙盘帷幄</h2>
              <p className="text-xs text-[#6E5A4F]">支持随机翻棋与排兵布阵双模式 · 工兵铁路飞驰</p>
            </div>
            <Shield className="w-5 h-5 text-[#8D6E63]" />
          </div>

          {/* SubMode Switcher: Flip vs Deploy */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#5D4037] mb-2">军旗玩法规则</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
              <button
                onClick={() => {
                  onSubModeChange('FLIP');
                  initNewGame('FLIP', openFaceDeploy);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  subMode === 'FLIP'
                    ? 'bg-[#98352E] text-white shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                翻棋模式 (暗置翻开)
              </button>
              <button
                onClick={() => {
                  onSubModeChange('DEPLOY');
                  initNewGame('DEPLOY', openFaceDeploy);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  subMode === 'DEPLOY'
                    ? 'bg-[#98352E] text-white shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                布阵模式 (排兵布阵)
              </button>
            </div>
          </div>

          {/* Mode Selector: PvE vs PvP */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#5D4037] mb-2">对战模式</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#E4DAC3] rounded-lg">
              <button
                onClick={() => {
                  onModeChange('PVE');
                  initNewGame(subMode, openFaceDeploy);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playMode === 'PVE'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                人机博弈 (PvE)
              </button>
              <button
                onClick={() => {
                  onModeChange('PVP');
                  initNewGame(subMode, openFaceDeploy);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  playMode === 'PVP'
                    ? 'bg-[#3E2723] text-[#F7F3E8] shadow-sm'
                    : 'text-[#4E342E] hover:text-[#291D16]'
                }`}
              >
                双人同屏 (PvP)
              </button>
            </div>
          </div>

          {/* Deploy Mode Preset & Visibility Controls */}
          {subMode === 'DEPLOY' && (
            <div className="mb-4 p-3 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#5D4037]">快速布阵调整</span>
                <button
                  onClick={() => {
                    const nextOpen = !openFaceDeploy;
                    setOpenFaceDeploy(nextOpen);
                  }}
                  className="text-xs text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {openFaceDeploy ? '切换为暗棋迷雾' : '切换为全明棋视野'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setBoard(createDeployModeBoard('BALANCED', openFaceDeploy));
                    setPhase('SETUP');
                    setLastBanner('已生成「机动突击阵」，可继续点击棋子微调');
                    soundFX.playSelect();
                  }}
                  className="py-1.5 px-2.5 rounded bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  随机机动阵
                </button>
                <button
                  onClick={() => {
                    setBoard(createDeployModeBoard('FORTRESS', openFaceDeploy));
                    setPhase('SETUP');
                    setLastBanner('已生成「铁桶防御阵」，可继续点击棋子微调');
                    soundFX.playSelect();
                  }}
                  className="py-1.5 px-2.5 rounded bg-[#E4DAC3] hover:bg-[#D8C9AA] text-[#3E2723] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Shield className="w-3.5 h-3.5" />
                  铁桶防御阵
                </button>
              </div>
            </div>
          )}

          {/* Rank Hierarchy Quick Reference */}
          <div className="mb-4 p-3 rounded-lg bg-[#F7F3E8] border border-[#D8CBB8] text-xs text-[#5D4037] leading-relaxed">
            <span className="font-bold text-[#291D16]">作战与胜负新规：</span>
            仅允许大吃小或同级对兑（不可小打大主动阵亡）；须先清空敌方全部地雷（工兵/炸弹/无工兵三撞），再由最低官阶扛旗回己方大本营；任一方无可用棋子即直接判输。
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => initNewGame(subMode, openFaceDeploy)}
              className="py-2.5 px-4 rounded-lg bg-[#3E2723] hover:bg-[#291D16] text-[#F7F3E8] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重新开局
            </button>
            <button
              onClick={() => {
                if (phase === 'GAME_OVER' || history.length === 0) return;
                setWinner(turn === 'RED' ? 'BLUE' : 'RED');
                setPhase('GAME_OVER');
                soundFX.playCheck();
                if (playMode === 'PVE') onRecordResult('LOSS');
              }}
              disabled={phase === 'GAME_OVER' || history.length === 0}
              className="py-2.5 px-4 rounded-lg border border-[#98352E]/50 text-[#98352E] hover:bg-[#98352E]/10 disabled:opacity-40 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-3.5 h-3.5" />
              投子认负
            </button>
          </div>
        </div>

        {/* Battle Log */}
        <div className="bg-[#EFE9D8] border border-[#D8CBB8] rounded-xl p-5 flex flex-col h-[250px]">
          <div className="flex items-center justify-between border-b border-[#D8CBB8] pb-2.5 mb-3">
            <h3 className="text-sm font-bold font-serif-oriental text-[#291D16]">军情战报记录</h3>
            <span className="text-xs text-[#6E5A4F] font-mono-tabular">共 {moveLogs.length} 条</span>
          </div>
          {moveLogs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#8D6E63]">
              暂无交火战报，请调遣部队展开行动
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {moveLogs.map((log) => (
                <div
                  key={log.step}
                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-[#F7F3E8]/80 text-[#3E2723]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular font-semibold text-[#8D6E63] w-7">
                      #{log.step}
                    </span>
                    <span className="font-medium">{log.actor}</span>
                    <span className="text-[#6E5A4F]">·</span>
                    <span className="font-semibold text-[#291D16]">{log.description}</span>
                  </div>
                  <span className="text-[11px] font-mono-tabular text-[#8D6E63]">{log.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
