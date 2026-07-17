# 云开发数据迁移到 MongoDB / OSS

有存量数据时按下列步骤操作；空库上线可跳过。

## 1. 导出云数据库

在微信开发者工具 → 云开发 → 数据库，分别导出：

- `users.json`
- `stores.json`
- `pets.json`
- `orders.json`
- `daily_logs.json`

放到本机目录，例如 `server/migrate-data/`。

## 2. 导入 MongoDB

在服务器或本机（已配置 `.env` 的 `MONGO_URI`）：

```bash
cd server
node src/scripts/import-collections.js ./migrate-data
```

脚本会按集合名导入 JSON 数组；若文档含 `_id` 字符串且为合法 ObjectId，会尽量保留。

## 3. 迁移云存储文件到 OSS

1. 从云开发控制台下载文件，或用工具按 `cloud://` fileID 批量下载
2. 上传到 OSS，保持相对路径清晰（如 `store-photos/`、`daily/`）
3. 准备映射文件 `url-map.json`：

```json
{
  "cloud://xxx/store-photos/a.jpg": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/store-photos/a.jpg"
}
```

4. 批量改写库内字段：

```bash
node src/scripts/rewrite-cloud-urls.js ./migrate-data/url-map.json
```

会扫描 `users`、`stores`、`pets`、`orders`、`daily_logs` 中常见媒体字段并替换。

## 4. 校验

```bash
# 登录拿 token 后调用
curl -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"code":"test"}'
# DEV_MOCK_WECHAT=true 时可本地测
```

在小程序开发者工具中验证店铺图、宠物图、打卡媒体是否可显示。
