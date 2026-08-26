# 数码名片 MVP

一个可被人和 AI 清晰理解的数字身份页。当前版本完成最小闭环：

> 注册 → 创建/修改名片 → 官网抓取产品 → 公开展示 → 名片夹浏览

## 1. 页面结构

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 欢迎页 | `/` | 品牌说明，提供登录与注册入口 |
| 登录 / 注册 | `/auth.html` | 邮箱密码注册、已有账号登录；成功后进入编辑页 |
| 我的名片 | `/editor.html` | 同时录入姓名、公司/组织、部门和职务；支持纸质名片 OCR、头像/微信二维码、官网产品抓取与产品管理 |
| 公开名片 | `/card.html?slug=...` | 3:2 实体名片比例 + 左图右文产品目录，无需登录即可访问 |
| 名片夹 | `/directory.html?slug=...` | 双栏联系人工作台：左侧姓名与关键词，右侧完整名片和产品；内置 18 个模拟联系人用于界面演示 |

前端使用原生 HTML、CSS、JavaScript；共享样式在 `public/styles.css`，共享请求与反馈逻辑在 `public/app.js`。

## 2. 数据库表设计

### `users`

- `id`：主键
- `email`：唯一登录邮箱
- `password_hash`：bcrypt 密码哈希
- `created_at`：注册时间

### `cards`

- `id`：主键
- `user_id`：所属账号，一对一且级联删除
- `slug`：公开访问标识
- 身份字段：`name`、`company_name`、`department`、`job_title`、`tagline`
- 联系字段：`phone`、`telephone`、`contact_email`、`wechat_qr_url`、`website`、`region`、`address`；旧 `wechat` 字段仅作兼容回退
- 展示字段：`avatar_url`、`bio`、`expertise`、`main_business`、`founded_at`、`team_size`
- `card_type`、`occupation`：仅为兼容第一个版本的旧数据保留，新编辑器不再把个人与公司设为互斥类型
- `created_at`、`updated_at`：创建和更新时间

### `products`

- `id`：主键
- `card_id`：所属名片，多对一且级联删除
- `name`：产品名称
- `description`：产品关键简介
- `image_url`：本地图片路径
- `external_url`：可选外部链接
- `source_type`：`manual` 手动添加或 `website` 官网导入
- `sort_order`：后续排序扩展字段
- `created_at`：创建时间

完整 SQL 位于 `server/schema.sql`。

## 3. 本地运行

需要 Node.js 20+。

```bash
npm install
copy .env.example .env
npm start
```

打开 <http://localhost:3000>。

准备上传阿里云轻量应用服务器时，请参阅 [`DEPLOY_ALIYUN.md`](./DEPLOY_ALIYUN.md)。

默认不要求额外安装数据库：开发环境使用文件持久化的 PGlite（PostgreSQL WASM），数据保存在 `.data/pglite`。它执行同一份 PostgreSQL SQL。

若要连接常规 PostgreSQL：

1. 使用 `docker compose up -d` 启动项目附带的 PostgreSQL；
2. 在 `.env` 中设置：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/digital_card
JWT_SECRET=请替换成至少32位的随机字符串
```

3. 重新执行 `npm start`。服务启动时会自动建表。

## 当前边界

- 图片保存在本机 `uploads/`；生产环境建议迁移到对象存储。
- 官网产品抓取仅访问名片中已保存官网的同域页面，包含内网地址拦截、超时、响应大小限制和链接去重；远程产品图会缓存到本地。
- 名片夹当前使用一张真实名片生成 18 个前端模拟联系人，用于验证搜索、切换、长列表和响应式布局；尚未提供联系人持久化。
- 微信联系入口使用二维码图片，可在编辑页上传、替换或移除；存在二维码时，公开页不再显示微信号文字。
- 纸质名片识别使用本地 Tesseract.js 简体中文模型（可识别常见英文、邮箱和数字）。系统会比较原图、顺时针 90° 和逆时针 90° 三种方向，在有效信息不足时自动选择更好的结果。第一次识别需要下载语言数据，可能较慢；照片识别后立即删除，识别结果需人工核对。
- 当前一个账号对应一张名片；后续可扩展为一个账号管理多张名片。
- 登录使用 7 天有效的 HttpOnly Cookie；未实现邮箱验证、找回密码或复杂权限。
- 不包含 AI 匹配、支付与移动 App。
