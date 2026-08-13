#!/usr/bin/env node
/**
 * Blog Desk — interactive menu.
 *
 * Run via:  deploy.bat        (or)   node tools/blog-manager/menu.mjs
 *
 * All Chinese text lives here (Node handles UTF-8 natively). The deploy.bat
 * wrapper stays ASCII-only to avoid cmd's batch-file encoding pitfalls.
 *
 * Each action shells out to cli.mjs (reuses the full build/import/publish
 * pipeline). Arguments are passed as an array, so titles/paths with spaces or
 * CJK characters need no quoting.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const cliPath = path.join(here, "cli.mjs");
const sitePath = path.join(root, "content", "site.json");

const rl = readline.createInterface({ input, output });

/** Spawn cli.mjs with inherited stdio; resolves to exit code. */
function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code));
    child.on("error", (err) => {
      console.log(`\n[!] 启动失败: ${err.message}`);
      resolve(1);
    });
  });
}

async function ask(prompt, def) {
  const suffix = def ? ` [${def}]` : "";
  const ans = (await rl.question(`${prompt}${suffix}: `)).trim();
  return ans === "" ? (def ?? "") : ans;
}

async function pause() {
  await rl.question("\n  （按回车返回菜单）");
}

async function pickCategory() {
  const site = JSON.parse(fs.readFileSync(sitePath, "utf8"));
  console.log("\n  可选分类:");
  site.categories.forEach((c, i) =>
    console.log(`    ${i + 1}. ${c.id}   (${c.name})`),
  );
  while (true) {
    const num = (await rl.question("  选择分类编号 [回车=malware-analysis]: ")).trim();
    if (num === "") return "malware-analysis";
    const cat = site.categories[parseInt(num, 10) - 1];
    if (cat) return cat.id;
    console.log("  [!] 无效，请重选。");
  }
}

async function menuNew() {
  console.log("\n========== 新建文章 (从零开始) ==========\n");
  const title = await ask("文章标题");
  if (!title) return console.log("[!] 标题不能为空。");
  const category = await pickCategory();
  const tags = await ask("标签 (逗号分隔，可留空)");
  const slug = await ask("URL 短名 (英文/数字/连字符，可留空)");
  const status = await ask("状态 [1]published 发布 / [2]draft 草稿", "published");
  const st = status === "2" ? "draft" : "published";
  const summary = await ask("摘要 (一句话简介，可留空)");

  const args = ["new", title, `--category=${category}`, `--status=${st}`];
  if (tags) args.push(`--tags=${tags}`);
  if (slug) args.push(`--slug=${slug}`);
  if (summary) args.push(`--summary=${summary}`);

  console.log("\n  >> 正在创建...");
  await run(args);
  console.log("\n  完成。用 Typora 打开上面打印的文件开始写作；预览回菜单选 [3]。");
}

async function menuImport() {
  console.log("\n========== 导入文章 (语雀 / Typora 导出) ==========");
  console.log("  支持: 单个 .md 文件，或包含 md + 图片的目录 (可拖入路径)\n");
  const inputPath = await ask("文章路径");
  if (!inputPath) return console.log("[!] 路径不能为空。");
  const category = await pickCategory();
  const title = await ask("标题 (回车=用文件名自动识别)");
  const tags = await ask("标签 (逗号分隔，可留空)");
  const slug = await ask("URL 短名 (英文/数字，可留空)");
  const summary = await ask("摘要 (一句话简介，显示在标题下方，可留空)");

  const args = ["import", inputPath, `--category=${category}`];
  if (title) args.push(`--title=${title}`);
  if (tags) args.push(`--tags=${tags}`);
  if (slug) args.push(`--slug=${slug}`);
  if (summary) args.push(`--summary=${summary}`);

  console.log("\n  >> 正在导入并构建...");
  await run(args);
  console.log("\n  完成。预览回菜单选 [3]/[4]；上线选 [6]。");
}

async function menuDev() {
  const port = await ask("端口", "4173");
  console.log("\n  dev 模式启动：Typora 保存即自动重建刷新。按 Ctrl+C 停止。\n");
  await run(["dev", `--port=${port}`]);
}

async function menuPreview() {
  const port = await ask("端口", "4173");
  console.log();
  await run(["preview", `--port=${port}`]);
  console.log("\n  预览服务器已在后台运行。停止回菜单选 [7]。");
}

async function menuCheck() {
  console.log();
  await run(["validate"]);
}

async function menuPublish() {
  console.log("\n========== 发布上线 ==========");
  console.log("  将执行: 构建 -> 校验 -> git 提交 -> 推送 origin/main\n");
  const msg = await ask("提交信息", "Deploy blog updates");
  const conf = await ask("确认发布并推送? (y/N)", "n");
  if (conf.toLowerCase() !== "y") return console.log("  已取消。");
  console.log();
  await run(["publish", `--message=${msg}`]);
}

async function menuStop() {
  const port = await ask("端口", "4173");
  console.log();
  await run(["stop", `--port=${port}`]);
}

const ACTIONS = [
  menuNew,
  menuImport,
  menuDev,
  menuPreview,
  menuCheck,
  menuPublish,
  menuStop,
];

async function main() {
  while (true) {
    console.log("\n  ================================================================");
    console.log("                       Blog Desk  交互式菜单");
    console.log("  ================================================================");
    console.log("    [1] 新建文章        从零开始，生成写作模板");
    console.log("    [2] 导入文章        语雀 / Typora 导出的 md + 图片");
    console.log("    [3] 实时写作预览    dev 模式：保存即自动刷新 (写作推荐)");
    console.log("    [4] 构建并预览      build + 校验 + 启动本地服务");
    console.log("    [5] 校验            build + 校验 (不启动服务)");
    console.log("    [6] 发布上线        构建 + 校验 + 提交 + 推送 origin/main");
    console.log("    [7] 停止预览        关闭正在运行的预览服务器");
    console.log("    [Q] 退出");
    console.log("  ================================================================");

    const choice = (await rl.question("\n  请选择操作 [1-7 / Q]: ")).trim().toLowerCase();
    if (choice === "q" || choice === "0" || choice === "quit") break;

    const n = parseInt(choice, 10);
    if (n >= 1 && n <= ACTIONS.length) {
      try {
        await ACTIONS[n - 1]();
      } catch (err) {
        console.log(`\n  [!] 出错: ${err.message}`);
      }
      await pause();
    }
  }
  console.log("\n  再见。\n");
  rl.close();
}

main();
