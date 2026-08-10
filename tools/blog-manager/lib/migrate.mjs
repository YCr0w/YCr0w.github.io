import fs from "node:fs/promises";
import path from "node:path";
import { ensureWorkspace, saveManifest } from "./storage.mjs";
import { fromRoot, postsDir, siteAssetsDir } from "./paths.mjs";

const legacyPosts = [
  {
    id: "pikabot",
    title: "Pikabot 样本分析",
    sourcePage: ["2024", "08", "08", "pikabot", "index.html"],
    sourceAssetDir: ["imge", "pikabot", "assets"],
    category: "malware-analysis",
    tags: ["Pikabot", "恶意软件", "逆向分析"],
    date: "2024-08-08T12:40:41+08:00",
    updated: "2024-09-26T21:23:52+08:00",
    url: "/2024/08/08/pikabot/",
    summary: "Pikabot Loader 与核心模块的动态 API 解析、反分析技术和关键行为记录。",
  },
  {
    id: "windows-module-loading",
    title: "Windows 模块加载方式与 PEB 模块遍历",
    sourcePage: ["2024", "08", "07", "加载特定模块的方法", "index.html"],
    category: "windows-internals",
    tags: ["Windows", "PEB", "DLL"],
    date: "2024-08-07T22:19:05+08:00",
    updated: "2024-08-07T22:21:12+08:00",
    url: "/2024/08/07/%E5%8A%A0%E8%BD%BD%E7%89%B9%E5%AE%9A%E6%A8%A1%E5%9D%97%E7%9A%84%E6%96%B9%E6%B3%95/",
    summary: "梳理 Windows 静态与动态链接方式，以及通过 PEB 模块链表枚举已加载模块的实现思路。",
  },
  {
    id: "cobaltstrike-debugging",
    title: "CobaltStrike 动态调试",
    sourcePage: ["2024", "08", "07", "CobaltStrike动调", "index.html"],
    sourceAssetDir: ["imge", "CobaltStrike动调", "assets"],
    category: "red-team",
    tags: ["CobaltStrike", "动态调试", "逆向分析"],
    date: "2024-08-07T12:40:41+08:00",
    updated: "2024-09-26T21:23:50+08:00",
    url: "/2024/08/07/CobaltStrike%E5%8A%A8%E8%B0%83/",
    summary: "围绕 CobaltStrike 样本展开的动态调试过程、关键流程定位与行为分析笔记。",
  },
  {
    id: "dll-hijacking",
    title: "DLL 劫持原理与实践",
    sourcePage: ["2024", "08", "07", "dll劫持", "index.html"],
    sourceAssetDir: ["imge", "dll劫持", "assets"],
    category: "windows-security",
    tags: ["DLL 劫持", "Windows", "安全研究"],
    date: "2024-08-07T12:27:41+08:00",
    updated: "2024-09-26T21:23:51+08:00",
    url: "/2024/08/07/dll%E5%8A%AB%E6%8C%81/",
    summary: "DLL 搜索顺序、劫持条件与验证过程的学习记录。",
  },
];

function extractBody(page, sourcePath) {
  const startMarker = '<div class="post-content markdown-body">';
  const start = page.indexOf(startMarker);
  const endMarkers = [
    '</div></section><div id="reward-container">',
    '</div></section></article>',
  ];
  const ends = endMarkers
    .map((marker) => page.indexOf(marker, start + startMarker.length))
    .filter((position) => position >= 0);
  const end = ends.length ? Math.min(...ends) : -1;
  if (start < 0 || end < 0) {
    throw new Error(`Cannot extract article body from ${sourcePath}`);
  }
  return page.slice(start + startMarker.length, end).trim();
}

function rewriteLegacyAssets(body, post) {
  if (!post.sourceAssetDir) return body;
  const oldPrefix = `/${post.sourceAssetDir.map(encodeURIComponent).join("/")}/`;
  const loosePrefix = `/${post.sourceAssetDir.join("/")}/`;
  const newPrefix = `/assets/posts/${post.id}/`;
  return body
    .replaceAll(oldPrefix, newPrefix)
    .replaceAll(loosePrefix, newPrefix)
    .replaceAll("/../imge/", "/assets/posts/");
}

async function copyIfPresent(source, destination) {
  try {
    await fs.access(source);
    await fs.cp(source, destination, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function migrateLegacySite() {
  await ensureWorkspace();

  const posts = [];
  for (const legacy of legacyPosts) {
    const sourcePath = fromRoot(...legacy.sourcePage);
    const page = await fs.readFile(sourcePath, "utf8");
    const destinationDir = path.join(postsDir, legacy.category, legacy.id);
    await fs.mkdir(destinationDir, { recursive: true });

    const body = rewriteLegacyAssets(extractBody(page, sourcePath), legacy);
    const source = path.join(destinationDir, "index.html");
    await fs.writeFile(source, `${body}\n`, "utf8");

    if (legacy.sourceAssetDir) {
      await copyIfPresent(
        fromRoot(...legacy.sourceAssetDir),
        path.join(destinationDir, "assets"),
      );
    }

    posts.push({
      id: legacy.id,
      title: legacy.title,
      category: legacy.category,
      tags: legacy.tags,
      date: legacy.date,
      updated: legacy.updated,
      url: legacy.url,
      summary: legacy.summary,
      source: path.relative(fromRoot(), source).replaceAll(path.sep, "/"),
      format: "html",
      status: "published",
      legacy: true,
    });
  }

  const aboutPage = await fs.readFile(fromRoot("about", "index.html"), "utf8");
  await fs.writeFile(
    path.join(siteAssetsDir, "about.html"),
    `${extractBody(aboutPage, fromRoot("about", "index.html"))}\n`,
    "utf8",
  );

  await Promise.all([
    copyIfPresent(fromRoot("background2.jpg"), path.join(siteAssetsDir, "hero.jpg")),
    copyIfPresent(fromRoot("background3.jpg"), path.join(siteAssetsDir, "hero-alt.jpg")),
    copyIfPresent(fromRoot("yun.jpg"), path.join(siteAssetsDir, "avatar.jpg")),
    copyIfPresent(fromRoot("yun.svg"), path.join(siteAssetsDir, "mark.svg")),
    copyIfPresent(fromRoot("favicon.ico"), path.join(siteAssetsDir, "favicon.ico")),
  ]);

  const manifest = {
    version: 1,
    site: {
      title: "YCr0w'blog",
      author: "YCr0w",
      tagline: "逆风而行",
      description: "记录恶意软件分析、Windows 安全与二进制研究。",
      url: "https://ycr0w.github.io",
      email: "3083981460@qq.com",
      github: "https://github.com/YCr0w",
    },
    categories: [
      { id: "malware-analysis", name: "恶意软件分析", color: "#d84a5b", description: "样本行为、加载链与对抗技术" },
      { id: "windows-internals", name: "Windows 内核机制", color: "#187f76", description: "PEB、模块加载与系统结构" },
      { id: "windows-security", name: "Windows 安全", color: "#d59b28", description: "攻击面、利用方式与防护思路" },
      { id: "red-team", name: "红队研究", color: "#5967a9", description: "工具链、调试与对抗分析" },
      { id: "reverse-pwn", name: "逆向与 Pwn", color: "#7b5a9a", description: "二进制分析与漏洞研究" },
      { id: "notes", name: "学习随笔", color: "#59636e", description: "零散记录与实践备忘" }
    ],
    posts,
    updatedAt: new Date().toISOString(),
  };

  await saveManifest(manifest);
  return { posts: posts.length, manifest: fromRoot("content", "site.json") };
}
