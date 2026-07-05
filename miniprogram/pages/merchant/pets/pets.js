const app = getApp();
Page({
  data: { pets: [], filtered: [], keyword: '' },
  onShow() { const pets = app.getPets(); this.setData({ pets, filtered: pets }); },
  onSearch(e) { const kw = e.detail.value.toLowerCase(); this.setData({ keyword: kw, filtered: this.data.pets.filter(p => p.name && p.name.toLowerCase().includes(kw)) }); },
  onAdd() { wx.navigateTo({ url: '/pages/user/pet-form/pet-form' }); },
  onEdit(e) { wx.navigateTo({ url: '/pages/user/pet-form/pet-form?id=' + e.currentTarget.dataset.id }); }
});