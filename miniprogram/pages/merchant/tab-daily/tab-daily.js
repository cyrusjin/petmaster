const app = getApp();
const storeApi = require('../../../utils/store');
const { enableStoreShareMenu, buildMerchantShareConfig, buildMerchantTimelineShareConfig, buildStaffShareConfig } = require('../../../utils/storeShare');
const {
  buildBoardingListWithDailyStats,
  countUncheckedBoardingPets
} = require('../../../utils/dailyStats');
const badgeUtil = require('../../../utils/badge');
const merchantDemo = require('../../../utils/merchantDemo');
const { countPendingPickupTasks } = require('../../../utils/pickupManage');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');
const { startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../../utils/orderRefresh');

function parseStaffInviteStoreId(options) {
  if (!options) return '';
  const flag = options.staff_invite;
  const isInvite = flag === '1' || flag === 1 || flag === true || flag === 'true';
  const storeId = String(options.store_id || '').trim();
  return isInvite && storeId ? storeId : '';
}

Page({
  data: {
    isDemoMode: false,
    isPendingReview: false,
    isStoreOwner: false,
    shop: {},
    boardingList: [],
    staffCount: 0,
    pendingOrderCount: 0,
    pickupPendingCount: 0,
    uncheckedPetCount: 0
  },

  onLoad(options) {
    hideHomeButton();
    enableStoreShareMenu();
    const inviteFromOptions = parseStaffInviteStoreId(options);
    if (inviteFromOptions && !app.shouldIgnoreShareEntry()) {
      this._staffInviteStoreId = inviteFromOptions;
      app.globalData.pendingStaffInviteStoreId = inviteFromOptions;
    } else {
      this._staffInviteStoreId = '';
      if (inviteFromOptions) {
        app.globalData.pendingStaffInviteStoreId = '';
      }
    }
    const shop = app.getShop();
    if (shop && shop.store_id) {
      app.globalData.merchantStoreId = shop.store_id;
      this.setData({ shop });
    }
  },

  onShow() {
    hideHomeButton();
    app.ensureCloudAndLogin().then(() => {
      const inviteId = this._staffInviteStoreId
        || app.globalData.pendingStaffInviteStoreId
        || parseStaffInviteStoreId(this._getPageEntryQuery());

      if (inviteId && !app.shouldIgnoreShareEntry()) {
        this._staffInviteStoreId = '';
        app.globalData.pendingStaffInviteStoreId = '';
        return app.acceptStaffInvite(inviteId).then(() => this._bootstrapPage());
      }

      if (inviteId && app.shouldIgnoreShareEntry()) {
        this._staffInviteStoreId = '';
        app.globalData.pendingStaffInviteStoreId = '';
      }

      if (app.isUserClientMode && app.isUserClientMode()) {
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }

      if (!app.canAccessMerchantBackend()) {
        wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
        return;
      }

      return this._bootstrapPage();
    });
    startMerchantOrdersPoll(this, () => {
      if (!app.canAccessMerchantBackend() || app.isMerchantDemoMode()) return Promise.resolve();
      return app.loadOrders({ force: true }).then(() => {
        const shop = app.getShop();
        if (!shop || !shop.store_id) return;
        return this._applyBoardingData(shop);
      });
    });
  },

  onHide() {
    stopMerchantOrdersPoll(this);
  },

  onUnload() {
    stopMerchantOrdersPoll(this);
  },

  _getPageEntryQuery() {
    try {
      const enter = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
      const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
      const enterQuery = (enter && enter.query) || {};
      const launchQuery = (launch && launch.query) || {};
      return {
        staff_invite: enterQuery.staff_invite || launchQuery.staff_invite,
        store_id: enterQuery.store_id || launchQuery.store_id
      };
    } catch (err) {
      return {};
    }
  },

  onPullDownRefresh() {
    if (this.data.isDemoMode) {
      merchantDemo.ensureDemoData();
      const shop = merchantDemo.getDemoShop();
      app.globalData.merchantStoreId = shop.store_id;
      this.setData({ shop, staffCount: 0 });
      this._applyBoardingData(shop).finally(() => wx.stopPullDownRefresh());
      return;
    }

    if (!app.canAccessMerchantBackend()) {
      wx.stopPullDownRefresh();
      return;
    }

    app.refreshMerchantStore()
      .then((shop) => {
        if (!shop || !shop.store_id) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return null;
        }
        this.setData({ shop, isStoreOwner: app.isStoreOwner() });
        return Promise.all([
          app.loadOrders({ force: true }),
          app.loadPets({ force: true }),
          this._loadStaffCount()
        ]).then(() => shop);
      })
      .then((shop) => {
        if (!shop) return;
        return this._applyBoardingData(shop);
      })
      .then(() => {
        wx.showToast({ title: '已刷新', icon: 'success' });
      })
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  _bootstrapPage() {
    const isDemoMode = app.isMerchantDemoMode();
    const isPendingReview = app.isMerchantPending();
    this.setData({ isDemoMode, isPendingReview });

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      const shop = merchantDemo.getDemoShop();
      app.globalData.merchantStoreId = shop.store_id;
      this.setData({ shop, staffCount: 0, isStoreOwner: false });
      return this._applyBoardingData(shop);
    }

    const cachedShop = app.getShop();
    if (cachedShop && cachedShop.store_id && !isPendingReview) {
      this.setData({ shop: cachedShop, isStoreOwner: app.isStoreOwner() });
      this._applyBoardingData(cachedShop);
    }

    return app.ensureMerchantStore()
      .then((shop) => {
        const isStoreOwner = app.isStoreOwner();
        if (!shop || !shop.store_id) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return null;
        }
        this.setData({ shop, isStoreOwner });
        if (isPendingReview) {
          this.setData({
            boardingList: [],
            pendingOrderCount: 0,
            pickupPendingCount: 0,
            uncheckedPetCount: 0,
            staffCount: 0
          });
          return null;
        }
        this._loadStaffCount();
        return app.loadOrders().then(() => shop);
      })
      .then((shop) => {
        if (!shop || !shop.store_id) return;
        return this._applyBoardingData(shop);
      });
  },

  _applyBoardingData(shop) {
    const storeShop = shop || app.getShop();
    const orders = app.getOrders();
    const pendingOrderCount = badgeUtil.countMerchantPendingOrders(orders);
    const pickupPendingCount = countPendingPickupTasks(orders);
    const pets = app.getPets();
    const boardingOrders = orders.filter((o) => o.status === 'boarding');
    const orderIds = boardingOrders.map((o) => o.id || o.order_id).filter(Boolean);

    const finish = (logs) => {
      const boardingList = buildBoardingListWithDailyStats(boardingOrders, pets, logs);
      this.setData({
        shop: storeShop,
        boardingList,
        pendingOrderCount,
        pickupPendingCount,
        uncheckedPetCount: countUncheckedBoardingPets(boardingList)
      });
    };

    if (app.isMerchantDemoMode()) {
      finish(merchantDemo.getDemoDailyLogs());
      return Promise.resolve();
    }

    if (!orderIds.length) {
      finish([]);
      return Promise.resolve();
    }

    const dailyApi = require('../../../utils/daily');
    return dailyApi.fetchDailyLogsForOrders(orderIds)
      .then((logs) => finish(logs || []))
      .catch(() => finish([]));
  },

  _loadStaffCount() {
    if (!this.data.isStoreOwner || this.data.isDemoMode) {
      this.setData({ staffCount: 0 });
      return Promise.resolve();
    }
    return storeApi.listStoreStaff()
      .then((res) => {
        if (res && res.success) {
          this.setData({ staffCount: (res.staff || []).length });
        }
      })
      .catch(() => {});
  },

  onShareAppMessage(res) {
    if (this.data.isDemoMode) {
      return { title: '萌宠寄养体验', path: '/pages/index/index' };
    }
    const shareType = res && res.target && res.target.dataset && res.target.dataset.shareType;
    if (shareType === 'staff') {
      if (!this.data.isStoreOwner) {
        wx.showToast({ title: '仅负责人可邀请员工', icon: 'none' });
        return buildMerchantShareConfig(this);
      }
      return buildStaffShareConfig(this);
    }
    return buildMerchantShareConfig(this);
  },

  onShareTimeline() {
    if (this.data.isDemoMode) {
      return { title: '萌宠寄养体验' };
    }
    return buildMerchantTimelineShareConfig(this);
  },

  onGoStaffManage() {
    if (!this.data.isStoreOwner) {
      wx.showToast({ title: '仅负责人可管理员工', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/merchant/staff-manage/staff-manage' });
  },

  _guardMerchantFeature() {
    if (this.data.isPendingReview) {
      wx.showToast({ title: '入驻审核中，请耐心等待', icon: 'none' });
      return false;
    }
    return true;
  },

  onGoMerchantOrders() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/pages/merchant/orders/orders' });
  },
  onGoDailyCheck() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/pages/merchant/daily-check/daily-check' });
  },
  onGoDailyCheckForOrder(e) {
    if (!this._guardMerchantFeature()) return;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/merchant/daily-check/daily-check?orderId=' + id });
  },
  onGoPickupManage() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/pages/merchant/pickup-manage/pickup-manage' });
  },
  onGoDailyLogs() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/pages/merchant/daily-logs/daily-logs' });
  },
  onGoDetail(e) {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/pages/merchant/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },
  onTabDaily() {},
  onTabStatistics() {
    wx.redirectTo({ url: '/pages/merchant/tab-statistics/tab-statistics' });
  },
  onTabStore() { wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' }); },
  onAdminSecretTap() {
    handlePageSecretTap(this);
  }
});
