// 清理 MongoDB 业务数据（保留 users 账号壳）
const c = (n) => {
  try {
    return db.getCollection(n).countDocuments({});
  } catch (e) {
    return 0;
  }
};

const snap = () => ({
  users: c('users'),
  stores: c('stores'),
  pets: c('pets'),
  orders: c('orders'),
  daily_logs: c('daily_logs'),
  daily_log_comments: c('daily_log_comments'),
  visit_store_intents: c('visit_store_intents'),
  oa_pending_binds: c('oa_pending_binds'),
  oa_bind_tickets: c('oa_bind_tickets'),
  media_checks: c('media_checks'),
});

print('清理前:', JSON.stringify(snap()));

[
  'stores',
  'pets',
  'orders',
  'daily_logs',
  'daily_log_comments',
  'visit_store_intents',
  'oa_pending_binds',
  'oa_bind_tickets',
  'media_checks',
].forEach((n) => db.getCollection(n).deleteMany({}));

db.users.deleteMany({ openid: 'dev_openid_petmaster' });
db.users.updateMany(
  {},
  {
    $set: {
      store_id: '',
      merchantStoreId: '',
      visitStoreId: '',
      pet_ids: [],
      isMerchant: false,
      merchantStatus: '',
      merchantRole: '',
    },
  }
);

print('清理后:', JSON.stringify(snap()));
