const app = getApp();
const util = require('../../../utils/util');
const dailyMedia = require('../../../utils/dailyMedia');
const dailyApi = require('../../../utils/daily');
const merchantDemo = require('../../../utils/merchantDemo');
const { buildDailyCheckOrderOptions } = require('../../../utils/dailyStats');
const { showValidationAlert } = require('../../../utils/formAlert');
const { refreshMerchantOrders } = require('../../../utils/orderRefresh');

function getDefaultCheckItems() {
  return [
    { key: 'feed', label: '喂食', icon: '🍖', checked: false },
    { key: 'water', label: '饮水', icon: '💧', checked: false },
    { key: 'walk', label: '遛弯', icon: '🚶', checked: false },
    { key: 'poop', label: '排便', icon: '💩', checked: false },
    { key: 'play', label: '玩耍', icon: '🎾', checked: false },
    { key: 'medicine', label: '喂药', icon: '💊', checked: false },
    { key: 'care', label: '护理', icon: '🛁', checked: false },
    { key: 'clean', label: '清洁', icon: '🧹', checked: false },
    { key: 'spirit', label: '精神状态', icon: '😊', checked: true }
  ];
}

function getMediaStats(mediaList) {
  const list = mediaList || [];
  const imageCount = list.filter((item) => item.type === 'image').length;
  const hasVideo = list.some((item) => item.type === 'video');
  return {
    imageCount,
    hasVideo,
    canAddMedia: imageCount < 9 || !hasVideo
  };
}

function splitMediaList(mediaList) {
  const images = [];
  let video = '';
  (mediaList || []).forEach((item) => {
    if (item.type === 'video' && !video) {
      video = item.path;
    } else if (item.type === 'image') {
      images.push(item.path);
    }
  });
  return { images, video };
}

function createMediaId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

Page({
  data: {
    orderOptions: [],
    selectedCount: 0,
    checkItems: getDefaultCheckItems(),
    desc: '',
    mediaList: [],
    canAddMedia: true,
    submitting: false,
    loadingPets: false
  },

  onLoad(options) {
    this._prefillOrderId = (options && options.orderId) || '';
    this._selectedOrderIds = [];
  },

  onShow() {
    if (app.canAccessMerchantBackend()) {
      this._applyFromCache();
    }
    this._refreshData({ force: false });
  },

  onPullDownRefresh() {
    this._refreshData({ force: true })
      .finally(() => wx.stopPullDownRefresh());
  },

  _applyFromCache(logs) {
    const boardingOrders = app.getOrders().filter((o) => o.status === 'boarding');
    const selectedSet = new Set(this._selectedOrderIds);
    if (this._prefillOrderId) {
      selectedSet.add(this._prefillOrderId);
    }
    const orderOptions = buildDailyCheckOrderOptions(boardingOrders, logs || [], {
      selectedIds: [...selectedSet]
    });
    this._selectedOrderIds = orderOptions.filter((item) => item.selected).map((item) => item.id);
    if (this._prefillOrderId) {
      this._prefillOrderId = '';
    }
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length,
      loadingPets: false
    });
  },

  _refreshData({ force } = {}) {
    if (this._loadingPets && !force) return Promise.resolve();
    this._loadingPets = true;
    if (!this.data.orderOptions.length) {
      this.setData({ loadingPets: true });
    }

    return app.ensureCloudAndLogin({ silent: !force }).then(() => {
      if (!app.canAccessMerchantBackend()) return null;
      if (app.isMerchantDemoMode()) {
        merchantDemo.ensureDemoData();
        return refreshMerchantOrders(app, { force });
      }
      if (!app.isMerchantPending()) {
        dailyApi.initDatabase().catch(() => {});
      }
      return refreshMerchantOrders(app, { force });
    }).then(() => {
      if (!app.canAccessMerchantBackend()) return;
      const boardingOrders = app.getOrders().filter((o) => o.status === 'boarding');
      const orderIds = boardingOrders.map((o) => o.id).filter(Boolean);

      if (app.isMerchantDemoMode()) {
        this._applyFromCache(merchantDemo.getDemoDailyLogs());
        return;
      }

      if (!orderIds.length) {
        this._applyFromCache([]);
        return;
      }

      return dailyApi.fetchDailyLogsForOrders(orderIds)
        .then((logs) => this._applyFromCache(logs || []))
        .catch(() => this._applyFromCache([]));
    }).finally(() => {
      this._loadingPets = false;
      this.setData({ loadingPets: false });
    });
  },

  getSelectedOrders() {
    const ids = new Set(this._selectedOrderIds);
    return app.getOrders().filter((order) => ids.has(order.id));
  },

  onToggleOrder(e) {
    const id = e.currentTarget.dataset.id;
    const orderOptions = this.data.orderOptions.map((item) => (
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
    this._selectedOrderIds = orderOptions.filter((item) => item.selected).map((item) => item.id);
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length
    });
  },

  onSelectAll() {
    const allSelected = this.data.selectedCount === this.data.orderOptions.length;
    const orderOptions = this.data.orderOptions.map((item) => ({
      ...item,
      selected: !allSelected
    }));
    this._selectedOrderIds = allSelected ? [] : orderOptions.map((item) => item.id);
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length
    });
  },

  onToggleCheck(e) {
    const key = e.currentTarget.dataset.key;
    const items = this.data.checkItems.map((item) => (
      item.key === key ? { ...item, checked: !item.checked } : item
    ));
    this.setData({ checkItems: items });
  },

  onDesc(e) {
    this.setData({ desc: e.detail.value });
  },

  onChooseMedia() {
    const mediaList = this.data.mediaList || [];
    const { imageCount, hasVideo } = getMediaStats(mediaList);
    const imageSlots = 9 - imageCount;
    const videoSlots = hasVideo ? 0 : 1;
    if (imageSlots <= 0 && videoSlots <= 0) return;

    const count = Math.min(9, imageSlots + videoSlots);
    const mediaType = imageSlots > 0 && videoSlots > 0
      ? ['image', 'video']
      : (imageSlots > 0 ? ['image'] : ['video']);

    wx.chooseMedia({
      count,
      mediaType,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 60,
      compressed: true,
      success: (res) => {
        const nextList = [...mediaList];
        let nextImageCount = imageCount;
        let nextHasVideo = hasVideo;

        (res.tempFiles || []).forEach((file) => {
          if (file.fileType === 'video') {
            if (nextHasVideo) return;
            nextList.push({
              id: createMediaId('video'),
              type: 'video',
              path: file.tempFilePath,
              thumb: file.thumbTempFilePath || file.tempFilePath
            });
            nextHasVideo = true;
            return;
          }
          if (nextImageCount >= 9) return;
          nextList.push({
            id: createMediaId('image'),
            type: 'image',
            path: file.tempFilePath,
            thumb: file.tempFilePath
          });
          nextImageCount += 1;
        });

        const stats = getMediaStats(nextList);
        this.setData({
          mediaList: nextList,
          canAddMedia: stats.canAddMedia
        });
      }
    });
  },

  onRemoveMedia(e) {
    const id = e.currentTarget.dataset.id;
    const mediaList = (this.data.mediaList || []).filter((item) => item.id !== id);
    const stats = getMediaStats(mediaList);
    this.setData({
      mediaList,
      canAddMedia: stats.canAddMedia
    });
  },

  resetForm() {
    this.setData({
      desc: '',
      mediaList: [],
      canAddMedia: true,
      checkItems: getDefaultCheckItems()
    });
  },

  onSubmit() {
    if (this.data.submitting) return;

    const selectedOrders = this.getSelectedOrders();
    if (!selectedOrders.length) {
      showValidationAlert('请选择宠物');
      return;
    }

    const { checkItems, mediaList } = this.data;
    const checks = checkItems.filter((item) => item.checked).map((item) => item.label);
    if (!checks.length) {
      wx.showModal({
        title: '提示',
        content: '请至少选择一项打卡项目',
        showCancel: false,
        confirmColor: '#E98657'
      });
      return;
    }

    if (!mediaList.length) {
      showValidationAlert('请上传照片或视频');
      return;
    }

    this.doSubmit(selectedOrders);
  },

  doSubmit(selectedOrders) {
    if (this.data.submitting) return;

    const { checkItems, desc, mediaList } = this.data;
    const { images, video } = splitMediaList(mediaList);
    const checks = checkItems.filter((item) => item.checked).map((item) => item.label);
    const shop = app.getShop() || {};
    const storeId = shop.store_id || app.globalData.merchantStoreId || '';
    const uploadOrderId = selectedOrders[0].id;
    const time = util.formatDateTime(new Date());

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    const submitLogs = (cloudImages, cloudVideo) => {
      wx.showLoading({ title: '提交中', mask: true });
      const tasks = selectedOrders.map((order) => app.saveDailyLog({
        orderId: order.id,
        petName: order.petName,
        checks,
        description: desc,
        images: cloudImages,
        video: cloudVideo,
        notifyOwner: false,
        isAbnormal: false,
        time
      }));
      return Promise.all(tasks);
    };

    const uploadPromise = app.isMerchantDemoMode()
      ? Promise.resolve({ images, video })
      : dailyMedia.uploadDailyMedia(images, video, storeId, uploadOrderId);

    uploadPromise
      .then(({ images: cloudImages, video: cloudVideo }) => submitLogs(cloudImages, cloudVideo))
      .then(() => {
        wx.hideLoading();
        wx.showToast({
          title: selectedOrders.length > 1 ? `已为${selectedOrders.length}只宠物打卡` : '打卡成功',
          icon: 'success'
        });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' });
        }, 600);
      })
      .catch((err) => {
        wx.hideLoading();
        const message = (err && err.message) || (err && err.errMsg) || '打卡失败';
        wx.showToast({ title: message, icon: 'none', duration: 3000 });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  }
});
