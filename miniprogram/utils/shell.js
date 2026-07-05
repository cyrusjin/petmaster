const { isMerchantApproved, isMerchantPending, isMerchantRejected } = require('./role');
const { isMerchantDemoMode } = require('./merchantDemo');

const MERCHANT_APPLY_HOME = '/pages/merchant/tab-daily/tab-daily';
const MERCHANT_HOME = '/pages/merchant/tab-daily/tab-daily';

const USER_TAB_ROUTES = [
  'pages/index/index',
  'pages/orders/orders',
  'pages/daily/daily'
];

const MERCHANT_TAB_ROUTES = [
  'pages/merchant/tab-daily/tab-daily',
  'pages/merchant/tab-statistics/tab-statistics',
  'pages/merchant/tab-store/tab-store'
];

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? current.route : '';
}

function isMerchantTabRoute(route) {
  return MERCHANT_TAB_ROUTES.includes(route);
}

function isStoreVisitEntry() {
  try {
    const app = getApp();
    if (app && typeof app.isUserClientMode === 'function') {
      return app.isUserClientMode();
    }
    return !!(app && app._storeVisitEntry);
  } catch (err) {
    return false;
  }
}

function hasMerchantBackendAccess() {
  try {
    const app = getApp();
    if (app.isMerchantApproved && app.isMerchantApproved()) return true;
    return isMerchantApproved(app.globalData && app.globalData.userInfo);
  } catch (err) {
    return false;
  }
}

function canUseMerchantShell() {
  try {
    const app = getApp();
    if (isStoreVisitEntry()) return false;
    const user = app.globalData && app.globalData.userInfo;
    if (hasMerchantBackendAccess()) return true;
    if (isMerchantDemoMode(user)) return true;
    if (isMerchantPending(user) || isMerchantRejected(user)) return true;
    return false;
  } catch (err) {
    return false;
  }
}

/** @deprecated 用 hasMerchantBackendAccess 判断是否可进商家端 */
function hasMerchantStore() {
  return hasMerchantBackendAccess();
}

function getMerchantLandingUrl() {
  return MERCHANT_HOME;
}

function applyRoleShell() {
  const route = getCurrentRoute();

  if (isStoreVisitEntry()) {
    wx.hideTabBar({ animation: false }).catch(() => {});
    if (isMerchantTabRoute(route) || route === 'pages/merchant/apply/apply') {
      wx.switchTab({ url: '/pages/index/index' });
    }
    return;
  }

  wx.hideTabBar({ animation: false }).catch(() => {});
  const landing = getMerchantLandingUrl();
  const targetRoute = landing.replace(/^\//, '');

  if (route === targetRoute) return;

  if (USER_TAB_ROUTES.includes(route) || route === 'pages/index/index') {
    wx.reLaunch({ url: landing });
    return;
  }

  if (hasMerchantBackendAccess() && route === 'pages/merchant/apply/apply') {
    wx.reLaunch({ url: landing });
    return;
  }

  if (!hasMerchantBackendAccess() && isMerchantTabRoute(route)) {
    if (!canUseMerchantShell()) {
      wx.reLaunch({ url: landing });
    }
  }
}

function guardUserTabPage() {
  if (!isStoreVisitEntry()) {
    const route = getCurrentRoute();
    if (USER_TAB_ROUTES.includes(route)) {
      applyRoleShell();
      return true;
    }
  }
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
