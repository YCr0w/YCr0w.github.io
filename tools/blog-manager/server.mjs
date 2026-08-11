#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildSite } from "./lib/generator.mjs";
import { importFromInbox, importUploadedFiles, updatePost } from "./lib/importer.mjs";
import { managerPublicDir, publicDir, rootDir } from "./lib/paths.mjs";
import { listInbox, loadManifest, safeSegment, saveManifest } from "./lib/storage.mjs";

const execFileAsync = promisify(execFile);
const requestedPort = Number(process.argv.find((value) => value.startsWith("--port="))?.split("=")[1] || process.env.PORT || 4173);
const host = "127.0.0.1";
const watchMode = process.argv.includes("--watch");
const liveReloadClients = new Set();
const LIVE_RELOAD_SCRIPT = "<script>(function(){var e=new EventSource('/__livereload__');e.addEventListener('message',function(){location.reload();});})();</script>";

function injectLiveReload(body) {
  const text = body.toString("utf8");
  return /<\/body>/i.test(text)
    ? Buffer.from(text.replace(/<\/body>/i, `${LIVE_RELOAD_SCRIPT}</body>`), "utf8")
    : Buffer.concat([body, Buffer.from(LIVE_RELOAD_SCRIPT, "utf8")]);
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".xml", "application/xml; charset=utf-8"],
]);

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJson(request, maxBytes = 130 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function gitStatus() {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootDir, "status", "--short"]);
    return stdout.trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function apiState(response) {
  const [manifest, inbox, changes] = await Promise.all([loadManifest(), listInbox(), gitStatus()]);
  sendJson(response, 200, { manifest, inbox, changes });
}

async function addCategory(payload) {
  const manifest = await loadManifest();
  const id = safeSegment(payload.id || payload.name);
  if (!payload.name?.trim()) throw new Error("Category name is required.");
  if (manifest.categories.some((category) => category.id === id)) {
    throw new Error(`Category '${id}' already exists.`);
  }
  manifest.categories.push({
    id,
    name: payload.name.trim(),
    description: String(payload.description || "").trim(),
    color: /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : "#59636e",
  });
  await saveManifest(manifest);
  return manifest.categories.at(-1);
}

async function publishSite(payload) {
  await buildSite();
  const { validateSite } = await import("./lib/validate.mjs");
  const result = await validateSite();
  const { runPublish } = await import("./lib/publish.mjs");
  const outcome = await runPublish({ message: payload.commitMessage });
  return { ...outcome, files: result.files };
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/state") {
    await apiState(response);
    return true;
  }
  if (request.method === "POST" && pathname === "/api/build") {
    const result = await buildSite();
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === "POST" && pathname === "/api/import") {
    const payload = await readJson(request);
    const post = await importUploadedFiles(payload.files || [], payload.metadata || {});
    await buildSite();
    sendJson(response, 201, post);
    return true;
  }
  if (request.method === "POST" && pathname === "/api/inbox/import") {
    const payload = await readJson(request);
    const post = await importFromInbox(payload.entryName, payload.metadata || {});
    await buildSite();
    sendJson(response, 201, post);
    return true;
  }
  if (request.method === "POST" && pathname === "/api/categories") {
    sendJson(response, 201, await addCategory(await readJson(request)));
    return true;
  }
  if (request.method === "POST" && pathname === "/api/publish") {
    sendJson(response, 200, await publishSite(await readJson(request)));
    return true;
  }
  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (request.method === "PATCH" && postMatch) {
    const post = await updatePost(decodeURIComponent(postMatch[1]), await readJson(request));
    await buildSite();
    sendJson(response, 200, post);
    return true;
  }
  return false;
}

function safeStaticPath(base, relativePath) {
  const target = path.resolve(base, relativePath);
  const prefix = `${path.resolve(base)}${path.sep}`;
  if (target !== path.resolve(base) && !target.startsWith(prefix)) throw new Error("Invalid path.");
  return target;
}

async function serveFile(response, base, relativePath) {
  let target = safeStaticPath(base, relativePath);
  let stat;
  try {
    stat = await fs.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, "index.html");
      stat = await fs.stat(target);
    }
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(target).toLowerCase();
  let body = await fs.readFile(target);
  if (watchMode && ext === ".html") body = injectLiveReload(body);
  response.writeHead(200, {
    "content-type": mimeTypes.get(ext) || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  response.end(body);
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${requestedPort}`}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      if (!await handleApi(request, response, pathname)) sendJson(response, 404, { error: "API route not found." });
      return;
    }

    if (watchMode && pathname === "/__livereload__") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      response.write(": connected\n\n");
      liveReloadClients.add(response);
      request.on("close", () => liveReloadClients.delete(response));
      return;
    }
    if (pathname === "/__manager__/lucide.js") {
      const served = await serveFile(response, path.join(rootDir, "node_modules", "lucide", "dist", "umd"), "lucide.js")
        || await serveFile(response, path.join(rootDir, "node_modules", "lucide", "dist", "umd"), "lucide.min.js");
      if (!served) sendJson(response, 404, { error: "Lucide bundle not found." });
      return;
    }
    if (pathname.startsWith("/__manager__")) {
      const relativePath = pathname.replace(/^\/__manager__\/?/, "") || "index.html";
      if (!await serveFile(response, managerPublicDir, relativePath)) sendJson(response, 404, { error: "Manager asset not found." });
      return;
    }
    const relativePath = pathname.replace(/^\//, "") || "index.html";
    if (!await serveFile(response, publicDir, relativePath)) {
      if (!await serveFile(response, publicDir, "404.html")) sendJson(response, 404, { error: "Not found." });
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(requestedPort, host, () => {
  console.log(`Blog preview: http://${host}:${requestedPort}/`);
  console.log(`Blog manager: http://${host}:${requestedPort}/__manager__/`);
});

if (watchMode) {
  const { watchAndRebuild } = await import("./lib/watch.mjs");
  watchAndRebuild((error, result) => {
    if (error) {
      console.error(`[watch] rebuild failed: ${error.message}`);
      return;
    }
    console.log(`[watch] rebuilt ${result.posts} posts / ${result.pages} pages${result.synced ? " (front-matter synced)" : ""}`);
    for (const client of liveReloadClients) client.write("data: reload\n\n");
  });
  console.log("Watch mode: editing content/ or theme/ auto-rebuilds the site.");
}
