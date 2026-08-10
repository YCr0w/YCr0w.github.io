import fs from "node:fs/promises";
import path from "node:path";
import { buildDir, fromRoot, publicDir, siteAssetsDir } from "./paths.mjs";
import { checkWorkspace } from "./check.mjs";
import { loadManifest, safeSegment } from "./storage.mjs";
import { excerptFromText, renderPost, sourceAssetDirectory } from "./renderer.mjs";
import {
  articlePage,
  categoriesPage,
  homePage,
  listingPage,
  notFoundPage,
  simplePage,
  tagsPage,
} from "./templates.mjs";

async function write(relativePath, content) {
  const destination = path.join(buildDir, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, "utf8");
}

function outputPathFromUrl(url) {
  const decoded = decodeURIComponent(url.split(/[?#]/)[0]);
  return `${decoded.replace(/^\/+|\/+$/g, "")}/index.html`;
}

async function copyDirectoryIfPresent(source, destination) {
  try {
    await fs.access(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function copyLucide() {
  const candidates = [
    fromRoot("node_modules", "lucide", "dist", "umd", "lucide.js"),
    fromRoot("node_modules", "lucide", "dist", "umd", "lucide.min.js"),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      await fs.copyFile(candidate, path.join(buildDir, "assets", "vendor", "lucide.js"));
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Lucide browser bundle was not found. Run npm install.");
}

async function syncBuildToPublic() {
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.cp(buildDir, publicDir, { recursive: true });
}

export async function buildSite() {
  await checkWorkspace();
  const manifest = await loadManifest();
  const posts = [...manifest.posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const published = posts.filter((post) => post.status === "published");
  const categories = new Map(manifest.categories.map((category) => [category.id, category]));

  await fs.rm(buildDir, { recursive: true, force: true });
  await Promise.all([
    fs.mkdir(path.join(buildDir, "assets", "css"), { recursive: true }),
    fs.mkdir(path.join(buildDir, "assets", "js"), { recursive: true }),
    fs.mkdir(path.join(buildDir, "assets", "vendor"), { recursive: true }),
  ]);

  const renderedPosts = new Map();
  for (const post of published) {
    const rendered = await renderPost(post);
    if (!post.summary) post.summary = excerptFromText(rendered.text);
    renderedPosts.set(post.id, rendered);
  }

  await write("index.html", homePage(manifest, published));
  await write("categories/index.html", categoriesPage(manifest, published));
  await write("tags/index.html", tagsPage(manifest, published));
  await write("archives/index.html", listingPage({
    manifest,
    title: "归档",
    eyebrow: "CHRONOLOGY",
    description: `${published.length} 篇研究与学习记录`,
    posts: published,
    active: "archives",
  }));

  for (const category of manifest.categories) {
    const categoryPosts = published.filter((post) => post.category === category.id);
    await write(`categories/${category.id}/index.html`, listingPage({
      manifest,
      title: category.name,
      eyebrow: "CATEGORY",
      description: category.description,
      posts: categoryPosts,
    }));
  }

  const tags = new Map();
  for (const post of published) {
    for (const tag of post.tags) {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(post);
    }
  }
  for (const [tag, tagPosts] of tags) {
    await write(`tags/${safeSegment(tag)}/index.html`, listingPage({
      manifest,
      title: `#${tag}`,
      eyebrow: "TAG",
      description: `${tagPosts.length} 篇相关文章`,
      posts: tagPosts,
    }));
  }

  for (let index = 0; index < published.length; index++) {
    const post = published[index];
    await write(outputPathFromUrl(post.url), articlePage({
      manifest,
      post,
      category: categories.get(post.category),
      rendered: renderedPosts.get(post.id),
      previous: published[index + 1],
      next: published[index - 1],
    }));
    await copyDirectoryIfPresent(
      await sourceAssetDirectory(post),
      path.join(buildDir, "assets", "posts", post.id),
    );
  }

  const about = await fs.readFile(path.join(siteAssetsDir, "about.html"), "utf8");
  await write("about/index.html", simplePage(manifest, "关于", "about", about));
  await write("links/index.html", simplePage(
    manifest,
    "链接",
    "",
    `<p><a href="${manifest.site.github}" target="_blank" rel="noopener">GitHub · ${manifest.site.author}</a></p><p><a href="mailto:${manifest.site.email}">${manifest.site.email}</a></p>`,
  ));
  await write("404.html", notFoundPage(manifest));

  const search = published.map((post) => ({
    title: post.title,
    url: post.url,
    summary: post.summary,
    category: categories.get(post.category).name,
    tags: post.tags,
    text: renderedPosts.get(post.id).text.slice(0, 8000),
  }));
  await write("search.json", `${JSON.stringify(search)}\n`);
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
    "/", "/categories/", "/tags/", "/archives/", "/about/", ...published.map((post) => post.url),
  ].map((url) => `<url><loc>${manifest.site.url}${url}</loc></url>`).join("")}</urlset>\n`);
  await write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${manifest.site.url}/sitemap.xml\n`);
  await write(".nojekyll", "");

  await Promise.all([
    copyDirectoryIfPresent(siteAssetsDir, path.join(buildDir, "assets", "site")),
    fs.copyFile(fromRoot("tools", "blog-manager", "theme", "site.css"), path.join(buildDir, "assets", "css", "site.css")),
    fs.copyFile(fromRoot("tools", "blog-manager", "theme", "site.js"), path.join(buildDir, "assets", "js", "site.js")),
    copyLucide(),
  ]);

  await syncBuildToPublic();
  await fs.rm(buildDir, { recursive: true, force: true });
  return { posts: published.length, pages: published.length + manifest.categories.length + tags.size + 8 };
}
