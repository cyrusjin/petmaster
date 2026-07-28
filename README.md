# PetMaster · 宠物寄养小程序（宠主端）

宠主端小程序，业务数据通过自建 API（`https://api.petmaster.me`）读写；商家端为独立小程序 `PetMasterBusiness`。

## AppID

- 宠主端：`wx95d01c319ed4f686`
- 商家端：`wx327ccf77cdedc252`

## 项目结构

```
petmaster/
├── miniprogram/             # 宠主端小程序前端
│   ├── config/api.js        # API Base URL 与 client 标识
│   ├── utils/api.js         # HTTP 请求、登录、业务接口路由
│   ├── utils/upload.js      # 媒体上传到服务器
│   ├── app.js               # 全局入口与业务数据层
│   └── pages/               # 宠主端页面（首页/订单/动态/预约等）
├── server/                  # 自建后端（Express + MongoDB）
└── project.config.json
```

## 从商家分享进入

客人通过商家「分享给客人」进入时，会先打开商家端中转页，再自动跳转到本小程序 `pages/index/index?store_id=xxx`。

员工邀请链接若误打开本端，会提示跳转商家端小程序接受邀请。

## API

- Base URL：`https://api.petmaster.me`（配置于 `miniprogram/config/api.js`）
- 登录：`POST /api/auth/login`，body 带 `{ code, client: "user" }`
- 业务接口：`/api/user|store|order|pet|daily`、`/api/upload/sign`
- 媒体：`wx.uploadFile` 到服务器，公开访问 `https://api.petmaster.me/media/...`

## 本地开发

1. 用微信开发者工具打开本项目根目录
2. 确认 `miniprogram/config/api.js` 中 `API_BASE_URL` 指向可用后端
3. 开发者工具勾选「不校验合法域名」便于本地调试；真机/正式版需在公众平台配置 `https://api.petmaster.me`
4. 后端部署见 `server/docs/DEPLOY.md`

## 参考文档

- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
