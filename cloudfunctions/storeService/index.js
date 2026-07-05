const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const stores = db.collection('stores');

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

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://');
}

async function resolveStoreMediaUrls(store) {
  if (!store) return store;

  const photos = Array.isArray(store.storePhotos) ? store.storePhotos.filter(Boolean) : [];
  const logo = store.logo || '';
  const cloudIds = [...new Set([...photos, logo].filter(isCloudFileId))];

  if (!cloudIds.length) return store;

  try {
    const { fileList } = await cloud.getTempFileURL({ fileList: cloudIds });
    const map = {};
    (fileList || []).forEach((item) => {
      if (item.fileID && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL;
      }
    });

    const mapUrl = (url) => {
      if (!url) return '';
      return isCloudFileId(url) ? (map[url] || '') : url;
    };

    return {
      ...store,
      logo: mapUrl(logo) || logo,
      storePhotos: photos.map(mapUrl).filter(Boolean)
    };
  } catch (err) {
    console.error('resolveStoreMediaUrls failed', err);
    return store;
  }
}

async function getStore(event) {
  const { store_id: storeId } = event;
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  const { data } = await stores.where({ store_id: storeId }).limit(1).get();
  if (data.length === 0) {
    return { success: false, errMsg: '店铺不存在' };
  }
  const store = await resolveStoreMediaUrls(formatStore(data[0]));
  return { success: true, store };
}

async function clearStaleMerchantLink(openid) {
  if (!openid) return false;
  const users = db.collection('users');
  const { data: userRows } = await users.where({ openid }).limit(1).get();
  if (!userRows.length) return false;

  const user = userRows[0];
  const linkedStoreId = (user.store_id || '').trim();
  if (linkedStoreId) {
    const { data: linkedStores } = await stores.where({ store_id: linkedStoreId }).limit(1).get();
    if (linkedStores.length > 0) return false;
  }

  const { data: ownedStores } = await stores.where({ ownerOpenid: openid }).limit(1).get();
  if (ownedStores.length > 0) return false;

  const hasStaleLink = user.store_id || user.merchantStatus || user.isMerchant;
  if (!hasStaleLink) return false;

  const now = Date.now();
  await users.doc(user._id).update({
    data: {
      store_id: '',
      isMerchant: false,
      merchantStatus: '',
      merchantRole: '',
      updateTime: now
    }
  });
  return true;
}

async function getMyStore() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const usersCol = db.collection('users');
  const { data: userRows } = await usersCol.where({ openid: OPENID }).limit(1).get();
  const userDoc = userRows.length ? userRows[0] : null;
  const storeDoc = await resolveMerchantStoreDoc(OPENID);

  if (storeDoc) {
    return {
      success: true,
      store: formatStore(storeDoc),
      accessRole: resolveAccessRole(storeDoc, OPENID, userDoc)
    };
  }

  const reconciled = await clearStaleMerchantLink(OPENID);
  return { success: true, store: null, reconciled };
}

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

async function getOwnedStoreByOpenid(openid) {
  if (!openid) return null;
  const { data } = await stores.where({ ownerOpenid: openid }).limit(1).get();
  return data.length ? data[0] : null;
}

async function resolveMerchantStoreDoc(openid) {
  if (!openid) return null;

  const usersCol = db.collection('users');
  const { data: userRows } = await usersCol.where({ openid }).limit(1).get();
  const linkedStoreId = userRows.length ? (userRows[0].store_id || '').trim() : '';

  const { data: ownedStores } = await stores.where({ ownerOpenid: openid }).limit(1).get();
  if (ownedStores.length) return ownedStores[0];

  if (linkedStoreId) {
    const { data: linkedStores } = await stores.where({ store_id: linkedStoreId }).limit(1).get();
    if (linkedStores.length) return linkedStores[0];
  }

  const { data: staffStores } = await stores.where({ staffOpenids: openid }).limit(1).get();
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
    return existing.filter(isCloudFileId);
  }
  return nextPhotos
    .map((url, index) => {
      if (isCloudFileId(url)) return url;
      if (isHttpUrl(url) && isCloudFileId(existing[index])) return existing[index];
      return '';
    })
    .filter(isCloudFileId);
}

function sanitizeStoreLogo(nextLogo, existingLogo) {
  if (isCloudFileId(nextLogo)) return nextLogo || '';
  if (isHttpUrl(nextLogo) && isCloudFileId(existingLogo)) return existingLogo;
  if (nextLogo && !isHttpUrl(nextLogo)) return nextLogo;
  return existingLogo || nextLogo || '';
}

/** 云数据库对 null 对象字段会做子路径合并，需用 _.set 整体替换 */
function buildStoreUpdatePayload(storeData) {
  const payload = { ...storeData };

  if (Object.prototype.hasOwnProperty.call(payload, 'billingRules') && payload.billingRules != null) {
    payload.billingRules = _.set(payload.billingRules);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'businessHours') && payload.businessHours != null) {
    payload.businessHours = _.set(payload.businessHours);
  }

  return payload;
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

async function saveStore(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const shop = event.shop || {};
  const now = Date.now();
  const existing = await resolveMerchantStoreDoc(OPENID);

  if (!existing) {
    const storeId = buildStoreId();
    const newStore = {
      store_id: storeId,
      displayNo: buildRandomDisplayNo(8),
      ...buildStorePatch(shop, {}, now),
      ownerOpenid: OPENID,
      staffOpenids: [],
      createTime: now
    };
    await stores.add({ data: newStore });
    await syncUserStoreLink(OPENID, storeId);
    return { success: true, store: formatStore(newStore) };
  }

  if (!(await canManageStoreDoc(existing, OPENID))) {
    return { success: false, errMsg: '无权修改店铺信息' };
  }

  const storeData = buildStorePatch(shop, existing, now);
  if (!existing.ownerOpenid || existing.ownerOpenid === OPENID) {
    storeData.ownerOpenid = OPENID;
  }
  await stores.doc(existing._id).update({ data: buildStoreUpdatePayload(storeData) });
  if (!existing.ownerOpenid || existing.ownerOpenid === OPENID) {
    await syncUserStoreLink(OPENID, existing.store_id);
  }
  return {
    success: true,
    store: formatStore({ ...existing, ...storeData, store_id: existing.store_id })
  };
}

async function submitMerchantApply(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
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
    .filter((url) => typeof url === 'string' && url.startsWith('cloud://'));

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
  const { data } = await stores.where({ ownerOpenid: OPENID }).limit(1).get();
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
      ownerOpenid: OPENID,
      staffOpenids: [],
      createTime: now,
      ...applyPatch
    };
    await stores.add({ data: newStore });
    await syncUserStoreLink(OPENID, storeId, { pending: true });
    return { success: true, store: formatStore(newStore) };
  }

  const existing = data[0];
  await stores.doc(existing._id).update({ data: applyPatch });
  await syncUserStoreLink(OPENID, existing.store_id, { pending: true });
  return {
    success: true,
    store: formatStore({ ...existing, ...applyPatch, store_id: existing.store_id })
  };
}

async function syncUserStoreLink(openid, storeId, options = {}) {
  if (!openid || !storeId) return;
  const pending = options.pending === true;
  const rejected = options.rejected === true;
  const users = db.collection('users');
  const { data } = await users.where({ openid }).limit(1).get();
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
    await users.doc(data[0]._id).update({ data: linkData });
    return;
  }
  await users.add({
    data: {
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
    }
  });
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
  const usersCol = db.collection('users');
  const { data: pendingUsers } = await usersCol
    .where({ merchantStatus: 'pending' })
    .limit(100)
    .get();

  const storeIds = [...new Set((pendingUsers || []).map((item) => item.store_id).filter(Boolean))];
  const storeMap = {};
  for (let i = 0; i < storeIds.length; i += 20) {
    const chunk = storeIds.slice(i, i + 20);
    const { data: storeDocs } = await stores.where({ store_id: db.command.in(chunk) }).get();
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

  const { data } = await stores.where({ store_id: storeId }).limit(1).get();
  if (!data.length) return { success: false, errMsg: '店铺不存在' };

  const storeDoc = data[0];
  const ownerOpenid = storeDoc.ownerOpenid;
  if (!ownerOpenid) return { success: false, errMsg: '缺少商家账号信息' };

  const now = Date.now();
  if (decision === 'approve') {
    await stores.doc(storeDoc._id).update({
      data: {
        merchantApplyStatus: 'approved',
        rejectReason: '',
        updateTime: now
      }
    });
    await syncUserStoreLink(ownerOpenid, storeId, { pending: false });
    return { success: true };
  }

  const rejectReason = (event.rejectReason || '').trim() || '审核未通过，请修改资料后重新申请';
  await stores.doc(storeDoc._id).update({
    data: {
      merchantApplyStatus: 'rejected',
      rejectReason,
      updateTime: now
    }
  });
  await syncUserStoreLink(ownerOpenid, storeId, { rejected: true });
  return { success: true };
}

async function listStoreStaff() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const storeDoc = await getOwnedStoreByOpenid(OPENID);
  if (!storeDoc) return { success: false, errMsg: '仅店铺负责人可查看员工' };

  const openids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids.filter(Boolean) : [];
  if (!openids.length) return { success: true, staff: [] };

  const usersCol = db.collection('users');
  const staff = [];
  for (let i = 0; i < openids.length; i += 20) {
    const chunk = openids.slice(i, i + 20);
    const { data } = await usersCol.where({ openid: _.in(chunk) }).get();
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

async function removeStoreStaff(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const staffOpenid = (event.staff_openid || '').trim();
  if (!staffOpenid) return { success: false, errMsg: '缺少员工信息' };

  const storeDoc = await getOwnedStoreByOpenid(OPENID);
  if (!storeDoc) return { success: false, errMsg: '仅店铺负责人可移除员工' };

  const staffOpenids = Array.isArray(storeDoc.staffOpenids) ? storeDoc.staffOpenids : [];
  if (!staffOpenids.includes(staffOpenid)) {
    return { success: false, errMsg: '该员工不在授权列表中' };
  }

  const now = Date.now();
  await stores.doc(storeDoc._id).update({
    data: {
      staffOpenids: _.pull(staffOpenid),
      updateTime: now
    }
  });

  const usersCol = db.collection('users');
  const { data: staffUsers } = await usersCol.where({ openid: staffOpenid }).limit(1).get();
  if (staffUsers.length) {
    await usersCol.doc(staffUsers[0]._id).update({
      data: {
        store_id: '',
        isMerchant: false,
        merchantStatus: '',
        merchantRole: '',
        updateTime: now
      }
    });
  }

  return { success: true };
}

async function acceptStaffInvite(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = (event.store_id || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const { data: storeRows } = await stores.where({ store_id: storeId }).limit(1).get();
  if (!storeRows.length) return { success: false, errMsg: '店铺不存在' };

  const storeDoc = storeRows[0];
  if (storeDoc.ownerOpenid === OPENID) {
    return { success: true, alreadyOwner: true, store: formatStore(storeDoc), accessRole: 'owner' };
  }

  const ownedStore = await getOwnedStoreByOpenid(OPENID);
  if (ownedStore && ownedStore.store_id !== storeId) {
    return { success: false, errMsg: '您已是其他店铺负责人，无法接受员工邀请' };
  }

  const usersCol = db.collection('users');
  const { data: userRows } = await usersCol.where({ openid: OPENID }).limit(1).get();
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
  if (!staffOpenids.includes(OPENID)) {
    staffOpenids.push(OPENID);
  }

  const now = Date.now();
  await stores.doc(storeDoc._id).update({
    data: {
      staffOpenids,
      updateTime: now
    }
  });

  if (userRows.length) {
    await usersCol.doc(userRows[0]._id).update({
      data: {
        store_id: storeId,
        isMerchant: true,
        merchantStatus: 'approved',
        merchantRole: 'staff',
        updateTime: now
      }
    });
  } else {
    await usersCol.add({
      data: {
        openid: OPENID,
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
      }
    });
  }

  const store = await resolveStoreMediaUrls(formatStore({ ...storeDoc, staffOpenids }));
  return { success: true, store, accessRole: 'staff' };
}

async function getStoreQrCode(event) {
  const { store_id: storeId, env_version: envVersion } = event;
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const { data } = await stores.where({ store_id: storeId }).limit(1).get();
  if (data.length === 0) {
    return { success: false, errMsg: '店铺不存在' };
  }
  if (data[0].ownerOpenid !== OPENID) {
    return { success: false, errMsg: '无权生成该店铺二维码' };
  }

  const scene = String(storeId).slice(0, 32);
  const version = envVersion === 'release' || envVersion === 'develop' || envVersion === 'trial'
    ? envVersion
    : 'trial';

  try {
    const resp = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/index/index',
      checkPath: false,
      envVersion: version,
      width: 430
    });

    const cloudPath = `store-qrcodes/${storeId}.png`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: resp.buffer
    });
    const { fileList } = await cloud.getTempFileURL({ fileList: [upload.fileID] });
    const tempFileURL = fileList[0] && fileList[0].tempFileURL;

    return {
      success: true,
      fileID: upload.fileID,
      tempFileURL
    };
  } catch (err) {
    console.error('getStoreQrCode failed', err);
    return {
      success: false,
      errMsg: (err && (err.errMsg || err.message)) || '生成二维码失败'
    };
  }
}

exports.main = async (event) => {
  switch (event.action) {
    case 'getStore':
      return getStore(event);
    case 'getMyStore':
      return getMyStore();
    case 'saveStore':
      return saveStore(event);
    case 'submitMerchantApply':
      return submitMerchantApply(event);
    case 'listPendingMerchantApplications':
      return listPendingMerchantApplications();
    case 'reviewMerchantApplication':
      return reviewMerchantApplication(event);
    case 'listStoreStaff':
      return listStoreStaff(event);
    case 'removeStoreStaff':
      return removeStoreStaff(event);
    case 'acceptStaffInvite':
      return acceptStaffInvite(event);
    case 'getStoreQrCode':
      return getStoreQrCode(event);
    default:
      return { success: false, errMsg: '未知操作' };
  }
};
