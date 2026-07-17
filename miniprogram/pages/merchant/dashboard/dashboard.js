const app = getApp();
const { formatOrderCreateTime } = require('../../../utils/util');
Page({
  data: { shop: {}, stats: { todayRevenue: 0, boardingCount: 0, totalOrders: 0, newOrders: 0 }, boardingList: [] },
  onShow() {
    const shop = app.getShop();
    const pets = app.getPets();
    const orders = app.getOrders();
    const boardingList = orders.filter(o => o.status === 'boarding').map(o => {
      const pet = pets.find(p => p.id === o.petId);
      return {
        ...o,
        petPhoto: pet ? pet.photo : '',
        createTimeText: formatOrderCreateTime(o) || '--'
      };
    });
    const newOrders = orders.filter(o => o.status === 'pending').length;
    const todayRevenue = boardingList.reduce((s, o) => s + (o.totalFee || 0), 0);
    this.setData({ shop, stats: { todayRevenue, boardingCount: boardingList.length, totalOrders: orders.length, newOrders }, boardingList });
  },
  onToggleStatus() { const shop = app.getShop(); shop.status = shop.status === '暂停接单' ? '正常接单' : '暂停接单'; app.saveShop(shop); this.setData({ shop }); wx.showToast({ title: '已切换', icon: 'success' }); },
  onGoOrders() { wx.navigateTo({ url: '/pages/merchant/orders/orders' }); },
  onGoDailyCheck() { wx.navigateTo({ url: '/pages/merchant/daily-check/daily-check' }); },
  onGoStatistics() { wx.redirectTo({ url: '/pages/merchant/tab-statistics/tab-statistics' }); },
  onGoPets() { wx.navigateTo({ url: '/pages/merchant/pets/pets' }); },
  onGoSettings() { wx.reLaunch({ url: '/pages/merchant/tab-store/tab-store' }); },
  onGoDetail(e) { wx.navigateTo({ url: '/pages/merchant/order-detail/order-detail?id=' + e.currentTarget.dataset.id }); }
});