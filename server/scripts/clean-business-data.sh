#!/bin/bash
# 清理 MongoDB 中的业务测试数据（保留 users 账号壳，清空店铺/宠物/订单/打卡）
set -euo pipefail

docker exec mongo mongosh petmaster --quiet --eval '
const before = {
  users: db.users.countDocuments({}),
  stores: db.stores.countDocuments({}),
  pets: db.pets.countDocuments({}),
  orders: db.orders.countDocuments({}),
  daily_logs: db.daily_logs.countDocuments({})
};
print("清理前:", JSON.stringify(before));

db.stores.deleteMany({});
db.pets.deleteMany({});
db.orders.deleteMany({});
db.daily_logs.deleteMany({});
db.users.deleteMany({ openid: "dev_openid_petmaster" });
db.users.updateMany({}, { $set: { store_id: "", pet_ids: [] } });

const after = {
  users: db.users.countDocuments({}),
  stores: db.stores.countDocuments({}),
  pets: db.pets.countDocuments({}),
  orders: db.orders.countDocuments({}),
  daily_logs: db.daily_logs.countDocuments({})
};
print("清理后:", JSON.stringify(after));
'
