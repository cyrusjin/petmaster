---
name: hp-ui-design
description: >-
  Petmaster 小程序 HP Boxing Gym 风格 UI 设计规范。深海蓝主色、浅灰背景、白卡片、柔和阴影。
  在新建/修改页面、组件、wxss、wxml 样式，或用户提及 UI 重构、设计规范、配色、风格统一时使用。
---

# HP UI 设计规范（Petmaster）

## 设计令牌

令牌定义在 `miniprogram/styles/design-tokens.wxss`，通过 `app.wxss` 全局引入。优先使用 CSS 变量，页面级样式可写死同色值。

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--color-primary` | `#1D3D7A` | 主色：按钮、激活态、价格、链接 |
| `--color-primary-light` | `#2B5AA0` | 次要强调、渐变终点 |
| `--color-accent-bg` | `#F2F4FF` | 选中背景、标签底、图标装饰圆 |
| `--color-bg-page` | `#F7F8FA` | 页面背景 |
| `--color-bg-card` | `#FFFFFF` | 卡片、弹层 |
| `--color-text-heading` | `#000000` | 标题、大数字 |
| `--color-text-primary` | `#333333` | 正文 |
| `--color-text-secondary` | `#666666` | 副文案 |
| `--color-text-tertiary` | `#999999` | 标签、占位、未激活 Tab |
| `--color-border` | `#E8ECF0` | 分割线、输入框边框 |
| `--color-danger` | `#E53935` | 错误、关闭、到期提醒 |
| `--shadow-card` | `0 4rpx 20rpx rgba(0,0,0,0.05)` | 卡片阴影 |
| `--shadow-btn` | `0 6rpx 20rpx rgba(29,61,122,0.22)` | 主按钮阴影 |
| `--radius-card` | `24rpx` | 卡片圆角 |
| `--radius-pill` | `999rpx` | 胶囊按钮 |

## 全局类（app.wxss）

新建页面应复用以下类，避免重复定义：

- **布局**：`.container` `.card` `.flex-row` `.flex-between`
- **标题**：`.card-title` / `.section-title`（左侧 6rpx 深蓝竖条）
- **表单**：`.form-group` `.form-label` `.form-input` `.form-textarea`
- **按钮**：`.btn-primary`（实心胶囊）`.btn-outline`（描边胶囊）`.btn-sm`
- **Tab**：`.order-tabs` + `.order-tab`（文字 + 底部短下划线激活态，**不用**填充色块）
- **Pill 切换**：`.pill-tabs` + `.pill-tab`（上月/本月类切换）
- **标签**：`.tag` `.tag-green` 等
- **统计数字**：`.stat-number`（粗体斜体 + 轻阴影）

## 组件模式

### 卡片
```css
background: #FFFFFF;
border-radius: 24rpx;
box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
```

### 主按钮
```css
background: #1D3D7A;
color: #FFFFFF;
border-radius: 999rpx;
box-shadow: 0 6rpx 20rpx rgba(29, 61, 122, 0.22);
```

### 区块标题
```css
font-weight: 700;
color: #000000;
padding-left: 16rpx;
border-left: 6rpx solid #1D3D7A;
```

### Tab 激活态
```css
.order-tab.active {
  color: #000000;
  font-weight: 700;
  background: transparent;
}
.order-tab.active::after {
  width: 48rpx; height: 6rpx;
  background: #1D3D7A;
  border-radius: 3rpx;
}
```

### 选中项（宠物/房型/模式）
```css
background: #F2F4FF;
border: 2rpx solid #1D3D7A;
color: #1D3D7A;
```

## Tab 图标

路径：`miniprogram/images/tab/`

| 文件 | 用途 |
|------|------|
| `tab-home` | 用户端首页 |
| `tab-order` | 用户端订单 / 商家日常管理 |
| `tab-daily` | 用户端动态 |
| `tab-shop` | 商家我的店铺 |
| `tab-mine` | 预留 |

- 未选中：灰色线框 `#999999`
- 选中：深海蓝实心 `#1D3D7A` + 白色细节
- 尺寸：81×81 px，透明背景

重新生成：`cd scripts && npm i sharp && node generate-tab-icons.mjs ../miniprogram/images/tab`

## 导航与 TabBar

`app.json` 配置：
- `navigationBarBackgroundColor`: `#1D3D7A`
- `navigationBarTextStyle`: `white`
- `backgroundColorTop`: `#1D3D7A`（与导航栏同色，消除状态栏与导航栏之间的接缝，iOS 必设）
- `backgroundColor`: `#F7F8FA`（页面内容区背景）
- TabBar `color`: `#999999`，`selectedColor`: `#1D3D7A`

页面级 `navigationBarBackgroundColor` 覆盖时保持 `#1D3D7A`。

## 禁止使用的旧配色

以下橙色暖色主题已废弃，**不得**在新代码中使用：

`#FF8C69` `#FFB347` `#5D4037` `#FFE0D0` `#FFF5F0` `#FFF8F5` `#A1887F` `#BFA094` `#8D6E63` `#FFF0E8`

主色渐变 `linear-gradient(135deg, #FF8C69, #FFB347)` 改为纯色 `#1D3D7A`。

## 新增页面检查清单

- [ ] 页面背景 `#F7F8FA`，内容用白卡片
- [ ] 主操作按钮用 `.btn-primary` 或 `#1D3D7A` 胶囊
- [ ] 标题用 `.card-title` 左竖条样式
- [ ] Tab 用下划线激活，不用色块填充
- [ ] 阴影用 `rgba(0,0,0,0.05)`，不用橙色阴影
- [ ] `checkbox`/`radio` 的 `color` 属性设为 `#1D3D7A`
- [ ] `wx.showModal` 的 `confirmColor` 设为 `#1D3D7A`

## 参考文件

- 令牌：`miniprogram/styles/design-tokens.wxss`
- 全局样式：`miniprogram/app.wxss`
- 首页示例：`miniprogram/pages/index/index.wxss`
- 日历组件：`miniprogram/components/calendar/calendar.wxss`
- 商家 Tab：`miniprogram/styles/merchant-tab.wxss`
