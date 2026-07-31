// 完全重置 petmaster 数据库（删除所有集合与用户）
const names = db.getCollectionNames();
print('重置前集合:', JSON.stringify(names));
print(
  '重置前文档数:',
  JSON.stringify(
    Object.fromEntries(names.map((n) => [n, db.getCollection(n).countDocuments({})]))
  )
);

const result = db.dropDatabase();
print('dropDatabase:', JSON.stringify(result));

print('重置后集合:', JSON.stringify(db.getCollectionNames()));
