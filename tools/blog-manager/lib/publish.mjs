/**
 * Direct-branch publish: builds to docs/, commits, and pushes to origin.
 * Designed for a single-branch workflow (main) where GitHub Pages serves
 * from the /docs directory.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rootDir } from "./paths.mjs";

const execFileAsync = promisify(execFile);

/**
 * @param {object} options
 * @param {string} [options.message]  Commit message.
 * @returns {Promise<{committed: boolean, output: string}>}
 */
export async function runPublish({ message = "Deploy blog updates" } = {}) {
  const msg = String(message).trim();
  const git = (args, opts) => execFileAsync("git", ["-C", rootDir, ...args], opts);

  const branch = (await git(["branch", "--show-current"])).stdout.trim();
  if (branch !== "main") {
    throw new Error(`Publish must run from the 'main' branch; current branch is '${branch}'.`);
  }

  await git(["remote", "get-url", "origin"]);

  const status = (await git(["status", "--short"])).stdout.trim();
  if (!status) {
    return { committed: false, output: "Nothing to publish." };
  }

  await git(["add", "--all"]);
  await git(["commit", "-m", msg]);
  const { stdout, stderr } = await git(["push", "origin", "main"], { maxBuffer: 10 * 1024 * 1024 });
  return { committed: true, output: `${stdout}\n${stderr}`.trim() };
}
