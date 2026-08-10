import fs from "node:fs/promises";
import path from "node:path";
import { load as loadHtml } from "cheerio";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import sanitizeHtml from "sanitize-html";
import YAML from "yaml";
import { fromRoot } from "./paths.mjs";
import { safeSegment } from "./storage.mjs";

const markdown = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, language) {
      const validLanguage = language && hljs.getLanguage(language) ? language : "plaintext";
      return hljs.highlight(code, { language: validLanguage }).value;
    },
  }),
  { gfm: true, breaks: false },
);

function parseFrontMatter(source) {
  if (!source.startsWith("---\n")) return { attributes: {}, body: source };
  const end = source.indexOf("\n---", 4);
  if (end < 0) return { attributes: {}, body: source };
  return {
    attributes: YAML.parse(source.slice(4, end)) ?? {},
    body: source.slice(end + 4).replace(/^\r?\n/, ""),
  };
}

function sanitizeImportedHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "article", "section", "figure", "figcaption", "img", "details", "summary",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "kbd", "mark",
    ]),
    allowedAttributes: {
      "*": ["id", "class", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      pre: ["class"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowProtocolRelative: false,
  });
}

function normalizeArticle(html, post) {
  const $ = loadHtml(`<article data-render-root>${html}</article>`, null, false);
  const headings = [];
  const usedIds = new Set();

  $("h1, h2, h3").each((_, element) => {
    const heading = $(element);
    heading.children("a.headerlink").remove();
    const text = heading.text().trim();
    if (!text) return;
    let id = heading.attr("id") || safeSegment(text, `section-${headings.length + 1}`);
    let candidate = id;
    let suffix = 2;
    while (usedIds.has(candidate)) candidate = `${id}-${suffix++}`;
    id = candidate;
    usedIds.add(id);
    heading.attr("id", id);
    headings.push({ level: Number(element.tagName.slice(1)), id, text });
  });

  $("img").each((_, element) => {
    const image = $(element);
    image.attr("loading", "lazy");
    image.attr("decoding", "async");
    if (!image.attr("alt")) image.attr("alt", post.title);
  });
  $("a[target='_blank']").attr("rel", "noopener noreferrer");

  const root = $("article[data-render-root]");
  const text = root.text().replace(/\s+/g, " ").trim();
  return { html: root.html() ?? "", headings, text };
}

export async function renderPost(post) {
  const sourcePath = fromRoot(...post.source.split("/"));
  const raw = await fs.readFile(sourcePath, "utf8");
  let html;
  let attributes = {};

  if (post.format === "markdown") {
    const parsed = parseFrontMatter(raw);
    attributes = parsed.attributes;
    html = await markdown.parse(parsed.body);
    html = sanitizeImportedHtml(html);
  } else {
    html = post.legacy ? raw : sanitizeImportedHtml(raw);
  }

  return { ...normalizeArticle(html, post), attributes, sourcePath };
}

export function excerptFromText(text, length = 170) {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()}...`;
}

export async function sourceAssetDirectory(post) {
  const sourcePath = fromRoot(...post.source.split("/"));
  return path.join(path.dirname(sourcePath), "assets");
}
