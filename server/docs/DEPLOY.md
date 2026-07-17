# Alibaba Cloud Linux 部署指南

本文说明如何在阿里云轻量应用服务器（Alibaba Cloud Linux）上部署 Petmaster 后端。

## 1. 服务器准备

1. 安全组 / 防火墙放行：`22`、`80`、`443`
2. 域名 A 记录指向服务器公网 IP
3. 完成 ICP 备案（大陆服务器对外提供 HTTPS 给小程序必须备案）
4. 开通 OSS，创建 Bucket，创建 RAM 子账号并授予 OSS 权限

## 2. 安装基础软件

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

## 3. 部署代码

```bash
# 上传 server/ 目录到服务器，例如：
cd /opt
sudo mkdir -p petmaster && sudo chown $USER:$USER petmaster
# scp / rsync 将本地 server/ 同步到 /opt/petmaster/server

cd /opt/petmaster/server
cp .env.example .env
# 编辑 .env：填入 MONGO_URI、JWT_SECRET、WX_APPID、WX_SECRET、OSS_*
npm install --production
```

`.env` 关键字段：

| 变量 | 说明 |
|------|------|
| `MONGO_URI` | 如 `mongodb://127.0.0.1:27017/petmaster` |
| `JWT_SECRET` | 长随机串 |
| `WX_APPID` / `WX_SECRET` | 小程序凭证 |
| `OSS_*` | 阿里云 OSS 配置 |

## 4. 启动 API

```bash
cd /opt/petmaster/server
pm2 start src/app.js --name petmaster-api
pm2 save
pm2 startup
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

## 5. Nginx + HTTPS

备案通过后，在阿里云申请免费 SSL，或使用 certbot。

示例 Nginx 配置（`/etc/nginx/conf.d/petmaster.conf`）：

```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/nginx/ssl/api.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/api.example.com.key;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6. 小程序配置

1. 修改 [`miniprogram/config/cloud.js`](../../miniprogram/config/cloud.js) 中 `API_BASE_URL` 为 `https://api.example.com`
2. 微信公众平台 → 开发管理 → 服务器域名：
   - request 合法域名：`https://api.example.com`
   - uploadFile / downloadFile 合法域名：OSS 域名（如 `https://your-bucket.oss-cn-hangzhou.aliyuncs.com`）
3. 开发阶段可勾选「不校验合法域名」，用局域网 IP 联调

## 7. OSS 跨域（CORS）

Bucket → 跨域设置，允许小程序上传：

- 来源：`*`（或具体域名）
- Methods：`GET, POST, PUT, HEAD`
- Headers：`*`
- 暴露 Headers：`ETag, x-oss-request-id`

## 8. 数据迁移（可选）

见 [`docs/DATA_MIGRATION.md`](./DATA_MIGRATION.md)。

## 9. 回滚

稳定前可保留微信云开发环境。若需回滚，将小程序改回 `wx.cloud.callFunction` 并恢复云环境 ID 即可。
