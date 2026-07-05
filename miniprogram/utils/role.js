function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeMerchantStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'approved' || status === 'pending' || status === 'rejected') return status;
  return '';
}

/** 仅审核通过（或历史已开通商家）的用户可进入商家端 */
function isMerchantApproved(user) {
  if (!user) return false;
  const status = normalizeMerchantStatus(user.merchantStatus);
  if (status === 'approved') return true;
  if (status === 'pending') return false;
  return normalizeIsMerchant(user.isMerchant);
}

function isMerchantPending(user) {
  return normalizeMerchantStatus(user && user.merchantStatus) === 'pending';
}

function isMerchantRejected(user) {
  return normalizeMerchantStatus(user && user.merchantStatus) === 'rejected';
}

function isMerchantStaff(user) {
  if (!user) return false;
  return (user.merchantRole || '').toLowerCase() === 'staff';
}

function isStaffOfStore(user, storeId) {
  if (!user || !storeId) return false;
  const id = String(storeId).trim();
  if (!id) return false;
  return isMerchantStaff(user) && isMerchantApproved(user) && String(user.store_id || '').trim() === id;
}

function isStoreOwner(user) {
  if (!user || !isMerchantApproved(user)) return false;
  return !isMerchantStaff(user);
}

function resolveRole(user) {
  return isMerchantApproved(user) ? 'merchant' : 'user';
}

module.exports = {
  normalizeIsMerchant,
  normalizeMerchantStatus,
  isMerchantApproved,
  isMerchantPending,
  isMerchantRejected,
  isMerchantStaff,
  isStaffOfStore,
  isStoreOwner,
  resolveRole
};
