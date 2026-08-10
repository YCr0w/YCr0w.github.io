import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { contentDir, publicDir } from "./paths.mjs";

const execFileAsync = promisify(execFile);

const TEXT_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".svg", ".json", ".txt", ".md", ".xml", ".yml", ".yaml",
]);
const TEXT_FILENAMES = new Set([".editorconfig", ".gitattributes"]);

const REQUIRED_FILES = ["index.html", "tags/index.html", "assets/css/site.css"];

const EXTERNAL_REF = /^(https?:|mailto:|javascript:|data:|\/\/|#)/;
const HTML_REF = /(?:href|src)=["']([^"'#]+)["']/g;
const CSS_URL = /url\(["']?([^"')]+)/g;
const HTML_ID = /\sid=["']([^"']*)["']/g;

async function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(target)));
    } else if (entry.isFile()) {
      out.push(target);
    }
  }
  return out;
}

function relName(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveReference(ref, sourceFile, root) {
  if (EXTERNAL_REF.test(ref)) return null;
  const stripped = ref.split(/[?#]/)[0];
  if (stripped === "") return null;
  let resolved;
  if (stripped.startsWith("/")) {
    resolved = path.join(root, decodeURIComponent(stripped.replace(/^\/+/, "")));
  } else {
    resolved = path.resolve(path.dirname(sourceFile), decodeURIComponent(stripped));
  }
  if (stripped.endsWith("/")) {
    resolved = path.join(resolved, "index.html");
  }
  return resolved;
}

export async function validateSite() {
  const failures = [];

  for (const required of REQUIRED_FILES) {
    if (!(await pathExists(path.join(publicDir, ...required.split("/"))))) {
      failures.push(`missing required file: ${required}`);
    }
  }

  const publishedFiles = await walkFiles(publicDir);
  const workspaceFiles = [...publishedFiles, ...(await walkFiles(contentDir))];

  for (const file of workspaceFiles) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !TEXT_FILENAMES.has(base)) continue;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(file));
      if (text.includes("\uFFFD")) {
        failures.push(`${relName(file, publicDir)}: contains Unicode replacement characters`);
      }
    } catch {
      failures.push(`${relName(file, publicDir)}: is not valid UTF-8`);
    }
  }

  const htmlFiles = publishedFiles.filter((f) => f.toLowerCase().endsWith(".html"));
  const cssFiles = publishedFiles.filter((f) => f.toLowerCase().endsWith(".css"));
  const jsFiles = publishedFiles.filter((f) => f.toLowerCase().endsWith(".js"));

  for (const file of htmlFiles) {
    const text = await fs.readFile(file, "utf8");
    const display = relName(file, publicDir);
    for (const match of text.matchAll(HTML_REF)) {
      const resolved = resolveReference(match[1], file, publicDir);
      if (resolved && !(await pathExists(resolved))) {
        failures.push(`${display}: missing ${match[1]}`);
      }
    }
  }

  for (const file of cssFiles) {
    const text = await fs.readFile(file, "utf8");
    const display = relName(file, publicDir);
    for (const match of text.matchAll(CSS_URL)) {
      const ref = match[1];
      if (ref.startsWith("$")) continue;
      const resolved = resolveReference(ref, file, publicDir);
      if (resolved && !(await pathExists(resolved))) {
        failures.push(`${display}: missing ${ref}`);
      }
    }
  }

  for (const file of htmlFiles) {
    const text = await fs.readFile(file, "utf8");
    const display = relName(file, publicDir);
    const counts = new Map();
    for (const match of text.matchAll(HTML_ID)) {
      counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count > 1) failures.push(`${display}: duplicate id '${id}'`);
    }
  }

  for (const file of jsFiles) {
    try {
      await execFileAsync(process.execPath, ["--check", file]);
    } catch (error) {
      const detail = (error.stderr || error.stdout || error.message).toString().trim();
      failures.push(`${relName(file, publicDir)}: ${detail}`);
    }
  }

  for (const file of htmlFiles) {
    const text = await fs.readFile(file, "utf8");
    if (text.includes("example.com")) {
      failures.push(`${relName(file, publicDir)}: contains the example.com placeholder`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Site validation failed with ${failures.length} error(s):\n${failures.join("\n")}`,
    );
  }
  return { files: publishedFiles.length };
}
