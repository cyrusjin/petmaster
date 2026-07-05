const app = getApp();
const merchantDemo = require('../../../utils/merchantDemo');
const { PERIOD_OPTIONS, buildMerchantStatistics } = require('../../../utils/merchantStats');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');

Page({
  data: {
    loading: true,
    isDemoMode: false,
    periodKey: 'month',
    periodLabel: '本月',
    periodTabs: PERIOD_OPTIONS,
    summary: {},
    kpis: [],
    composition: {},
    orderStats: {},
    recentOrders: [],
    updatedAt: ''
  },

  onLoad() {
    hideHomeButton();
  },

  onShow() {
    hideHomeButton();
    if (app.isUserClientMode && app.isUserClientMode()) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    this._loadStats();
  },

  onPullDownRefresh() {
    this._loadStats().finally(() => wx.stopPullDownRefresh());
  },

  onPeriodTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.periodKey) return;
    this.setData({ periodKey: key });
    this._applyStats(app.getOrders());
  },

  onGoOrders() {
    wx.navigateTo({ url: '/pages/merchant/orders/orders' });
  },

  onGoOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/merchant/order-detail/order-detail?id=${id}` });
  },

  onTabDaily() {
    wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' });
  },
  onTabStatistics() {},
  onTabStore() {
    wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
  },
  onAdminSecretTap() {
    handlePageSecretTap(this);
  },

  _loadStats() {
    this.setData({ loading: true });
    const isDemoMode = app.isMerchantDemoMode();
    this.setData({ isDemoMode });

    const finish = () => {
      this._applyStats(app.getOrders());
      this.setData({ loading: false });
    };

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      finish();
      return Promise.resolve();
    }

    if (!app.canAccessMerchantBackend()) {
      finish();
      return Promise.resolve();
    }

    return app.ensureMerchantStore()
      .then(() => app.loadOrders({ force: true }))
      .then(finish)
      .catch(finish);
  },

  _applyStats(orders) {
    const stats = buildMerchantStatistics(orders, this.data.periodKey);
    this.setData({
      summary: stats.summary,
      kpis: stats.kpis,
      composition: stats.composition,
      orderStats: stats.orderStats,
      recentOrders: stats.recentOrders,
      updatedAt: stats.updatedAt,
      periodLabel: stats.periodLabel
    });
  }
});
