let state;
let activeFilter = "all";
let inboxEntry = "";

const elements = {
  table: document.querySelector("#post-table-body"),
  tableWrap: document.querySelector("#post-table-wrap"),
  inboxList: document.querySelector("#inbox-list"),
  categoryNav: document.querySelector("#category-nav"),
  search: document.querySelector("#post-search"),
  importDialog: document.querySelector("#import-dialog"),
  editDialog: document.querySelector("#edit-dialog"),
  toast: document.querySelector("#toast"),
};

document.addEventListener("DOMContentLoaded", async () => {
  bindActions();
  await refresh();
  window.lucide?.createIcons();
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

async function refresh() {
  state = await api("/api/state");
  render();
}

function render() {
  const posts = state.manifest.posts;
  const categories = new Map(state.manifest.categories.map((category) => [category.id, category]));
  document.querySelector("#all-count").textContent = posts.length;
  document.querySelector("#inbox-count").textContent = state.inbox.length;
  document.querySelector("#draft-count").textContent = posts.filter((post) => post.status === "draft").length;
  document.querySelector("#published-stat").textContent = posts.filter((post) => post.status === "published").length;
  document.querySelector("#category-stat").textContent = categories.size;
  document.querySelector("#inbox-stat").textContent = state.inbox.length;
  document.querySelector("#changes-stat").textContent = state.changes.length;

  elements.categoryNav.innerHTML = state.manifest.categories.map((category) => `<button class="category-item${activeFilter === category.id ? " active" : ""}" data-filter="${category.id}" type="button"><i class="category-color" style="--category-color:${category.color}"></i><span>${escapeHtml(category.name)}</span><b>${posts.filter((post) => post.category === category.id).length}</b></button>`).join("");
  fillCategorySelects();

  const query = elements.search.value.trim().toLocaleLowerCase("zh-CN");
  const filtered = posts
    .filter((post) => activeFilter === "all" || (activeFilter === "draft" ? post.status === "draft" : post.category === activeFilter))
    .filter((post) => !query || [post.title, post.summary, post.tags.join(" ")].join(" ").toLocaleLowerCase("zh-CN").includes(query))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  document.querySelector("#result-count").textContent = `${filtered.length} 篇文章`;
  elements.table.innerHTML = filtered.length ? filtered.map((post) => {
    const category = categories.get(post.category);
    return `<tr><td><div class="title-cell"><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.summary || post.source)}</small></div></td><td><span class="category-cell"><i class="category-color" style="--category-color:${category.color}"></i>${escapeHtml(category.name)}</span></td><td><div class="tag-cell">${post.tags.slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></td><td><span class="date-cell">${post.date.slice(0, 10)}</span></td><td><span class="status ${post.status}">${post.status === "draft" ? "草稿" : "已发布"}</span></td><td><button class="row-menu" data-edit="${post.id}" type="button" aria-label="编辑 ${escapeHtml(post.title)}"><i data-lucide="ellipsis"></i></button></td></tr>`;
  }).join("") : '<tr><td class="empty-row" colspan="6">暂无文章</td></tr>';

  elements.inboxList.innerHTML = state.inbox.length ? state.inbox.map((entry) => `<div class="inbox-row"><i data-lucide="${entry.kind === "directory" ? "folder" : "file-text"}"></i><div><strong>${escapeHtml(entry.name)}</strong><small>${entry.kind === "directory" ? "导出目录" : "导出文件"}</small></div><button class="button secondary" data-inbox="${escapeHtml(entry.name)}" type="button">整理</button></div>`).join("") : '<p class="empty-row">待整理目录为空</p>';
  elements.inboxList.hidden = activeFilter !== "inbox";
  elements.tableWrap.hidden = activeFilter === "inbox";
  document.querySelector("#view-title").textContent = activeFilter === "inbox" ? "待整理" : activeFilter === "all" ? "文章工作台" : activeFilter === "draft" ? "草稿" : categories.get(activeFilter)?.name || "文章工作台";
  window.lucide?.createIcons();
}

function fillCategorySelects() {
  const options = state.manifest.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("");
  document.querySelectorAll("select[name='category']").forEach((select) => {
    const selected = select.value;
    select.innerHTML = options;
    if (selected) select.value = selected;
  });
}

function bindActions() {
  document.body.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      activeFilter = filterButton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button === filterButton));
      render();
    }
    const closeButton = event.target.closest("[data-close]");
    if (closeButton) document.querySelector(`#${closeButton.dataset.close}`)?.close();
    const editButton = event.target.closest("[data-edit]");
    if (editButton) openEdit(editButton.dataset.edit);
    const inboxButton = event.target.closest("[data-inbox]");
    if (inboxButton) openImport(inboxButton.dataset.inbox);
  });

  document.querySelector("#import-button").addEventListener("click", () => openImport());
  document.querySelector("#new-category-button").addEventListener("click", () => document.querySelector("#category-dialog").showModal());
  document.querySelector("#publish-button").addEventListener("click", () => document.querySelector("#publish-dialog").showModal());
  document.querySelector("#clear-inbox-source").addEventListener("click", () => openImport());
  elements.search.addEventListener("input", render);
  document.querySelector("#article-files").addEventListener("change", updateFileSelection);
  document.querySelector("#article-folder").addEventListener("change", updateFileSelection);
  document.querySelector("#build-button").addEventListener("click", () => runAction("正在生成站点", async () => {
    const result = await api("/api/build", { method: "POST", body: "{}" });
    return `生成完成：${result.posts} 篇文章，${result.pages} 个页面`;
  }));
  document.querySelectorAll("[data-density]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-density]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector(".post-table").classList.toggle("compact", button.dataset.density === "compact");
  }));

  document.querySelector("#import-form").addEventListener("submit", submitImport);
  document.querySelector("#edit-form").addEventListener("submit", submitEdit);
  document.querySelector("#category-form").addEventListener("submit", submitCategory);
  document.querySelector("#publish-form").addEventListener("submit", submitPublish);
}

function openImport(entry = "") {
  inboxEntry = entry;
  const form = document.querySelector("#import-form");
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  const source = document.querySelector("#inbox-source");
  source.hidden = !entry;
  source.querySelector("span").textContent = entry;
  document.querySelector("#file-selection").textContent = entry || "Markdown / HTML / 图片资源";
  elements.importDialog.showModal();
}

function openEdit(id) {
  const post = state.manifest.posts.find((item) => item.id === id);
  const form = document.querySelector("#edit-form");
  form.elements.id.value = post.id;
  form.elements.title.value = post.title;
  form.elements.category.value = post.category;
  form.elements.date.value = post.date.slice(0, 10);
  form.elements.tags.value = post.tags.join(", ");
  form.elements.summary.value = post.summary || "";
  form.elements.draft.checked = post.status === "draft";
  elements.editDialog.showModal();
}

function updateFileSelection() {
  const files = selectedFiles();
  document.querySelector("#file-selection").textContent = files.length ? `已选择 ${files.length} 个文件` : "Markdown / HTML / 图片资源";
}

function selectedFiles() {
  const all = [...document.querySelector("#article-files").files, ...document.querySelector("#article-folder").files];
  return [...new Map(all.map((file) => [file.webkitRelativePath || file.name, file])).values()];
}

async function submitImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await runAction("正在整理文章", async () => {
    const metadata = formMetadata(form);
    if (inboxEntry) {
      await api("/api/inbox/import", { method: "POST", body: JSON.stringify({ entryName: inboxEntry, metadata }) });
    } else {
      const files = selectedFiles();
      if (!files.length) throw new Error("请选择导出文件或目录。");
      const encoded = await Promise.all(files.map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        content: await fileToBase64(file),
      })));
      await api("/api/import", { method: "POST", body: JSON.stringify({ files: encoded, metadata }) });
    }
    elements.importDialog.close();
    await refresh();
    return "文章已整理并重新生成站点";
  });
}

async function submitEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await runAction("正在保存文章", async () => {
    const id = form.elements.id.value;
    await api(`/api/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(formMetadata(form)) });
    elements.editDialog.close();
    await refresh();
    return "文章信息已更新";
  });
}

async function submitCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await runAction("正在创建分类", async () => {
    await api("/api/categories", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    document.querySelector("#category-dialog").close();
    form.reset();
    await refresh();
    return "分类已创建";
  });
}

async function submitPublish(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await runAction("正在发布到 GitHub", async () => {
    const result = await api("/api/publish", { method: "POST", body: JSON.stringify({ commitMessage: form.elements.commitMessage.value }) });
    document.querySelector("#publish-dialog").close();
    await refresh();
    return result.output.split(/\r?\n/).at(-1) || "发布完成";
  });
}

function formMetadata(form) {
  return {
    title: form.elements.title.value.trim(),
    category: form.elements.category.value,
    date: form.elements.date.value,
    tags: form.elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    slug: form.elements.slug?.value.trim(),
    summary: form.elements.summary.value.trim(),
    status: form.elements.draft.checked ? "draft" : "published",
  };
}

async function runAction(progress, action) {
  showToast(progress);
  document.body.classList.add("busy");
  try {
    showToast(await action());
  } catch (error) {
    showToast(error.message, true);
  } finally {
    document.body.classList.remove("busy");
  }
}

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 4200);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
