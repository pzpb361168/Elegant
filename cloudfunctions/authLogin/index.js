const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TOKEN_TTL_MS = 30 * 60 * 1000;

function signOnlineToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const secret = process.env.ONLINE_AUTH_SECRET;
  if (!OPENID) throw new Error('无法获取微信用户身份');
  if (!secret || secret.length < 32) throw new Error('云函数未配置 ONLINE_AUTH_SECRET');

  const db = cloud.database();
  const users = db.collection('users');
  const existing = await users.where({ openId: OPENID }).limit(1).get();
  const now = Date.now();
  let user;
  if (existing.data.length) {
    user = existing.data[0];
    await users.doc(user._id).update({ data: { lastLoginAt: now } });
  } else {
    const nickname = `棋友${crypto.createHash('sha256').update(OPENID).digest('hex').slice(0, 4).toUpperCase()}`;
    const created = await users.add({
      data: { openId: OPENID, nickname, createdAt: now, lastLoginAt: now },
    });
    user = { _id: created._id, nickname };
  }

  const expiresAt = now + TOKEN_TTL_MS;
  const token = signOnlineToken(
    { sub: user._id, nickname: user.nickname, exp: expiresAt, aud: 'yayi-online' },
    secret
  );
  return { token, expiresAt, player: { playerId: user._id, nickname: user.nickname } };
};
