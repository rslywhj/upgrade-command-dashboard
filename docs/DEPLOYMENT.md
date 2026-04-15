# 部署与更新说明

本文说明升级指挥大屏的构建、Windows 部署、麒麟 Linux 部署和日常更新流程。

## 构建环境

建议环境：

- Node.js 20 LTS 或更高版本
- npm 10 或更高版本
- Chrome / Edge 浏览器

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

构建输出：

- `dist/`：可直接部署的静态文件目录。
- `dist.zip`：由 `npm run zip` 生成的压缩包，便于人工拷贝发布。

## Windows + Nginx 部署

1. 下载 Nginx Windows 版。

   下载地址：

   ```text
   http://nginx.org/en/download.html
   ```

2. 解压到固定目录，例如：

   ```text
   D:\nginx
   ```

3. 将 `dist/` 目录内的所有文件复制到：

   ```text
   D:\nginx\html
   ```

4. 编辑 Nginx 配置：

   ```text
   D:\nginx\conf\nginx.conf
   ```

   将站点 `server` 配置为：

   ```nginx
   server {
       listen       80;
       server_name  localhost;

       location / {
           root   html;
           index  index.html;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

5. 启动 Nginx：

   ```text
   D:\nginx\nginx.exe
   ```

6. 浏览器访问：

   ```text
   http://localhost
   http://127.0.0.1
   ```

## 麒麟 Linux + Nginx 部署

1. 安装 Nginx。

   ```bash
   sudo apt update
   sudo apt install nginx -y
   nginx -v
   ```

2. 将 `dist/` 目录内的所有文件复制到默认站点目录：

   ```bash
   sudo cp -r dist/* /var/www/html/
   ```

3. 编辑默认站点配置：

   ```bash
   sudo nano /etc/nginx/sites-available/default
   ```

   将 `server` 配置为：

   ```nginx
   server {
       listen 80;
       server_name localhost;

       root /var/www/html;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

4. 检查配置并启动：

   ```bash
   sudo nginx -t
   sudo systemctl start nginx
   sudo systemctl enable nginx
   sudo systemctl status nginx
   ```

5. 浏览器访问：

   ```text
   http://localhost
   http://127.0.0.1
   ```

## 日常更新流程

1. 在开发机更新代码和文档。
2. 执行检查和构建：

   ```bash
   npm run lint
   npm run build
   ```

3. 将新生成的 `dist/` 内容覆盖到 Nginx 站点目录。
4. 刷新浏览器页面。如果仍显示旧版本，清理浏览器缓存后重试。

## 常见问题

页面刷新后 404：

- 检查 Nginx 是否配置了 `try_files $uri $uri/ /index.html;`。

导入 Excel 时间不正确：

- 优先使用 `YYYY-MM-DD HH:mm` 格式。
- 检查电脑系统时区是否正确。

页面数据不是新导入的数据：

- 大屏数据保存在浏览器 `localStorage`。
- 可在配置区重新导入计划，或使用清空状态功能重置执行状态。

部署后背景图不显示：

- 检查 `public/celebration-bg.png` 是否已被构建到 `dist/` 并复制到站点目录。
