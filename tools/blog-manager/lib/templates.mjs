import { safeSegment } from "./storage.mjs";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value, long = false) {
  return new Intl.DateTimeFormat("zh-CN", long
    ? { year: "numeric", month: "long", day: "numeric" }
    : { year: "numeric", month: "2-digit", day: "2-digit" }
  ).format(new Date(value));
}

function icon(name, label = "") {
  const aria = label ? ` aria-label="${escapeHtml(label)}"` : " aria-hidden=\"true\"";
  return `<i data-lucide="${name}"${aria}></i>`;
}

function nav(active) {
  const links = [
    ["home", "首页", "/", "house"],
    ["categories", "分类", "/categories/", "folder-tree"],
    ["archives", "归档", "/archives/", "archive"],
    ["about", "关于", "/about/", "user-round"],
  ];
  return `<header class="site-header">
    <a class="brand" href="/" aria-label="YCr0w'blog 首页"><span class="brand-mark">YC</span><span>YCr0w'blog</span></a>
    <button class="nav-toggle icon-button" type="button" aria-label="打开导航">${icon("menu")}</button>
    <nav class="main-nav" aria-label="主导航">
      ${links.map(([id, label, href, iconName]) => `<a${active === id ? ' class="active"' : ""} href="${href}">${icon(iconName)}<span>${label}</span></a>`).join("")}
    </nav>
    <div class="header-actions">
      <button class="icon-button" id="search-button" type="button" aria-label="搜索">${icon("search")}</button>
      <button class="icon-button" id="theme-button" type="button" aria-label="切换主题">${icon("sun-moon")}</button>
    </div>
  </header>`;
}

function searchDialog() {
  return `<dialog class="search-dialog" id="search-dialog">
    <form method="dialog" class="search-head">
      <label class="search-field">${icon("search")}<input id="search-input" type="search" placeholder="搜索文章、标签或分类" autocomplete="off"></label>
      <button class="icon-button" value="close" aria-label="关闭搜索">${icon("x")}</button>
    </form>
    <div class="search-results" id="search-results"></div>
  </dialog>`;
}

export function layout({ site, title, description, active, content, bodyClass = "" }) {
  const pageTitle = title ? `${title} | ${site.title}` : site.title;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#15171a">
  <meta name="description" content="${escapeHtml(description || site.description)}">
  <meta name="author" content="${escapeHtml(site.author)}">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="icon" type="image/x-icon" href="/assets/site/favicon.ico">
  <link rel="stylesheet" href="/assets/css/site.css">
  <script src="/assets/vendor/lucide.js" defer></script>
  <script src="/assets/js/site.js" defer></script>
</head>
<body class="${escapeHtml(bodyClass)}">
  ${nav(active)}
  ${content}
  <footer class="site-footer"><span>© ${new Date().getFullYear()} ${escapeHtml(site.author)}</span><span>由 Blog Desk 整理并生成</span></footer>
  ${searchDialog()}
</body>
</html>\n`;
}

function categoryLink(category, count) {
  return `<a class="category-link" href="/categories/${category.id}/" style="--category-color:${category.color}">
    <span class="category-dot"></span><span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.description)}</small></span><b>${count}</b>
  </a>`;
}

export function postRow(post, category) {
  return `<article class="post-row">
    <div class="post-date"><span>${formatDate(post.date).slice(5)}</span><small>${new Date(post.date).getFullYear()}</small></div>
    <div class="post-summary">
      <div class="post-kicker"><a href="/categories/${category.id}/" style="--category-color:${category.color}"><span class="category-dot"></span>${escapeHtml(category.name)}</a></div>
      <h2><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.summary)}</p>
      <div class="tag-list">${post.tags.map((tag) => `<a href="/tags/${encodeURIComponent(safeSegment(tag))}/">#${escapeHtml(tag)}</a>`).join("")}</div>
    </div>
    <a class="row-action" href="${post.url}" aria-label="阅读 ${escapeHtml(post.title)}">${icon("arrow-up-right")}</a>
  </article>`;
}

export function homePage(manifest, posts) {
  const published = posts.filter((post) => post.status === "published");
  const categories = manifest.categories.map((category) => ({
    ...category,
    count: published.filter((post) => post.category === category.id).length,
  }));
  const content = `<main>
    <section class="hero">
      <div class="hero-scrim"></div>
      <div class="hero-content">
        <p class="hero-eyebrow">BINARY · WINDOWS · MALWARE</p>
        <h1>${escapeHtml(manifest.site.title)}</h1>
        <p>${escapeHtml(manifest.site.description)}</p>
        <a class="hero-action" href="#latest">浏览最新文章 ${icon("arrow-down")}</a>
      </div>
    </section>
    <section class="category-band" aria-label="文章分类"><div class="section-inner category-grid">
      ${categories.map((category) => categoryLink(category, category.count)).join("")}
    </div></section>
    <section class="posts-section" id="latest"><div class="section-inner content-grid">
      <div class="section-main"><header class="section-heading"><div><p>RECENT NOTES</p><h2>最近更新</h2></div><a href="/archives/">查看归档 ${icon("arrow-right")}</a></header>
      <div class="post-list">${published.slice(0, 8).map((post) => postRow(post, categories.find((category) => category.id === post.category))).join("")}</div></div>
      <aside class="profile-panel"><img src="/assets/site/avatar.jpg" alt="${escapeHtml(manifest.site.author)}"><h2>${escapeHtml(manifest.site.author)}</h2><p>${escapeHtml(manifest.site.tagline)}</p><div class="profile-links"><a href="${manifest.site.github}" target="_blank" rel="noopener">${icon("github")} GitHub</a><a href="mailto:${manifest.site.email}">${icon("mail")} Email</a></div></aside>
    </div></section>
  </main>`;
  return layout({ site: manifest.site, active: "home", content, bodyClass: "home-page" });
}

export function listingPage({ manifest, title, eyebrow, description, posts, active = "categories" }) {
  const categories = new Map(manifest.categories.map((category) => [category.id, category]));
  const content = `<main class="page-shell"><header class="page-heading"><p>${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><span>${escapeHtml(description)}</span></header><section class="post-list wide">${posts.map((post) => postRow(post, categories.get(post.category))).join("") || '<p class="empty-state">暂无文章</p>'}</section></main>`;
  return layout({ site: manifest.site, title, description, active, content });
}

export function categoriesPage(manifest, posts) {
  const content = `<main class="page-shell"><header class="page-heading"><p>TOPICS</p><h1>分类</h1><span>按研究方向浏览文章</span></header><section class="directory-list">${manifest.categories.map((category) => categoryLink(category, posts.filter((post) => post.category === category.id && post.status === "published").length)).join("")}</section></main>`;
  return layout({ site: manifest.site, title: "分类", active: "categories", content });
}

export function tagsPage(manifest, posts) {
  const counts = new Map();
  posts.filter((post) => post.status === "published").forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  const content = `<main class="page-shell"><header class="page-heading"><p>INDEX</p><h1>标签</h1><span>${counts.size} 个标签</span></header><section class="tag-directory">${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => `<a href="/tags/${encodeURIComponent(safeSegment(tag))}/"><span>#${escapeHtml(tag)}</span><b>${count}</b></a>`).join("")}</section></main>`;
  return layout({ site: manifest.site, title: "标签", active: "categories", content });
}

export function articlePage({ manifest, post, category, rendered, previous, next }) {
  const toc = rendered.headings.filter((heading) => heading.level > 1).map((heading) => `<a class="toc-level-${heading.level}" href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.text)}</a>`).join("");
  const content = `<main class="article-shell">
    <article class="article"><header class="article-header"><a class="article-category" href="/categories/${category.id}/" style="--category-color:${category.color}"><span class="category-dot"></span>${escapeHtml(category.name)}</a><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.summary)}</p><div class="article-meta"><span>${icon("calendar-days")}${formatDate(post.date, true)}</span><span>${icon("clock-3")}${Math.max(1, Math.ceil(rendered.text.length / 650))} 分钟阅读</span></div><div class="tag-list">${post.tags.map((tag) => `<a href="/tags/${encodeURIComponent(safeSegment(tag))}/">#${escapeHtml(tag)}</a>`).join("")}</div></header><div class="article-body markdown-body">${rendered.html}</div><footer class="article-footer"><div><span>本文链接</span><a href="${manifest.site.url}${post.url}">${manifest.site.url}${post.url}</a></div></footer></article>
    <aside class="article-aside"><div class="toc"><span>目录</span>${toc || '<small>本文暂无目录</small>'}</div></aside>
    <nav class="post-navigation">${previous ? `<a href="${previous.url}">${icon("arrow-left")}<span><small>上一篇</small>${escapeHtml(previous.title)}</span></a>` : "<span></span>"}${next ? `<a href="${next.url}"><span><small>下一篇</small>${escapeHtml(next.title)}</span>${icon("arrow-right")}</a>` : ""}</nav>
  </main>`;
  return layout({ site: manifest.site, title: post.title, description: post.summary, content, bodyClass: "article-page" });
}

export function simplePage(manifest, title, active, body) {
  const content = `<main class="page-shell"><header class="page-heading"><p>YCR0W</p><h1>${escapeHtml(title)}</h1></header><article class="simple-content markdown-body">${body}</article></main>`;
  return layout({ site: manifest.site, title, active, content });
}

export function notFoundPage(manifest) {
  const content = `<main class="not-found"><strong>404</strong><h1>页面不存在</h1><a href="/">${icon("arrow-left")}返回首页</a></main>`;
  return layout({ site: manifest.site, title: "页面不存在", content });
}
