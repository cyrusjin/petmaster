const app = getApp();
const { groupLogsByDate } = require('../../../utils/dailyTimeline');
const { dedupeDailyLogs } = require('../../../utils/dailyLogUtil');
const { previewImages, previewVideo } = require('../../../utils/dailyPreview');
const merchantDemo = require('../../../utils/merchantDemo');
const dailyApi = require('../../../utils/daily');
const { refreshMerchantOrders } = require('../../../utils/orderRefresh');

function enrichLogs(logs, orders, pets) {
  return dedupeDailyLogs(logs || []).map((log) => {
    const order = orders.find((item) => item.id === log.orderId || item.id === log.order_id);
    const pet = order ? pets.find((item) => item.id === order.petId) : null;
    return {
      ...log,
      petPhoto: pet ? pet.photo : '',
      petName: log.petName || (order ? order.petName : '未知宠物'),
      videoUrl: log.videoUrl || log.video || ''
    };
  });
}

Page({
  data: {
    loading: true,
    timeline: []
  },

  onShow() {
    app.ensureCloudAndLogin({ silent: true }).then(() => {
      if (!app.canAccessMerchantBackend()) {
        wx.navigateBack();
        return;
      }
      if (app.getOrders().length) {
        this._renderFromCache();
      }
      this.loadLogs({ force: false });
    });
  },

  onPullDownRefresh() {
    this.loadLogs({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  _renderFromCache(logs) {
    const orders = app.getOrders();
    const pets = app.getPets();
    const timeline = groupLogsByDate(enrichLogs(logs || [], orders, pets));
    this.setData({ timeline, loading: false });
  },

  loadLogs({ force } = {}) {
    const showLoading = force || !this.data.timeline.length;
    if (showLoading) {
      this.setData({ loading: true });
    }

    if (app.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      const logs = merchantDemo.getDemoDailyLogs();
      this._renderFromCache(logs);
      return Promise.resolve();
    }

    return refreshMerchantOrders(app, { force })
      .then(() => {
        const boardingOrders = app.getOrders().filter((o) => o.status === 'boarding');
        const orderIds = boardingOrders.map((item) => item.id || item.order_id).filter(Boolean);
        if (!orderIds.length) {
          return [];
        }
        return dailyApi.fetchDailyLogsForOrders(orderIds);
      })
      .then((logs) => {
        this._renderFromCache(logs || []);
      })
      .catch(() => {
        if (!this.data.timeline.length) {
          this.setData({ loading: false, timeline: [] });
        }
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  onPreviewImage(e) {
    const { groupIndex, logIndex, url } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log || !url) return;
    previewImages(url, log.images || []);
  },

  onPreviewVideo(e) {
    const { groupIndex, logIndex } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log) return;
    previewVideo(log.videoUrl || log.video);
  }
});
