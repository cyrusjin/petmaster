const app = getApp();
const { dedupeDailyLogs } = require('../../../utils/dailyLogUtil');
const { previewImages, previewVideo } = require('../../../utils/dailyPreview');
const { resolveVideoUrl } = require('../../../utils/mediaUrl');
const { refreshSingleOrder } = require('../../../utils/orderRefresh');

Page({
  data: { order: null, logs: [] },

  onLoad(opts) {
    this.orderId = opts.id;
    this._applyOrderFromCache();
    this._loadLogs({ force: false });
  },

  onPullDownRefresh() {
    Promise.all([
      refreshSingleOrder(app, this.orderId, { force: true }),
      this._loadLogs({ force: true })
    ])
      .then(() => this._applyOrderFromCache())
      .finally(() => wx.stopPullDownRefresh());
  },

  _applyOrderFromCache() {
    const pets = app.getPets();
    const order = app.getOrders().find((o) => o.id === this.orderId);
    if (!order) return;
    const pet = pets.find((p) => p.id === order.petId);
    this.setData({
      order: {
        ...order,
        petPhoto: pet ? pet.photo : ''
      }
    });
  },

  _loadLogs({ force } = {}) {
    const cached = dedupeDailyLogs(app.getDailyLogs().filter((log) => (
      log.orderId === this.orderId || log.order_id === this.orderId
    )));
    if (cached.length && !force) {
      this._setLogs(cached);
    }

    return app.ensureCloudAndLogin({ silent: !force })
      .then(() => app.loadDailyLogs(this.orderId))
      .then((logs) => this._setLogs(logs || []))
      .catch(() => {});
  },

  _setLogs(logs) {
    const sorted = dedupeDailyLogs(logs || []);
    return Promise.all(sorted.map((log) => {
      if (log.videoUrl || !log.video) {
        return { ...log, videoUrl: log.videoUrl || '' };
      }
      return resolveVideoUrl(log.video).then((videoUrl) => ({
        ...log,
        videoUrl: videoUrl || ''
      }));
    })).then((resolved) => {
      this.setData({ logs: resolved });
    });
  },

  onPreviewImage(e) {
    const logIndex = e.currentTarget.dataset.logIndex;
    const url = e.currentTarget.dataset.url;
    const log = this.data.logs[logIndex];
    if (!log || !url) return;
    previewImages(url, log.images || []);
  },

  onPreviewVideo(e) {
    const logIndex = e.currentTarget.dataset.logIndex;
    const log = this.data.logs[logIndex];
    if (!log) return;
    previewVideo(log.videoUrl || log.video);
  }
});
