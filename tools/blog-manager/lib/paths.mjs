import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(moduleDir, "../../..");
export const contentDir = path.join(rootDir, "content");
export const postsDir = path.join(contentDir, "posts");
export const inboxDir = path.join(contentDir, "inbox");
export const siteAssetsDir = path.join(contentDir, "site-assets");
export const manifestPath = path.join(contentDir, "site.json");
export const buildDir = path.join(rootDir, ".site-build");
export const publicDir = path.join(rootDir, "docs");
export const managerPublicDir = path.join(rootDir, "tools", "blog-manager", "public");

export function fromRoot(...segments) {
  return path.join(rootDir, ...segments);
}
