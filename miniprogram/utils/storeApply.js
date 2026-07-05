const { isVagueAddress } = require('./location');
const { normalizeStorePhotos } = require('./storePhotos');

function validateApplyForm(payload) {
  const shop = payload.shop || {};
  const name = (shop.name || '').trim();
  const address = (shop.address || '').trim();
  const contactPhone = (shop.contactPhone || '').trim();
  const legalName = (shop.legalName || '').trim();
  const storePhotos = normalizeStorePhotos(payload.storePhotos || shop.storePhotos);
  const lat = parseFloat(shop.latitude);
  const lng = parseFloat(shop.longitude);

  if (!name) return '请填写店铺名称';
  if (!address) return '请选择营业地址';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '请通过地图选择营业地址';
  if (isVagueAddress(address)) return '营业地址不够详细，请重新在地图中选择具体位置';
  if (!contactPhone) return '请填写联系电话';
  if (!legalName) return '请填写负责人姓名';
  if (!storePhotos.length) return '请至少上传1张店铺照片';
  return '';
}

function createEmptyApplyShop() {
  return {
    name: '',
    address: '',
    contactPhone: '',
    legalName: '',
    locationName: '',
    addressRegion: '',
    latitude: null,
    longitude: null
  };
}

function pickApplyShopFields(shop) {
  const source = shop || {};
  return {
    name: source.name || '',
    address: source.address || '',
    contactPhone: source.contactPhone || '',
    legalName: source.legalName || '',
    locationName: source.locationName || '',
    addressRegion: source.addressRegion || '',
    latitude: source.latitude,
    longitude: source.longitude
  };
}

module.exports = { validateApplyForm, createEmptyApplyShop, pickApplyShopFields };
