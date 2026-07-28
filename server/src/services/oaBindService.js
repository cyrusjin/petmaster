const db = require('../db');
const wechat = require('../wechat');
const identity = require('./identity');

const PENDING_COLLECTION = 'oa_pending_binds';

async function ensurePendingCollection() {
  await db.ensureCollections([PENDING_COLLECTION]);
}

async function savePendingBind({ oaOpenid, unionid }) {
  if (!oaOpenid) return null;
  await ensurePendingCollection();
  const existing = await db.findMany(PENDING_COLLECTION, { oaOpenid }, { limit: 1 });
  const now = Date.now();
  const patch = {
    oaOpenid,
    unionid: unionid || '',
    updateTime: now
  };
  if (existing.length) {
    return db.updateById(PENDING_COLLECTION, existing[0]._id, patch);
  }
  return db.insertOne(PENDING_COLLECTION, {
    ...patch,
    createTime: now
  });
}

async function removePendingByOaOpenid(oaOpenid) {
  if (!oaOpenid) return;
  await ensurePendingCollection();
  await db.deleteMany(PENDING_COLLECTION, { oaOpenid });
}

async function findPendingByUnionid(unionid) {
  if (!unionid) return null;
  await ensurePendingCollection();
  const rows = await db.findMany(PENDING_COLLECTION, { unionid }, { limit: 1 });
  return rows[0] || null;
}

async function bindOaOpenidToUser(user, oaOpenid, unionid) {
  if (!user || !oaOpenid) return user;
  const openids = {
    ...(user.openids || {}),
    oa: oaOpenid
  };
  if (!openids.user && user.openid) {
    openids.user = user.openid;
  }
  const patch = {
    openids,
    updateTime: Date.now()
  };
  if (unionid && !user.unionid) {
    patch.unionid = unionid;
  }
  const updated = await db.updateById('users', user._id, patch);
  await removePendingByOaOpenid(oaOpenid);
  return updated;
}

async function clearOaOpenid(oaOpenid) {
  if (!oaOpenid) return;
  const users = await identity.findUsersByOpenidAny(oaOpenid);
  for (const user of users) {
    const openids = { ...(user.openids || {}) };
    if (openids.oa !== oaOpenid) continue;
    delete openids.oa;
    await db.updateById('users', user._id, {
      openids,
      updateTime: Date.now()
    });
  }
  await removePendingByOaOpenid(oaOpenid);
}

/**
 * 关注服务号：用 unionid 绑定到已有用户；否则写入待绑定表
 */
async function handleOaSubscribe(oaOpenid) {
  if (!oaOpenid) return { bound: false };
  let unionid = '';
  try {
    const info = await wechat.getOaUserInfo(oaOpenid);
    unionid = info.unionid || '';
  } catch (err) {
    console.warn('[oa] getOaUserInfo failed', err.message || err);
  }

  if (unionid) {
    const users = await identity.findUsersByUnionid(unionid);
    const user = identity.pickPrimaryUser(users);
    if (user) {
      await bindOaOpenidToUser(user, oaOpenid, unionid);
      return { bound: true, unionid, userId: String(user._id) };
    }
  }

  await savePendingBind({ oaOpenid, unionid });
  return { bound: false, unionid, pending: true };
}

async function handleOaUnsubscribe(oaOpenid) {
  await clearOaOpenid(oaOpenid);
  return { unbound: true };
}

/**
 * 小程序登录后：若有同 unionid 的待绑 OA openid，写入 users.openids.oa
 */
async function attachPendingOaByUnionid(user, unionid) {
  if (!user) return user;
  const openids = user.openids || {};
  if (openids.oa) return user;

  const uid = unionid || user.unionid || '';
  if (!uid) return user;

  const pending = await findPendingByUnionid(uid);
  if (!pending || !pending.oaOpenid) return user;

  return bindOaOpenidToUser(user, pending.oaOpenid, uid);
}

function getOaOpenidFromUser(user) {
  if (!user) return '';
  const openids = user.openids || {};
  return openids.oa || '';
}

module.exports = {
  handleOaSubscribe,
  handleOaUnsubscribe,
  attachPendingOaByUnionid,
  getOaOpenidFromUser,
  bindOaOpenidToUser
};
