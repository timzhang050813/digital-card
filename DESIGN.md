# 数码名片 Design System

## Stack

- framework: 原生 HTML + CSS + JavaScript
- backend: Node.js + Express
- styling: CSS custom properties
- components: 原生可复用样式与页面模块
- animation: CSS transitions（支持 reduced motion）
- icons: 内联 SVG

## Tokens

- brand: `--color-brand` / `--color-brand-strong`
- background: `--color-canvas` / `--color-surface` / `--color-subtle`
- foreground: `--color-ink` / `--color-muted`
- radius: `--radius-sm` / `--radius-md` / `--radius-lg`
- shadow: `--shadow-sm` / `--shadow-lg`

完整 token 定义位于 `public/styles.css`。

## Decisions

- 2026-08-26 — 初始化：采用原生前端与 Express，减少 MVP 依赖并保持后续可迁移性。
- 2026-08-26 — 页面系统：使用温暖白底、深色文字和克制的绿色品牌色；所有页面共用导航、按钮、表单与反馈样式。
- 2026-08-26 — 名片展示：桌面端为横向实体名片构图，移动端自动折叠；产品区使用响应式网格。
- 2026-08-26 — 主体模型升级：个人与公司信息可以同时存在；以姓名、公司/组织、部门、职务组成名片身份层级。
- 2026-08-26 — 纸质名片导入：编辑器增加本地 OCR 上传面板，识别结果只填充空字段并保留原始文字供核对。
- 2026-08-26 — 微信联系入口：用可上传、替换和移除的微信二维码取代公开微信号文字；公开名片在联系方式旁展示可扫描二维码。
- 2026-08-26 — 真实名片照片：OCR 启用自动旋转，以适配横向名片由手机竖向拍摄的常见情况。
- 2026-08-26 — 实体名片比例：公开名片采用 90×60 mm 的 3:2 比例，桌面端上限为 108 mm（放大 20%），手机端等比缩放；视觉升级为深绿、暖白与细金线的现代商务风格。
- 2026-08-26 — 官网产品目录：编辑器可从已保存的公司官网抓取同域产品详情页，提取名称、关键简介、缩略图和链接并去重；公开页采用左图右文的单列精品目录，适合较多产品连续浏览。
- 2026-08-26 — 名片夹工作台：新增桌面双栏、移动端主从切换的联系人浏览页；左侧突出姓名、公司和三个关键词，右侧组合 3:2 名片与纵向产品目录，并使用 18 个模拟联系人验证长列表、搜索与切换。
- 2026-08-26 — 首页示例名片：取消桌面端与手机端的装饰性旋转，保持卡片边缘水平垂直，以更准确传达实体名片尺寸与版式。

## Components

- 顶部导航：`public/*.html`
- 欢迎页：`public/index.html`
- 登录/注册面板：`public/auth.html`
- 名片编辑器与产品管理：`public/editor.html`
- 纸质名片 OCR 导入面板：`public/editor.html`、`public/editor.js`、`server/ocr.js`
- 微信二维码上传与展示：`public/editor.html`、`public/editor.js`、`public/card.js`
- 公开名片与产品网格：`public/card.html`
- 3:2 艺术化公开名片：`public/card.js`、`public/styles.css`
- 官网产品抓取与横向精品目录：`server/site-import.js`、`server/index.js`、`public/editor.html`、`public/editor.js`、`public/card.js`
- 双栏名片夹与模拟联系人：`public/directory.html`、`public/directory.js`、`public/styles.css`
- Toast、空状态、加载骨架：`public/app.js`、`public/styles.css`

## Responsive behavior

- mobile (< 640px): 单列布局、全宽主按钮、名片保持 3:2，产品目录缩略图与简介横向排列。
- tablet (640px–959px): 表单保持单列，产品目录保持单列横向卡片。
- desktop (>= 960px): 编辑器双栏，名片保持 3:2，产品目录以宽版单列展示。

## Non-Goals

- 不做 AI 匹配、支付、复杂权限或移动 App。
- 当前版本不做深色模式与多主题。
- 不依赖前端框架。
