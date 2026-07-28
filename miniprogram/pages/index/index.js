const app = getApp();
const { guardUserTabPage } = require('../../utils/shell');
const { buildStoreShareConfig, buildTimelineShareConfig, resolveShareStoreId } = require('../../utils/storeShare');
const storeDebug = require('../../utils/storeDebug');
const { refreshUserOrders } = require('../../utils/orderRefresh');
const { resolveEntryStoreId, enterStoreAndRefresh } = require('../../utils/storeEntry');
const { formatOrderCreateTime } = require('../../utils/util');
const { isAuthorizedNickName, getDisplayNickName } = require('../../utils/userAuth');

Page({
  data: {
    userInfo: {},
    displayNickName: '小主',
    needsNickName: false,
    nickNameInput: '',
    currentStore: null,
    boardingPets: [],
    petsCount: 0,
    previewPets: [],
    petsMoreCount: 0,
    petPreviewSize: 'single'
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

  _getEntryContext() {
    const enterOptions = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    const storeId = resolveEntryStoreId(app, enterOptions)
      || resolveEntryStoreId(app, launchOptions);
    return { storeId, enterOptions, launchOptions };
  },

  _applyStoreEntry(storeId, options) {
    if (!storeId) return Promise.resolve();
    if (app.shouldIgnoreShareEntry && app.shouldIgnoreShareEntry()) {
      storeDebug.log('首页 忽略客人店铺入口', { storeId });
      return refreshUserOrders(app, { force: false }).then(() => this._refreshPage());
    }
    if (this._storeEntryPromise && this._storeEntryId === storeId) {
      return this._storeEntryPromise;
    }
    this._storeEntryId = storeId;
    this._storeEntryPromise = enterStoreAndRefresh(app, storeId, options)
      .then(() => this._refreshPage())
      .finally(() => {
        this._storeEntryPromise = null;
      });
    return this._storeEntryPromise;
  },

  onLoad(options) {
    storeDebug.logEntryOptions('首页 onLoad', options);

    const sceneStoreId = options.scene ? decodeURIComponent(String(options.scene)) : '';
    const storeId = options.store_id || (sceneStoreId.startsWith('store_') ? sceneStoreId : '');

    storeDebug.log('首页 onLoad 解析 store_id', {
      fromQuery: options.store_id || '',
      fromScene: sceneStoreId,
      resolved: storeId || '(无)'
    });

    // 先用缓存铺屏，避免等网络时白屏
    this._refreshPageFromCache();

    if (storeId) {
      this._applyStoreEntry(storeId, { query: options });
      return;
    }
    storeDebug.logStoreState('首页 onLoad', app);
  },

  onShow() {
    this._syncUserTabBar(0);
    storeDebug.log('首页 onShow');
    if (guardUserTabPage()) return;

    // 始终先渲染缓存，再静默刷新
    this._refreshPageFromCache();

    const { storeId, enterOptions } = this._getEntryContext();
    if (storeId) {
      storeDebug.log('首页 onShow 检测到 store_id', { storeId });
      this._applyStoreEntry(storeId, enterOptions);
      return;
    }

    app.ensureCloudAndLogin({ silent: true }).then(() => {
      if (guardUserTabPage()) return;
      if (app.isUserClientMode && app.isUserClientMode()) {
        const cachedStoreId = app.getStoreId();
        if (cachedStoreId && !app.getCurrentStore()) {
          return app.bindStore(cachedStoreId, { syncUser: false, force: false })
            .then(() => Promise.all([
              refreshUserOrders(app, { force: false, skipDailyLogs: true }),
              app.loadPets({ force: false })
            ]))
            .finally(() => {
              this._refreshPage();
            });
        }
      }
      return Promise.all([
        refreshUserOrders(app, { force: false, skipDailyLogs: true }),
        app.loadPets({ force: false })
      ]).then(() => {
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

  _buildUserViewState(userInfo) {
    const user = userInfo || {};
    const needsNickName = !isAuthorizedNickName(user.nickName);
    return {
      userInfo: user,
      displayNickName: getDisplayNickName(user),
      needsNickName,
      nickNameInput: needsNickName ? '' : user.nickName
    };
  },

  _hashSeed(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  },

  _buildPetPreview(pets) {
    const list = Array.isArray(pets) ? pets : [];
    const maxShow = 3;
    const sliced = list.slice(0, maxShow);
    const count = sliced.length;
    const sizeMap = { 0: 'single', 1: 'single', 2: 'double', 3: 'triple' };

    // 第一只固定在初始位置；第 2 只起在区域内水平随机选槽（位置按 id 稳定）
    const firstFixed = { top: 116, right: 36 };
    const extraSlots = [
      { top: 48, left: 210 },
      { top: 52, left: 280 },
      { top: 44, left: 340 },
      { top: 178, left: 200 },
      { top: 186, left: 270 },
      { top: 172, left: 330 },
      { top: 100, left: 220 },
      { top: 196, left: 380 }
    ];

    const usedSlotIndexes = new Set();
    const previewPets = sliced.map((pet, index) => {
      if (index === 0) {
        return {
          ...pet,
          cardStyle: `top:${firstFixed.top}rpx;right:${firstFixed.right}rpx;z-index:4;`
        };
      }

      const seed = this._hashSeed(pet.id || pet.name || index);
      let slotIndex = seed % extraSlots.length;
      let guard = 0;
      while (usedSlotIndexes.has(slotIndex) && guard < extraSlots.length) {
        slotIndex = (slotIndex + 1) % extraSlots.length;
        guard += 1;
      }
      usedSlotIndexes.add(slotIndex);
      const slot = extraSlots[slotIndex];
      return {
        ...pet,
        cardStyle: `top:${slot.top}rpx;left:${slot.left}rpx;z-index:${3 + index};`
      };
    });

    return {
      petsCount: list.length,
      previewPets,
      petsMoreCount: Math.max(0, list.length - maxShow),
      petPreviewSize: sizeMap[count] || 'triple'
    };
  },

  _applyPageData(payload) {
    this.setData({
      ...this._buildUserViewState(payload.userInfo),
      currentStore: payload.currentStore,
      boardingPets: payload.boardingPets,
      petsCount: payload.petsCount,
      previewPets: payload.previewPets || [],
      petsMoreCount: payload.petsMoreCount || 0,
      petPreviewSize: payload.petPreviewSize || 'single'
    });
    this._syncNavTitle(payload.currentStore);
  },

  _refreshPageFromCache() {
    const userInfo = app.globalData.userInfo || {};
    const pets = app.getPets();
    const storeId = app.getStoreId();
    const currentStore = app.getUserStoreView();
    const orders = app.getOrders()
      .filter((o) => !storeId || o.store_id === storeId)
      .filter((o) => o.status === 'boarding' || o.status === 'awaiting_arrival')
      .map((o) => {
        const pet = pets.find((p) => p.id === o.petId);
        return {
          ...o,
          petPhoto: pet ? pet.photo : '',
          createTimeText: formatOrderCreateTime(o) || '--'
        };
      });
    this._applyPageData({
      userInfo,
      currentStore,
      boardingPets: orders,
      ...this._buildPetPreview(pets)
    });
  },

  _refreshPage() {
    // 先用本地店铺视图出字，图片解析完成后再增量更新
    this._refreshPageFromCache();
    app.getUserStoreViewDisplay().then((currentStore) => {
        const userInfo = app.globalData.userInfo || {};
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
            return {
              ...o,
              petPhoto: pet ? pet.photo : '',
              createTimeText: formatOrderCreateTime(o) || '--'
            };
          });
        this._applyPageData({
          userInfo,
          currentStore,
          boardingPets: orders,
          ...this._buildPetPreview(pets)
        });
      });
  },

  onNickNameInput(e) {
    this.setData({ nickNameInput: (e.detail.value || '').trim() });
  },

  onNickNameBlur(e) {
    const nickName = ((e.detail && e.detail.value) || this.data.nickNameInput || '').trim();
    if (!isAuthorizedNickName(nickName)) return;
    if (nickName === (this.data.userInfo.nickName || '')) {
      this.setData(this._buildUserViewState({ ...this.data.userInfo, nickName }));
      return;
    }
    app.updateProfile({ nickName })
      .then(() => {
        this._refreshPageFromCache();
      })
      .catch((err) => {
        console.error('[首页] 保存昵称失败', err);
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
    const storeId = app.getStoreId();
    const currentStore = app.getCurrentStore();
    if (!storeId || !currentStore) {
      wx.showModal({
        title: '暂无法预约',
        content: '您还未绑定店铺，请先通过商家分享链接进入店铺后再预约服务。',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }
    wx.navigateTo({ url: '/pages/user/reserve/reserve' });
  },
  onGoPets() { wx.navigateTo({ url: '/pages/user/pets/pets' }); },
  onGoOrders() { wx.switchTab({ url: '/pages/orders/orders' }); },
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
