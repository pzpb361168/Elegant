const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TOKEN_TTL_MS = 30 * 60 * 1000;
const ORIENTAL_PREFIXES = ['松风', '竹影', '青衫', '听雨', '云水', '墨香', '清茶', '明月', '南山', '沧海'];
const ORIENTAL_SUFFIXES = ['弈客', '居士', '棋士', '书生', '隐士', '散人', '雅士', '公子'];
const GENERIC_WECHAT_NAMES = new Set(['微信用户', '微信棋友']);

function generateOrientalAlias(openId) {
  const hash = crypto.createHash('sha256').update(String(openId)).digest();
  const pre = ORIENTAL_PREFIXES[hash[0] % ORIENTAL_PREFIXES.length];
  const suf = ORIENTAL_SUFFIXES[hash[1] % ORIENTAL_SUFFIXES.length];
  const num = 10 + (hash[2] % 90);
  return `${pre}${suf}${num}`;
}

function sanitizeNickname(raw, allowGeneric) {
  if (typeof raw !== 'string') return '';
  const clean = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 16);
  if (!clean) return '';
  if (!allowGeneric && GENERIC_WECHAT_NAMES.has(clean)) return '';
  return clean;
}

function sanitizeAvatarUrl(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512 || /[\s\u0000-\u001F]/.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function signOnlineToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const secret = process.env.ONLINE_AUTH_SECRET;
  if (!OPENID) throw new Error('无法获取微信用户身份');
  if (!secret || secret.length < 32) throw new Error('云函数未配置 ONLINE_AUTH_SECRET');

  const mode = event && event.mode === 'updateProfile' ? 'updateProfile' : 'login';
  const requestedAuthStatus =
    event && (event.authStatus === 'AUTHORIZED' || event.authStatus === 'GUEST_ALIAS')
      ? event.authStatus
      : undefined;
  const incomingNick = sanitizeNickname(event && event.nickName, mode === 'updateProfile');
  const incomingAvatar = sanitizeAvatarUrl(event && event.avatarUrl);

  const db = cloud.database();
  const users = db.collection('users');
  const existing = await users.where({ openId: OPENID }).limit(1).get();
  const now = Date.now();
  let user;

  if (existing.data.length) {
    const stored = existing.data[0];
    let nickname = sanitizeNickname(stored.nickname, true) || generateOrientalAlias(OPENID);
    let avatarUrl = sanitizeAvatarUrl(stored.avatarUrl);
    let authStatus = stored.authStatus === 'AUTHORIZED' ? 'AUTHORIZED' : 'GUEST_ALIAS';

    const updateData = { lastLoginAt: now };

    if (mode === 'updateProfile') {
      if (incomingNick) {
        nickname = incomingNick;
        updateData.nickname = nickname;
        updateData.updatedAt = now;
      }
      if (incomingAvatar) {
        avatarUrl = incomingAvatar;
        updateData.avatarUrl = avatarUrl;
        updateData.updatedAt = now;
      }
      if (requestedAuthStatus === 'AUTHORIZED' && (incomingNick || incomingAvatar || avatarUrl)) {
        authStatus = 'AUTHORIZED';
        updateData.authStatus = authStatus;
        updateData.updatedAt = now;
      }
    } else {
      if (incomingNick) {
        nickname = incomingNick;
        updateData.nickname = nickname;
        updateData.updatedAt = now;
      }
      if (incomingAvatar) {
        avatarUrl = incomingAvatar;
        updateData.avatarUrl = avatarUrl;
        updateData.updatedAt = now;
      }
      if (requestedAuthStatus === 'AUTHORIZED' && (incomingNick || incomingAvatar)) {
        authStatus = 'AUTHORIZED';
        updateData.authStatus = authStatus;
        updateData.updatedAt = now;
      } else if (requestedAuthStatus === 'GUEST_ALIAS' && stored.authStatus !== 'AUTHORIZED') {
        authStatus = 'GUEST_ALIAS';
        updateData.authStatus = authStatus;
      }
    }

    await users.doc(stored._id).update({ data: updateData });
    user = { _id: stored._id, nickname, avatarUrl, authStatus };
  } else {
    const nickname = incomingNick || generateOrientalAlias(OPENID);
    const avatarUrl = incomingAvatar;
    const authStatus =
      requestedAuthStatus === 'AUTHORIZED' && (incomingNick || incomingAvatar)
        ? 'AUTHORIZED'
        : 'GUEST_ALIAS';

    const created = await users.add({
      data: {
        openId: OPENID,
        nickname,
        avatarUrl,
        authStatus,
        createdAt: now,
        lastLoginAt: now,
        updatedAt: now,
      },
    });
    user = { _id: created._id, nickname, avatarUrl, authStatus };
  }

  const expiresAt = now + TOKEN_TTL_MS;
  const token = signOnlineToken(
    {
      sub: user._id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || '',
      authStatus: user.authStatus,
      exp: expiresAt,
      aud: 'yayi-online',
    },
    secret
  );

  return {
    token,
    expiresAt,
    player: {
      playerId: user._id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || '',
      authStatus: user.authStatus,
    },
  };
};
