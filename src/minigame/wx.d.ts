export interface WxTouch {
  identifier: number;
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
}

export interface WxTouchEvent {
  touches: WxTouch[];
  changedTouches: WxTouch[];
  timeStamp: number;
}

export interface WxCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

export interface WxSocketTask {
  onOpen(cb: () => void): void;
  onMessage(cb: (res: { data: string | ArrayBuffer }) => void): void;
  onError(cb: (err: unknown) => void): void;
  onClose(cb: (res: { code?: number; reason?: string }) => void): void;
  send(opts: { data: string }): void;
  close(opts?: { code?: number; reason?: string }): void;
}

export interface WxSystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  statusBarHeight?: number;
  safeArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
}

export interface WxMenuButtonRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface WxUserInfo {
  nickName?: string;
  avatarUrl?: string;
  gender?: number;
  country?: string;
  province?: string;
  city?: string;
  language?: string;
}

export interface WxUserInfoButtonStyle {
  left: number;
  top: number;
  width: number;
  height: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: number;
  lineHeight?: number;
}

export interface WxUserInfoButton {
  show(): void;
  hide(): void;
  destroy(): void;
  onTap(cb: (res: { userInfo?: WxUserInfo; errMsg?: string }) => void): void;
  offTap?(cb?: (res: { userInfo?: WxUserInfo; errMsg?: string }) => void): void;
  style?: WxUserInfoButtonStyle;
}

export interface WxImage {
  src: string;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: ((err?: unknown) => void) | null;
}

export interface WxGlobal {
  createCanvas(): WxCanvas;
  createImage?(): WxImage;
  getSystemInfoSync(): WxSystemInfo;
  getWindowInfo?(): WxSystemInfo;
  getMenuButtonBoundingClientRect?(): WxMenuButtonRect;
  onTouchStart(cb: (e: WxTouchEvent) => void): void;
  onTouchMove(cb: (e: WxTouchEvent) => void): void;
  onTouchEnd(cb: (e: WxTouchEvent) => void): void;
  onTouchCancel?(cb: (e: WxTouchEvent) => void): void;
  getStorageSync(key: string): string | undefined;
  setStorageSync(key: string, data: string): void;
  showToast(opts: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void;
  showModal(opts: {
    title: string;
    content?: string;
    editable?: boolean;
    placeholderText?: string;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
    success?: (res: { confirm: boolean; cancel: boolean; content?: string }) => void;
  }): void;
  setClipboardData(opts: { data: string; success?: () => void }): void;
  connectSocket(opts: { url: string }): WxSocketTask;
  createUserInfoButton?(opts: {
    type: 'text' | 'image';
    text?: string;
    image?: string;
    withCredentials?: boolean;
    lang?: 'en' | 'zh_CN' | 'zh_TW';
    style: WxUserInfoButtonStyle;
  }): WxUserInfoButton;
  getSetting?(opts: {
    success?: (res: { authSetting?: Record<string, boolean | undefined> }) => void;
    fail?: (err: unknown) => void;
  }): void;
  openSetting?(opts: {
    success?: (res: { authSetting?: Record<string, boolean | undefined> }) => void;
    fail?: (err: unknown) => void;
  }): void;
  getPrivacySetting?(opts: {
    success?: (res: { needAuthorization?: boolean; privacyContractName?: string }) => void;
    fail?: (err: unknown) => void;
  }): void;
  requirePrivacyAuthorize?(opts: {
    success?: () => void;
    fail?: (err: { errMsg?: string; errno?: number }) => void;
  }): void;
  getUserInfo?(opts: {
    withCredentials?: boolean;
    lang?: 'en' | 'zh_CN' | 'zh_TW';
    success?: (res: { userInfo?: WxUserInfo }) => void;
    fail?: (err: unknown) => void;
  }): void;
  cloud: {
    init(opts: { env: string }): void;
    callFunction(opts: { name: string; data?: Record<string, unknown> }): Promise<{ result?: unknown }>;
    connectContainer(opts: {
      config: { env: string };
      service: string;
      path: string;
      header?: Record<string, string>;
    }): Promise<{ socketTask: WxSocketTask }>;
  };
  createWebAudioContext?(): AudioContext;
  onShareAppMessage?(cb: () => { title: string; query?: string }): void;
  shareAppMessage?(opts: { title: string; query?: string }): void;
  showShareMenu?(opts?: { withShareTicket?: boolean; menus?: string[] }): void;
  getLaunchOptionsSync?(): { query?: Record<string, string> };
  onShow?(cb: (res: { query?: Record<string, string> }) => void): void;
}

declare global {
  const wx: WxGlobal;
}
