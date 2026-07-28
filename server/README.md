# Petmaster API（阿里云自建后端）

Express + MongoDB + 本地磁盘媒体（`/media`），替代原微信云开发云函数 / 云数据库 / 云存储。

## 本地开发

```bash
cp .env.example .env
# 编辑 .env；开发可设 DEV_MOCK_WECHAT=true 跳过真实微信登录

# 需本机 MongoDB
npm install
npm start
```

健康检查：`GET http://127.0.0.1:3000/health`

## 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | `{ code }` → JWT |
| POST | `/api/user` | 原 userAuth，body 含 `action` |
| POST | `/api/store` | 原 storeService |
| POST | `/api/order` | 原 orderService |
| POST | `/api/pet` | 原 petService |
| POST | `/api/daily` | 原 dailyService |
| POST | `/api/upload/sign` | 获取本地上传凭证 |
| POST | `/api/upload` | 小程序直传文件（multipart，需登录） |
| GET | `/media/*` | 本地媒体静态访问 |

鉴权：`Authorization: Bearer <token>`

## 文档

- [部署到 Alibaba Cloud Linux](docs/DEPLOY.md)
- [数据迁移](docs/DATA_MIGRATION.md)
