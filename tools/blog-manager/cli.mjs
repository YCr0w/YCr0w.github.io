#!/usr/bin/env node
/**
 * Blog Desk CLI — single entry point for build, validation, import, and preview.
 *
 * Commands
 *   build                Generate the static site into the repo root.
 *   check                Validate the content model (site.json ↔ posts).
 *   validate             Validate the generated output (links, encoding, JS).
 *   import  <path>       Import an article from a file or directory.
 *                        Flags: --title --category --tags a,b --slug --date
 *                               --summary --status published|draft --no-build
 *   preview [--port N]   Build, validate, then start the preview server.
 *                        Flags: --no-browser
 *   stop    [--port N]   Stop a running preview server.
 *   migrate              One-time legacy Hexo → content/ migration.
 */
import path from "node:path";
import { exec } from "node:child_process";
import { splitTags } from "./lib/storage.mjs";

const command = process.argv[2] ?? "build";
const args = process.argv.slice(3);

function getFlag(name, fallback) {
  const prefix = `--${name}=`;
  const flag = `--${name}`;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(prefix)) return args[i].slice(prefix.length);
    if (args[i] === flag && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      return args[i + 1];
    }
  }
  return fallback;
}

function getSwitch(name) {
  return args.includes(`--${name}`);
}

try {
  switch (command) {
    case "migrate": {
      const { migrateLegacySite } = await import("./lib/migrate.mjs");
      const result = await migrateLegacySite();
      console.log(`Migrated ${result.posts} posts into ${result.manifest}`);
      break;
    }

    case "build": {
      const { buildSite } = await import("./lib/generator.mjs");
      const result = await buildSite();
      console.log(`Built ${result.posts} posts and ${result.pages} pages.`);
      break;
    }

    case "check": {
      const { checkWorkspace } = await import("./lib/check.mjs");
      const result = await checkWorkspace();
      console.log(`Workspace check passed: ${result.posts} posts, ${result.assets} assets.`);
      break;
    }

    case "validate": {
      const { buildSite } = await import("./lib/generator.mjs");
      await buildSite();
      const { validateSite } = await import("./lib/validate.mjs");
      const result = await validateSite();
      console.log(`Validation passed: ${result.files} files checked.`);
      break;
    }

    case "import": {
      const inputPath = args.find((a) => !a.startsWith("--"));
      if (!inputPath) {
        throw new Error(
          "Usage: cli.mjs import <file-or-dir> [--title ...] [--category ...] [--tags a,b] " +
          "[--slug ...] [--date ...] [--summary ...] [--status published|draft] [--no-build]",
        );
      }
      const metadata = {};
      for (const [key, value] of Object.entries({
        title: getFlag("title"),
        category: getFlag("category"),
        slug: getFlag("slug"),
        date: getFlag("date"),
        summary: getFlag("summary"),
        status: getFlag("status"),
      })) {
        if (value !== undefined) metadata[key] = value;
      }
      const tags = getFlag("tags");
      if (tags) metadata.tags = splitTags(tags);

      const { importFromPath } = await import("./lib/importer.mjs");
      const post = await importFromPath(path.resolve(inputPath), metadata);
      console.log(`Imported "${post.title}" → ${post.url}`);
      console.log(`  category: ${post.category}  tags: ${post.tags.join(", ")}`);

      if (!getSwitch("no-build")) {
        const { buildSite } = await import("./lib/generator.mjs");
        await buildSite();
        console.log("Site rebuilt.");
      }
      break;
    }

    case "new": {
      const title = args.find((a) => !a.startsWith("--"));
      if (!title) {
        throw new Error(
          'Usage: cli.mjs new "标题" --category <cat> [--tags a,b] [--slug ...] [--status draft|published]',
        );
      }
      const metadata = { title };
      for (const [key, value] of Object.entries({
        category: getFlag("category"),
        slug: getFlag("slug"),
        status: getFlag("status"),
        summary: getFlag("summary"),
      })) {
        if (value !== undefined) metadata[key] = value;
      }
      const tags = getFlag("tags");
      if (tags) metadata.tags = splitTags(tags);

      const { createPost } = await import("./lib/importer.mjs");
      const post = await createPost(metadata);
      const { fromRoot } = await import("./lib/paths.mjs");
      const filePath = fromRoot(...post.source.split("/"));
      console.log(`Created "${post.title}"`);
      console.log(`  file:   ${filePath}`);
      console.log(`  url:    ${post.url}`);
      console.log(`  status: ${post.status}`);

      if (!getSwitch("no-build")) {
        const { buildSite } = await import("./lib/generator.mjs");
        await buildSite();
        console.log("Site rebuilt. Open the file in Typora, then run: deploy.bat dev");
      }
      break;
    }

    case "preview": {
      const port = Number(getFlag("port", "4173"));
      const { buildSite } = await import("./lib/generator.mjs");
      await buildSite();
      const { validateSite } = await import("./lib/validate.mjs");
      await validateSite();
      const { startPreview } = await import("./lib/preview.mjs");
      const { url, pid } = await startPreview(port);
      console.log(`\n==> Preview ready: ${url}`);
      console.log(`==> Blog manager:  ${url}__manager__/`);
      console.log(`==> PID ${pid}.  Stop with: deploy.bat stop ${port}`);
      if (!getSwitch("no-browser")) exec(`start "" "${url}"`);
      break;
    }

    case "dev": {
      const port = Number(getFlag("port", "4173"));
      const { buildSite } = await import("./lib/generator.mjs");
      await buildSite();
      const { rootDir } = await import("./lib/paths.mjs");
      const { spawn } = await import("node:child_process");
      const serverPath = path.join(rootDir, "tools", "blog-manager", "server.mjs");
      const child = spawn(process.execPath, [serverPath, `--port=${port}`, "--watch"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
      });
      console.log(`\n==> Dev mode (watch + live reload): http://127.0.0.1:${port}/`);
      console.log(`==> Manager: http://127.0.0.1:${port}/__manager__/`);
      console.log("==> Edit in Typora, save → site rebuilds → browser auto-refreshes.");
      console.log("==> Press Ctrl+C to stop.\n");
      const stop = () => { child.kill(); process.exit(0); };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      child.on("exit", (code) => process.exit(code ?? 0));
      break;
    }

    case "stop": {
      const port = Number(getFlag("port", "4173"));
      const { stopPreview } = await import("./lib/preview.mjs");
      const stopped = await stopPreview(port);
      console.log(stopped ? `Stopped preview on port ${port}.` : "No preview was running.");
      break;
    }

    case "publish": {
      const message = getFlag("message", "Deploy blog updates");
      const { buildSite } = await import("./lib/generator.mjs");
      await buildSite();
      const { validateSite } = await import("./lib/validate.mjs");
      await validateSite();
      const { runPublish } = await import("./lib/publish.mjs");
      const outcome = await runPublish({ message });
      console.log(outcome.committed
        ? `Published to origin/gh-pages.\n${outcome.output}`
        : outcome.output);
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}\nSee source header for available commands.`);
  }
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
