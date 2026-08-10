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
      if (tags) metadata.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

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
