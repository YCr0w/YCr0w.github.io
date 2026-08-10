const root = document.documentElement;
const savedTheme = localStorage.getItem("site-theme");
if (savedTheme === "dark" || (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)) {
  root.dataset.theme = "dark";
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();

  const navigation = document.querySelector(".main-nav");
  document.querySelector(".nav-toggle")?.addEventListener("click", () => {
    navigation?.classList.toggle("open");
  });

  document.querySelector("#theme-button")?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("site-theme", root.dataset.theme);
  });

  const dialog = document.querySelector("#search-dialog");
  const input = document.querySelector("#search-input");
  const results = document.querySelector("#search-results");
  let searchIndex;

  document.querySelector("#search-button")?.addEventListener("click", async () => {
    dialog?.showModal();
    input?.focus();
    if (!searchIndex) searchIndex = await fetch("/search.json").then((response) => response.json());
  });

  input?.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("zh-CN");
    if (!query || !searchIndex) {
      results.replaceChildren();
      return;
    }
    const matches = searchIndex.filter((item) => [
      item.title, item.summary, item.category, item.tags.join(" "), item.text,
    ].join(" ").toLocaleLowerCase("zh-CN").includes(query)).slice(0, 12);
    results.innerHTML = matches.length
      ? matches.map((item) => `<a class="search-result" href="${item.url}"><strong>${escapeText(item.title)}</strong><small>${escapeText(item.category)} · ${escapeText(item.summary)}</small></a>`).join("")
      : '<p class="empty-state">没有匹配的文章</p>';
  });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      document.querySelectorAll(".toc a").forEach((link) => link.classList.remove("active"));
      const active = document.querySelector(`.toc a[href="#${CSS.escape(encodeURIComponent(entry.target.id))}"]`)
        || document.querySelector(`.toc a[href="#${CSS.escape(entry.target.id)}"]`);
      active?.classList.add("active");
    }
  }, { rootMargin: "-20% 0px -70%" });
  document.querySelectorAll(".article-body h2, .article-body h3").forEach((heading) => observer.observe(heading));

  const viewer = document.createElement("dialog");
  viewer.className = "image-viewer";
  viewer.addEventListener("click", () => viewer.close());
  document.body.append(viewer);
  document.querySelectorAll(".article-body img").forEach((image) => {
    image.addEventListener("click", () => {
      viewer.innerHTML = `<img src="${image.currentSrc || image.src}" alt="${escapeText(image.alt)}">`;
      viewer.showModal();
    });
  });
});

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
