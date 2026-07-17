const db = require('../db');
const oss = require('../oss');
const wechat = require('../wechat');

function formatStore(doc) {
  const latitude = parseFloat(doc.latitude);
  const longitude = parseFloat(doc.longitude);
  return {
    store_id: doc.store_id,
    displayNo: resolveStoreDisplayNo(doc),
    name: doc.name || '',
    logo: doc.logo || '',
    address: doc.address || '',
    locationName: doc.locationName || '',
    addressRegion: doc.addressRegion || '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    hours: doc.hours || '',
    businessHours: doc.businessHours || null,
    intro: doc.intro || '',
    range: formatReceptionRangeText(doc.receptionRange || doc.range),
    receptionRange: normalizeReceptionRange(doc.receptionRange || doc.range),
    storePhotos: Array.isArray(doc.storePhotos) ? doc.storePhotos : [],
    notice: doc.notice || '',
    pickupService: doc.pickupService === 'yes' ? 'yes' : 'no',
    pickupNotice: doc.pickupNotice || '',
    pickupPricingMode: doc.pickupPricingMode === 'distance' ? 'distance' : 'flat',
    pickupFlatPrice: doc.pickupFlatPrice != null ? doc.pickupFlatPrice : '',
    pickupPricePerKm: doc.pickupPricePerKm != null ? doc.pickupPricePerKm : '',
    deposit: normalizeDeposit(doc.deposit),
    compensationLimit: doc.compensationLimit != null ? doc.compensationLimit : null,
    boardingContractClauseText: doc.boardingContractClauseText || '',
    status: normalizeStoreStatus(doc.status),
    contactPhone: doc.contactPhone || '',
    legalName: doc.legalName || '',
    billingRules: doc.billingRules || null,
    ownerOpenid: doc.ownerOpenid || '',
    staffOpenids: Array.isArray(doc.staffOpenids) ? doc.staffOpenids : [],
    merchantApplyStatus: doc.merchantApplyStatus || '',
    rejectReason: doc.rejectReason || '',
    coopContractSigned: !!doc.coopContractSigned,
    coopContractSignTime: doc.coopContractSignTime || '',
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

function normalizeStoreStatus(status) {
  if (status === '未营业') return '未营业';
  if (status === '已闭店' || status === '暂停接单') return '已闭店';
  return '营业中';
}

const RECEPTION_RANGE_OPTIONS = ['小型犬', '中型犬', '大型犬', '猫咪', '其他'];

function normalizeReceptionRange(source) {
  let values = [];
  if (Array.isArray(source)) {
    values = source;
  } else if (typeof source === 'string' && source.trim()) {
    values = source.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean);
  }
  const normalized = [];
  values.forEach((item) => {
    const text = item === '其他宠物' ? '其他' : item;
    if (RECEPTION_RANGE_OPTIONS.includes(text) && !normalized.includes(text)) {
      normalized.push(text);
    }
  });
  return RECEPTION_RANGE_OPTIONS.filter((value) => normalized.includes(value));
}

function formatReceptionRangeText(source) {
  const normalized = normalizeReceptionRange(source);
  return normalized.length ? normalized.join('、') : '';
}

function normalizeDeposit(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function normalizePickupMoney(value) {
  if (value === '' || value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  return Math.round(num * 100) / 100;
}

function normalizeCompensationLimit(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parseCoord(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function buildStoreId() {
  return 'store_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

const DISPLAY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildRandomDisplayNo(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += DISPLAY_CODE_CHARS[Math.floor(Math.random() * DISPLAY_CODE_CHARS.length)];
  }
  return out;
}

function deriveDisplayNo(seed, length = 8) {
  const str = String(seed || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  let state = hash >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += DISPLAY_CODE_CHARS[state % DISPLAY_CODE_CHARS.length];
  }
  return out;
}

function resolveStoreDisplayNo(doc) {
  if (!doc) return '';
  if (doc.displayNo) return String(doc.displayNo).trim();
  const seed = doc.store_id || '';
  return seed ? deriveDisplayNo(`store:${seed}`) : '';
}

async function resolveStoreMediaUrls(store) {
  if (!store) return store;
  const photos = Array.isArray(store.storePhotos) ? store.storePhotos.filter(Boolean) : [];
  const logo = store.logo || '';
  return {
    ...store,
    logo: (await oss.resolveMediaUrl(logo)) || logo,
    storePhotos: (await oss.resolveMediaUrls(photos)).filter(Boolean)
  };
}

async function getStore(event) {
  const storeId = event.store_id;
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!data.length) {
    return { success: false, errMsg: '店铺不存在' };
  }
  const store = await resolveStoreMediaUrls(formatStore(data[0]));
  return { success: true, store };
}

async function clearStaleMerchantLink(openid) {
  if (!openid) return false;
  const userRows = await db.findMany('users', { openid }, { limit: 1 });
  if (!userRows.length) return false;

  const user = userRows[0];
  const linkedStoreId = (user.store_id || '').trim();
  if (linkedStoreId) {
    const linkedStores = await db.findMany('stores', { store_id: linkedStoreId }, { limit: 1 });
    if (linkedStores.length > 0) return false;
  }

  const ownedStores = await db.findMany('stores', { ownerOpenid: openid }, { limit: 1 });
  if (ownedStores.length > 0) return false;

  const hasStaleLink = user.store_id || user.merchantStatus || user.isMerchant;
  if (!hasStaleLink) return false;

  const now = Date.now();
  await db.updateById('users', user._id, {
    store_id: '',
    isMerchant: false,
    merchantStatus: '',
    merchantRole: '',
    updateTime: now
  });
  return true;
}

async function getOwnedStoreByOpenid(openid) {
  if (!openid) return null;
  const data = await db.findMany('stores', { ownerOpenid: openid }, { limit: 1 });
  return data.length ? data[0] : null;
}

async function resolveMerchantStoreDoc(openid) {
  if (!openid) return null;

  const userRows = await db.findMany('users', { openid }, { limit: 1 });
  const linkedStoreId = userRows.length ? (userRows[0].store_id || '').trim() : '';

  const ownedStores = await db.findMany('stores', { ownerOpenid: openid }, { limit: 1 });
  if (ownedStores.length) return ownedStores[0];

  if (linkedStoreId) {
    const linkedStores = await db.findMany('stores', { store_id: linkedStoreId }, { limit: 1 });
    if (linkedStores.length) return linkedStores[0];
  }

  const staffStores = await db.findMany('stores', { staffOpenids: openid }, { limit: 1 });
  if (staffStores.length) return staffStores[0];

  return null;
}

function hasShopField(shop, key) {
  return shop && Object.prototype.hasOwnProperty.call(shop, key);
}

function isHttpUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

function sanitizeStorePhotoList(nextPhotos, existingPhotos) {
  const existing = Array.isArray(existingPhotos) ? existingPhotos : [];
  if (!Array.isArray(nextPhotos)) {
    return existing.filter(oss.isStoredMedia);
  }
  return nextPhotos
    .map((url, index) => {
      if (oss.isStoredMedia(url) && !url.startsWith('cloud://')) return url;
      if (url && url.startsWith('cloud://')) return url;
      if (isHttpUrl(url) && oss.isStoredMedia(existing[index])) return existing[index];
      if (oss.isStoredMedia(url)) return url;
      return '';
    })
    .filter(Boolean);
}

function sanitizeStoreLogo(nextLogo, existingLogo) {
  if (oss.isStoredMedia(nextLogo) && !String(nextLogo).startsWith('cloud://')) return nextLogo || '';
  if (String(nextLogo || '').startsWith('cloud://')) return nextLogo;
  if (isHttpUrl(nextLogo) && oss.isStoredMedia(existingLogo)) return existingLogo;
  if (nextLogo && !isHttpUrl(nextLogo)) return nextLogo;
  return existingLogo || nextLogo || '';
}

function buildStorePatch(shop, existing, now) {
  const existingDoc = existing || {};
  const latitude = parseCoord(hasShopField(shop, 'latitude') ? shop.latitude : existingDoc.latitude);
  const longitude = parseCoord(hasShopField(shop, 'longitude') ? shop.longitude : existingDoc.longitude);
  const receptionSource = hasShopField(shop, 'receptionRange')
    ? shop.receptionRange
    : (hasShopField(shop, 'range') ? shop.range : (existingDoc.receptionRange || existingDoc.range));

  return {
    name: hasShopField(shop, 'name') ? (shop.name || '') : (existingDoc.name || ''),
    logo: hasShopField(shop, 'logo')
      ? sanitizeStoreLogo(shop.logo || '', existingDoc.logo || '')
      : (existingDoc.logo || ''),
    address: hasShopField(shop, 'address') ? (shop.address || '') : (existingDoc.address || ''),
    locationName: hasShopField(shop, 'locationName') ? (shop.locationName || '') : (existingDoc.locationName || ''),
    addressRegion: hasShopField(shop, 'addressRegion') ? (shop.addressRegion || '') : (existingDoc.addressRegion || ''),
    latitude,
    longitude,
    hours: hasShopField(shop, 'hours') ? (shop.hours || '') : (existingDoc.hours || ''),
    businessHours: hasShopField(shop, 'businessHours')
      ? shop.businessHours
      : (existingDoc.businessHours || null),
    intro: hasShopField(shop, 'intro') ? String(shop.intro || '') : (existingDoc.intro || ''),
    range: formatReceptionRangeText(receptionSource),
    receptionRange: normalizeReceptionRange(receptionSource),
    storePhotos: hasShopField(shop, 'storePhotos') && Array.isArray(shop.storePhotos)
      ? sanitizeStorePhotoList(shop.storePhotos, existingDoc.storePhotos)
      : sanitizeStorePhotoList(existingDoc.storePhotos, existingDoc.storePhotos),
    notice: hasShopField(shop, 'notice') ? String(shop.notice || '') : (existingDoc.notice || ''),
    pickupService: hasShopField(shop, 'pickupService')
      ? (shop.pickupService === 'yes' ? 'yes' : 'no')
      : (existingDoc.pickupService === 'yes' ? 'yes' : 'no'),
    pickupNotice: hasShopField(shop, 'pickupNotice')
      ? String(shop.pickupNotice || '')
      : (existingDoc.pickupNotice || ''),
    pickupPricingMode: hasShopField(shop, 'pickupPricingMode')
      ? (shop.pickupPricingMode === 'distance' ? 'distance' : 'flat')
      : (existingDoc.pickupPricingMode === 'distance' ? 'distance' : 'flat'),
    pickupFlatPrice: hasShopField(shop, 'pickupFlatPrice')
      ? normalizePickupMoney(shop.pickupFlatPrice)
      : normalizePickupMoney(existingDoc.pickupFlatPrice),
    pickupPricePerKm: hasShopField(shop, 'pickupPricePerKm')
      ? normalizePickupMoney(shop.pickupPricePerKm)
      : normalizePickupMoney(existingDoc.pickupPricePerKm),
    deposit: hasShopField(shop, 'deposit')
      ? normalizeDeposit(shop.deposit)
      : normalizeDeposit(existingDoc.deposit),
    compensationLimit: hasShopField(shop, 'compensationLimit')
      ? normalizeCompensationLimit(shop.compensationLimit)
      : normalizeCompensationLimit(existingDoc.compensationLimit),
    boardingContractClauseText: hasShopField(shop, 'boardingContractClauseText')
      ? String(shop.boardingContractClauseText || '')
      : (existingDoc.boardingContractClauseText || ''),
    status: normalizeStoreStatus(hasShopField(shop, 'status') ? shop.status : existingDoc.status),
    contactPhone: hasShopField(shop, 'contactPhone')
      ? String(shop.contactPhone || '').trim()
      : (existingDoc.contactPhone || ''),
    legalName: hasShopField(shop, 'legalName')
      ? String(shop.legalName || '').trim()
      : (existingDoc.legalName || ''),
    billingRules: hasShopField(shop, 'billingRules')
      ? shop.billingRules
      : (existingDoc.billingRules || null),
    updateTime: now
  };
}

function resolveAccessRole(storeDoc, openid, userDoc) {
  if (!storeDoc) return '';
  if (storeDoc.ownerOpenid && storeDoc.ownerOpenid === openid) return 'owner';
  const role = (userDoc && userDoc.merchantRole) || '';
  if (role === 'staff') return 'staff';
  if (!storeDoc.ownerOpenid || storeDoc.ownerOpenid === openid) return 'owner';
  const staffOpenids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids : [];
  return staffOpenids.includes(openid) ? 'staff' : 'owner';
}

async function canManageStoreDoc(storeDoc, openid) {
  if (!storeDoc || !openid) return false;
  if (storeDoc.ownerOpenid === openid) return true;
  const staffOpenids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids : [];
  return staffOpenids.includes(openid);
}

async function syncUserStoreLink(openid, storeId, options = {}) {
  if (!openid || !storeId) return;
  const pending = options.pending === true;
  const rejected = options.rejected === true;
  const data = await db.findMany('users', { openid }, { limit: 1 });
  const now = Date.now();
  let linkData;
  if (rejected) {
    linkData = {
      store_id: storeId,
      isMerchant: false,
      merchantStatus: 'rejected',
      merchantRole: '',
      updateTime: now
    };
  } else if (pending) {
    linkData = {
      store_id: storeId,
      isMerchant: false,
      merchantStatus: 'pending',
      merchantRole: '',
      updateTime: now
    };
  } else {
    linkData = {
      store_id: storeId,
      isMerchant: true,
      merchantStatus: 'approved',
      merchantRole: 'owner',
      updateTime: now
    };
  }
  if (data.length) {
    await db.updateById('users', data[0]._id, linkData);
    return;
  }
  await db.insertOne('users', {
    openid,
    store_id: storeId,
    isMerchant: rejected || pending ? false : true,
    merchantStatus: rejected ? 'rejected' : (pending ? 'pending' : 'approved'),
    merchantRole: rejected || pending ? '' : 'owner',
    nickName: '',
    avatarUrl: '',
    phone: '',
    realName: '',
    idCard: '',
    address: '',
    pet_ids: [],
    createTime: now,
    updateTime: now
  });
}

async function getMyStore(openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const userRows = await db.findMany('users', { openid }, { limit: 1 });
  const userDoc = userRows.length ? userRows[0] : null;
  const storeDoc = await resolveMerchantStoreDoc(openid);

  if (storeDoc) {
    return {
      success: true,
      store: formatStore(storeDoc),
      accessRole: resolveAccessRole(storeDoc, openid, userDoc)
    };
  }

  const reconciled = await clearStaleMerchantLink(openid);
  return { success: true, store: null, reconciled };
}

async function saveStore(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const shop = event.shop || {};
  const now = Date.now();
  const existing = await resolveMerchantStoreDoc(openid);

  if (!existing) {
    const storeId = buildStoreId();
    const newStore = {
      store_id: storeId,
      displayNo: buildRandomDisplayNo(8),
      ...buildStorePatch(shop, {}, now),
      ownerOpenid: openid,
      staffOpenids: [],
      createTime: now
    };
    await db.insertOne('stores', newStore);
    await syncUserStoreLink(openid, storeId);
    return { success: true, store: formatStore(newStore) };
  }

  if (!(await canManageStoreDoc(existing, openid))) {
    return { success: false, errMsg: '无权修改店铺信息' };
  }

  const storeData = buildStorePatch(shop, existing, now);
  if (!existing.ownerOpenid || existing.ownerOpenid === openid) {
    storeData.ownerOpenid = openid;
  }
  await db.updateById('stores', existing._id, storeData);
  if (!existing.ownerOpenid || existing.ownerOpenid === openid) {
    await syncUserStoreLink(openid, existing.store_id);
  }
  return {
    success: true,
    store: formatStore({ ...existing, ...storeData, store_id: existing.store_id })
  };
}

async function submitMerchantApply(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const shop = event.shop || {};
  const name = (shop.name || '').trim();
  const address = (shop.address || '').trim();
  const contactPhone = (shop.contactPhone || '').trim();
  const legalName = (shop.legalName || '').trim();
  const latitude = parseCoord(shop.latitude);
  const longitude = parseCoord(shop.longitude);
  const storePhotos = (Array.isArray(shop.storePhotos) ? shop.storePhotos : [])
    .filter((url) => oss.isStoredMedia(url));

  if (!name) return { success: false, errMsg: '请填写店铺名称' };
  if (!address) return { success: false, errMsg: '请选择营业地址' };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { success: false, errMsg: '请通过地图选择营业地址' };
  }
  if (!contactPhone) return { success: false, errMsg: '请填写联系电话' };
  if (!legalName) return { success: false, errMsg: '请填写负责人姓名' };
  if (!storePhotos.length) return { success: false, errMsg: '请至少上传1张店铺照片' };
  if (!shop.coopContractSigned || !shop.coopContractSnapshot) {
    return { success: false, errMsg: '请先签署入驻合作协议' };
  }

  const now = Date.now();
  const data = await db.findMany('stores', { ownerOpenid: openid }, { limit: 1 });
  const applyPatch = {
    name,
    address,
    locationName: shop.locationName || '',
    addressRegion: shop.addressRegion || '',
    latitude,
    longitude,
    contactPhone,
    legalName,
    storePhotos,
    coopContractSigned: true,
    coopContractSignTime: shop.coopContractSignTime || '',
    coopContractSnapshot: shop.coopContractSnapshot || null,
    merchantApplyStatus: 'pending',
    rejectReason: '',
    updateTime: now
  };

  if (!data.length) {
    const storeId = buildStoreId();
    const newStore = {
      store_id: storeId,
      logo: '',
      hours: '',
      businessHours: null,
      intro: '',
      range: '',
      receptionRange: [],
      notice: '',
      pickupService: 'no',
      pickupNotice: '',
      pickupPricingMode: 'flat',
      pickupFlatPrice: '',
      pickupPricePerKm: '',
      deposit: 0,
      status: '未营业',
      billingRules: null,
      ownerOpenid: openid,
      staffOpenids: [],
      createTime: now,
      ...applyPatch
    };
    await db.insertOne('stores', newStore);
    await syncUserStoreLink(openid, storeId, { pending: true });
    return { success: true, store: formatStore(newStore) };
  }

  const existing = data[0];
  await db.updateById('stores', existing._id, applyPatch);
  await syncUserStoreLink(openid, existing.store_id, { pending: true });
  return {
    success: true,
    store: formatStore({ ...existing, ...applyPatch, store_id: existing.store_id })
  };
}

function formatApplyTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch (err) {
    return '';
  }
}

async function listPendingMerchantApplications() {
  const pendingUsers = await db.findMany('users', { merchantStatus: 'pending' }, { limit: 100 });
  const storeIds = [...new Set((pendingUsers || []).map((item) => item.store_id).filter(Boolean))];
  const storeMap = {};
  for (let i = 0; i < storeIds.length; i += 20) {
    const chunk = storeIds.slice(i, i + 20);
    const storeDocs = await db.findMany('stores', { store_id: { $in: chunk } });
    (storeDocs || []).forEach((doc) => {
      storeMap[doc.store_id] = doc;
    });
  }

  const applications = (pendingUsers || [])
    .map((user) => {
      const storeDoc = storeMap[user.store_id];
      if (!storeDoc) return null;
      return {
        store_id: storeDoc.store_id,
        name: storeDoc.name || '',
        legalName: storeDoc.legalName || '',
        contactPhone: storeDoc.contactPhone || '',
        address: storeDoc.address || '',
        applicantName: user.realName || user.nickName || '',
        applicantPhone: user.phone || '',
        applyTime: storeDoc.updateTime || storeDoc.createTime || 0,
        applyTimeText: formatApplyTime(storeDoc.updateTime || storeDoc.createTime)
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.applyTime || 0) - (a.applyTime || 0));

  return { success: true, applications };
}

async function reviewMerchantApplication(event) {
  const storeId = event.store_id;
  const decision = event.decision;
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };
  if (decision !== 'approve' && decision !== 'reject') {
    return { success: false, errMsg: '无效审核操作' };
  }

  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!data.length) return { success: false, errMsg: '店铺不存在' };

  const storeDoc = data[0];
  const ownerOpenid = storeDoc.ownerOpenid;
  if (!ownerOpenid) return { success: false, errMsg: '缺少商家账号信息' };

  const now = Date.now();
  if (decision === 'approve') {
    await db.updateById('stores', storeDoc._id, {
      merchantApplyStatus: 'approved',
      rejectReason: '',
      updateTime: now
    });
    await syncUserStoreLink(ownerOpenid, storeId, { pending: false });
    return { success: true };
  }

  const rejectReason = (event.rejectReason || '').trim() || '审核未通过，请修改资料后重新申请';
  await db.updateById('stores', storeDoc._id, {
    merchantApplyStatus: 'rejected',
    rejectReason,
    updateTime: now
  });
  await syncUserStoreLink(ownerOpenid, storeId, { rejected: true });
  return { success: true };
}

async function listStoreStaff(openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeDoc = await getOwnedStoreByOpenid(openid);
  if (!storeDoc) return { success: false, errMsg: '仅店铺负责人可查看员工' };

  const openids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids.filter(Boolean) : [];
  if (!openids.length) return { success: true, staff: [] };

  const staff = [];
  for (let i = 0; i < openids.length; i += 20) {
    const chunk = openids.slice(i, i + 20);
    const data = await db.findMany('users', { openid: { $in: chunk } });
    (data || []).forEach((doc) => {
      staff.push({
        openid: doc.openid,
        nickName: doc.nickName || '微信用户',
        phone: doc.phone || '',
        realName: doc.realName || ''
      });
    });
  }

  const orderMap = {};
  openids.forEach((id, index) => {
    orderMap[id] = index;
  });
  staff.sort((a, b) => (orderMap[a.openid] || 0) - (orderMap[b.openid] || 0));

  return { success: true, staff };
}

async function removeStoreStaff(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const staffOpenid = (event.staff_openid || '').trim();
  if (!staffOpenid) return { success: false, errMsg: '缺少员工信息' };

  const storeDoc = await getOwnedStoreByOpenid(openid);
  if (!storeDoc) return { success: false, errMsg: '仅店铺负责人可移除员工' };

  const staffOpenids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids : [];
  if (!staffOpenids.includes(staffOpenid)) {
    return { success: false, errMsg: '该员工不在授权列表中' };
  }

  const now = Date.now();
  await db.updateOne('stores', { _id: storeDoc._id }, {
    updateTime: now
  }, {
    $pull: { staffOpenids: staffOpenid }
  });

  const staffUsers = await db.findMany('users', { openid: staffOpenid }, { limit: 1 });
  if (staffUsers.length) {
    await db.updateById('users', staffUsers[0]._id, {
      store_id: '',
      isMerchant: false,
      merchantStatus: '',
      merchantRole: '',
      updateTime: now
    });
  }

  return { success: true };
}

async function acceptStaffInvite(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = (event.store_id || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const storeRows = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!storeRows.length) return { success: false, errMsg: '店铺不存在' };

  const storeDoc = storeRows[0];
  if (storeDoc.ownerOpenid === openid) {
    return { success: true, alreadyOwner: true, store: formatStore(storeDoc), accessRole: 'owner' };
  }

  const ownedStore = await getOwnedStoreByOpenid(openid);
  if (ownedStore && ownedStore.store_id !== storeId) {
    return { success: false, errMsg: '您已是其他店铺负责人，无法接受员工邀请' };
  }

  const userRows = await db.findMany('users', { openid }, { limit: 1 });
  const currentUser = userRows[0];
  if (
    currentUser
    && currentUser.merchantRole === 'staff'
    && currentUser.store_id
    && currentUser.store_id !== storeId
  ) {
    return { success: false, errMsg: '您已是其他店铺员工，请先联系原店铺负责人移除权限' };
  }

  const staffOpenids = Array.isArray(storeDoc.staffOpenids) ? [...storeDoc.staffOpenids] : [];
  if (!staffOpenids.includes(openid)) {
    staffOpenids.push(openid);
  }

  const now = Date.now();
  await db.updateById('stores', storeDoc._id, {
    staffOpenids,
    updateTime: now
  });

  if (userRows.length) {
    await db.updateById('users', userRows[0]._id, {
      store_id: storeId,
      isMerchant: true,
      merchantStatus: 'approved',
      merchantRole: 'staff',
      updateTime: now
    });
  } else {
    await db.insertOne('users', {
      openid,
      store_id: storeId,
      isMerchant: true,
      merchantStatus: 'approved',
      merchantRole: 'staff',
      nickName: '',
      avatarUrl: '',
      phone: '',
      realName: '',
      idCard: '',
      address: '',
      pet_ids: [],
      createTime: now,
      updateTime: now
    });
  }

  const store = await resolveStoreMediaUrls(formatStore({ ...storeDoc, staffOpenids }));
  return { success: true, store, accessRole: 'staff' };
}

async function getStoreQrCode(event, openid) {
  const storeId = event.store_id;
  const envVersion = event.env_version;
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!data.length) {
    return { success: false, errMsg: '店铺不存在' };
  }
  if (data[0].ownerOpenid !== openid) {
    return { success: false, errMsg: '无权生成该店铺二维码' };
  }

  const scene = String(storeId).slice(0, 32);
  const version = envVersion === 'release' || envVersion === 'develop' || envVersion === 'trial'
    ? envVersion
    : 'trial';

  try {
    const buffer = await wechat.getUnlimitedQrCode({
      scene,
      page: 'pages/index/index',
      envVersion: version,
      width: 430
    });
    const objectKey = `store-qrcodes/${storeId}.png`;
    const publicUrl = await oss.uploadBuffer(objectKey, buffer, 'image/png');
    return {
      success: true,
      fileID: publicUrl,
      tempFileURL: publicUrl
    };
  } catch (err) {
    console.error('getStoreQrCode failed', err);
    return {
      success: false,
      errMsg: (err && err.message) || '生成二维码失败'
    };
  }
}

async function handle(event, openid) {
  switch (event.action) {
    case 'getStore':
      return getStore(event);
    case 'getMyStore':
      return getMyStore(openid);
    case 'saveStore':
      return saveStore(event, openid);
    case 'submitMerchantApply':
      return submitMerchantApply(event, openid);
    case 'listPendingMerchantApplications':
      return listPendingMerchantApplications();
    case 'reviewMerchantApplication':
      return reviewMerchantApplication(event);
    case 'listStoreStaff':
      return listStoreStaff(openid);
    case 'removeStoreStaff':
      return removeStoreStaff(event, openid);
    case 'acceptStaffInvite':
      return acceptStaffInvite(event, openid);
    case 'getStoreQrCode':
      return getStoreQrCode(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = { handle, formatStore, resolveMerchantStoreDoc };
