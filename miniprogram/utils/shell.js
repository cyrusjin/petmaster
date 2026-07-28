/**
 * 宠主端壳：仅用户 Tab，不再切换商家端（商家功能在独立小程序 PetMasterBusiness）
 */

const USER_TAB_ROUTES = [
  'pages/index/index',
  'pages/orders/orders',
  'pages/daily/daily'
];

const MERCHANT_TAB_ROUTES = [];
const MERCHANT_APPLY_HOME = '/pages/index/index';
const MERCHANT_HOME = '/pages/index/index';

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? current.route : '';
}

function isMerchantTabRoute() {
  return false;
}

function hasMerchantBackendAccess() {
  return false;
}

function canUseMerchantShell() {
  return false;
}

function hasMerchantStore() {
  return false;
}

function getMerchantLandingUrl() {
  return MERCHANT_HOME;
}

function applyRoleShell() {
  // 宠主端使用 custom-tab-bar；须隐藏原生 tabBar，否则会与自定义栏叠成双层
  try {
    wx.hideTabBar({ animation: false }).catch(() => {});
  } catch (err) {
    // ignore
  }
}

function guardUserTabPage() {
  return false;
}

module.exports = {
  MERCHANT_APPLY_HOME,
  MERCHANT_HOME,
  applyRoleShell,
  guardUserTabPage,
  USER_TAB_ROUTES,
  MERCHANT_TAB_ROUTES,
  isMerchantTabRoute,
  hasMerchantStore,
  hasMerchantBackendAccess,
  canUseMerchantShell,
  getMerchantLandingUrl
};
