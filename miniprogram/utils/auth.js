const { callApiService, rejectOnFailure } = require('./api');

function callUserAuth(action, data = {}) {
  return callApiService('userAuth', { action, ...data });
}

function initDatabase() {
  return callUserAuth('initDatabase');
}

function getUserInfo() {
  return callUserAuth('getUserInfo');
}

function syncProfile(profile) {
  return callUserAuth('syncProfile', { profile })
    .then((res) => rejectOnFailure(res, '保存资料失败'));
}

function bindPhone(code) {
  return callUserAuth('bindPhone', { code })
    .then((res) => rejectOnFailure(res, '绑定手机号失败'));
}

function dedupeMyUser() {
  return callUserAuth('dedupeMyUser');
}

function bindUserStore(storeId) {
  return callUserAuth('bindUserStore', { store_id: storeId });
}

function registerVisitStoreIntent(storeId) {
  return callUserAuth('registerVisitStoreIntent', { store_id: storeId });
}

function setMerchantProfile(storeId) {
  return callUserAuth('setMerchantProfile', { store_id: storeId || '' });
}

function ping() {
  return callUserAuth('ping');
}

module.exports = {
  initDatabase,
  getUserInfo,
  syncProfile,
  bindPhone,
  dedupeMyUser,
  bindUserStore,
  registerVisitStoreIntent,
  setMerchantProfile,
  ping
};
