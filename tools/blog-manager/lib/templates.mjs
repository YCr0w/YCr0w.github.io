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

function nav(active, site) {
  const links = [
    ["home", "首页", "/", "house"],
    ["categories", "分类", "/categories/", "folder-tree"],
    ["archives", "归档", "/archives/", "archive"],
    ["about", "关于", "/about/", "user-round"],
  ];
  return `<header class="site-header">
    <div class="header-profile">
      <a class="header-identity" href="/" aria-label="返回首页"><img class="header-avatar" src="/assets/site/avatar.jpg" alt="${escapeHtml(site.author)}"><span class="header-name">${escapeHtml(site.author)}</span></a>
      <div class="header-links"><a href="${site.github}" target="_blank" rel="noopener" aria-label="GitHub">${icon("github")}</a><a href="mailto:${site.email}" aria-label="Email">${icon("mail")}</a></div>
    </div>
    <button class="nav-toggle icon-button" type="button" aria-label="打开导航">${icon("menu")}</button>
    <nav class="main-nav" aria-label="主导航">
      ${links.map(([id, label, href, iconName]) => `<a${active === id ? ' class="active"' : ""} href="${href}">${icon(iconName)}<span>${label}</span></a>`).join("")}
    </nav>
    <div class="header-actions">
      <div class="search-inline" id="search-inline">
        <button class="icon-button" id="search-button" type="button" aria-label="搜索" aria-expanded="false">${icon("search")}</button>
        <input id="search-input" type="search" placeholder="搜索文章、标签或分类" autocomplete="off">
        <div class="search-results" id="search-results"></div>
      </div>
      <button class="icon-button" id="theme-button" type="button" aria-label="切换主题">${icon("sun-moon")}</button>
    </div>
  </header>`;
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
  ${nav(active, site)}
  ${content}
  <footer class="site-footer"><span>© ${new Date().getFullYear()} ${escapeHtml(site.author)}</span></footer>
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
  const categories = new Map(manifest.categories.map((category) => [category.id, category]));
  const content = `<main class="home-main">
    <section class="banner">
      <div class="banner-scrim"></div>
      <svg class="banner-waves" viewBox="0 24 150 28" preserveAspectRatio="none" shape-rendering="auto" aria-hidden="true">
        <defs><path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" fill="currentColor"></path></defs>
        <g class="wave-parallax">
          <use href="#gentle-wave" x="48" y="0" opacity="0.7"></use>
          <use href="#gentle-wave" x="48" y="3" opacity="0.5"></use>
          <use href="#gentle-wave" x="48" y="5" opacity="0.3"></use>
          <use href="#gentle-wave" x="48" y="7"></use>
        </g>
      </svg>
      <a class="banner-down" href="#posts" aria-label="向下滚动">${icon("chevron-down")}</a>
    </section>
    <section class="posts-section" id="posts"><div class="section-inner home-feed">
      <header class="section-heading"><div><p>RECENT NOTES</p><h2>最近更新</h2></div><a href="/archives/">查看归档 ${icon("arrow-right")}</a></header>
      <div class="post-list">${published.slice(0, 8).map((post) => postRow(post, categories.get(post.category))).join("")}</div>
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
  const content = `<main class="page-shell"><header class="page-heading"><h1>${escapeHtml(title)}</h1></header><article class="simple-content markdown-body">${body}</article></main>`;
  return layout({ site: manifest.site, title, active, content });
}

export function notFoundPage(manifest) {
  const content = `<main class="not-found"><strong>404</strong><h1>页面不存在</h1><a href="/">${icon("arrow-left")}返回首页</a></main>`;
  return layout({ site: manifest.site, title: "页面不存在", content });
}
