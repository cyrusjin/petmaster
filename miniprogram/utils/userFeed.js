const { dedupeDailyLogs, getLogId } = require('./dailyLogUtil');
const { formatTimeLabel } = require('./dailyTimeline');
const { resolveVideoUrl } = require('./mediaUrl');

function getUserScopedOrders(app) {
  const storeId = app.getStoreId();
  return (app.getOrders() || []).filter((o) => !storeId || o.store_id === storeId);
}

function getUserScopedDailyLogs(app, orders) {
  const orderList = orders || getUserScopedOrders(app);
  const orderIds = new Set(
    orderList.map((o) => o.id || o.order_id).filter(Boolean)
  );
  return dedupeDailyLogs(
    (app.getDailyLogs() || []).filter((log) => {
      const oid = log.orderId || log.order_id;
      return oid && orderIds.has(oid);
    })
  );
}

function getUserBoardingOrderIds(orders) {
  return [...new Set(
    (orders || [])
      .filter((o) => o.status === 'boarding')
      .map((o) => o.id || o.order_id)
      .filter(Boolean)
  )];
}

function mergeDailyLogsForOrders(existing, fetched, orderIds) {
  const idSet = new Set((orderIds || []).filter(Boolean));
  const others = (existing || []).filter((item) => {
    const oid = item.orderId || item.order_id;
    return !oid || !idSet.has(oid);
  });
  const merged = dedupeDailyLogs(others.concat(fetched || []));
  const sig = (list) => list
    .map((log) => `${getLogId(log)}:${log.updateTime || log.createTime || 0}:${log.videoUrl || ''}`)
    .sort()
    .join('|');
  return {
    logs: merged,
    changed: sig(existing || []) !== sig(merged)
  };
}

function persistResolvedVideoUrls(app, logs) {
  const updates = new Map();
  (logs || []).forEach((log) => {
    const id = getLogId(log);
    if (id && log.videoUrl) updates.set(id, log.videoUrl);
  });
  if (!updates.size) return false;

  const all = app.getDailyLogs();
  let dirty = false;
  const next = all.map((log) => {
    const id = getLogId(log);
    const url = id ? updates.get(id) : '';
    if (url && log.videoUrl !== url) {
      dirty = true;
      return { ...log, videoUrl: url };
    }
    return log;
  });
  if (dirty) {
    app.patchDailyLogs(next);
  }
  return dirty;
}

function buildDailyViewLogs(app, rawLogs, orders) {
  const orderList = orders || getUserScopedOrders(app);
  const pets = app.getPets();
  const enriched = dedupeDailyLogs(rawLogs).map((log) => {
    const order = orderList.find((item) => (
      item.id === log.orderId || item.id === log.order_id
      || item.order_id === log.orderId || item.order_id === log.order_id
    ));
    const pet = order ? pets.find((item) => item.id === order.petId) : null;
    return {
      ...log,
      petName: log.petName || (order ? order.petName : '未知'),
      petPhoto: pet ? pet.photo : (log.petPhoto || ''),
      time: log.time || formatTimeLabel(log),
      videoUrl: log.videoUrl || ''
    };
  });

  const needResolve = enriched.filter((log) => !log.videoUrl && log.video);
  if (!needResolve.length) {
    return Promise.resolve(enriched);
  }

  return Promise.all(needResolve.map((log) => (
    resolveVideoUrl(log.video).then((videoUrl) => {
      if (videoUrl) log.videoUrl = videoUrl;
      return log;
    })
  ))).then(() => {
    persistResolvedVideoUrls(app, enriched);
    return enriched;
  });
}

module.exports = {
  getUserScopedOrders,
  getUserScopedDailyLogs,
  getUserBoardingOrderIds,
  mergeDailyLogsForOrders,
  buildDailyViewLogs,
  persistResolvedVideoUrls
};
