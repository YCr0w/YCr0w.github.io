# Blog Desk 工作流文档

> 本文是 YCr0w'blog 的内部写作 / 构建 / 发布文档。仓库根目录的 `README.md` 是面向访客的展示页，这里记录完整的本地工作流。

安全研究博客 —— 恶意软件分析、Windows 内核机制、逆向与 Pwn。

## 目录结构

```text
content/                         文章源码（唯一需要手动维护的目录）
  inbox/                         导出的文章等待整理
  posts/<分类>/<文章id>/
    index.md | index.html        原始文章
    assets/                      文章图片和附件
  site-assets/                   站点级资源（头像、背景图、favicon、关于页）
  site.json                      分类、标签、日期、URL、发布状态

tools/blog-manager/              构建系统（Blog Desk）
  cli.mjs                        命令行入口
  server.mjs                     预览服务器 + 管理 API
  lib/                           构建、导入、验证、发布逻辑
  public/                        Blog Desk 管理界面
  theme/                         博客主题（site.css, site.js）
  README.md                      本文档（内部工作流）

docs/                            ⚙ 生成产物（GitHub Pages 从此目录提供服务）

deploy.bat                       入口脚本：预览 / 检查 / 发布 / 导入
package.json                     依赖和脚本
README.md                        根目录展示页（面向访客）
```

单分支 `main` 工作流。根目录只有源码和配置，生成内容输出到 `docs/`，
GitHub Pages 从 `main` 分支的 `/docs` 目录提供服务。

## GitHub Pages 配置

仓库 Settings → Pages → Source → Deploy from a branch → `main` → `/docs`

## 日常使用

### 写文章（推荐：Typora 一键流程）

三步完成"本地书写 → 实时预览 → 一键发布"。

**1. 新建文章** —— 生成带 front-matter 的模板，打印路径供 Typora 打开：

```bat
deploy.bat new "Pikabot 样本分析" --category malware-analysis --tags "Loader,逆向" --slug pikabot
```

**2. 实时预览** —— 开启 watch 模式，Typora 里 Ctrl+S 即自动重建、浏览器即时刷新：

```bat
deploy.bat dev
```

dev 模式会自动同步文章头部 front-matter 的 `title` / `tags` / `status` / `summary` / `date`。停止按 `Ctrl+C`。

**3. 发布到线上** —— 构建 + 校验 + 推送 GitHub：

```bat
deploy.bat publish "发布 Pikabot 分析"
```

> 只有显式 `publish` 才推送 GitHub；`dev` 保存只影响本地预览。
> `status: draft` 的文章不进构建，适合写一半先存着。front-matter 字段见下方"导入"。

### 导入

```bat
deploy.bat import "C:\导出目录\index.md" --category malware-analysis --tags "Loader,逆向"
```

支持单文件或含图片的导出目录。YAML front-matter 会被自动读取：

```yaml
---
title: 文章标题
category: malware-analysis
tags: 标签1, 标签2
date: 2024-08-10T10:00:00+08:00
slug: url-slug
---
```

### 预览

```bat
deploy.bat
```

自动构建 + 验证 + 启动本地服务器：

- 博客：<http://127.0.0.1:4173/>
- 管理界面：<http://127.0.0.1:4173/__manager__/>

停止：`deploy.bat stop`

### 发布

```bat
deploy.bat publish "发布新文章"
```

构建 + 验证 + 提交 `docs/` + 推送到 `origin/main`。

## 命令一览

| 命令 | 说明 |
|---|---|
| `deploy.bat` | 预览（构建 + 验证 + 启动服务） |
| `deploy.bat preview [port]` | 指定端口预览 |
| `deploy.bat dev [port]` | 实时预览：watch + 自动重建（Typora 保存即刷新） |
| `deploy.bat check` | 仅构建 + 验证 |
| `deploy.bat publish "msg"` | 提交并推送到 main |
| `deploy.bat stop [port]` | 停止预览服务器 |
| `deploy.bat import <path>` | 导入文章 |
| `deploy.bat new "title" --category <cat>` | 新建文章模板（--tags/--slug/--status 可选） |

## 上传接口（未来一键上传工具）

`cli.mjs import` 是稳定的程序化接口。语雀/Typora → 博客的管线：

1. 导出文章（Markdown + 图片）
2. `cli.mjs import <path> --category <cat>`
3. `cli.mjs publish --message "<msg>"`

HTTP API（预览期间可用）：

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/state` | 清单、inbox、git 状态 |
| `POST` | `/api/import` | 导入上传文件 |
| `POST` | `/api/inbox/import` | 从 inbox 导入 |
| `POST` | `/api/build` | 重新构建 |
| `PATCH` | `/api/posts/<id>` | 更新文章元数据 |
| `POST` | `/api/categories` | 添加分类 |
| `POST` | `/api/publish` | 构建 + 验证 + 推送 |
