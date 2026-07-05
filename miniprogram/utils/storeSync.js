const { normalizeReceptionRange, formatReceptionRangeText } = require('./receptionRange');
const { isCloudFileId } = require('./storePhotos');

const MERGE_TEXT_FIELDS = [
  'name',
  'intro',
  'notice',
  'pickupNotice',
  'address',
  'locationName',
  'addressRegion',
  'contactPhone',
  'legalName',
  'hours',
  'logo',
  'boardingContractClauseText'
];

function hasOwn(shop, key) {
  return shop && Object.prototype.hasOwnProperty.call(shop, key);
}

function hasReceptionRange(shop) {
  return normalizeReceptionRange(shop && (shop.receptionRange || shop.range)).length > 0;
}

function hasStorePhotos(shop) {
  return Array.isArray(shop && shop.storePhotos) && shop.storePhotos.length > 0;
}

function hasBillingRules(shop) {
  return !!(shop && shop.billingRules && Object.keys(shop.billingRules).length);
}

function hasBusinessHours(shop) {
  const hours = shop && shop.businessHours;
  return !!(hours && (hours.openTime || hours.closeTime || (Array.isArray(hours.weekdays) && hours.weekdays.length)));
}

/**
 * 云端与本地店铺数据合并：云端优先，但避免用空云端覆盖有效本地缓存。
 */
function mergeMerchantShop(local, cloud) {
  if (!cloud || !cloud.store_id) return local || cloud || {};
  if (!local || !local.store_id || local.store_id !== cloud.store_id) {
    return { ...cloud };
  }

  const merged = {
    ...local,
    ...cloud,
    store_id: cloud.store_id
  };

  MERGE_TEXT_FIELDS.forEach((key) => {
    const cloudVal = (cloud[key] || '').trim();
    const localVal = (local[key] || '').trim();
    if (!cloudVal && localVal) merged[key] = local[key];
  });

  if (!hasReceptionRange(cloud) && hasReceptionRange(local)) {
    merged.receptionRange = local.receptionRange || local.range;
    merged.range = local.range || formatReceptionRangeText(local.receptionRange);
  } else {
    merged.receptionRange = normalizeReceptionRange(cloud.receptionRange || cloud.range);
    merged.range = formatReceptionRangeText(merged.receptionRange);
  }

  if (!hasStorePhotos(cloud) && hasStorePhotos(local)) {
    merged.storePhotos = local.storePhotos;
  } else if (Array.isArray(cloud.storePhotos) && Array.isArray(local.storePhotos)) {
    merged.storePhotos = cloud.storePhotos.map((url, index) => {
      if (isCloudFileId(local.storePhotos[index]) && !isCloudFileId(url)) {
        return local.storePhotos[index];
      }
      return url;
    });
  }

  if (isCloudFileId(local.logo) && cloud.logo && !isCloudFileId(cloud.logo)) {
    merged.logo = local.logo;
  }

  if (!hasBillingRules(cloud) && hasBillingRules(local)) {
    merged.billingRules = local.billingRules;
  }

  if (!hasBusinessHours(cloud) && hasBusinessHours(local)) {
    merged.businessHours = local.businessHours;
    if ((local.hours || '').trim()) merged.hours = local.hours;
  }

  if (cloud.pickupService == null && local.pickupService != null) {
    merged.pickupService = local.pickupService;
  }

  if (cloud.deposit == null && local.deposit != null) {
    merged.deposit = local.deposit;
  }

  if (cloud.compensationLimit == null && local.compensationLimit != null) {
    merged.compensationLimit = local.compensationLimit;
  }

  return merged;
}

module.exports = {
  mergeMerchantShop,
  hasOwn
};
