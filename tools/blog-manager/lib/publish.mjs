/**
 * Orphan-branch deploy: pushes the contents of public/ to origin/gh-pages
 * using a disposable temp git repo.  The working tree and source branch are
 * never touched, making this safe and idempotent.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { publicDir, rootDir } from "./paths.mjs";

const execFileAsync = promisify(execFile);

/**
 * @param {object} options
 * @param {string} [options.message]  Commit message.
 * @returns {Promise<{committed: boolean, output: string}>}
 */
export async function runPublish({ message = "Deploy blog updates" } = {}) {
  const msg = String(message).trim();

  if (!(await fs.access(publicDir).then(() => true).catch(() => false))) {
    throw new Error("public/ does not exist. Run a build first.");
  }

  const { stdout: remoteOut } = await execFileAsync("git", ["-C", rootDir, "remote", "get-url", "origin"]);
  const remote = remoteOut.trim();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-pages-deploy-"));

  try {
    await fs.cp(publicDir, tmpDir, { recursive: true });

    const git = (args) => execFileAsync("git", ["-C", tmpDir, ...args], { maxBuffer: 10 * 1024 * 1024 });
    await git(["init", "--quiet"]);
    await git(["config", "user.email", "blog-desk@deploy"]);
    await git(["config", "user.name", "Blog Desk"]);
    await git(["add", "--all"]);
    const { stdout: status } = await git(["status", "--short"]);
    if (!status.trim()) {
      return { committed: false, output: "Nothing to publish (public/ is empty)." };
    }
    await git(["commit", "--quiet", "-m", msg]);
    await git(["push", "--force", "--quiet", remote, "HEAD:gh-pages"]);
    return { committed: true, output: `Published to ${remote} (gh-pages).` };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
