/**
 * 拆分 users.store_id → merchantStoreId + visitStoreId，并创建索引
 * 用法：node scripts/normalize-user-schema.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDb, getDb } = require('../src/db');
const userFields = require('../src/services/userFields');
const identity = require('../src/services/identity');

async function normalizeUsers() {
  const col = getDb().collection('users');
  const users = await col.find({}).toArray();
  let updated = 0;

  for (const user of users) {
    const legacy = (user.store_id || '').trim();
    let merchantStoreId = (user.merchantStoreId || '').trim();
    let visitStoreId = (user.visitStoreId || '').trim();

    if (!merchantStoreId && userFields.isMerchantApprovedFromDoc(user) && legacy) {
      merchantStoreId = legacy;
    } else if (!merchantStoreId && userFields.normalizeMerchantStatus(user.merchantStatus) === 'pending' && legacy) {
      merchantStoreId = legacy;
    }

    if (!visitStoreId && legacy && legacy !== merchantStoreId) {
      visitStoreId = legacy;
    }

    const nextStoreId = visitStoreId;
    const patch = {};
    if (merchantStoreId !== (user.merchantStoreId || '')) patch.merchantStoreId = merchantStoreId;
    if (visitStoreId !== (user.visitStoreId || '')) patch.visitStoreId = visitStoreId;
    if (nextStoreId !== (user.store_id || '')) patch.store_id = nextStoreId;

    if (Object.keys(patch).length) {
      patch.updateTime = Date.now();
      await col.updateOne({ _id: user._id }, { $set: patch });
      updated += 1;
    }
  }

  return { total: users.length, updated };
}

async function normalizeStoreOwners() {
  const usersCol = getDb().collection('users');
  const storesCol = getDb().collection('stores');
  const stores = await storesCol.find({ ownerOpenid: { $exists: true, $ne: '' } }).toArray();
  let updated = 0;

  for (const store of stores) {
    const ownerOpenid = (store.ownerOpenid || '').trim();
    if (!ownerOpenid) continue;
    const user = await identity.findPrimaryUserByOpenid(ownerOpenid);
    if (!user || !user.openid || user.openid === ownerOpenid) continue;
    await storesCol.updateOne(
      { _id: store._id },
      { $set: { ownerOpenid: user.openid, updateTime: Date.now() } }
    );
    await usersCol.updateOne(
      { _id: user._id },
      {
        $set: {
          merchantStoreId: store.store_id,
          updateTime: Date.now()
        }
      }
    );
    updated += 1;
  }

  return { total: stores.length, updated };
}

async function ensureIndexes() {
  const db = getDb();
  await db.collection('users').createIndex({ openid: 1 });
  await db.collection('users').createIndex({ 'openids.user': 1 });
  await db.collection('users').createIndex({ 'openids.merchant': 1 });
  await db.collection('users').createIndex({ phone: 1 });
  await db.collection('users').createIndex({ merchantStoreId: 1 });
  await db.collection('users').createIndex({ visitStoreId: 1 });
  await db.collection('stores').createIndex({ store_id: 1 }, { unique: true });
  await db.collection('stores').createIndex({ ownerOpenid: 1 });
  await db.collection('pets').createIndex({ pet_id: 1 }, { unique: true });
  await db.collection('pets').createIndex({ ownerOpenid: 1 });
  await db.collection('orders').createIndex({ order_id: 1 }, { unique: true });
  await db.collection('orders').createIndex({ userOpenid: 1 });
  await db.collection('orders').createIndex({ store_id: 1 });
  await db.collection('daily_logs').createIndex({ order_id: 1 });
  return { ok: true };
}

async function main() {
  await connectDb();
  const users = await normalizeUsers();
  const stores = await normalizeStoreOwners();
  const indexes = await ensureIndexes();
  console.log(JSON.stringify({ users, stores, indexes }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
