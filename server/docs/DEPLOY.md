# Alibaba Cloud Linux 部署指南

本文说明如何在阿里云轻量应用服务器（Alibaba Cloud Linux）上部署 Petmaster 后端。

## 1. 服务器准备

1. 安全组 / 防火墙放行：`22`、`80`、`443`
2. 域名 A 记录指向服务器公网 IP（官网 `petmaster.me` / `www`，API `api.petmaster.me`）
3. 完成 ICP 备案（大陆服务器对外提供 HTTPS 给小程序必须备案）
4. 媒体文件默认存服务器本地磁盘（`MEDIA_ROOT`），小程序 uploadFile/downloadFile 域名填 `https://api.petmaster.me`

## 2. 双小程序凭证

| 变量 | 说明 |
|------|------|
| `WX_APPID` / `WX_SECRET` | 宠主端小程序 |
| `WX_MERCHANT_APPID` / `WX_MERCHANT_SECRET` | 商家端小程序 |

登录接口：`POST /api/auth/login`，body 带 `client: "user" | "merchant"`。  
两端 openid 不同，服务端用 UnionID / 手机号 / `openids.*` 对齐到同一业务用户。

## 2.1 服务号模板消息与关注欢迎

| 变量 | 说明 |
|------|------|
| `WX_OA_APPID` / `WX_OA_SECRET` | 服务号凭证 |
| `WX_OA_TOKEN` | 回调验签 Token |
| `WX_OA_AES_KEY` | 可选；安全模式 EncodingAESKey |
| `WX_OA_TEMPLATE_*` | 新订单 / 订单状态 / 打卡 模板 ID |
| `WX_OA_QRCODE_URL` | 小程序引导关注用的二维码图 |
| `WX_OA_WELCOME_TEXT` | 关注被动回复欢迎文案 |
| `TENCENT_MAP_KEY` | 腾讯位置服务 WebServiceAPI Key（接送驾车距离） |

回调 URL：`https://api.petmaster.me/api/wechat/oa`（明文或兼容模式）。用户关注后通过 UnionID 写入 `users.openids.oa`。

关注欢迎流程：

1. 公众号后台进入开发者模式，服务器 URL 填上述回调地址，Token 与 `WX_OA_TOKEN` 一致
2. 商家分享链接：`https://api.petmaster.me/s/{store_id}`；扫码关注时 EventKey 为 `qrscene_s_{store_id}`
3. 关注/扫码后登记店铺意向（`visitStoreIntent`），并被动回复欢迎文字；**不再推送小程序卡片**
4. 修改 `.env` 后执行 `pm2 restart petmaster-api`
5. 测试：打开分享链接 → 关注服务号 → 应收到欢迎文字，打开商家分享的小程序卡片即可绑定店铺

接送按距离计费时，小程序通过 `GET/POST /api/map/driving-distance` 由服务端代理腾讯驾车距离接口。

## 3. 安装基础软件

```bash
# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# MongoDB 7（官方源，按阿里云文档选择对应发行版）
# 或使用 Docker：docker run -d --name mongo -p 127.0.0.1:27017:27017 mongo:7

# Nginx
sudo yum install -y nginx

# 进程守护
sudo npm i -g pm2
```

确认 MongoDB 仅监听 `127.0.0.1`，不要对公网开放。

## 4. 部署代码

```bash
cd /opt
sudo mkdir -p petmaster && sudo chown $USER:$USER petmaster
# 将本地 server/ 同步到 /opt/petmaster/server

cd /opt/petmaster/server
cp .env.example .env
# 编辑 .env：填入 MONGO_URI、JWT_SECRET、WX_*、MEDIA_*
mkdir -p /opt/petmaster/media/_tmp
# 确保 Node 进程用户（如 pm2 运行用户）对 media 目录可写
npm install --production
```

## 5. 启动 API

```bash
cd /opt/petmaster/server
pm2 start src/app.js --name petmaster-api
pm2 save
pm2 startup
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
curl https://api.petmaster.me/health
```

## 6. Nginx + HTTPS

推荐使用 acme.sh（Let's Encrypt）：

```bash
curl -fsSL https://get.acme.sh | sh -s email=admin@petmaster.me
~/.acme.sh/acme.sh --issue -d petmaster.me -d www.petmaster.me -d api.petmaster.me -w /var/www/petmaster --server letsencrypt
~/.acme.sh/acme.sh --install-cert -d petmaster.me --ecc \
  --key-file /etc/nginx/ssl/petmaster.me.key \
  --fullchain-file /etc/nginx/ssl/petmaster.me.pem \
  --reloadcmd 'nginx -s reload'
```

Nginx：`api.petmaster.me` 反代到 `127.0.0.1:3000`；官网域名托管静态站点（含 `website/admin/` 管理后台）。

## 7. 官网管理后台（商家入驻审核）

1. 将 `website/` 同步到 Nginx 静态目录（如 `/var/www/petmaster`）
2. 管理入口：`https://petmaster.me/admin/login.html`
3. 在 `.env` 配置管理员账号（逗号分隔，格式 `用户名:密码`）：

```bash
ADMIN_ACCOUNTS=jinsen:你的密码,reviewer:你的密码
ADMIN_JWT_EXPIRES_IN=8h
```

4. 审核 API（需 admin JWT）：
   - `POST /api/admin/login`
   - `GET /api/admin/applications`
   - `POST /api/admin/applications/review`

审核通过后，商家端小程序下次拉取用户信息时会同步 `merchantStatus: approved`。

## 8. 小程序配置

1. 宠主端 / 商家端 `config/api.js` 中 `API_BASE_URL = 'https://api.petmaster.me'`
2. 微信公众平台 → 开发管理 → 服务器域名（**两个小程序都要配**）：
   - request 合法域名：`https://api.petmaster.me`
   - uploadFile / downloadFile 合法域名：`https://api.petmaster.me`
3. 两端绑定同一微信开放平台账号，可自动拿到 UnionID 打通身份

## 8.1 上传图片内容安全（微信免费接口）

上传接口会：

1. **同步** `imgSecCheck`：压缩后审图，违规直接返回失败（客户端拿不到 URL，正式内容不会展示）
2. **异步** `mediaCheckAsync`：结果经小程序消息推送回传；若判定违规则删除服务器文件（之后图片会加载失败）

需在**宠主端、商家端**两个小程序后台都配置消息推送（开发 → 开发管理 → 消息推送）：

| 项 | 值 |
| --- | --- |
| URL | `https://api.petmaster.me/api/wechat/mp` |
| Token | 与 `.env` 中 `WX_MP_TOKEN` 一致（未配则用 `WX_OA_TOKEN`） |
| 加密方式 | 建议明文联调，或安全模式并配置 `WX_MP_AES_KEY` |
| 数据格式 | 建议 JSON |

修改 `.env` 后执行 `pm2 restart petmaster-api`。服务器需已安装 `ffmpeg`（同步审图压缩、视频封面抽帧都依赖它）。

## 9. 本地媒体目录

默认路径 `/opt/petmaster/media`，经 API 静态路由 `/media` 对外访问。注意磁盘容量与备份。

## 10. 数据迁移（可选）

见 [`docs/DATA_MIGRATION.md`](./DATA_MIGRATION.md)。
