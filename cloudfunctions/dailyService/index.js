const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const dailyLogs = db.collection('daily_logs');
const orders = db.collection('orders');
const stores = db.collection('stores');
const users = db.collection('users');

const DAILY_LOGS_COLLECTION = 'daily_logs';
let dailyLogsReady = false;

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function getErrorText(err) {
  return String((err && (err.errMsg || err.message)) || err || '');
}

function isCollectionNotExistError(err) {
  const msg = getErrorText(err);
  return msg.includes('-502005')
    || msg.includes('DATABASE_COLLECTION_NOT_EXIST')
    || msg.includes('Db or Table not exist')
    || msg.includes('collection not exists')
    || msg.includes('collection not exist');
}

function isCollectionExistsError(msg) {
  return msg.includes('already exists')
    || msg.includes('已存在')
    || msg.includes('Table exist')
    || msg.includes('ResourceExist');
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
    notifyOwner: !!(doc.notifyOwner || doc.isAbnormal),
    isAbnormal: !!(doc.notifyOwner || doc.isAbnormal),
    time: doc.time || '',
    createTime: doc.createTime
  };
}

function isCloudFileId(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function sanitizeMediaList(list) {
  return (list || []).filter((item) => isCloudFileId(item));
}

function sanitizeMediaField(value) {
  return isCloudFileId(value) ? value : '';
}

async function resolveCloudFileUrlMap(fileIds) {
  const ids = [...new Set((fileIds || []).filter(isCloudFileId))];
  const map = {};
  if (!ids.length) return map;

  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk });
      (res.fileList || []).forEach((item) => {
        if (item && item.status === 0 && item.fileID && item.tempFileURL) {
          map[item.fileID] = item.tempFileURL;
        }
      });
    } catch (err) {
      console.error('[dailyService] getTempFileURL failed', err);
    }
  }
  return map;
}

async function enrichLogsMedia(logs) {
  const list = (logs || []).map(formatLog);
  const fileIds = [];
  list.forEach((log) => {
    sanitizeMediaList(log.images).forEach((id) => fileIds.push(id));
    const videoId = sanitizeMediaField(log.video);
    if (videoId) fileIds.push(videoId);
  });

  const urlMap = await resolveCloudFileUrlMap(fileIds);
  return list.map((log) => ({
    ...log,
    images: sanitizeMediaList(log.images).map((id) => urlMap[id] || '').filter(Boolean),
    videoUrl: (() => {
      const videoId = sanitizeMediaField(log.video);
      return videoId ? (urlMap[videoId] || '') : '';
    })()
  }));
}

async function queryLogsByOrderId(orderId) {
  try {
    return await dailyLogs
      .where({ order_id: orderId })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();
  } catch (err) {
    const result = await dailyLogs.where({ order_id: orderId }).limit(100).get();
    result.data = (result.data || []).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
    return result;
  }
}

async function createDailyLogsCollection() {
  try {
    await db.createCollection(DAILY_LOGS_COLLECTION);
    return true;
  } catch (err) {
    const msg = getErrorText(err);
    if (isCollectionExistsError(msg)) {
      return true;
    }
    console.warn('[dailyService] createCollection daily_logs:', msg);
    return false;
  }
}

async function verifyDailyLogsCollection() {
  await dailyLogs.limit(1).get();
  dailyLogsReady = true;
}

async function ensureDailyLogsCollection(force = false) {
  if (dailyLogsReady && !force) return;

  await createDailyLogsCollection();

  try {
    await verifyDailyLogsCollection();
    return;
  } catch (err) {
    if (!isCollectionNotExistError(err)) {
      throw err;
    }
  }

  dailyLogsReady = false;
  await createDailyLogsCollection();
  await verifyDailyLogsCollection();
}

async function runWithDailyLogsCollection(task) {
  await ensureDailyLogsCollection();
  try {
    return await task();
  } catch (err) {
    if (!isCollectionNotExistError(err)) {
      throw err;
    }
    dailyLogsReady = false;
    await ensureDailyLogsCollection(true);
    return task();
  }
}

async function initDailyDatabase() {
  dailyLogsReady = false;
  await ensureDailyLogsCollection(true);
  return { success: true, collection: DAILY_LOGS_COLLECTION };
}

async function getOrderById(orderId) {
  const { data } = await orders.where({ order_id: orderId }).limit(1).get();
  return data.length ? data[0] : null;
}

async function getStoreById(storeId) {
  const { data } = await stores.where({ store_id: storeId }).limit(1).get();
  return data.length ? data[0] : null;
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const { data } = await users.where({ openid }).limit(20).get();
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

  const { data: ownedStores } = await stores.where({ ownerOpenid: openid, store_id: storeId }).limit(1).get();
  return ownedStores.length > 0;
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

  const { data: ownedStores } = await stores.where({ ownerOpenid: openid, store_id: storeId }).limit(1).get();
  return ownedStores.length > 0;
}

async function listMerchantDailyLogs(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id || event.storeId;
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const canView = await canManageStore(storeId, OPENID);
  if (!canView) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await runWithDailyLogsCollection(() => dailyLogs
    .where({ store_id: storeId })
    .limit(200)
    .get());

  const logs = (result.data || [])
    .map(formatLog)
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return { success: true, logs: await enrichLogsMedia(logs) };
}

async function saveDailyLog(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.log || {};
  const orderId = payload.orderId || payload.order_id;
  if (!orderId) return { success: false, errMsg: '缺少订单信息' };

  const checks = Array.isArray(payload.checks) ? payload.checks.filter(Boolean) : [];
  if (!checks.length) {
    return { success: false, errMsg: '请至少选择一项打卡项目' };
  }

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, OPENID);
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

  if (rawImages.length && !images.length) {
    return { success: false, errMsg: '图片未上传到云端，请重新打卡' };
  }
  if (rawVideo && !video) {
    return { success: false, errMsg: '视频未上传到云端，请重新打卡' };
  }

  const now = Date.now();
  const notifyOwner = !!(payload.notifyOwner || payload.isAbnormal);
  const logData = {
    log_id: buildLogId(),
    order_id: orderId,
    store_id: order.store_id || '',
    merchantOpenid: order.merchantOpenid || OPENID,
    userOpenid: order.userOpenid || '',
    petName: order.petName || payload.petName || '',
    checks,
    description: payload.description || '',
    images,
    video,
    notifyOwner,
    isAbnormal: notifyOwner,
    time: payload.time || new Date(now).toLocaleString('zh-CN'),
    createTime: now
  };

  await runWithDailyLogsCollection(() => dailyLogs.add({ data: logData }));

  return {
    success: true,
    log: formatLog(logData)
  };
}

async function listDailyLogsByOrders(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const orderIds = [...new Set((event.orderIds || event.order_ids || []).filter(Boolean))];
  if (!orderIds.length) return { success: true, logs: [] };

  const authorizedOrderIds = [];
  const chunkSize = 20;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data: orderDocs } = await orders.where({ order_id: _.in(chunk) }).get();
    for (const order of orderDocs || []) {
      const isMerchant = await canManageOrder(order, OPENID);
      const isUser = order.userOpenid === OPENID;
      if (isMerchant || isUser) {
        authorizedOrderIds.push(order.order_id);
      }
    }
  }

  if (!authorizedOrderIds.length) return { success: true, logs: [] };

  const allDocs = [];
  for (let i = 0; i < authorizedOrderIds.length; i += chunkSize) {
    const chunk = authorizedOrderIds.slice(i, i + chunkSize);
    const result = await runWithDailyLogsCollection(() => dailyLogs
      .where({ order_id: _.in(chunk) })
      .limit(500)
      .get());
    allDocs.push(...(result.data || []));
  }

  const logs = allDocs
    .map(formatLog)
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return { success: true, logs: await enrichLogsMedia(logs) };
}

async function listDailyLogs(event) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, errMsg: '无法获取用户身份' };

  const orderId = event.order_id || event.orderId;
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, OPENID);
  const isUser = order.userOpenid === OPENID;
  if (!isMerchant && !isUser) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await runWithDailyLogsCollection(() => queryLogsByOrderId(orderId));
  const logs = (result.data || []).map(formatLog);
  return { success: true, logs: await enrichLogsMedia(logs) };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'initDatabase':
        return await initDailyDatabase();
      case 'saveDailyLog':
        return await saveDailyLog(event);
      case 'listDailyLogs':
        return await listDailyLogs(event);
      case 'listDailyLogsByOrders':
        return await listDailyLogsByOrders(event);
      case 'listMerchantDailyLogs':
        return await listMerchantDailyLogs(event);
      default:
        return { success: false, errMsg: '未知操作' };
    }
  } catch (err) {
    console.error('[dailyService] error', err);
    const msg = getErrorText(err);
    if (isCollectionNotExistError(err)) {
      return {
        success: false,
        errMsg: '打卡数据表未创建，请重新部署 dailyService 云函数，或在云开发控制台手动创建 daily_logs 集合'
      };
    }
    return {
      success: false,
      errMsg: msg || '打卡服务异常'
    };
  }
};
