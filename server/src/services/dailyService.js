const db = require('../db');
const oss = require('../oss');
const { canManageOrder } = require('./orderService');
const identity = require('./identity');
const userFields = require('./userFields');

const DAILY_LOGS_COLLECTION = 'daily_logs';

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function buildLogId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatLog(doc) {
  return {
    id: doc.log_id,
    log_id: doc.log_id,
    orderId: doc.order_id,
    order_id: doc.order_id,
    petName: doc.petName || '',
    checks: Array.isArray(doc.checks) ? doc.checks : [],
    description: doc.description || '',
    images: Array.isArray(doc.images) ? doc.images : [],
    video: doc.video || '',
    videoCover: doc.videoCover || '',
    notifyOwner: !!(doc.notifyOwner || doc.isAbnormal),
    isAbnormal: !!(doc.notifyOwner || doc.isAbnormal),
    time: doc.time || '',
    createTime: doc.createTime
  };
}

function sanitizeMediaList(list) {
  return (list || []).filter((item) => oss.isStoredMedia(item));
}

function sanitizeMediaField(value) {
  return oss.isStoredMedia(value) ? value : '';
}

async function enrichLogsMedia(logs) {
  const list = (logs || []).map(formatLog);
  return Promise.all(list.map(async (log) => {
    const images = await oss.resolveMediaUrls(sanitizeMediaList(log.images));
    const videoId = sanitizeMediaField(log.video);
    const videoUrl = videoId ? (await oss.resolveMediaUrl(videoId)) : '';
    const videoCoverId = sanitizeMediaField(log.videoCover);
    const videoCoverUrl = videoUrl
      ? await oss.resolveVideoCoverUrl(videoUrl, videoCoverId)
      : '';
    return {
      ...log,
      images: images.filter(Boolean),
      videoUrl: videoUrl || '',
      videoCoverUrl: videoCoverUrl || ''
    };
  }));
}

async function getOrderById(orderId) {
  const data = await db.findMany('orders', { order_id: orderId }, { limit: 1 });
  return data.length ? data[0] : null;
}

async function getStoreById(storeId) {
  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return data.length ? data[0] : null;
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return false;
  if (userFields.resolveMerchantStoreId(user) === storeId
    && userFields.isMerchantApprovedFromDoc(user)) {
    return true;
  }
  const openids = identity.collectOpenids(user);
  const owned = await db.findMany('stores', {
    store_id: storeId,
    ownerOpenid: { $in: openids }
  }, { limit: 1 });
  if (owned.length) return true;
  const staff = await db.findMany('stores', {
    store_id: storeId,
    staffOpenids: { $in: openids }
  }, { limit: 1 });
  return staff.length > 0;
}

async function isOrderUser(order, openid) {
  if (!order || !openid) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  const openids = user ? identity.collectOpenids(user) : [openid];
  return openids.includes(order.userOpenid);
}

async function canManageStore(storeId, openid) {
  if (!openid || !storeId) return false;

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

  const openids = identity.collectOpenids(await identity.findPrimaryUserByOpenid(openid) || openid);
  const ownedStores = await db.findMany('stores', {
    ownerOpenid: { $in: openids },
    store_id: storeId
  }, { limit: 1 });
  return ownedStores.length > 0;
}

async function initDailyDatabase() {
  await db.ensureCollections([DAILY_LOGS_COLLECTION]);
  return { success: true, collection: DAILY_LOGS_COLLECTION };
}

async function listMerchantDailyLogs(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id || event.storeId;
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const canView = await canManageStore(storeId, openid);
  if (!canView) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await db.findMany('daily_logs', { store_id: storeId }, { limit: 200 });
  const logs = (result || [])
    .map(formatLog)
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return { success: true, logs: await enrichLogsMedia(logs) };
}

async function saveDailyLog(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.log || {};
  const orderId = payload.orderId || payload.order_id;
  if (!orderId) return { success: false, errMsg: '缺少订单信息' };

  const checks = Array.isArray(payload.checks) ? payload.checks.filter(Boolean) : [];
  if (!checks.length) {
    return { success: false, errMsg: '请至少选择一项打卡项目' };
  }

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  if (!isMerchant) {
    return { success: false, errMsg: '无权为该订单打卡' };
  }
  if (order.status !== 'boarding') {
    return { success: false, errMsg: '仅寄养中订单可打卡' };
  }

  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const images = sanitizeMediaList(rawImages);
  const rawVideo = payload.video || '';
  const video = sanitizeMediaField(rawVideo);
  const rawVideoCover = payload.videoCover || '';
  const videoCover = sanitizeMediaField(rawVideoCover);

  if (rawImages.length && !images.length) {
    return { success: false, errMsg: '图片未上传成功，请重新打卡' };
  }
  if (rawVideo && !video) {
    return { success: false, errMsg: '视频未上传成功，请重新打卡' };
  }
  if (rawVideoCover && !videoCover) {
    return { success: false, errMsg: '视频封面未上传成功，请重新打卡' };
  }

  const now = Date.now();
  const notifyOwner = !!(payload.notifyOwner || payload.isAbnormal);
  const logData = {
    log_id: buildLogId(),
    order_id: orderId,
    store_id: order.store_id || '',
    merchantOpenid: order.merchantOpenid || openid,
    userOpenid: order.userOpenid || '',
    petName: order.petName || payload.petName || '',
    checks,
    description: payload.description || '',
    images,
    video,
    videoCover,
    notifyOwner,
    isAbnormal: notifyOwner,
    time: payload.time || new Date(now).toLocaleString('zh-CN'),
    createTime: now
  };

  await db.ensureCollections([DAILY_LOGS_COLLECTION]);
  await db.insertOne('daily_logs', logData);

  const [savedLog] = await enrichLogsMedia([logData]);
  return {
    success: true,
    log: savedLog || formatLog(logData)
  };
}

async function listDailyLogsByOrders(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderIds = [...new Set((event.orderIds || event.order_ids || []).filter(Boolean))];
  if (!orderIds.length) return { success: true, logs: [] };

  const authorizedOrderIds = [];
  const chunkSize = 20;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const orderDocs = await db.findMany('orders', { order_id: { $in: chunk } });
    for (const order of orderDocs || []) {
      const isMerchant = await canManageOrder(order, openid);
      const isUser = await isOrderUser(order, openid);
      if (isMerchant || isUser) {
        authorizedOrderIds.push(order.order_id);
      }
    }
  }

  if (!authorizedOrderIds.length) return { success: true, logs: [] };

  const allDocs = [];
  for (let i = 0; i < authorizedOrderIds.length; i += chunkSize) {
    const chunk = authorizedOrderIds.slice(i, i + chunkSize);
    const result = await db.findMany('daily_logs', { order_id: { $in: chunk } }, { limit: 500 });
    allDocs.push(...(result || []));
  }

  const logs = allDocs
    .map(formatLog)
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return { success: true, logs: await enrichLogsMedia(logs) };
}

async function listDailyLogs(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderId = event.order_id || event.orderId;
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  const isUser = await isOrderUser(order, openid);
  if (!isMerchant && !isUser) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await db.findMany('daily_logs', { order_id: orderId }, {
    sort: { createTime: -1 },
    limit: 100
  });
  const logs = (result || []).map(formatLog);
  return { success: true, logs: await enrichLogsMedia(logs) };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'initDatabase':
      return initDailyDatabase();
    case 'saveDailyLog':
      return saveDailyLog(event, openid);
    case 'listDailyLogs':
      return listDailyLogs(event, openid);
    case 'listDailyLogsByOrders':
      return listDailyLogsByOrders(event, openid);
    case 'listMerchantDailyLogs':
      return listMerchantDailyLogs(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = { handle };
