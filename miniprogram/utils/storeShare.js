const { STORAGE_KEYS } = require('./constants');

const DEFAULT_SHARE_IMAGE = '/images/default-avatar.png';
const USER_HOME_PATH = 'pages/index/index';

function resolveShareStoreId(shop) {
  let app = null;
  try {
    app = getApp();
  } catch (err) {
    app = null;
  }

  const candidates = [
    shop && shop.store_id,
    app && app.getShareStoreId && app.getShareStoreId(),
    app && app.getStoreId && app.getStoreId(),
    app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.store_id,
    app && app.getCurrentStore && app.getCurrentStore() && app.getCurrentStore().store_id
  ];

  if (app && wx.getStorageSync) {
    candidates.push(wx.getStorageSync(STORAGE_KEYS.STORE_ID));
  }

  return candidates.find((id) => id && String(id).trim()) || '';
}

function buildSharePath(storeId) {
  const id = (storeId || '').trim();
  if (!id) return USER_HOME_PATH;
  return `${USER_HOME_PATH}?store_id=${encodeURIComponent(id)}`;
}

function buildStoreShareConfig(shop, storeId) {
  const id = resolveShareStoreId(shop) || (storeId || '').trim();
  const name = (shop && shop.name) || '宠物寄养';
  const logo = (shop && shop.logo) || DEFAULT_SHARE_IMAGE;
  return {
    title: `${name} · 在线预约寄养`,
    path: buildSharePath(id),
    imageUrl: logo
  };
}

function buildTimelineShareConfig(shop, storeId) {
  const appMessage = buildStoreShareConfig(shop, storeId);
  const id = resolveShareStoreId(shop) || (storeId || '').trim();
  return {
    title: appMessage.title,
    query: id ? `store_id=${encodeURIComponent(id)}` : '',
    imageUrl: appMessage.imageUrl
  };
}

function enableStoreShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
}

module.exports = {
  DEFAULT_SHARE_IMAGE,
  USER_HOME_PATH,
  buildSharePath,
  resolveShareStoreId,
  buildStoreShareConfig,
  buildTimelineShareConfig,
  enableStoreShareMenu
};
