const { STORAGE_KEYS } = require('./utils/constants');
const { getDefaultWeightPricing } = require('./utils/weightPricing');
const { getDefaultRoomPricing } = require('./utils/roomPricing');
const auth = require('./utils/auth');
const storeApi = require('./utils/store');
const { API_BASE_URL } = require('./config/api');
const { ensureLogin } = require('./utils/api');
const { normalizeIsMerchant, resolveRole, isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantStaff, isStaffOfStore, isStoreOwner, getMerchantStoreId, getVisitStoreId, hasMerchantCapability } = require('./utils/role');
const { applyRoleShell: applyTabShell } = require('./utils/shell');
const { mergeBillingRules, buildUserStoreView, prepareUserStoreView } = require('./utils/storeContext');
const storeDebug = require('./utils/storeDebug');
const { isCloudFileId } = require('./utils/mediaResolve');
const petApi = require('./utils/pet');
const orderApi = require('./utils/order');
const dailyApi = require('./utils/daily');
const { dedupeDailyLogs, getLogId } = require('./utils/dailyLogUtil');
const badgeUtil = require('./utils/badge');
const userFeed = require('./utils/userFeed');
const { clearImageFileCache } = require('./utils/imageCache');
const { resolveTargetEnvVersion } = require('./utils/miniProgramNavigate');
const { attachOrderDisplayNo, attachStoreDisplayNo, buildOrderDisplayNo } = require('./utils/displayNo');

function isDemoEntityId(id) {
  return String(id || '').startsWith('demo_');
}

/** 商家独立小程序 AppID（员工邀请/入驻跳转） */
const MERCHANT_MINI_PROGRAM_APPID = 'wx327ccf77cdedc252';

const USER_INFO_TTL = 5 * 60 * 1000;
const ORDERS_TTL = 2 * 60 * 1000;
const DAILY_LOGS_TTL = 2 * 60 * 1000;
const PETS_TTL = 5 * 60 * 1000;
const MERCHANT_STORE_TTL = 30 * 1000;

App({
  globalData: {
    env: '',
    role: 'user',
    isMerchant: false,
    userInfo: null,
    isLoggedIn: false,
    storeId: '',
    currentStore: null,
    merchantStoreId: '',
    pendingEntryStoreId: '',
    pendingStaffInviteStoreId: '',
    merchantAccessRole: '',
    apiReady: false,
    lastApiError: ''
  },

  onLaunch(options) {
    this._initCloud();
    this._purgeLocalDemoData();
    this._loadAllData();
    this._restoreCachedStore();
    storeDebug.logEntryOptions('App onLaunch', options);
    const cachedUser = this.getData(STORAGE_KEYS.USER);
    if (cachedUser) {
      this.globalData.userInfo = cachedUser;
      this._restoreUserClientMode();
      this._hydrateRoleFromUser(cachedUser);
    }
    // 复用本地 token，仅后台刷新用户信息，避免冷启动重复 wx.login
    this._userInfoFetchedAt = 0;
    this._bootstrapSession(options);
  },

  onShow(options) {
    storeDebug.logEntryOptions('App onShow', options);
    // 切回前台不强制清 token / 重置 TTL，避免重复登录与串行拉数
    this._bootstrapSession(options);
  },

  _hydrateRoleFromUser(user) {
    if (!user) return;
    if (isMerchantApproved(user)) {
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      return;
    }
    if (this.isUserClientMode()) {
      this.globalData.isMerchant = false;
      this.globalData.role = 'user';
      return;
    }
    this.globalData.isMerchant = false;
    this.globalData.role = 'user';
  },

  _bootstrapSession(options) {
    return this.ensureCloudAndLogin({ silent: true })
      .then(() => {
        this._reconcileClientModeFromCloudUser();
        this._handleEntryOptions(options);
        this._applyEntrySideEffects(options);
        applyTabShell();
        this.refreshUserBadges();
        if (!this.canAccessMerchantBackend() || this.isUserClientMode()) {
          return this.syncUserFeed();
        }
        return null;
      });
  },

  _applyEntrySideEffects(options) {
    if (this.isUserClientMode() && !this._extractStoreId(options)) {
      const storeId = this.getStoreId();
      if (storeId) {
        this.bindStore(storeId, { syncUser: false });
      }
      this._ensureUserClientLanding();
      return;
    }

    const staffInviteStoreId = this.globalData.pendingStaffInviteStoreId;
    if (staffInviteStoreId && !this.shouldIgnoreShareEntry()) {
      this._redirectStaffInviteIfNeeded(staffInviteStoreId);
    }
  },

  _reconcileClientModeFromCloudUser() {
    const user = this.globalData.userInfo;
    if (isMerchantApproved(user) && !this.isUserClientMode()) {
      wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
      this._storeVisitEntry = false;
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      if (isMerchantStaff(user)) {
        this.globalData.merchantAccessRole = 'staff';
      } else if (!this.globalData.merchantAccessRole) {
        this.globalData.merchantAccessRole = 'owner';
      }
      return;
    }
    if (this.getData(STORAGE_KEYS.USER_CLIENT_MODE)) {
      this._storeVisitEntry = true;
      this.globalData.role = 'user';
      this.globalData.isMerchant = hasMerchantCapability(user);
    }
  },

  isMerchantBackendUser(user) {
    const current = user || this.globalData.userInfo;
    return isMerchantApproved(current);
  },

  shouldIgnoreShareEntry() {
    return false;
  },

  _entryOptionsSignature(options) {
    if (!options) return '';
    const query = options.query || {};
    const staff = this._parseStaffInviteStoreId(options);
    const store = this._extractStoreId(options);
    const path = options.path || '';
    const scene = options.scene || query.scene || '';
    return `${path}|${staff}|${store}|${scene}`;
  },

  _redirectStaffInviteIfNeeded(storeId) {
    wx.showModal({
      title: '员工邀请',
      content: '商家端已独立。请打开「宠大师商家端」小程序接受邀请。',
      confirmText: '打开商家端',
      success: (res) => {
        if (!res.confirm) return;
        wx.navigateToMiniProgram({
          appId: MERCHANT_MINI_PROGRAM_APPID,
          path: `pages/merchant/tab-daily/tab-daily?staff_invite=1&store_id=${encodeURIComponent(storeId)}`,
          envVersion: resolveTargetEnvVersion(),
          fail: () => {
            wx.showToast({ title: '请搜索打开商家端小程序', icon: 'none' });
          }
        });
      }
    });
  },

  _initCloud() {
    const baseUrl = (API_BASE_URL || '').trim();
    if (!baseUrl) {
      console.error('[API] 请在 miniprogram/config/api.js 配置 API_BASE_URL');
      this.globalData.env = '';
      return;
    }
    this.globalData.env = baseUrl;
  },

  _purgeLocalDemoData() {
    const demoKeys = [
      STORAGE_KEYS.DEMO_INITIALIZED,
      STORAGE_KEYS.DEMO_ORDERS,
      STORAGE_KEYS.DEMO_PETS,
      STORAGE_KEYS.DEMO_DAILY_LOGS,
      STORAGE_KEYS.DEMO_SHOP,
      STORAGE_KEYS.DEMO_APPLY_DRAFT,
      STORAGE_KEYS.DEMO_CONTRACTS
    ];
    demoKeys.forEach((key) => {
      try {
        wx.removeStorageSync(key);
      } catch (err) {
        // ignore
      }
    });

    const stripDemo = (list) => (
      Array.isArray(list)
        ? list.filter((item) => !isDemoEntityId(
          (item && (item.id || item.order_id || item.pet_id)) || ''
        ))
        : []
    );

    try {
      const pets = stripDemo(wx.getStorageSync(STORAGE_KEYS.PETS));
      const orders = stripDemo(wx.getStorageSync(STORAGE_KEYS.ORDERS));
      const logs = stripDemo(wx.getStorageSync(STORAGE_KEYS.DAILY_LOGS));
      wx.setStorageSync(STORAGE_KEYS.PETS, pets);
      wx.setStorageSync(STORAGE_KEYS.ORDERS, orders);
      wx.setStorageSync(STORAGE_KEYS.DAILY_LOGS, logs);
    } catch (err) {
      console.warn('[demo] 清理本地演示数据失败', err);
    }
  },

  _bootstrapCloud() {
    if (!this.globalData.env) {
      return Promise.resolve(false);
    }
    return ensureLogin()
      .then(() => auth.initDatabase())
      .then((res) => {
        if (!res.success) {
          console.error('[API] 初始化数据库失败', res.errMsg);
          return false;
        }
        return dailyApi.initDatabase()
          .then((dailyRes) => {
            if (dailyRes && !dailyRes.success) {
              console.error('[API] 初始化打卡数据表失败', dailyRes.errMsg);
            }
            this.globalData.apiReady = true;
            return true;
          });
      })
      .catch((err) => {
        console.error('[API] 初始化失败，请确认服务端已启动', err);
        return false;
      });
  },

  _extractStoreId(options) {
    if (!options) return '';
    const query = options.query || {};
    if (query.store_id) return query.store_id;

    const extra = options.referrerInfo && options.referrerInfo.extraData;
    if (extra && extra.store_id) {
      return String(extra.store_id).trim();
    }

    if (query.scene) {
      const sceneParam = decodeURIComponent(String(query.scene));
      if (sceneParam.includes('store_id=')) {
        return sceneParam.split('store_id=')[1].split('&')[0];
      }
      if (sceneParam.startsWith('store_')) return sceneParam;
    }

    const scene = options.scene;
    if (scene && scene !== 1001 && scene !== 1089) {
      const decoded = decodeURIComponent(String(scene));
      if (decoded.includes('store_id=')) {
        return decoded.split('store_id=')[1].split('&')[0];
      }
      if (decoded.startsWith('store_')) return decoded;
    }
    return '';
  },

  _isStaffInviteEntry(options) {
    return !!this._parseStaffInviteStoreId(options);
  },

  _isUserEntryPath(options) {
    if (!options) return false;
    if (this._isStaffInviteEntry(options)) return false;
    const path = options.path || '';
    if (path.includes('pages/index/index') || path.includes('pages/user/')) {
      return true;
    }
    return !!this._extractStoreId(options);
  },

  _enterStoreVisitMode(storeId) {
    this._enterUserClientMode(storeId);
  },

  isUserClientMode() {
    return !!(this._storeVisitEntry || this.getData(STORAGE_KEYS.USER_CLIENT_MODE));
  },

  _enterUserClientMode(storeId, options = {}) {
    const { persist = true, applyShell = true } = options;
    if (this.shouldIgnoreShareEntry()) {
      return;
    }
    if (this.isStaffForStore(storeId)) {
      this._keepStaffMerchantMode();
      return;
    }
    this._storeVisitEntry = true;
    this.globalData.isMerchant = false;
    this.globalData.role = 'user';
    if (persist) {
      this.setData(STORAGE_KEYS.USER_CLIENT_MODE, true);
    }
    if (storeId) {
      this.globalData.pendingEntryStoreId = storeId;
      this.globalData.storeId = storeId;
      this.setData(STORAGE_KEYS.STORE_ID, storeId);
    }
    if (applyShell) {
      applyTabShell();
    }
  },

  _restoreUserClientMode() {
    const user = this.globalData.userInfo || this.getData(STORAGE_KEYS.USER);
    if (isMerchantApproved(user) || isStaffOfStore(user, user && user.store_id)) {
      wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
      this._storeVisitEntry = false;
      return;
    }
    if (this.getData(STORAGE_KEYS.USER_CLIENT_MODE)) {
      this._storeVisitEntry = true;
      this.globalData.isMerchant = false;
      this.globalData.role = 'user';
    }
  },

  _ensureUserClientLanding() {
    if (!this.isUserClientMode()) return;
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route : '';
    if (!route || route === 'pages/index/index') {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  enterMerchantMode() {
    this.openMerchantMiniProgram();
  },

  extractStoreIdFromOptions(options) {
    return this._extractStoreId(options);
  },

  enterUserStore(storeId, options = {}) {
    if (!storeId) return Promise.resolve(null);
    const currentId = this.getStoreId();
    const forceData = options.forceData !== false;
    storeDebug.log('enterUserStore', { storeId, currentId, forceData });
    this._lastHandledEntrySignature = '';
    if (forceData || storeId !== currentId) {
      this._ordersFetchedAt = 0;
      this._petsFetchedAt = 0;
    }
    return this.ensureCloudAndLogin({ silent: true })
      .then(() => {
        if (this.shouldIgnoreShareEntry()) {
          return null;
        }
        if (this.isStaffForStore(storeId)) {
          this._keepStaffMerchantMode();
          wx.showToast({ title: '请使用商家端小程序管理本店', icon: 'none' });
          return null;
        }
        this._enterUserClientMode(storeId);
        return this.bindStore(storeId, { syncUser: false, force: forceData })
          .then(() => this._flushPendingStoreBinding());
      });
  },

  _handleEntryOptions(options) {
    if (!options) return;

    const signature = this._entryOptionsSignature(options);
    const staffStoreId = this._parseStaffInviteStoreId(options);
    const storeId = this._extractStoreId(options);
    const hasShareEntry = staffStoreId || (storeId && this._isUserEntryPath(options));

    if (hasShareEntry && this.shouldIgnoreShareEntry()) {
      this.globalData.pendingStaffInviteStoreId = '';
      this.globalData.pendingEntryStoreId = '';
      if (signature) this._lastHandledEntrySignature = signature;
      storeDebug.log('忽略分享入口：商家/员工身份保持不变');
      return;
    }

    if (signature && signature === this._lastHandledEntrySignature) {
      return;
    }

    if (this._isStaffInviteEntry(options)) {
      if (staffStoreId) {
        this.globalData.pendingStaffInviteStoreId = staffStoreId;
        this._storeVisitEntry = false;
        wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
      }
      if (signature) this._lastHandledEntrySignature = signature;
      return;
    }

    if (storeId) {
      const currentId = this.getStoreId();
      this.globalData.pendingEntryStoreId = storeId;
      storeDebug.log('_handleEntryOptions 检测到 store_id', {
        storeId,
        currentId,
        isUserEntry: this._isUserEntryPath(options)
      });
      if (this.isStaffForStore(storeId)) {
        this._keepStaffMerchantMode();
        if (signature) this._lastHandledEntrySignature = signature;
        return;
      }
      if (storeId !== currentId || !this.isUserClientMode()) {
        if (this._isUserEntryPath(options) || this.isUserClientMode() || !currentId) {
          this._enterUserClientMode(storeId, { applyShell: this._isUserEntryPath(options) });
        }
      }
      this.bindStore(storeId, { syncUser: false, force: true });
    }

    if (signature) {
      this._lastHandledEntrySignature = signature;
    }
  },

  _restoreCachedStore() {
    const storeId = this.getData(STORAGE_KEYS.STORE_ID);
    const currentStore = this.getData(STORAGE_KEYS.CURRENT_STORE);
    const shop = this.getShop();
    if (shop && shop.store_id) {
      this.globalData.merchantStoreId = shop.store_id;
    }
    if (storeId) {
      this.globalData.storeId = storeId;
    }
    if (currentStore) {
      this.globalData.currentStore = currentStore;
    }
  },

  getShareStoreId() {
    const shop = this.getShop() || {};
    const user = this.globalData.userInfo || {};
    const current = this.getCurrentStore();
    if (this.globalData.isMerchant) {
      return (
        shop.store_id
        || this.globalData.merchantStoreId
        || user.store_id
        || ''
      );
    }
    return (
      this.getStoreId()
      || user.store_id
      || (current && current.store_id)
      || ''
    );
  },

  getStoreId() {
    return this.globalData.storeId || this.getData(STORAGE_KEYS.STORE_ID) || '';
  },

  getCurrentStore() {
    return this.globalData.currentStore || this.getData(STORAGE_KEYS.CURRENT_STORE) || null;
  },

  _cacheStore(store) {
    if (!store || !store.store_id) return;
    this.globalData.storeId = store.store_id;
    this.globalData.currentStore = store;
    this.setData(STORAGE_KEYS.STORE_ID, store.store_id);
    this.setData(STORAGE_KEYS.CURRENT_STORE, store);
  },

  bindStore(storeId, options = {}) {
    const force = !!(options && options.force);
    const syncUser = options.syncUser !== false;
    if (!storeId) {
      return Promise.resolve(this.getCurrentStore());
    }

    const cachedId = this.getStoreId();
    if (!force && cachedId === storeId && this.getCurrentStore()) {
      return Promise.resolve(this.getCurrentStore());
    }

    if (!this.globalData.env) {
      return Promise.resolve(this.getCurrentStore());
    }

    return storeApi.getStore(storeId)
      .then((res) => {
        if (res.success && res.store) {
          this._cacheStore(res.store);
          storeDebug.log('bindStore 成功', {
            storeId: res.store.store_id,
            storeName: res.store.name
          });
          if (syncUser) {
            return this._maybeSyncUserStore(storeId).then(() => res.store);
          }
          return res.store;
        }
        storeDebug.log('bindStore 失败', { storeId, errMsg: res.errMsg || '店铺不存在' });
        return this.getCurrentStore();
      })
      .catch((err) => {
        console.error('bindStore failed', err);
        return this.getCurrentStore();
      });
  },

  _shouldSyncUserStore() {
    return !!(this.isUserClientMode() || !this.globalData.isMerchant);
  },

  _maybeSyncUserStore(storeId) {
    if (!this._shouldSyncUserStore()) {
      return Promise.resolve(null);
    }
    if (this.globalData.isLoggedIn) {
      return this._syncUserStoreBinding(storeId);
    }
    this.globalData.pendingEntryStoreId = storeId;
    return Promise.resolve(null);
  },

  _flushPendingStoreBinding() {
    const storeId = (
      this.globalData.pendingEntryStoreId
      || (this.isUserClientMode() ? this.getStoreId() : '')
      || ''
    ).trim();
    if (!storeId || !this._shouldSyncUserStore()) {
      return Promise.resolve(null);
    }
    return this._syncUserStoreBinding(storeId).then((res) => {
      if (res && res.success) {
        this.globalData.pendingEntryStoreId = '';
      }
      return res;
    });
  },

  _syncUserStoreBinding(storeId) {
    if (!storeId || !this.globalData.env) return Promise.resolve();
    return auth.bindUserStore(storeId)
      .then((res) => {
        if (res.success && res.user) {
          storeDebug.log('users 表已同步 store_id', {
            store_id: res.user.store_id,
            isMerchant: res.user.isMerchant
          });
          const user = {
            ...(this.globalData.userInfo || {}),
            ...res.user,
            visitStoreId: res.user.visitStoreId || storeId,
            store_id: res.user.visitStoreId || res.user.store_id || storeId
          };
          const merchantCap = hasMerchantCapability(user);
          this.globalData.userInfo = user;
          this.globalData.isMerchant = merchantCap;
          this.globalData.role = this.isUserClientMode() ? 'user' : (merchantCap ? 'merchant' : 'user');
          this.setData(STORAGE_KEYS.USER, user);
          this._enterUserClientMode(storeId, { applyShell: false });
        } else {
          const errMsg = (res && res.errMsg) || '绑定店铺失败';
          console.error('[bindUserStore] 失败', errMsg, res);
          wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
        }
        return res;
      })
      .catch((err) => {
        console.error('sync user store_id failed', err);
        return null;
      });
  },

  refreshCurrentStore() {
    const storeId = this.getStoreId();
    if (!storeId) return Promise.resolve(null);
    return this.bindStore(storeId, { force: true });
  },

  getStoreBillingRules() {
    const store = this.getCurrentStore();
    return mergeBillingRules(store, this._defaultBillingRules());
  },

  getUserStoreView() {
    return buildUserStoreView(this.getCurrentStore());
  },

  getUserStoreViewDisplay() {
    const store = this.getCurrentStore();
    const storeId = this.getStoreId();
    const needsCloudRefresh = store && (
      isCloudFileId(store.logo)
      || (Array.isArray(store.storePhotos) && store.storePhotos.some(isCloudFileId))
      || (Array.isArray(store.introPhotos) && store.introPhotos.some(isCloudFileId))
      || (Array.isArray(store.noticePhotos) && store.noticePhotos.some(isCloudFileId))
    );
    const loader = needsCloudRefresh && storeId
      ? this.bindStore(storeId, { force: true, syncUser: false })
      : Promise.resolve(store);
    return loader.then(() => prepareUserStoreView(this.getCurrentStore()));
  },

  _loadAllData() {
    Object.values(STORAGE_KEYS).forEach((key) => {
      this.globalData[key] = wx.getStorageSync(key) || null;
    });
  },

  _applyRemoteUser(remoteUser, meta = {}) {
    const approved = isMerchantApproved(remoteUser);
    const isMerchant = approved;
    const role = isMerchant ? 'merchant' : 'user';
    this.globalData.isLoggedIn = true;
    this.globalData.authMeta = meta;

    const cached = this.globalData.userInfo || {};
    const prevApproved = isMerchantApproved(cached);
    const pickRemoteString = (key) => (
      Object.prototype.hasOwnProperty.call(remoteUser, key)
        ? (remoteUser[key] || '')
        : (cached[key] || '')
    );
    const merchantStoreId = pickRemoteString('merchantStoreId') || getMerchantStoreId(remoteUser) || getMerchantStoreId(cached);
    const visitStoreId = pickRemoteString('visitStoreId') || getVisitStoreId(remoteUser) || getVisitStoreId(cached);
    const user = {
      openid: remoteUser.openid || meta.requestOpenid || cached.openid || '',
      nickName: remoteUser.nickName || cached.nickName || '',
      avatarUrl: remoteUser.avatarUrl || cached.avatarUrl || '',
      phone: remoteUser.phone || cached.phone || '',
      realName: remoteUser.realName || cached.realName || '',
      idCard: remoteUser.idCard || cached.idCard || '',
      address: remoteUser.address || cached.address || '',
      merchantStoreId,
      visitStoreId,
      store_id: visitStoreId,
      pet_ids: Array.isArray(remoteUser.pet_ids) ? remoteUser.pet_ids : (cached.pet_ids || []),
      merchantStatus: pickRemoteString('merchantStatus'),
      merchantRole: pickRemoteString('merchantRole'),
      role,
      isMerchant,
      hasMerchantCapability: isMerchant,
      oaBound: Object.prototype.hasOwnProperty.call(remoteUser, 'oaBound')
        ? !!remoteUser.oaBound
        : !!cached.oaBound,
      oaQrcodeUrl: Object.prototype.hasOwnProperty.call(remoteUser, 'oaQrcodeUrl')
        ? (remoteUser.oaQrcodeUrl || '')
        : (cached.oaQrcodeUrl || ''),
      createTime: remoteUser.createTime || cached.createTime || Date.now()
    };

    if (this.isUserClientMode()) {
      user.role = 'user';
      this.globalData.role = 'user';
      this.globalData.isMerchant = isMerchant;
    } else {
      if (isMerchantStaff(user) && isMerchantApproved(user)) {
        wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
        this._storeVisitEntry = false;
      }
      this.globalData.role = role;
      this.globalData.isMerchant = isMerchant;
    }

    this.globalData.userInfo = user;
    this.setData(STORAGE_KEYS.USER, user);
    console.log('[auth] 角色同步', {
      openid: user.openid,
      isMerchant: user.isMerchant,
      role: user.role,
      store_id: user.store_id,
      meta
    });
    storeDebug.logStoreState('_applyRemoteUser', this);

    const storeIdToBind = this.isUserClientMode()
      ? (this.getStoreId() || visitStoreId)
      : (visitStoreId && !isMerchantPending(user) ? visitStoreId : '');

    if (storeIdToBind) {
      this.bindStore(storeIdToBind, { syncUser: false, force: this.isUserClientMode() });
    }

    if (!isMerchantPending(user)) {
      const cachedPets = this.getPets();
      const petIds = Array.isArray(user.pet_ids) ? user.pet_ids : [];
      const petsStale = !this._petsFetchedAt || Date.now() - this._petsFetchedAt > PETS_TTL;
      const petsMismatch = petIds.length !== cachedPets.length;
      if (!cachedPets.length || petsStale || petsMismatch) {
        this.loadPets();
      }
    }

    if (this.isUserClientMode()) {
      applyTabShell();
      return this._flushPendingStoreBinding().then(() => 'user');
    }
    applyTabShell();
    return this._flushPendingStoreBinding().then(() => (isMerchant ? 'merchant' : 'user'));
  },

  forceRefreshRole() {
    wx.removeStorageSync(STORAGE_KEYS.USER);
    wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
    this.globalData.userInfo = null;
    this.globalData.role = 'user';
    this.globalData.isMerchant = false;
    this.globalData.apiReady = false;
    this._storeVisitEntry = false;
    this._userInfoFetchedAt = 0;
    return this.ensureCloudAndLogin();
  },

  ensureCloudAndLogin(options = {}) {
    if (!this.globalData.env) {
      this.globalData.lastApiError = 'API 未配置，请检查 config/api.js';
      return this.silentLogin(options);
    }
    return this.silentLogin(options);
  },

  silentLogin(options = {}) {
    const force = !!(options && options.force);
    if (this._silentLoginPromise && !force) {
      return this._silentLoginPromise;
    }
    if (this._silentLoginPromise && force) {
      return this._silentLoginPromise
        .finally(() => {
          this._silentLoginPromise = null;
          this._userInfoFetchedAt = 0;
        })
        .then(() => this.silentLogin({ force: true }));
    }
    this._silentLoginPromise = this._doSilentLogin(force).finally(() => {
      this._silentLoginPromise = null;
    });
    return this._silentLoginPromise;
  },

  _hasCachedUser() {
    const cached = this.globalData.userInfo;
    return !!(cached && cached.openid);
  },

  _isUserInfoFresh() {
    return !!(this._userInfoFetchedAt && Date.now() - this._userInfoFetchedAt < USER_INFO_TTL);
  },

  _resolveCachedRole() {
    if (this.isUserClientMode()) return 'user';
    const cached = this.globalData.userInfo || {};
    if (this.globalData.role) return this.globalData.role;
    return cached.isMerchant ? 'merchant' : 'user';
  },

  _backgroundRefreshUser() {
    if (this._backgroundRefreshPromise) {
      return this._backgroundRefreshPromise;
    }
    this._backgroundRefreshPromise = auth.getUserInfo()
      .then((res) => {
        if (res.success && res.user) {
          this.globalData.lastApiError = '';
          this.globalData.apiReady = true;
          this._userInfoFetchedAt = Date.now();
          const meta = {
            requestOpenid: res.requestOpenid,
            matchedCount: res.matchedCount,
            dbIsMerchant: res.dbIsMerchant
          };
          return this._applyRemoteUser(res.user, meta);
        }
        return this._resolveCachedRole();
      })
      .catch((err) => {
        console.error('[API] 后台刷新用户失败', err);
        return this._resolveCachedRole();
      })
      .finally(() => {
        this._backgroundRefreshPromise = null;
      });
    return this._backgroundRefreshPromise;
  },

  _fetchCloudUser() {
    return auth.getUserInfo()
      .then((res) => {
        if (res.success && res.user) {
          this.globalData.lastApiError = '';
          this.globalData.apiReady = true;
          this._userInfoFetchedAt = Date.now();
          if (res.deduped) {
            console.log('[auth] 已自动合并重复用户记录');
          }
          const meta = {
            requestOpenid: res.requestOpenid,
            matchedCount: res.matchedCount,
            dbIsMerchant: res.dbIsMerchant
          };
          return this._applyRemoteUser(res.user, meta);
        }
        return this._resolveCachedRole();
      });
  },

  _doSilentLogin(force = false) {
    if (!this.globalData.env) {
      this.globalData.role = 'user';
      this.globalData.isMerchant = false;
      this.globalData.lastApiError = this.globalData.lastApiError || 'API 未连接';
      if (!this.globalData.userInfo) {
        this.globalData.userInfo = { nickName: '', role: 'user', isMerchant: false, merchantStatus: '' };
      }
      return Promise.resolve('user');
    }

    const afterLogin = () => {
      if (this._hasCachedUser()) {
        this.globalData.isLoggedIn = true;
        if (!force && this._isUserInfoFresh()) {
          return Promise.resolve(this._resolveCachedRole());
        }
        if (force) {
          return this._fetchCloudUser();
        }
        this._backgroundRefreshUser();
        return Promise.resolve(this._resolveCachedRole());
      }

      return this._fetchCloudUser()
        .catch((err) => {
          const errMsg = (err && (err.errMsg || err.message)) || '接口调用异常';
          this.globalData.lastApiError = errMsg;
          console.error('[API] silentLogin 失败', err);
          if (this.isUserClientMode()) {
            applyTabShell();
            return 'user';
          }
          this.globalData.role = 'user';
          this.globalData.isMerchant = false;
          applyTabShell();
          return 'user';
        });
    };

    return ensureLogin(force).then(afterLogin).catch((err) => {
      const errMsg = (err && (err.errMsg || err.message)) || '登录失败';
      this.globalData.lastApiError = errMsg;
      console.error('[API] ensureLogin 失败', err);
      this.globalData.role = 'user';
      this.globalData.isMerchant = false;
      if (!this.globalData.userInfo) {
        this.globalData.userInfo = { nickName: '', role: 'user', isMerchant: false, merchantStatus: '' };
      }
      applyTabShell();
      return 'user';
    });
  },

  isMerchantApproved() {
    return isMerchantApproved(this.globalData.userInfo);
  },

  isMerchantPending() {
    return isMerchantPending(this.globalData.userInfo);
  },

  isMerchantDemoMode() {
    return false;
  },

  canAccessMerchantBackend() {
    return false;
  },

  openMerchantMiniProgram(path = 'pages/merchant/tab-daily/tab-daily') {
    return new Promise((resolve) => {
      wx.navigateToMiniProgram({
        appId: MERCHANT_MINI_PROGRAM_APPID,
        path,
        envVersion: resolveTargetEnvVersion(),
        success: resolve,
        fail: (err) => {
          wx.showToast({ title: '请搜索打开商家端小程序', icon: 'none' });
          resolve(err);
        }
      });
    });
  },

  isStoreOwner() {
    if ((this.globalData.merchantAccessRole || '') === 'staff') return false;
    return isStoreOwner(this.globalData.userInfo);
  },

  isMerchantStaffUser() {
    if ((this.globalData.merchantAccessRole || '') === 'staff') return true;
    return isMerchantStaff(this.globalData.userInfo);
  },

  _parseStaffInviteStoreId(options) {
    if (!options) return '';
    const query = options.query || options;
    const flag = query.staff_invite;
    const isInvite = flag === '1' || flag === 1 || flag === true || flag === 'true';
    const storeId = (query.store_id || this._extractStoreId(options) || '').trim();
    return isInvite && storeId ? storeId : '';
  },

  isStaffForStore(storeId) {
    const user = this.globalData.userInfo || this.getData(STORAGE_KEYS.USER) || {};
    return isStaffOfStore(user, storeId);
  },

  _keepStaffMerchantMode() {
    wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
    this._storeVisitEntry = false;
    this.globalData.role = 'merchant';
    this.globalData.isMerchant = true;
    if (this.globalData.userInfo) {
      this.globalData.userInfo = {
        ...this.globalData.userInfo,
        role: 'merchant',
        isMerchant: true,
        merchantRole: 'staff'
      };
      this.setData(STORAGE_KEYS.USER, this.globalData.userInfo);
    }
    applyTabShell();
  },

  refreshUserRole() {
    return this.silentLogin();
  },

  getData(key) {
    return this.globalData[key] || wx.getStorageSync(key) || null;
  },

  setData(key, value) {
    this.globalData[key] = value;
    wx.setStorageSync(key, value);
  },

  clearLocalAppCache() {
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        wx.removeStorageSync(key);
      } catch (err) {
        // ignore
      }
      this.globalData[key] = null;
    });
    clearImageFileCache();

    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.role = 'user';
    this.globalData.isMerchant = false;
    this.globalData.storeId = '';
    this.globalData.currentStore = null;
    this.globalData.merchantStoreId = '';
    this.globalData.pendingEntryStoreId = '';
    this.globalData.pendingStaffInviteStoreId = '';
    this.globalData.merchantAccessRole = '';
    this._storeVisitEntry = false;
    this._userInfoFetchedAt = 0;
    this._ordersFetchedAt = 0;
    this._petsFetchedAt = 0;
    this._dailyLogsFetchedAt = 0;
    this._merchantStoreFetchedAt = 0;
    this._loadOrdersPromise = null;
    this._loadPetsPromise = null;
    this._loadDailyLogsPromise = null;
    this._merchantStorePromise = null;
    this._silentLoginPromise = null;
    this._backgroundRefreshPromise = null;
    this._syncUserFeedPromise = null;

    return this.ensureCloudAndLogin().then(() => {
      applyTabShell();
      return true;
    });
  },

  updateProfile(userInfo) {
    const user = {
      ...(this.globalData.userInfo || {}),
      ...userInfo,
      createTime: this.globalData.userInfo?.createTime || Date.now()
    };
    this.globalData.userInfo = user;
    this.globalData.isLoggedIn = true;
    this.setData(STORAGE_KEYS.USER, user);

    return auth.syncProfile(userInfo)
      .then((res) => {
        this.globalData.lastApiError = '';
        if (res.user) {
          return this._applyRemoteUser(res.user);
        }
        return this.globalData.role;
      })
      .catch((err) => {
        console.error('updateProfile failed', err);
        this.globalData.lastApiError = (err && err.message) || '保存失败';
        return Promise.reject(err);
      });
  },

  login(userInfo) {
    return this.updateProfile(userInfo);
  },

  getPets() {
    return this.getData(STORAGE_KEYS.PETS) || [];
  },

  _cachePets(pets) {
    this.setData(STORAGE_KEYS.PETS, pets || []);
  },

  _upsertLocalPet(pet) {
    const pets = this.getPets();
    const idx = pets.findIndex((p) => p.id === pet.id);
    if (idx >= 0) pets[idx] = pet;
    else pets.push(pet);
    this._cachePets(pets);
  },

  _syncUserPetIds(petId, action = 'add') {
    const user = this.globalData.userInfo;
    if (!user || !petId) return;
    const current = Array.isArray(user.pet_ids) ? user.pet_ids : [];
    const pet_ids = action === 'remove'
      ? current.filter((id) => id !== petId)
      : current.includes(petId) ? current : [...current, petId];
    this.globalData.userInfo = { ...user, pet_ids };
    this.setData(STORAGE_KEYS.USER, this.globalData.userInfo);
  },

  _mergePetList(localPets, remotePets) {
    const map = new Map();
    const put = (pet) => {
      if (!pet) return;
      const id = pet.id || pet.pet_id;
      if (!id) return;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { ...pet, id });
        return;
      }
      map.set(id, {
        ...existing,
        ...pet,
        id,
        weight: pet.weight || existing.weight,
        updateTime: Math.max(pet.updateTime || 0, existing.updateTime || 0)
      });
    };
    (localPets || []).forEach(put);
    (remotePets || []).forEach(put);
    return Array.from(map.values()).sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
  },

  loadPets(options = {}) {
    const force = !!(options && options.force);
    const localPets = this.getPets();
    if (!this.globalData.env) {
      return Promise.resolve(localPets);
    }
    if (!force && this._petsFetchedAt && Date.now() - this._petsFetchedAt < PETS_TTL) {
      return Promise.resolve(localPets);
    }
    if (this._loadPetsPromise) {
      return this._loadPetsPromise;
    }
    this._loadPetsPromise = petApi.listPets()
      .then((res) => {
        if (res.success && Array.isArray(res.pets)) {
          if (!res.pets.length && localPets.length) {
            return localPets;
          }
          const merged = this._mergePetList(localPets, res.pets);
          this._cachePets(merged);
          this._petsFetchedAt = Date.now();
          return merged;
        }
        return localPets;
      })
      .catch((err) => {
        console.error('[宠物] 拉取服务端档案失败', err);
        return localPets;
      })
      .finally(() => {
        this._loadPetsPromise = null;
      });
    return this._loadPetsPromise;
  },

  savePet(pet) {
    if (!this.globalData.env) {
      return Promise.reject(new Error('API 未连接，无法保存'));
    }
    return petApi.savePet(pet)
      .then((res) => {
        this._upsertLocalPet(res.pet);
        this._syncUserPetIds(res.pet.id, 'add');
        this._petsFetchedAt = 0;
        return res.pet;
      });
  },

  deletePet(id) {
    if (!this.globalData.env) {
      return Promise.reject(new Error('API 未连接，无法删除'));
    }
    return petApi.deletePet(id)
      .then(() => {
        this._cachePets(this.getPets().filter((p) => p.id !== id));
        this._syncUserPetIds(id, 'remove');
        this._petsFetchedAt = 0;
      });
  },

  getOrders() {
    return (this.getData(STORAGE_KEYS.ORDERS) || []).map(attachOrderDisplayNo);
  },

  _cacheOrders(orders) {
    this.setData(STORAGE_KEYS.ORDERS, (orders || []).map(attachOrderDisplayNo));
  },

  _upsertLocalOrder(order) {
    if (!order || !order.id) return;
    const normalized = attachOrderDisplayNo(order);
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.id === normalized.id);
    if (idx >= 0) orders[idx] = normalized;
    else orders.push(normalized);
    this._cacheOrders(orders);
  },

  loadOrders(options = {}) {
    const force = !!(options && options.force);
    if (!this.globalData.env) {
      return Promise.resolve(this.getOrders());
    }
    if (!force && this._ordersFetchedAt && Date.now() - this._ordersFetchedAt < ORDERS_TTL) {
      return Promise.resolve(this.getOrders());
    }
    if (this._loadOrdersPromise) {
      return this._loadOrdersPromise;
    }

    this._loadOrdersPromise = orderApi.listUserOrders()
      .then((res) => {
        if (res && res.success && Array.isArray(res.orders)) {
          this._cacheOrders(res.orders);
          this._ordersFetchedAt = Date.now();
          return res.orders;
        }
        if (res && res.errMsg) {
          console.error('[订单] 拉取服务端订单失败', res.errMsg);
        }
        return this.getOrders();
      })
      .catch((err) => {
        console.error('[订单] 拉取服务端订单失败', err);
        return this.getOrders();
      })
      .finally(() => {
        this._loadOrdersPromise = null;
        this.refreshUserBadges();
      });
    return this._loadOrdersPromise;
  },

  getUserScopedOrders() {
    return userFeed.getUserScopedOrders(this);
  },

  syncUserFeed(options = {}) {
    const force = !!(options && options.force);
    const skipDailyLogs = !!(options && options.skipDailyLogs);
    this.refreshUserBadges();

    if (this.canAccessMerchantBackend() && !this.isUserClientMode()) {
      return Promise.resolve();
    }
    if (this.isMerchantDemoMode()) {
      return Promise.resolve();
    }

    if (!force && this._syncUserFeedPromise) {
      return this._syncUserFeedPromise;
    }

    const run = () => this.ensureCloudAndLogin({ silent: true })
      .then(() => this.loadOrders({ force }))
      .then(() => {
        if (skipDailyLogs) {
          this.refreshUserBadges();
          // 动态日志不阻塞首页，后台补齐角标
          const orders = this.getUserScopedOrders();
          const boardingIds = userFeed.getUserBoardingOrderIds(orders);
          if (boardingIds.length) {
            this.loadDailyLogsForOrders(boardingIds, { force: false })
              .then(() => this.refreshUserBadges())
              .catch(() => {});
          }
          return null;
        }
        const orders = this.getUserScopedOrders();
        const boardingIds = userFeed.getUserBoardingOrderIds(orders);
        if (!boardingIds.length) return this.getDailyLogs();
        return this.loadDailyLogsForOrders(boardingIds, { force });
      })
      .then(() => {
        this.refreshUserBadges();
      });

    if (force) {
      return run();
    }

    this._syncUserFeedPromise = run().finally(() => {
      this._syncUserFeedPromise = null;
    });
    return this._syncUserFeedPromise;
  },

  refreshUserBadges() {
    if (typeof this.canAccessMerchantBackend === 'function' && this.canAccessMerchantBackend() && !this.isUserClientMode()) {
      badgeUtil.clearUserTabBadges();
      return;
    }
    const orders = this.getUserScopedOrders();
    const logs = userFeed.getUserScopedDailyLogs(this, orders);
    badgeUtil.refreshUserTabBadges(orders, logs);
  },

  patchDailyLogs(logs) {
    this.setData(STORAGE_KEYS.DAILY_LOGS, dedupeDailyLogs(logs || []));
  },

  saveOrder(order) {
    const userProfile = this.globalData.userInfo || {};
    if (!this.globalData.env) {
      return Promise.resolve(this._saveOrderLocal(order));
    }
    return orderApi.createOrder(order, userProfile)
      .then((res) => {
        if (res && res.success && res.order) {
          this._upsertLocalOrder(res.order);
          this._ordersFetchedAt = 0;
          this.refreshUserBadges();
          return res.order;
        }
        const errMsg = (res && res.errMsg) || '创建订单失败';
        console.error('[订单] 创建失败', errMsg, res);
        throw new Error(errMsg);
      })
      .catch((err) => {
        if (err && err.message) throw err;
        throw new Error((err && err.errMsg) || '创建订单失败');
      });
  },

  _saveOrderLocal(order) {
    const orders = this.getOrders();
    if (order.id) {
      const idx = orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) orders[idx] = order;
      else orders.push(order);
    } else {
      const currentStore = this.globalData.currentStore || this.getShop() || {};
      const storeDisplayNo = currentStore.displayNo || order.storeDisplayNo || '';
      order.id = `ord_${Date.now()}`;
      order.displayNo = order.displayNo || buildOrderDisplayNo(storeDisplayNo);
      order.status = order.status || 'pending';
      order.createTime = Date.now();
      orders.push(order);
    }
    this._cacheOrders(orders);
    return order;
  },

  updateOrder(id, updates) {
    const applyLocal = () => {
      const orders = this.getOrders();
      const idx = orders.findIndex((o) => o.id === id);
      if (idx >= 0) {
        Object.assign(orders[idx], updates);
        this._cacheOrders(orders);
        return orders[idx];
      }
      return null;
    };

    if (isDemoEntityId(id)) {
      return Promise.resolve(null);
    }

    if (!this.globalData.env) {
      return Promise.resolve(applyLocal());
    }

    return orderApi.updateOrder(id, updates)
      .then((res) => {
        if (res.success && res.order) {
          this._upsertLocalOrder(res.order);
          this._ordersFetchedAt = 0;
          this.refreshUserBadges();
          return res.order;
        }
        throw new Error(res.errMsg || '更新订单失败');
      });
  },

  getBills() { return this.getData(STORAGE_KEYS.BILLS) || []; },

  saveBill(bill) {
    const bills = this.getBills();
    bill.id = 'bill_' + Date.now();
    bill.createTime = Date.now();
    bills.push(bill);
    this.setData(STORAGE_KEYS.BILLS, bills);
    return bill;
  },

  getContracts() {
    return this.getData(STORAGE_KEYS.CONTRACTS) || [];
  },

  getContractByOrderId(orderId) {
    const contracts = this.getContracts();
    return contracts.find((c) => c.orderId === orderId) || null;
  },

  getContractById(id) {
    return this.getContracts().find((c) => c.id === id) || null;
  },

  saveContract(contract) {
    const contracts = this.getData(STORAGE_KEYS.CONTRACTS) || [];
    if (!contract.id) contract.id = 'ctr_' + Date.now();
    contract.createTime = contract.createTime || Date.now();
    const idx = contracts.findIndex((c) => c.id === contract.id);
    if (idx >= 0) contracts[idx] = contract;
    else contracts.push(contract);
    this.setData(STORAGE_KEYS.CONTRACTS, contracts);
    return contract;
  },

  updateContract(id, updates) {
    const contracts = this.getContracts();
    const idx = contracts.findIndex((c) => c.id === id);
    if (idx >= 0) {
      Object.assign(contracts[idx], updates);
      this.setData(STORAGE_KEYS.CONTRACTS, contracts);
    }
  },

  getDailyLogs() {
    return this.getData(STORAGE_KEYS.DAILY_LOGS) || [];
  },

  saveDailyLog(log) {
    if (!this.globalData.env) {
      return Promise.resolve(this._saveDailyLogLocal(log));
    }
    return dailyApi.saveDailyLog(log)
      .then((res) => {
        if (res.success && res.log) {
          this._upsertLocalDailyLog(res.log);
          this.refreshUserBadges();
          return res;
        }
        throw new Error(res.errMsg || '打卡失败');
      });
  },

  _upsertLocalDailyLog(log) {
    if (!log || !getLogId(log)) return;
    const logs = dedupeDailyLogs(this.getDailyLogs().filter((item) => getLogId(item) !== getLogId(log)));
    logs.push(log);
    this.setData(STORAGE_KEYS.DAILY_LOGS, dedupeDailyLogs(logs));
    this._dailyLogsFetchedAt = 0;
  },

  _saveDailyLogLocal(log) {
    const logs = this.getDailyLogs();
    log.id = log.id || `log_${Date.now()}`;
    log.createTime = log.createTime || Date.now();
    logs.push(log);
    this.setData(STORAGE_KEYS.DAILY_LOGS, logs);
    return log;
  },

  loadDailyLogs(orderId) {
    const matchOrder = (item) => item.orderId === orderId || item.order_id === orderId;
    if (this.isMerchantDemoMode() || !this.globalData.env || !orderId) {
      return Promise.resolve(dedupeDailyLogs(this.getDailyLogs().filter(matchOrder)));
    }
    return dailyApi.listDailyLogs(orderId)
      .then((res) => {
        if (!res.success || !Array.isArray(res.logs)) {
          return dedupeDailyLogs(this.getDailyLogs().filter(matchOrder));
        }
        const others = this.getDailyLogs().filter((item) => !matchOrder(item));
        const merged = dedupeDailyLogs(others.concat(res.logs));
        this.setData(STORAGE_KEYS.DAILY_LOGS, merged);
        return dedupeDailyLogs(res.logs);
      })
      .catch((err) => {
        console.error('[打卡] 拉取服务端记录失败', err);
        return dedupeDailyLogs(this.getDailyLogs().filter(matchOrder));
      });
  },

  loadDailyLogsForOrders(orderIds, options = {}) {
    const force = !!(options && options.force);
    const ids = [...new Set((orderIds || []).filter(Boolean))];
    const filterScoped = () => {
      const idSet = new Set(ids);
      return dedupeDailyLogs(
        this.getDailyLogs().filter((item) => idSet.has(item.orderId || item.order_id))
      );
    };

    if (!ids.length) {
      return Promise.resolve(dedupeDailyLogs(this.getDailyLogs()));
    }
    if (this.isMerchantDemoMode() || !this.globalData.env) {
      return Promise.resolve(filterScoped());
    }
    if (!force && this._dailyLogsFetchedAt && Date.now() - this._dailyLogsFetchedAt < DAILY_LOGS_TTL) {
      return Promise.resolve(filterScoped());
    }
    if (!force && this._loadDailyLogsPromise) {
      return this._loadDailyLogsPromise;
    }

    this._loadDailyLogsPromise = dailyApi.fetchDailyLogsForOrders(ids)
      .then((fetched) => {
        const { logs, changed } = userFeed.mergeDailyLogsForOrders(this.getDailyLogs(), fetched, ids);
        if (changed) {
          this.setData(STORAGE_KEYS.DAILY_LOGS, logs);
        }
        this._dailyLogsFetchedAt = Date.now();
        return filterScoped();
      })
      .catch((err) => {
        console.error('[打卡] 批量拉取记录失败', err);
        return filterScoped();
      })
      .finally(() => {
        this._loadDailyLogsPromise = null;
        this.refreshUserBadges();
      });
    return this._loadDailyLogsPromise;
  },

  getChats() { return this.getData(STORAGE_KEYS.CHATS) || []; },

  saveChat(msg) {
    const chats = this.getChats();
    msg.id = 'msg_' + Date.now();
    msg.time = Date.now();
    chats.push(msg);
    this.setData(STORAGE_KEYS.CHATS, chats);
    return msg;
  },

  getShop() {
    return attachStoreDisplayNo(this.getData(STORAGE_KEYS.SHOP) || {});
  },

  saveShop(shop) {
    const normalized = attachStoreDisplayNo(shop || {});
    this.setData(STORAGE_KEYS.SHOP, normalized);
    return normalized;
  },

  getBillingRules() {
    return this.getData(STORAGE_KEYS.BILLING_RULES) || this._defaultBillingRules();
  },

  saveBillingRules(rules) { this.setData(STORAGE_KEYS.BILLING_RULES, rules); },

  _defaultBillingRules() {
    return {
      billingMode: 'weight',
      timeMode: 'daily',
      weightPricing: getDefaultWeightPricing(),
      roomPricing: getDefaultRoomPricing(),
      checkInDayCharge: 'full',
      departureDayCharge: 'full',
      departureCharge: {
        freeUntil: '12:00',
        halfUntil: '18:00',
        fullFrom: '18:00'
      },
      pricing: { cat: 60, smallDog: 80, midDog: 100, largeDog: 150, other: 50 },
      holidayRate: 1.5,
      overtimeRate: 20,
      extras: { pickup: 30, medicine: 20, wash: 80, extraMeal: 15, walk: 25, specialCare: 50 }
    };
  },

  getContractTemplate() { return this.getData(STORAGE_KEYS.CONTRACT_TEMPLATE) || ''; },

  saveContractTemplate(tpl) { this.setData(STORAGE_KEYS.CONTRACT_TEMPLATE, tpl); }
});
