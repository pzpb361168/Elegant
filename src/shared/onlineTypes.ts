export type OnlineGameType = 'GOMOKU' | 'XIANGQI' | 'JUNQI';
export type JunqiSubMode = 'FLIP' | 'DEPLOY';
export type RoomStatus = 'WAITING' | 'DEPLOYING' | 'PLAYING' | 'FINISHED';

export type GomokuStone = 1 | 2; // 1 = Black, 2 = White
export type XiangqiSide = 'RED' | 'BLACK';
export type XiangqiPieceType = 'G' | 'A' | 'E' | 'H' | 'R' | 'C' | 'S';
export type JunqiSide = 'RED' | 'BLUE';
export type JunqiRank = 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 | 10 | -1;

export interface Coord {
  r: number;
  c: number;
}

export interface OnlineMoveLog {
  step: number;
  actor: string;
  description: string;
  timestamp: string;
}

export interface PlayerIdentity {
  playerId: string;
  nickname: string;
}

export interface AuthenticatedPlayer {
  playerId: string;
  nickname: string;
}

export interface SeatState {
  seatNumber: 1 | 2;
  playerId: string | null;
  nickname: string | null;
  connected: boolean;
  ready: boolean;
  setupConfirmed: boolean; // Used in Junqi DEPLOY mode
}

export interface SpectatorInfo {
  playerId: string;
  nickname: string;
  connected: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  roleLabel: string; // e.g., '红方', '黑方', '观战'
  text: string;
  timestamp: string;
}

export interface PendingRequest {
  type: 'UNDO' | 'DRAW';
  fromSeat: 1 | 2;
  fromNickname: string;
}

// ---------------- Game Specific States ----------------

export interface GomokuOnlineBoardState {
  grid: (0 | GomokuStone)[][]; // 15x15
  turn: GomokuStone;
  lastMove: Coord | null;
  winningLine: Coord[] | null;
  winner: GomokuStone | 'DRAW' | null;
  stepCount: number;
}

export interface XiangqiPiece {
  side: XiangqiSide;
  type: XiangqiPieceType;
}

export interface XiangqiOnlineBoardState {
  board: (XiangqiPiece | null)[][]; // 10x9
  turn: XiangqiSide;
  lastMove: { from: Coord; to: Coord } | null;
  inCheckSide: XiangqiSide | null;
  capturedRed: XiangqiPiece[];
  capturedBlack: XiangqiPiece[];
  winner: XiangqiSide | 'DRAW' | null;
  stepCount: number;
}

export interface JunqiPieceView {
  id: string;
  side: JunqiSide | 'UNKNOWN';
  rank: JunqiRank | null; // null when hidden by fog-of-war / unrevealed
  revealed: boolean;
  carryingFlag?: boolean;
  mineHits?: number; // 1 or 2 when damaged by non-engineer attack
}

export interface JunqiOnlineBoardState {
  subMode: JunqiSubMode;
  board: (JunqiPieceView | null)[][]; // 12x5
  turn: JunqiSide;
  lastBanner: string;
  lastMove: { from: Coord; to: Coord } | null;
  winner: JunqiSide | 'DRAW' | null;
  stepCount: number;
  redMines: number;
  blueMines: number;
  redMinRank: JunqiRank | null;
  blueMinRank: JunqiRank | null;
  capturedRed: JunqiRank[];
  capturedBlue: JunqiRank[];
}

export interface PublicRoomSummary {
  roomId: string;
  roomName: string;
  gameType: OnlineGameType;
  junqiSubMode?: JunqiSubMode;
  status: RoomStatus;
  hostNickname: string;
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
}

export interface SanitizedRoomState {
  roomId: string;
  roomName: string;
  gameType: OnlineGameType;
  junqiSubMode: JunqiSubMode;
  isPublic: boolean;
  status: RoomStatus;
  viewerRole: 'SEAT_1' | 'SEAT_2' | 'SPECTATOR';
  seat1: SeatState;
  seat2: SeatState;
  spectators: SpectatorInfo[];
  pendingRequest: PendingRequest | null;
  moveLogs: OnlineMoveLog[];
  chatMessages: ChatMessage[];
  gomoku?: GomokuOnlineBoardState;
  xiangqi?: XiangqiOnlineBoardState;
  junqi?: JunqiOnlineBoardState;
}

// ---------------- WebSocket Protocol ----------------

export type ClientToServerMessage =
  | { type: 'auth:login'; token: string }
  | { type: 'lobby:subscribe' }
  | {
      type: 'room:create';
      gameType: OnlineGameType;
      junqiSubMode?: JunqiSubMode;
      isPublic: boolean;
      roomName?: string;
    }
  | { type: 'room:join'; roomId: string }
  | { type: 'room:leave'; roomId: string }
  | { type: 'room:ready'; roomId: string; ready: boolean }
  | { type: 'room:switch_to_seat'; roomId: string; seatNumber: 1 | 2 }
  | {
      type: 'game:move';
      roomId: string;
      payload:
        | { kind: 'GOMOKU'; r: number; c: number }
        | { kind: 'XIANGQI'; from: Coord; to: Coord }
        | { kind: 'JUNQI_FLIP'; r: number; c: number }
        | { kind: 'JUNQI_MOVE'; from: Coord; to: Coord };
    }
  | { type: 'junqi:swap_setup'; roomId: string; c1: Coord; c2: Coord }
  | { type: 'junqi:preset_setup'; roomId: string; preset: 'BALANCED' | 'FORTRESS' }
  | { type: 'junqi:confirm_setup'; roomId: string }
  | { type: 'game:request_action'; roomId: string; action: 'UNDO' | 'DRAW' }
  | { type: 'game:respond_action'; roomId: string; accept: boolean }
  | { type: 'game:resign'; roomId: string }
  | { type: 'game:rematch'; roomId: string }
  | { type: 'chat:send'; roomId: string; text: string }
  | { type: 'profile:update'; nickname: string };

export type ServerToClientMessage =
  | { type: 'auth:ok'; player: AuthenticatedPlayer; expiresAt: number }
  | { type: 'auth:error'; message: string }
  | { type: 'lobby:rooms_update'; rooms: PublicRoomSummary[]; onlineUsers: number }
  | { type: 'room:joined'; roomId: string; state: SanitizedRoomState }
  | { type: 'room:state_sync'; state: SanitizedRoomState }
  | { type: 'room:chat_message'; roomId: string; message: ChatMessage }
  | { type: 'room:left'; roomId: string }
  | { type: 'room:error'; message: string };
