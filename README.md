# PetMaster · 宠物寄养小程序

基于微信云开发模板搭建的宠物寄养服务小程序，当前业务数据使用本地 Storage 模拟，后续可逐步迁移至云数据库。

## 项目结构

```
petmaster/
├── cloudfunctions/          # 云函数（预留，待接入后端能力）
│   └── quickstartFunctions/ # 云开发 QuickStart 示例函数
├── miniprogram/             # 小程序前端
│   ├── app.js               # 全局入口：云初始化 + 业务数据层
│   ├── app.json             # 页面路由、TabBar、全局组件
│   ├── app.wxss             # 全局样式
│   ├── components/          # 公共组件
│   │   ├── calendar/        # 日历选择器
│   │   └── sign-pad/        # 手写签名板
│   ├── images/              # 静态资源
│   │   ├── tab/             # TabBar 图标
│   │   ├── avatar.png
│   │   └── default-avatar.png
│   ├── pages/               # 页面
│   │   ├── index/           # Tab：首页
│   │   ├── orders/          # Tab：订单列表
│   │   ├── daily/           # Tab：寄养动态
│   │   ├── mine/            # Tab：我的
│   │   ├── user/            # 宠主端子页面
│   │   │   ├── login/           登录
│   │   │   ├── pets/            宠物档案列表
│   │   │   ├── pet-form/        新增/编辑宠物
│   │   │   ├── reserve/         预约寄养
│   │   │   ├── order-detail/    订单详情
│   │   │   ├── billing/         账单
│   │   │   ├── contract/        协议查看
│   │   │   ├── contract-sign/   协议签署
│   │   │   ├── pet-daily/       宠物日常动态
│   │   │   └── chat/            与商家聊天
│   │   └── merchant/        # 商家端子页面
│   │       ├── dashboard/       工作台
│   │       ├── orders/          订单管理
│   │       ├── order-detail/    订单详情
│   │       ├── pets/            在店宠物
│   │       ├── billing/         账单管理
│   │       ├── billing-config/  计费规则配置
│   │       ├── contract/        协议管理
│   │       ├── contract-edit/   协议模板编辑
│   │       ├── daily-check/     日常打卡
│   │       ├── chat/            与宠主聊天
│   │       ├── statistics/      数据统计
│   │       └── settings/        店铺设置
│   ├── utils/
│   │   ├── constants.js     # Storage Key 常量
│   │   └── util.js          # 日期、计费、枚举等工具函数
│   └── sitemap.json
├── project.config.json
└── uploadCloudFunction.sh
```

## 功能模块

| 模块 | 说明 |
|------|------|
| 宠主端 | 登录、宠物档案、预约寄养、订单/账单/协议、日常动态、聊天 |
| 商家端 | 工作台、订单管理、在店宠物、计费配置、协议模板、日常打卡、统计 |
| 公共 | 日历组件、签名板、全局样式与本地数据层 |

## 本地开发

1. 用微信开发者工具打开本项目根目录
2. 在 `miniprogram/app.js` 的 `globalData.env` 中填入云环境 ID（接入云能力时使用）
3. 编译运行即可预览全部页面

## 数据说明

当前版本通过 `app.js` 中的 `getData` / `setData` 方法读写微信本地 Storage，适合原型演示与 UI 联调。接入云开发后，可将各 `save*` / `get*` 方法逐步替换为云数据库调用。

## 参考文档

- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
