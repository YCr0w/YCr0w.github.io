import fs from "node:fs/promises";
import path from "node:path";
import { load as loadHtml } from "cheerio";
import YAML from "yaml";
import { fromRoot, inboxDir, postsDir } from "./paths.mjs";
import {
  assertInside,
  loadManifest,
  safeSegment,
  saveManifest,
} from "./storage.mjs";

const maxImportBytes = 120 * 1024 * 1024;

function normalizeRelativePath(value) {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Unsafe import path: ${value}`);
  }
  return normalized;
}

function stripCommonFolder(files) {
  const firstSegments = new Set(files.map((file) => file.path.split("/")[0]));
  if (firstSegments.size !== 1 || files.some((file) => !file.path.includes("/"))) return files;
  return files.map((file) => ({ ...file, path: file.path.split("/").slice(1).join("/") }));
}

function parseMarkdownMetadata(source) {
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---", 4);
  if (end < 0) return {};
  try {
    return YAML.parse(source.slice(4, end)) ?? {};
  } catch {
    return {};
  }
}

function replaceMarkdownAssets(source, primaryPath, assetMap, postId) {
  const primaryDirectory = path.posix.dirname(primaryPath);
  return source.replace(/(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))/g, (match, opening, target, closing) => {
    if (/^(?:https?:|data:|mailto:|#|\/)/i.test(target)) return match;
    const decoded = decodeURIComponent(target.split(/[?#]/)[0]);
    const resolved = path.posix.normalize(path.posix.join(primaryDirectory, decoded));
    const asset = assetMap.get(resolved);
    if (!asset) return match;
    return `${opening}/assets/posts/${postId}/${encodeURI(asset)}${closing}`;
  });
}

function replaceHtmlAssets(source, primaryPath, assetMap, postId) {
  const $ = loadHtml(source);
  const primaryDirectory = path.posix.dirname(primaryPath);
  $("img[src], a[href]").each((_, element) => {
    const attribute = element.tagName === "img" ? "src" : "href";
    const target = $(element).attr(attribute);
    if (!target || /^(?:https?:|data:|mailto:|#|\/)/i.test(target)) return;
    const decoded = decodeURIComponent(target.split(/[?#]/)[0]);
    const resolved = path.posix.normalize(path.posix.join(primaryDirectory, decoded));
    const asset = assetMap.get(resolved);
    if (asset) $(element).attr(attribute, `/assets/posts/${postId}/${encodeURI(asset)}`);
  });
  return $("body").length ? $("body").html() : $.root().html();
}

export function postUrl(date, slug) {
  const value = new Date(date);
  if (Number.isNaN(value.valueOf())) throw new Error("Article date is invalid.");
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `/${year}/${month}/${day}/${encodeURIComponent(slug)}/`;
}

async function collectDirectory(directory, base = directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectDirectory(target, base));
    } else {
      files.push({
        path: path.relative(base, target).replaceAll(path.sep, "/"),
        buffer: await fs.readFile(target),
      });
    }
  }
  return files;
}

export async function importFromInbox(entryName, metadata) {
  const safeName = normalizeRelativePath(entryName);
  const target = path.join(inboxDir, safeName);
  assertInside(inboxDir, target);
  const stat = await fs.stat(target);
  const files = stat.isDirectory()
    ? await collectDirectory(target)
    : [{ path: path.basename(target), buffer: await fs.readFile(target) }];
  const post = await importFiles(files, metadata);
  await fs.rm(target, { recursive: true, force: true });
  return post;
}

/**
 * Import an article from an arbitrary filesystem path.
 *
 * Accepts a single Markdown/HTML file or a directory containing an article
 * alongside its images.  Designed for the one-click upload pipeline:
 * export from Yuque / Typora, then `cli.mjs import <path>`.
 *
 * @param {string} filePath  Absolute or repo-relative path to the file or directory.
 * @param {object} metadata  { title, category, tags, slug, date, summary, status }
 * @returns {Promise<object>} the created post record
 */
export async function importFromPath(filePath, metadata = {}) {
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved);
  const files = stat.isDirectory()
    ? await collectDirectory(resolved)
    : [{ path: path.basename(resolved), buffer: await fs.readFile(resolved) }];
  return importFiles(files, metadata);
}

export async function importUploadedFiles(uploadedFiles, metadata) {
  const files = uploadedFiles.map((file) => ({
    path: normalizeRelativePath(file.path || file.name),
    buffer: Buffer.from(file.content, "base64"),
  }));
  return importFiles(files, metadata);
}

async function importFiles(inputFiles, metadata) {
  if (!inputFiles.length) throw new Error("No files were provided.");
  const totalBytes = inputFiles.reduce((sum, file) => sum + file.buffer.length, 0);
  if (totalBytes > maxImportBytes) throw new Error("Import is larger than 120 MB.");

  const files = stripCommonFolder(inputFiles.map((file) => ({
    ...file,
    path: normalizeRelativePath(file.path),
  })));
  const primary = metadata.primaryFile
    ? files.find((file) => file.path === normalizeRelativePath(metadata.primaryFile))
    : files.find((file) => /\.(?:md|markdown|html?|htm)$/i.test(file.path));
  if (!primary) throw new Error("No Markdown or HTML article was found.");

  const format = /\.md|\.markdown$/i.test(primary.path) ? "markdown" : "html";
  const rawSource = primary.buffer.toString("utf8");
  const exportedMetadata = format === "markdown" ? parseMarkdownMetadata(rawSource) : {};
  const title = String(metadata.title || exportedMetadata.title || path.parse(primary.path).name).trim();
  const slug = safeSegment(metadata.slug || exportedMetadata.slug || title, `post-${Date.now()}`);
  const id = safeSegment(metadata.id || slug);
  const date = metadata.date || exportedMetadata.date || new Date().toISOString();
  const categoryId = metadata.category || exportedMetadata.category || "notes";
  const manifest = await loadManifest();

  if (!manifest.categories.some((category) => category.id === categoryId)) {
    throw new Error(`Unknown category: ${categoryId}`);
  }
  if (manifest.posts.some((post) => post.id === id)) {
    throw new Error(`A post with id '${id}' already exists.`);
  }

  const destination = path.join(postsDir, categoryId, id);
  assertInside(postsDir, destination);
  await fs.mkdir(path.join(destination, "assets"), { recursive: true });

  const assetMap = new Map();
  for (const file of files) {
    if (file === primary) continue;
    const relativeAsset = normalizeRelativePath(file.path);
    assetMap.set(file.path, relativeAsset);
    const assetPath = path.join(destination, "assets", ...relativeAsset.split("/"));
    assertInside(path.join(destination, "assets"), assetPath);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, file.buffer);
  }

  const rewritten = format === "markdown"
    ? replaceMarkdownAssets(rawSource, primary.path, assetMap, id)
    : replaceHtmlAssets(rawSource, primary.path, assetMap, id);
  const sourceName = format === "markdown" ? "index.md" : "index.html";
  const sourcePath = path.join(destination, sourceName);
  await fs.writeFile(sourcePath, rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`, "utf8");

  const exportedTags = Array.isArray(exportedMetadata.tags)
    ? exportedMetadata.tags
    : String(exportedMetadata.tags || "").split(",");
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : String(metadata.tags || exportedTags.join(",")).split(",");
  const post = {
    id,
    title,
    category: categoryId,
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
    date: new Date(date).toISOString(),
    updated: new Date().toISOString(),
    url: postUrl(date, slug),
    summary: String(metadata.summary || exportedMetadata.description || "").trim(),
    source: path.relative(fromRoot(), sourcePath).replaceAll(path.sep, "/"),
    format,
    status: metadata.status === "draft" ? "draft" : "published",
    legacy: false,
  };
  manifest.posts.push(post);
  await saveManifest(manifest);
  return post;
}

export async function updatePost(postId, changes) {
  const manifest = await loadManifest();
  const post = manifest.posts.find((item) => item.id === postId);
  if (!post) throw new Error(`Post not found: ${postId}`);

  const nextCategory = changes.category || post.category;
  if (!manifest.categories.some((category) => category.id === nextCategory)) {
    throw new Error(`Unknown category: ${nextCategory}`);
  }

  if (nextCategory !== post.category) {
    const oldDirectory = path.dirname(fromRoot(...post.source.split("/")));
    const newDirectory = path.join(postsDir, nextCategory, post.id);
    assertInside(postsDir, newDirectory);
    await fs.mkdir(path.dirname(newDirectory), { recursive: true });
    await fs.rename(oldDirectory, newDirectory);
    post.source = path.relative(fromRoot(), path.join(newDirectory, path.basename(post.source))).replaceAll(path.sep, "/");
    post.category = nextCategory;
  }

  for (const field of ["title", "summary", "status"]) {
    if (changes[field] !== undefined) post[field] = String(changes[field]).trim();
  }
  if (changes.tags !== undefined) {
    post.tags = (Array.isArray(changes.tags) ? changes.tags : String(changes.tags).split(","))
      .map((tag) => tag.trim()).filter(Boolean);
  }
  if (changes.date) {
    post.date = new Date(changes.date).toISOString();
    const slug = decodeURIComponent(post.url.split("/").filter(Boolean).at(-1));
    post.url = postUrl(post.date, slug);
  }
  post.updated = new Date().toISOString();
  await saveManifest(manifest);
  return post;
}


/**
 * Create a new Markdown post from scratch — a front-matter template plus a
 * short body stub — and register it in the manifest. The generated index.md
 * is meant to be opened in Typora and filled in; the watch server picks up
 * saves automatically. Unlike importFiles(), no external files are read.
 *
 * @param {object} metadata  { title, category, tags, slug, id, date, status }
 * @returns {Promise<object>} the created post record
 */
export async function createPost(metadata = {}) {
  const title = String(metadata.title || "Untitled").trim();
  const categoryId = metadata.category || "notes";
  const manifest = await loadManifest();

  if (!manifest.categories.some((category) => category.id === categoryId)) {
    throw new Error(`Unknown category: ${categoryId}`);
  }

  const slug = safeSegment(metadata.slug || title, `post-${Date.now()}`);
  const id = safeSegment(metadata.id || slug);
  if (manifest.posts.some((post) => post.id === id)) {
    throw new Error(`A post with id '${id}' already exists.`);
  }

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : String(metadata.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const status = metadata.status === "draft" ? "draft" : "published";
  const date = metadata.date || new Date().toISOString();

  const destination = path.join(postsDir, categoryId, id);
  assertInside(postsDir, destination);
  await fs.mkdir(destination, { recursive: true });
  await fs.mkdir(path.join(destination, "assets"), { recursive: true });

  const frontMatter = YAML.stringify({ title, category: categoryId, tags, date, slug, status });
  const body = [
    "",
    `# ${title}`,
    "",
    "<!-- 在这里开始书写正文。保存后本地预览自动刷新；满意后运行 deploy.bat publish 上线。 -->",
    "",
  ].join("\n");
  const source = `---\n${frontMatter}---\n${body}`;

  const sourcePath = path.join(destination, "index.md");
  await fs.writeFile(sourcePath, source.endsWith("\n") ? source : `${source}\n`, "utf8");

  const post = {
    id,
    title,
    category: categoryId,
    tags,
    date: new Date(date).toISOString(),
    updated: new Date().toISOString(),
    url: postUrl(date, slug),
    summary: "",
    source: path.relative(fromRoot(), sourcePath).replaceAll(path.sep, "/"),
    format: "markdown",
    status,
    legacy: false,
  };
  manifest.posts.push(post);
  await saveManifest(manifest);
  return post;
}