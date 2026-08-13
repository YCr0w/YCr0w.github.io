import fs from "node:fs/promises";
import path from "node:path";
import { contentDir, inboxDir, manifestPath, postsDir, siteAssetsDir } from "./paths.mjs";

export async function ensureWorkspace() {
  await Promise.all([
    fs.mkdir(contentDir, { recursive: true }),
    fs.mkdir(inboxDir, { recursive: true }),
    fs.mkdir(postsDir, { recursive: true }),
    fs.mkdir(siteAssetsDir, { recursive: true }),
  ]);
}

export async function loadManifest() {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

export async function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function listInbox() {
  await fs.mkdir(inboxDir, { recursive: true });
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function safeSegment(value, fallback = "untitled") {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return normalized || fallback;
}


/**
 * Split a tag source into a clean array. Accepts an existing array or a
 * string separated by ASCII comma, full-width comma (，) or enumeration
 * comma (、), so CJK input works without surprising the user.
 */
export function splitTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,，、]/);
  return list.map((tag) => String(tag).trim()).filter(Boolean);
}
export function assertInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
}
