/**
 * Watch mode: monitor content/ and theme/, rebuild the site on change.
 *
 * syncFrontMatter() re-reads each Markdown post's YAML front-matter and
 * syncs mutable fields (title, tags, summary, status, date) back into
 * site.json so edits made in Typora take effect on the next rebuild.
 *
 * The sync is idempotent — a second pass over unchanged files writes
 * nothing, which keeps fs.watch from looping on site.json writes.
 *
 * category is intentionally NOT auto-synced (changing it moves the post
 * directory); use the manager UI or `updatePost` for that.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import YAML from "yaml";
import { buildSite } from "./generator.mjs";
import { contentDir, fromRoot } from "./paths.mjs";
import { loadManifest, saveManifest } from "./storage.mjs";
import { postUrl } from "./importer.mjs";

const themeDir = fromRoot("tools", "blog-manager", "theme");
const debounceMs = 300;

function sameTags(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((tag, index) => String(tag).trim() === String(b[index]).trim());
}

/**
 * Re-read front-matter from every Markdown post and sync mutable fields
 * into the manifest. Returns true if the manifest changed (and was saved).
 */
export async function syncFrontMatter() {
  const manifest = await loadManifest();
  let changed = false;

  for (const post of manifest.posts) {
    if (post.format !== "markdown") continue;
    const sourcePath = fromRoot(...post.source.split("/"));
    let raw;
    try {
      raw = await fsp.readFile(sourcePath, "utf8");
    } catch {
      continue;
    }
    if (!raw.startsWith("---\n")) continue;
    const end = raw.indexOf("\n---", 4);
    if (end < 0) continue;
    let attrs;
    try {
      attrs = YAML.parse(raw.slice(4, end)) ?? {};
    } catch {
      continue;
    }

    if (typeof attrs.title === "string" && attrs.title.trim() && attrs.title.trim() !== post.title) {
      post.title = attrs.title.trim();
      changed = true;
    }
    if (typeof attrs.summary === "string" && attrs.summary.trim() !== post.summary) {
      post.summary = attrs.summary.trim();
      changed = true;
    }
    if (attrs.status === "draft" || attrs.status === "published") {
      if (attrs.status !== post.status) {
        post.status = attrs.status;
        changed = true;
      }
    }
    if (Array.isArray(attrs.tags)) {
      const tags = attrs.tags.map((tag) => String(tag).trim()).filter(Boolean);
      if (!sameTags(tags, post.tags)) {
        post.tags = tags;
        changed = true;
      }
    }
    if (attrs.date != null) {
      const parsed = new Date(attrs.date);
      if (!Number.isNaN(parsed.valueOf())) {
        const normalized = parsed.toISOString();
        if (normalized !== new Date(post.date).toISOString()) {
          const slug = decodeURIComponent(post.url.split("/").filter(Boolean).at(-1));
          const nextUrl = postUrl(parsed, slug);
          if (nextUrl !== post.url) {
            post.date = normalized;
            post.url = nextUrl;
            changed = true;
          }
        }
      }
    }
  }

  if (changed) await saveManifest(manifest);
  return changed;
}

/**
 * Watch content/ and theme/ recursively. On any change, debounce, sync
 * front-matter, rebuild the site, then invoke onRebuild(error, result).
 *
 * @param {(error: Error|null, result: object|null) => void} [onRebuild]
 * @returns {() => void} close — stops all watchers and pending timers.
 */
export function watchAndRebuild(onRebuild) {
  let timer = null;
  let building = false;

  const run = async () => {
    timer = null;
    if (building) {
      timer = setTimeout(run, debounceMs);
      return;
    }
    building = true;
    try {
      const synced = await syncFrontMatter();
      const result = await buildSite();
      onRebuild?.(null, { ...result, synced });
    } catch (error) {
      onRebuild?.(error, null);
    } finally {
      building = false;
    }
  };

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  };

  const watchers = [];
  for (const dir of [contentDir, themeDir]) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, trigger);
      watcher.on("error", (error) => console.error(`[watch] ${dir}: ${error.message}`));
      watchers.push(watcher);
    } catch (error) {
      console.error(`[watch] cannot watch ${dir}: ${error.message}`);
    }
  }

  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}
