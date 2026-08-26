# 阿里云轻量应用服务器部署说明

本项目可以先使用内置 PGlite 数据库，不需要购买或申请云端 PostgreSQL。适合当前单台轻量服务器试运行。

## 一、部署包内容

- `public/`：网页文件
- `server/`：Node.js + Express 后端
- `server/schema.sql`：PostgreSQL 数据库结构
- `uploads/.gitkeep`：上传目录占位文件
- `README.md`：项目功能、页面和数据库说明
- `DESIGN.md`：界面设计规范和变更记录
- `docker-compose.yml`：以后切换标准 PostgreSQL 时使用

部署包不包含本地账号、数据库、头像、二维码、产品图片、密码或环境变量。

## 二、服务器要求

- 推荐系统：Ubuntu 22.04 或 24.04
- Node.js：20 或更高版本
- 内存：建议 2GB 或以上
- 阿里云防火墙：开放 TCP 80；配置 HTTPS 后再开放 TCP 443
- 不需要对公网开放 3000 或 PostgreSQL 的 5432 端口

## 三、上传并解压

在阿里云控制台把 ZIP 上传到服务器后，登录服务器执行：

```bash
sudo apt update
sudo apt install -y unzip nginx
sudo mkdir -p /opt/digital-card
sudo unzip digital-card-deploy.zip -d /opt/digital-card
cd /opt/digital-card
```

确认 Node.js 版本：

```bash
node -v
npm -v
```

如果 Node.js 低于 20，请先在阿里云应用镜像或系统软件源中安装 Node.js 20/22，再继续。

## 四、安装依赖并生成安全配置

```bash
cd /opt/digital-card
npm ci --omit=dev
JWT_VALUE=$(openssl rand -hex 32)
printf "PORT=3000\nJWT_SECRET=%s\n" "$JWT_VALUE" | sudo tee .env >/dev/null
sudo mkdir -p .data uploads
sudo chown -R www-data:www-data /opt/digital-card
```

不要把 `.env` 发给别人，也不要提交到 GitHub。

## 五、设置开机自动运行

创建 `/etc/systemd/system/digital-card.service`：

```ini
[Unit]
Description=Digital Card Website
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/digital-card
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now digital-card
sudo systemctl status digital-card
```

看到 `active (running)` 表示网站程序已启动。

## 六、配置 Nginx

创建 `/etc/nginx/sites-available/digital-card`：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/digital-card /etc/nginx/sites-enabled/digital-card
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

现在可以在浏览器中打开：

```text
http://服务器公网IP
```

## 七、备份

试运行阶段至少备份以下两个目录：

- `/opt/digital-card/.data/`：账号、名片和产品数据
- `/opt/digital-card/uploads/`：头像、二维码和产品图片

示例：

```bash
sudo tar -czf /root/digital-card-backup.tar.gz \
  /opt/digital-card/.data \
  /opt/digital-card/uploads
```

## 八、后续升级

- 绑定域名并申请 HTTPS 证书
- 将 PGlite 迁移到 PostgreSQL 或阿里云 RDS
- 将图片迁移到阿里云 OSS
- 增加自动备份和监控

