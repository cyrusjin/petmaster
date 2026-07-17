const db = require('../db');

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

const ORDER_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding', 'toPay', 'completed', 'cancelled'];
const EDITABLE_PRICE_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding'];
const MERCHANT_PATCH_FIELDS = ['pickupOutboundDone', 'pickupReturnDone'];
const USER_CANCEL_STATUSES = ['pending', 'confirmed', 'awaiting_arrival'];
const USER_EDIT_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding'];
const USER_EDIT_FIELDS_FULL = [
  'startDate', 'endDate', 'startTime', 'endTime', 'days',
  'contactName', 'contactPhone', 'emergencyPhone', 'specialNeeds',
  'needPickup', 'pickupAddress', 'pickupLocationName', 'pickupLatitude', 'pickupLongitude',
  'pickupContactPhone', 'pickupTime', 'pickupIncludeOutbound', 'pickupIncludeReturn',
  'boardingFee', 'shippingFee', 'totalFee', 'feeSnapshot', 'basePrice'
];
const USER_EDIT_FIELDS_BOARDING = [
  'endDate', 'endTime', 'days', 'boardingFee', 'shippingFee', 'totalFee', 'feeSnapshot'
];

function parseFee(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : fallback;
}

function normalizeOrderFees(doc) {
  const needPickup = !!doc.needPickup;
  const totalFee = parseFee(doc.totalFee, 0);
  let boardingFee = parseFee(doc.boardingFee, NaN);
  let shippingFee = parseFee(doc.shippingFee, 0);

  if (!Number.isFinite(boardingFee)) {
    boardingFee = needPickup ? Math.max(0, totalFee - shippingFee) : totalFee;
  }
  if (!needPickup) {
    shippingFee = 0;
  }

  return {
    boardingFee,
    shippingFee,
    totalFee: parseFee(boardingFee + shippingFee, totalFee)
  };
}

function buildOrderId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DISPLAY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildRandomDisplayNo(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += DISPLAY_CODE_CHARS[Math.floor(Math.random() * DISPLAY_CODE_CHARS.length)];
  }
  return out;
}

function deriveDisplayNo(seed, length = 10) {
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

function resolveOrderDisplayNo(doc) {
  if (!doc) return '';
  if (doc.displayNo) return String(doc.displayNo).trim();
  const seed = doc.order_id || '';
  return seed ? deriveDisplayNo(`order:${seed}`) : '';
}

function buildPetSnapshotFromDoc(pet) {
  if (!pet) return null;
  return {
    photo: pet.photo || '',
    breed: pet.breed || '',
    gender: pet.gender || '',
    age: pet.age != null ? String(pet.age) : '',
    weight: pet.weight != null ? String(pet.weight) : '',
    color: pet.color || '',
    vaccination: pet.vaccination || '',
    dewormDate: pet.dewormDate || '',
    allergyStatus: pet.allergyStatus || '',
    allergy: pet.allergy || '',
    medicalHistoryStatus: pet.medicalHistoryStatus || '',
    medicalHistory: pet.medicalHistory || '',
    isPregnant: pet.isPregnant || '',
    inHeat: pet.inHeat || '',
    isNeutered: pet.isNeutered || '',
    hasDogLicense: pet.hasDogLicense || '',
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || ''
  };
}

function mergePetSnapshot(stored, petDoc, orderDoc) {
  const fromPet = buildPetSnapshotFromDoc(petDoc) || {};
  const fromStored = stored && typeof stored === 'object' ? stored : {};
  const breed = fromStored.breed || fromPet.breed || orderDoc.petBreed || '';
  const photo = fromStored.photo || fromPet.photo || orderDoc.petPhoto || '';
  const gender = orderDoc.petGender || fromStored.gender || fromPet.gender || '';
  const age = orderDoc.petAge != null && orderDoc.petAge !== ''
    ? String(orderDoc.petAge)
    : (fromStored.age || fromPet.age || '');
  const weight = orderDoc.petWeight != null && orderDoc.petWeight !== ''
    ? String(orderDoc.petWeight)
    : (fromStored.weight || fromPet.weight || '');
  return {
    ...fromPet,
    ...fromStored,
    photo,
    breed,
    gender,
    age,
    weight
  };
}

function formatOrder(doc, petDoc) {
  if (!doc) return null;
  const fees = normalizeOrderFees(doc);
  const petSnapshot = mergePetSnapshot(doc.petSnapshot, petDoc, doc);
  return {
    id: doc.order_id,
    order_id: doc.order_id,
    displayNo: resolveOrderDisplayNo(doc),
    store_id: doc.store_id || '',
    merchantOpenid: doc.merchantOpenid || '',
    userOpenid: doc.userOpenid || '',
    userNickName: doc.userNickName || '',
    userPhone: doc.userPhone || '',
    petId: doc.petId || '',
    petName: doc.petName || '',
    petType: doc.petType || '',
    petGender: petSnapshot.gender || doc.petGender || '',
    petAge: petSnapshot.age || (doc.petAge != null ? String(doc.petAge) : ''),
    petWeight: petSnapshot.weight || (doc.petWeight != null ? String(doc.petWeight) : ''),
    petBreed: petSnapshot.breed || doc.petBreed || '',
    petPhoto: petSnapshot.photo || doc.petPhoto || '',
    petSnapshot,
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    startTime: doc.startTime || '',
    endTime: doc.endTime || '',
    days: doc.days != null ? doc.days : 0,
    boardingFee: fees.boardingFee,
    shippingFee: fees.shippingFee,
    totalFee: fees.totalFee,
    basePrice: doc.basePrice != null ? doc.basePrice : 0,
    deposit: doc.deposit != null ? doc.deposit : 0,
    feeSnapshot: doc.feeSnapshot || null,
    extras: Array.isArray(doc.extras) ? doc.extras : [],
    needPickup: !!doc.needPickup,
    specialNeeds: doc.specialNeeds || '',
    contactName: doc.contactName || '',
    contactPhone: doc.contactPhone || '',
    emergencyPhone: doc.emergencyPhone || '',
    pickupAddress: doc.pickupAddress || '',
    pickupLocationName: doc.pickupLocationName || '',
    pickupLatitude: doc.pickupLatitude != null ? doc.pickupLatitude : '',
    pickupLongitude: doc.pickupLongitude != null ? doc.pickupLongitude : '',
    pickupContactPhone: doc.pickupContactPhone || '',
    pickupTime: doc.pickupTime || '',
    pickupIncludeOutbound: doc.pickupIncludeOutbound !== false,
    pickupIncludeReturn: doc.pickupIncludeReturn !== false,
    pickupOutboundDone: !!doc.pickupOutboundDone,
    pickupReturnDone: !!doc.pickupReturnDone,
    billingMode: doc.billingMode || 'weight',
    roomType: doc.roomType || '',
    roomName: doc.roomName || '',
    storeName: doc.storeName || '',
    storeLogo: doc.storeLogo || '',
    storeAddress: doc.storeAddress || '',
    serviceType: doc.serviceType || '寄养预约',
    status: doc.status || 'pending',
    pricePendingConfirm: !!doc.pricePendingConfirm,
    priceConfirmedAt: doc.priceConfirmedAt || 0,
    contractId: doc.contractId || '',
    contractSigned: !!doc.contractSigned,
    contractSignTime: doc.contractSignTime || '',
    contractSnapshot: doc.contractSnapshot || null,
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

async function getStoreById(storeId) {
  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return data.length ? data[0] : null;
}

function isStoreClosed(store) {
  const status = (store && store.status) || '';
  return status === '已闭店' || status === '暂停接单' || status === '未营业';
}

function validateCreatePayload(order) {
  if (!order || !order.store_id) return '缺少店铺信息';
  if (!(order.petName || '').trim()) return '缺少宠物信息';
  if (!order.startDate || !order.endDate) return '请选择寄养时间';
  if (!order.startTime || !order.endTime) return '请选择入住和离店时间';
  return '';
}

function buildOrderData(order, userOpenid, merchantOpenid, userProfile) {
  const now = Date.now();
  const fees = normalizeOrderFees({
    boardingFee: order.boardingFee,
    shippingFee: order.shippingFee,
    totalFee: order.totalFee,
    needPickup: order.needPickup
  });
  return {
    order_id: buildOrderId(),
    displayNo: buildRandomDisplayNo(10),
    store_id: order.store_id,
    merchantOpenid,
    userOpenid,
    userNickName: (userProfile && (userProfile.realName || userProfile.nickName)) || '',
    userPhone: (userProfile && userProfile.phone) || '',
    petId: order.petId || '',
    petName: order.petName || '',
    petType: order.petType || '',
    petGender: order.petGender || '',
    petAge: order.petAge != null ? String(order.petAge) : '',
    petWeight: order.petWeight != null ? String(order.petWeight) : '',
    petBreed: order.petBreed || (order.petSnapshot && order.petSnapshot.breed) || '',
    petPhoto: order.petPhoto || (order.petSnapshot && order.petSnapshot.photo) || '',
    petSnapshot: order.petSnapshot || null,
    startDate: order.startDate,
    endDate: order.endDate,
    startTime: order.startTime,
    endTime: order.endTime,
    days: parseFloat(order.days) || 0,
    boardingFee: fees.boardingFee,
    shippingFee: fees.shippingFee,
    totalFee: fees.totalFee,
    basePrice: order.basePrice != null ? order.basePrice : 0,
    deposit: order.deposit != null ? order.deposit : 0,
    feeSnapshot: order.feeSnapshot || null,
    extras: Array.isArray(order.extras) ? order.extras : [],
    needPickup: !!order.needPickup,
    specialNeeds: order.specialNeeds || '',
    contactName: order.contactName || '',
    contactPhone: order.contactPhone || '',
    emergencyPhone: order.emergencyPhone || '',
    pickupAddress: order.pickupAddress || '',
    pickupLocationName: order.pickupLocationName || '',
    pickupLatitude: order.pickupLatitude != null ? order.pickupLatitude : '',
    pickupLongitude: order.pickupLongitude != null ? order.pickupLongitude : '',
    pickupContactPhone: order.pickupContactPhone || '',
    pickupTime: order.pickupTime || '',
    pickupIncludeOutbound: order.pickupIncludeOutbound !== false,
    pickupIncludeReturn: order.pickupIncludeReturn !== false,
    pickupOutboundDone: false,
    pickupReturnDone: false,
    billingMode: order.billingMode || 'weight',
    roomType: order.roomType || '',
    roomName: order.roomName || '',
    storeName: order.storeName || '',
    storeLogo: order.storeLogo || '',
    storeAddress: order.storeAddress || '',
    serviceType: order.serviceType || '寄养预约',
    status: 'pending',
    pricePendingConfirm: false,
    contractId: order.contractId || '',
    contractSigned: !!order.contractSigned,
    contractSignTime: order.contractSignTime || '',
    contractSnapshot: order.contractSnapshot || null,
    createTime: now,
    updateTime: now
  };
}

async function createOrder(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.order || {};
  const err = validateCreatePayload(payload);
  if (err) return { success: false, errMsg: err };

  const store = await getStoreById(payload.store_id);
  if (!store) return { success: false, errMsg: '店铺不存在，请确认商家已保存店铺设置' };
  if (isStoreClosed(store)) return { success: false, errMsg: '店铺已闭店，暂不可预约' };

  await db.ensureCollections(['orders']);

  let merchantOpenid = store.ownerOpenid || '';
  if (!merchantOpenid) {
    const merchantUsers = await db.findMany('users', {
      store_id: payload.store_id,
      isMerchant: true
    }, { limit: 1 });
    if (merchantUsers.length) {
      merchantOpenid = merchantUsers[0].openid || '';
    }
  }

  const orderData = buildOrderData(payload, openid, merchantOpenid, event.userProfile || {});
  await db.insertOne('orders', orderData);

  return { success: true, order: formatOrder(orderData) };
}

async function fetchPetsMap(petIds) {
  const ids = [...new Set((petIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;

  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const data = await db.findMany('pets', { pet_id: { $in: chunk } });
    (data || []).forEach((doc) => {
      map[doc.pet_id] = doc;
    });
  }
  return map;
}

async function listUserOrders(openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const data = await db.findMany('orders', { userOpenid: openid }, { limit: 100 });
  const sorted = (data || []).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  const petMap = await fetchPetsMap(sorted.map((item) => item.petId));
  return {
    success: true,
    orders: sorted.map((doc) => formatOrder(doc, petMap[doc.petId]))
  };
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const data = await db.findMany('users', { openid }, { limit: 20 });
  return (data || []).some((doc) => (
    normalizeIsMerchant(doc.isMerchant) && doc.store_id === storeId
  ));
}

async function canManageOrder(order, openid) {
  if (!openid || !order) return false;

  if (order.merchantOpenid && order.merchantOpenid === openid) {
    return true;
  }

  const storeId = order.store_id;
  if (!storeId) return false;

  const store = await getStoreById(storeId);
  if (store) {
    const ownerOpenid = store.ownerOpenid || '';
    if (ownerOpenid === openid) return true;
    if (!ownerOpenid && await isMerchantUser(openid, storeId)) {
      return true;
    }
  }

  if (await isMerchantUser(openid, storeId)) {
    return true;
  }

  const ownedStores = await db.findMany('stores', { ownerOpenid: openid, store_id: storeId }, { limit: 1 });
  return ownedStores.length > 0;
}

async function listMerchantOrders(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id;
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };

  const store = await getStoreById(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  const canView = await canManageOrder({ store_id: storeId, merchantOpenid: store.ownerOpenid || '' }, openid);
  if (!canView) {
    return { success: false, errMsg: '无权查看该店铺订单' };
  }

  const data = await db.findMany('orders', { store_id: storeId }, { limit: 200 });
  const sorted = (data || []).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  const petMap = await fetchPetsMap(sorted.map((item) => item.petId));
  return {
    success: true,
    orders: sorted.map((doc) => formatOrder(doc, petMap[doc.petId]))
  };
}

async function updateOrder(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderId = event.order_id || event.id;
  const updates = event.updates || {};
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const data = await db.findMany('orders', { order_id: orderId }, { limit: 1 });
  if (!data.length) return { success: false, errMsg: '订单不存在' };

  const existing = data[0];
  const isMerchant = await canManageOrder(existing, openid);
  const isUser = existing.userOpenid === openid;

  if (!isMerchant && !isUser) {
    return { success: false, errMsg: '无权操作该订单' };
  }

  const nextStatus = updates.status;
  if (nextStatus && !ORDER_STATUSES.includes(nextStatus)) {
    return { success: false, errMsg: '无效的订单状态' };
  }

  const hasPriceUpdate = ['boardingFee', 'shippingFee', 'totalFee'].some((key) => updates[key] != null);
  const hasNonStatusUpdate = Object.keys(updates).some((key) => key !== 'status');
  const hasMerchantUpdate = isMerchant && (
    hasPriceUpdate
    || !!nextStatus
    || MERCHANT_PATCH_FIELDS.some((key) => updates[key] != null)
  );

  if (isMerchant && existing.pricePendingConfirm && hasMerchantUpdate) {
    return { success: false, errMsg: '价格待用户确认，暂不可修改订单' };
  }

  const patch = { updateTime: Date.now() };

  if (isUser && !isMerchant) {
    const confirmingPrice = updates.pricePendingConfirm === false && existing.pricePendingConfirm;
    if (confirmingPrice) {
      // 用户确认商家改价
    } else if (nextStatus === 'cancelled') {
      if (hasNonStatusUpdate) {
        return { success: false, errMsg: '取消订单时不可修改其他信息' };
      }
      if (!USER_CANCEL_STATUSES.includes(existing.status)) {
        return { success: false, errMsg: '当前状态不可取消' };
      }
    } else if (hasNonStatusUpdate) {
      if (!USER_EDIT_STATUSES.includes(existing.status)) {
        return { success: false, errMsg: '当前状态不可修改订单' };
      }
      if (nextStatus) {
        return { success: false, errMsg: '无权修改订单状态' };
      }
      const allowedFields = existing.status === 'boarding'
        ? USER_EDIT_FIELDS_BOARDING
        : USER_EDIT_FIELDS_FULL;
      const disallowed = Object.keys(updates).filter(
        (key) => updates[key] !== undefined && !allowedFields.includes(key)
      );
      if (disallowed.length) {
        return { success: false, errMsg: '当前状态不可修改该信息' };
      }
      allowedFields.forEach((key) => {
        if (updates[key] !== undefined) {
          if (key === 'needPickup' || key === 'pickupIncludeOutbound' || key === 'pickupIncludeReturn') {
            patch[key] = !!updates[key];
          } else {
            patch[key] = updates[key];
          }
        }
      });
    } else if (nextStatus) {
      return { success: false, errMsg: '无权操作该订单' };
    }
  }

  if (nextStatus) patch.status = nextStatus;

  if (isUser && !isMerchant && updates.pricePendingConfirm === false && existing.pricePendingConfirm) {
    patch.pricePendingConfirm = false;
    patch.priceConfirmedAt = Date.now();
  }

  if (isMerchant) {
    MERCHANT_PATCH_FIELDS.forEach((key) => {
      if (updates[key] != null) {
        patch[key] = !!updates[key];
      }
    });
  }

  if (hasPriceUpdate) {
    if (!isMerchant) {
      return { success: false, errMsg: '无权修改订单价格' };
    }
    if (!EDITABLE_PRICE_STATUSES.includes(existing.status)) {
      return { success: false, errMsg: '当前状态不可修改价格' };
    }

    const boardingFee = updates.boardingFee != null
      ? parseFee(updates.boardingFee, 0)
      : parseFee(existing.boardingFee, parseFee(existing.totalFee, 0));
    const shippingFee = existing.needPickup
      ? (updates.shippingFee != null ? parseFee(updates.shippingFee, 0) : parseFee(existing.shippingFee, 0))
      : 0;
    const normalized = normalizeOrderFees({
      boardingFee,
      shippingFee,
      totalFee: boardingFee + shippingFee,
      needPickup: existing.needPickup
    });

    patch.boardingFee = normalized.boardingFee;
    patch.shippingFee = normalized.shippingFee;
    patch.totalFee = normalized.totalFee;
    patch.pricePendingConfirm = true;
    if (!existing.merchantOpenid || existing.merchantOpenid !== openid) {
      patch.merchantOpenid = openid;
    }
  }

  await db.updateById('orders', existing._id, patch);
  let petDoc = null;
  if (existing.petId) {
    const petMap = await fetchPetsMap([existing.petId]);
    petDoc = petMap[existing.petId] || null;
  }
  const updatedOrder = formatOrder({ ...existing, ...patch }, petDoc);

  return { success: true, order: updatedOrder };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'createOrder':
      return createOrder(event, openid);
    case 'listUserOrders':
      return listUserOrders(openid);
    case 'listMerchantOrders':
      return listMerchantOrders(event, openid);
    case 'updateOrder':
      return updateOrder(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = { handle, canManageOrder, formatOrder };
