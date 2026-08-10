import fs from "node:fs/promises";
import path from "node:path";
import { loadManifest, listInbox } from "./storage.mjs";
import { fromRoot } from "./paths.mjs";

async function countFiles(directory) {
  let count = 0;
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      count += entry.isDirectory() ? await countFiles(target) : 1;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return count;
}

export async function checkWorkspace() {
  const manifest = await loadManifest();
  const categories = new Set(manifest.categories.map((category) => category.id));
  const ids = new Set();
  const urls = new Set();

  for (const post of manifest.posts) {
    if (ids.has(post.id)) throw new Error(`Duplicate post id: ${post.id}`);
    if (urls.has(post.url)) throw new Error(`Duplicate post URL: ${post.url}`);
    if (!categories.has(post.category)) throw new Error(`Unknown category '${post.category}' for ${post.id}`);
    if (!Array.isArray(post.tags)) throw new Error(`Tags must be an array for ${post.id}`);
    const sourcePath = fromRoot(...post.source.split("/"));
    await fs.access(sourcePath);
    ids.add(post.id);
    urls.add(post.url);
  }

  await listInbox();
  return {
    posts: manifest.posts.length,
    assets: await countFiles(fromRoot("content", "posts")) - manifest.posts.length,
  };
}
