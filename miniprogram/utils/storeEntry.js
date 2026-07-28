const MERCHANT_APP_ID = 'wx327ccf77cdedc252';

function isFromMerchantShare(options) {
  const ref = options && options.referrerInfo;
  return !!(ref && ref.appId === MERCHANT_APP_ID);
}

function resolveEntryStoreId(app, options) {
  if (!app || !options) return '';
  const fromQuery = app.extractStoreIdFromOptions(options);
  if (fromQuery) return fromQuery;
  const extra = options.referrerInfo && options.referrerInfo.extraData;
  if (extra && extra.store_id) return String(extra.store_id).trim();
  return '';
}

function shouldRefreshStoreEntry(app, storeId, options) {
  if (!storeId) return false;
  if (isFromMerchantShare(options)) return true;
  return storeId !== app.getStoreId();
}

function enterStoreAndRefresh(app, storeId, options = {}) {
  if (!storeId) return Promise.resolve(null);
  const forceData = shouldRefreshStoreEntry(app, storeId, options);
  return app.enterUserStore(storeId, { forceData })
    .then(() => Promise.all([
      // 首页只需订单+宠物；动态日志后台补，不串行阻塞首屏
      app.syncUserFeed({ force: forceData, skipDailyLogs: true }),
      app.loadPets({ force: forceData })
    ]));
}

module.exports = {
  MERCHANT_APP_ID,
  isFromMerchantShare,
  resolveEntryStoreId,
  shouldRefreshStoreEntry,
  enterStoreAndRefresh
};
