const db = require('../db');
const wechat = require('../wechat');

const COLLECTIONS = ['users', 'stores', 'pets', 'orders', 'daily_logs'];

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeMerchantStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'approved' || status === 'pending' || status === 'rejected') return status;
  return '';
}

function isMerchantApprovedFromDoc(doc) {
  const status = normalizeMerchantStatus(doc.merchantStatus);
  if (status === 'approved') return true;
  if (status === 'pending') return false;
  return normalizeIsMerchant(doc.isMerchant);
}

function formatUser(doc) {
  const merchantStatus = normalizeMerchantStatus(doc.merchantStatus);
  const isMerchant = isMerchantApprovedFromDoc(doc);
  const petIds = Array.isArray(doc.pet_ids)
    ? [...new Set(doc.pet_ids.filter((id) => typeof id === 'string' && id.trim()))]
    : [];
  return {
    _id: String(doc._id),
    openid: doc.openid,
    nickName: doc.nickName || '',
    avatarUrl: doc.avatarUrl || '',
    phone: doc.phone || '',
    realName: doc.realName || '',
    idCard: doc.idCard || '',
    address: doc.address || '',
    store_id: doc.store_id || '',
    pet_ids: petIds,
    merchantStatus: merchantStatus || (isMerchant ? 'approved' : ''),
    merchantRole: (doc.merchantRole || '').toLowerCase() === 'staff' ? 'staff' : (
      isMerchant ? 'owner' : ''
    ),
    isMerchant,
    role: isMerchant ? 'merchant' : 'user',
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

function pickCanonicalUser(records) {
  if (!records.length) return null;
  const merchantDoc = records.find((item) => normalizeIsMerchant(item.isMerchant));
  if (merchantDoc) return merchantDoc;
  return records.sort((a, b) => {
    const timeDiff = (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0);
    if (timeDiff !== 0) return timeDiff;
    return (a.createTime || 0) - (b.createTime || 0);
  })[0];
}

function mergePetIds(records) {
  const ids = [];
  records.forEach((item) => {
    const list = Array.isArray(item.pet_ids) ? item.pet_ids : [];
    list.forEach((petId) => {
      if (typeof petId === 'string' && petId.trim() && !ids.includes(petId)) {
        ids.push(petId);
      }
    });
  });
  return ids;
}

function mergeUserFields(records) {
  const canonical = pickCanonicalUser(records);
  const merged = { ...canonical };
  merged.isMerchant = records.some((item) => isMerchantApprovedFromDoc(item));
  const staffRecord = records.find((item) => (item.merchantRole || '').toLowerCase() === 'staff');
  if (staffRecord) {
    merged.merchantRole = 'staff';
    merged.store_id = staffRecord.store_id || merged.store_id || '';
  }
  merged.merchantStatus = records.reduce((best, item) => {
    const status = normalizeMerchantStatus(item.merchantStatus);
    if (status === 'approved') return 'approved';
    if (status === 'pending' && best !== 'approved') return 'pending';
    if (status === 'rejected' && best !== 'approved' && best !== 'pending') return 'rejected';
    return best;
  }, '');

  const textFields = ['nickName', 'avatarUrl', 'phone', 'realName', 'idCard', 'address', 'store_id'];
  textFields.forEach((field) => {
    if (!merged[field]) {
      const found = records.find((item) => item[field]);
      if (found) merged[field] = found[field];
    }
  });

  merged.createTime = Math.min(...records.map((item) => item.createTime || Date.now()));
  merged.updateTime = Math.max(...records.map((item) => item.updateTime || item.createTime || 0));
  merged.pet_ids = mergePetIds(records);
  return merged;
}

async function fetchUsersByOpenid(openid) {
  return db.findMany('users', { openid });
}

async function dedupeUsersByOpenid(openid) {
  const records = await fetchUsersByOpenid(openid);
  if (records.length <= 1) {
    return records[0] || null;
  }

  const merged = mergeUserFields(records);
  const duplicateIds = records
    .map((item) => item._id)
    .filter((id) => String(id) !== String(merged._id));

  await db.updateById('users', merged._id, {
    nickName: merged.nickName || '',
    avatarUrl: merged.avatarUrl || '',
    phone: merged.phone || '',
    realName: merged.realName || '',
    idCard: merged.idCard || '',
    address: merged.address || '',
    store_id: merged.store_id || '',
    pet_ids: mergePetIds(records),
    isMerchant: !!merged.isMerchant,
    merchantStatus: merged.merchantStatus || '',
    merchantRole: merged.merchantRole || '',
    createTime: merged.createTime,
    updateTime: merged.updateTime
  });

  if (duplicateIds.length > 0) {
    await db.deleteMany('users', { _id: { $in: duplicateIds } });
  }

  return db.findOne('users', { _id: merged._id });
}

async function getOrCreateUser(openid) {
  let user = await dedupeUsersByOpenid(openid);
  if (user) return user;

  const now = Date.now();
  const newUser = {
    openid,
    nickName: '',
    avatarUrl: '',
    phone: '',
    realName: '',
    idCard: '',
    address: '',
    store_id: '',
    pet_ids: [],
    isMerchant: false,
    merchantStatus: '',
    createTime: now,
    updateTime: now
  };

  await db.insertOne('users', newUser);
  user = await dedupeUsersByOpenid(openid);
  return user || newUser;
}

async function initDatabase() {
  const results = await db.ensureCollections(COLLECTIONS);
  return { success: true, collections: results };
}

async function getUserInfo(openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const records = await fetchUsersByOpenid(openid);
  const beforeCount = records.length;
  let doc;
  if (beforeCount > 1) {
    doc = await dedupeUsersByOpenid(openid);
  } else if (beforeCount === 1) {
    doc = records[0];
  } else {
    doc = await getOrCreateUser(openid);
  }

  return {
    success: true,
    requestOpenid: openid,
    matchedCount: 1,
    deduped: beforeCount > 1,
    dbIsMerchant: doc.isMerchant,
    user: formatUser(doc)
  };
}

async function syncProfile(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const profile = event.profile || {};
  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const profileData = {
    nickName: profile.nickName || doc.nickName || '',
    avatarUrl: profile.avatarUrl || doc.avatarUrl || '',
    phone: profile.phone || doc.phone || '',
    realName: profile.realName || doc.realName || '',
    idCard: profile.idCard || doc.idCard || '',
    address: profile.address || doc.address || '',
    store_id: doc.store_id || '',
    updateTime: now
  };

  const updated = await db.updateById('users', doc._id, profileData);
  await dedupeUsersByOpenid(openid);
  return { success: true, user: formatUser(updated) };
}

async function dedupeMyUser(openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const beforeCount = (await fetchUsersByOpenid(openid)).length;
  const doc = await dedupeUsersByOpenid(openid);
  const afterCount = (await fetchUsersByOpenid(openid)).length;

  return {
    success: true,
    beforeCount,
    afterCount,
    removed: Math.max(beforeCount - afterCount, 0),
    user: doc ? formatUser(doc) : null
  };
}

async function bindUserStore(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const storeId = (event.store_id || '').trim();
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  const storeDocs = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!storeDocs.length) {
    return { success: false, errMsg: '店铺不存在' };
  }

  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const isStaffUser = (doc.merchantRole || '').toLowerCase() === 'staff'
    && (doc.store_id || '').trim() === storeId;
  const updateData = {
    store_id: storeId,
    updateTime: now
  };
  if (!isStaffUser && !isMerchantApprovedFromDoc(doc)) {
    updateData.isMerchant = false;
  }

  const updated = await db.updateById('users', doc._id, updateData);
  return { success: true, user: formatUser(updated), store: storeDocs[0] };
}

async function setMerchantProfile(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const storeId = (event.store_id || '').trim();
  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const updateData = {
    updateTime: now
  };
  if (storeId) {
    updateData.store_id = storeId;
  }
  if (isMerchantApprovedFromDoc(doc)) {
    updateData.isMerchant = true;
    updateData.merchantStatus = 'approved';
  }

  const updated = await db.updateById('users', doc._id, updateData);
  return { success: true, user: formatUser(updated) };
}

async function bindPhone(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const code = (event.code || '').trim();
  if (!code) {
    return { success: false, errMsg: '缺少手机号授权 code' };
  }

  let phone = '';
  try {
    phone = await wechat.getPhoneNumber(code);
  } catch (err) {
    console.error('getPhoneNumber failed', err);
    return {
      success: false,
      errMsg: (err && err.message) || '获取手机号失败'
    };
  }

  if (!phone) {
    return { success: false, errMsg: '未能解析手机号' };
  }

  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const updated = await db.updateById('users', doc._id, {
    phone,
    updateTime: now
  });
  await dedupeUsersByOpenid(openid);

  return { success: true, phone, user: formatUser(updated) };
}

async function ping(openid) {
  return {
    success: true,
    openid: openid || '',
    env: 'aliyun',
    time: Date.now()
  };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'ping':
      return ping(openid);
    case 'initDatabase':
      return initDatabase();
    case 'getUserInfo':
      return getUserInfo(openid);
    case 'syncProfile':
      return syncProfile(event, openid);
    case 'bindPhone':
      return bindPhone(event, openid);
    case 'dedupeMyUser':
      return dedupeMyUser(openid);
    case 'bindUserStore':
      return bindUserStore(event, openid);
    case 'setMerchantProfile':
      return setMerchantProfile(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = {
  handle,
  getOrCreateUser,
  formatUser,
  normalizeIsMerchant,
  isMerchantApprovedFromDoc
};
