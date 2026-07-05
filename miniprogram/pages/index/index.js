const app = getApp();
const { guardUserTabPage } = require('../../utils/shell');
const { buildStoreShareConfig, buildTimelineShareConfig, enableStoreShareMenu, resolveShareStoreId } = require('../../utils/storeShare');
const storeDebug = require('../../utils/storeDebug');
const { refreshUserOrders } = require('../../utils/orderRefresh');

Page({
  data: {
    userInfo: {},
    currentStore: null,
    boardingPets: []
  },

  _syncUserTabBar(index) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (tabBar) tabBar.setData({ selected: index });
  },

  _syncNavTitle(currentStore) {
    const name = currentStore && currentStore.name ? String(currentStore.name).trim() : '';
    wx.setNavigationBarTitle({ title: name || '宠物寄养' });
  },

  onLoad(options) {
    enableStoreShareMenu();
    storeDebug.logEntryOptions('首页 onLoad', options);

    const sceneStoreId = options.scene ? decodeURIComponent(String(options.scene)) : '';
    const storeId = options.store_id || (sceneStoreId.startsWith('store_') ? sceneStoreId : '');

    storeDebug.log('首页 onLoad 解析 store_id', {
      fromQuery: options.store_id || '',
      fromScene: sceneStoreId,
      resolved: storeId || '(无)'
    });

    if (storeId) {
      if (app.shouldIgnoreShareEntry && app.shouldIgnoreShareEntry()) {
        storeDebug.logStoreState('首页 onLoad 商家身份忽略客人链接', app);
        return;
      }
      app.enterUserStore(storeId).then(() => this._refreshPage());
    } else {
      storeDebug.logStoreState('首页 onLoad', app);
    }
  },

  onShow() {
    this._syncUserTabBar(0);
    storeDebug.log('首页 onShow');
    if (guardUserTabPage()) return;

    this._refreshPageFromCache();

    const enterOptions = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    const entryStoreId = app.extractStoreIdFromOptions(enterOptions)
      || app.extractStoreIdFromOptions(launchOptions);

    if (entryStoreId) {
      if (app.shouldIgnoreShareEntry && app.shouldIgnoreShareEntry()) {
        storeDebug.log('首页 onShow 商家身份忽略客人链接', { entryStoreId });
        return refreshUserOrders(app, { force: false }).then(() => {
          this._refreshPage();
        });
      }
      storeDebug.log('首页 onShow 检测到 store_id', { entryStoreId });
      app.enterUserStore(entryStoreId).then(() => this._refreshPage());
      return;
    }

    app.ensureCloudAndLogin({ silent: true }).then(() => {
      if (guardUserTabPage()) return;
      if (app.isUserClientMode && app.isUserClientMode()) {
        const storeId = app.getStoreId();
        if (storeId && !app.getCurrentStore()) {
          return app.bindStore(storeId, { syncUser: false })
            .then(() => refreshUserOrders(app, { force: false }))
            .finally(() => {
              this._refreshPage();
            });
        }
      }
      return refreshUserOrders(app, { force: false }).then(() => {
        this._refreshPage();
      });
    });
  },

  onPullDownRefresh() {
    if (guardUserTabPage()) {
      wx.stopPullDownRefresh();
      return;
    }
    refreshUserOrders(app, { force: true })
      .then(() => this._refreshPage())
      .catch((err) => {
        console.error('[首页] 下拉刷新失败', err);
        this._refreshPageFromCache();
      })
      .finally(() => wx.stopPullDownRefresh());
  },

  _refreshPageFromCache() {
    const userInfo = app.globalData.userInfo || { nickName: '微信用户', avatarUrl: '' };
    const pets = app.getPets();
    const storeId = app.getStoreId();
    const currentStore = app.getUserStoreView();
    const orders = app.getOrders()
      .filter((o) => !storeId || o.store_id === storeId)
      .filter((o) => o.status === 'boarding' || o.status === 'awaiting_arrival')
      .map((o) => {
        const pet = pets.find((p) => p.id === o.petId);
        return { ...o, petPhoto: pet ? pet.photo : '' };
      });
    this.setData({ userInfo, currentStore, boardingPets: orders });
    this._syncNavTitle(currentStore);
  },

  _refreshPage() {
    app.getUserStoreViewDisplay().then((currentStore) => {
        const userInfo = app.globalData.userInfo || { nickName: '微信用户', avatarUrl: '' };
        const pets = app.getPets();
        const storeId = app.getStoreId();
        storeDebug.logStoreState('首页 _refreshPage', app);
        storeDebug.log('首页店铺信息', {
          storeId,
          storeName: currentStore?.name || '',
          storeStatus: currentStore?.status || '',
          photoCount: (currentStore && currentStore.storePhotos && currentStore.storePhotos.length) || 0
        });
        const orders = app.getOrders()
          .filter((o) => !storeId || o.store_id === storeId)
          .filter((o) => o.status === 'boarding' || o.status === 'awaiting_arrival')
          .map((o) => {
            const pet = pets.find((p) => p.id === o.petId);
            return { ...o, petPhoto: pet ? pet.photo : '' };
          });
        this.setData({ userInfo, currentStore, boardingPets: orders });
        this._syncNavTitle(currentStore);
      });
  },

  onPreviewStorePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.currentStore && this.data.currentStore.storePhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onOpenStoreLocation() {
    const store = this.data.currentStore;
    if (!store || !store.hasLocation) {
      if (store && store.address) {
        wx.showToast({ title: '暂无地图定位，请联系商家', icon: 'none' });
      }
      return;
    }
    wx.openLocation({
      latitude: parseFloat(store.latitude),
      longitude: parseFloat(store.longitude),
      name: store.name || '店铺',
      address: store.address || '',
      scale: 18
    });
  },

  onCallStore(e) {
    const phone = String(e.currentTarget.dataset.phone || '').trim();
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onGoReserve() {
    if (!app.getStoreId()) {
      wx.showToast({ title: '请先通过店铺分享链接进入', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/user/reserve/reserve' });
  },
  onGoPets() { wx.navigateTo({ url: '/pages/user/pets/pets' }); },
  onGoDaily(e) { wx.navigateTo({ url: '/pages/user/pet-daily/pet-daily?id=' + e.currentTarget.dataset.id }); },

  onShareAppMessage() {
    const store = app.getUserStoreView() || app.getShop() || {};
    const storeId = app.getShareStoreId();
    const config = buildStoreShareConfig(store, storeId);
    storeDebug.logShareConfig(storeId ? '转发好友' : '转发好友-无店铺', config);
    return config;
  },

  onShareTimeline() {
    const store = app.getUserStoreView() || app.getShop() || {};
    const storeId = app.getShareStoreId();
    const config = buildTimelineShareConfig(store, storeId);
    storeDebug.logShareConfig(storeId ? '朋友圈' : '朋友圈-无店铺', config);
    return config;
  }
});
