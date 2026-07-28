const config = require('../config');
const db = require('../db');
const wechat = require('../wechat');
const identity = require('./identity');
const oaBindService = require('./oaBindService');

const ORDER_STATUS_LABELS = {
  pending: '待确认',
  confirmed: '待签协议',
  awaiting_arrival: '待到店',
  boarding: '寄养中',
  toPay: '待支付',
  completed: '已完成',
  cancelled: '已取消'
};

const CHECK_STATUS_MAP = {
  feed: '喂食',
  water: '饮水',
  walk: '遛弯',
  poop: '排便',
  play: '玩耍',
  medicine: '喂药',
  care: '护理',
  clean: '清洁',
  spirit: '精神状态'
};

function truncate(value, max = 20) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '-';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(max - 1, 1))}…`;
}

function formatDateTime(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapTemplateData(fieldMap, values) {
  const data = {};
  Object.keys(fieldMap || {}).forEach((logicalKey) => {
    const wxKey = fieldMap[logicalKey];
    if (!wxKey) return;
    data[wxKey] = values[logicalKey] != null ? values[logicalKey] : '-';
  });
  return data;
}

function isOaConfigured() {
  const oa = config.wxOa || {};
  return !!(oa.appId && oa.secret);
}

async function resolveOaOpenidForUserOpenid(openid) {
  if (!openid) return '';
  const user = await identity.findPrimaryUserByOpenid(openid);
  return oaBindService.getOaOpenidFromUser(user);
}

async function collectMerchantOaOpenids(order) {
  const set = new Set();
  const storeId = order && order.store_id;
  let store = null;
  if (storeId) {
    const rows = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
    store = rows[0] || null;
  }

  const candidateOpenids = new Set();
  if (order && order.merchantOpenid) candidateOpenids.add(order.merchantOpenid);
  if (store && store.ownerOpenid) candidateOpenids.add(store.ownerOpenid);
  if (store && Array.isArray(store.staffOpenids)) {
    store.staffOpenids.filter(Boolean).forEach((id) => candidateOpenids.add(id));
  }

  for (const openid of candidateOpenids) {
    const oaOpenid = await resolveOaOpenidForUserOpenid(openid);
    if (oaOpenid) set.add(oaOpenid);
  }
  return [...set];
}

async function safeSend(label, fn) {
  try {
    if (!isOaConfigured()) {
      console.log(`[notify] skip ${label}: OA not configured`);
      return null;
    }
    return await fn();
  } catch (err) {
    console.warn(`[notify] ${label} failed:`, err.message || err);
    return null;
  }
}

async function notifyMerchantNewOrder(order) {
  return safeSend('newOrder', async () => {
    const templateId = config.wxOa.templates.newOrder;
    if (!templateId || !order) {
      console.log('[notify] skip newOrder: missing template or order');
      return null;
    }
    const recipients = await collectMerchantOaOpenids(order);
    if (!recipients.length) {
      console.log('[notify] skip newOrder: no merchant oa openid');
      return null;
    }

    const orderId = order.order_id || order.id || '';
    const reserveTime = [order.startDate, order.startTime].filter(Boolean).join(' ') || '-';
    const data = mapTemplateData(config.wxOa.templateFields.newOrder, {
      orderNo: truncate(order.displayNo || orderId, 32),
      petName: truncate(order.petName || '宠物', 20),
      serviceType: truncate(order.serviceType || '寄养预约', 20),
      reserveTime: truncate(reserveTime, 20),
      storeName: truncate(order.storeName || '店铺', 20)
    });

    const miniprogram = {
      appid: config.wxApps.merchant.appId,
      pagepath: `pages/merchant/order-detail/order-detail?id=${orderId}`
    };

    const results = [];
    for (const touser of recipients) {
      results.push(await wechat.sendTemplateMessage({
        touser,
        templateId,
        data,
        miniprogram
      }));
    }
    return results;
  });
}

async function notifyUserOrderStatus(order, prevStatus) {
  return safeSend('orderStatus', async () => {
    const templateId = config.wxOa.templates.orderStatus;
    if (!templateId || !order) {
      console.log('[notify] skip orderStatus: missing template or order');
      return null;
    }
    if (prevStatus && prevStatus === order.status) {
      return null;
    }

    const oaOpenid = await resolveOaOpenidForUserOpenid(order.userOpenid);
    if (!oaOpenid) {
      console.log('[notify] skip orderStatus: no user oa openid');
      return null;
    }

    const orderId = order.order_id || order.id || '';
    const data = mapTemplateData(config.wxOa.templateFields.orderStatus, {
      orderNo: truncate(order.displayNo || orderId, 32),
      petName: truncate(order.petName || '宠物', 20),
      status: truncate(ORDER_STATUS_LABELS[order.status] || order.status || '-', 20),
      storeName: truncate(order.storeName || '店铺', 20),
      updateTime: truncate(formatDateTime(order.updateTime || Date.now()), 20)
    });

    return wechat.sendTemplateMessage({
      touser: oaOpenid,
      templateId,
      data,
      miniprogram: {
        appid: config.wxApps.user.appId,
        pagepath: `pages/user/order-detail/order-detail?id=${orderId}`
      }
    });
  });
}

function formatChecks(checks) {
  const list = (checks || []).map((item) => CHECK_STATUS_MAP[item] || item).filter(Boolean);
  if (!list.length) return '日常打卡';
  return truncate(list.join('、'), 20);
}

async function notifyUserDailyCheck(order, log) {
  return safeSend('dailyCheck', async () => {
    const templateId = config.wxOa.templates.dailyCheck;
    if (!templateId || !order) {
      console.log('[notify] skip dailyCheck: missing template or order');
      return null;
    }

    const oaOpenid = await resolveOaOpenidForUserOpenid(order.userOpenid);
    if (!oaOpenid) {
      console.log('[notify] skip dailyCheck: no user oa openid');
      return null;
    }

    const data = mapTemplateData(config.wxOa.templateFields.dailyCheck, {
      petName: truncate((log && log.petName) || order.petName || '宠物', 20),
      checks: formatChecks(log && log.checks),
      storeName: truncate(order.storeName || '店铺', 20),
      checkTime: truncate((log && log.time) || formatDateTime(Date.now()), 20)
    });

    return wechat.sendTemplateMessage({
      touser: oaOpenid,
      templateId,
      data,
      miniprogram: {
        appid: config.wxApps.user.appId,
        pagepath: 'pages/daily/daily'
      }
    });
  });
}

module.exports = {
  notifyMerchantNewOrder,
  notifyUserOrderStatus,
  notifyUserDailyCheck,
  ORDER_STATUS_LABELS
};
