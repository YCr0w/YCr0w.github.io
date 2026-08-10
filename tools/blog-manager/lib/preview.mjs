/**
 * Preview-server lifecycle management.
 *
 * startPreview() spawns the Blog Desk server as a detached background process,
 * waits for the port to accept connections, and records a state file so that
 * stopPreview() — or `deploy.bat stop` — can locate and terminate it later.
 */
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { rootDir } from "./paths.mjs";

function stateFile(port) {
  const tmp = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return path.join(tmp, `ycr0w-blog-preview-${port}.json`);
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(150);
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, attempts = 30, intervalMs = 100) {
  for (let i = 0; i < attempts; i++) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function readState(port) {
  try {
    return JSON.parse(await fs.readFile(stateFile(port), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function killProcess(pid) {
  try {
    process.kill(pid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the preview server.  Throws if the port is already in use or the
 * server fails to become ready.
 *
 * @param {number} port
 * @returns {Promise<{pid: number, port: number, url: string}>}
 */
export async function startPreview(port) {
  const existing = await readState(port);
  if (existing?.pid) {
    const alive = await killProcess(existing.pid).catch(() => false);
    if (alive) {
      // Process from a previous session is still alive — recycle it.
      await killProcess(existing.pid);
    }
  }

  if (await isPortOpen(port)) {
    throw new Error(`Port ${port} is already in use. Choose another with --port.`);
  }

  const serverPath = path.join(rootDir, "tools", "blog-manager", "server.mjs");
  const child = spawn(process.execPath, [serverPath, `--port=${port}`], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();

  if (!(await waitForPort(port))) {
    throw new Error("Preview server failed to start. Verify the Node runtime.");
  }

  const state = {
    pid: child.pid,
    port,
    root: rootDir,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(stateFile(port), JSON.stringify(state, null, 2));
  return { ...state, url: `http://127.0.0.1:${port}/` };
}

/**
 * Stop a running preview server by reading its state file.
 *
 * @param {number} port
 * @returns {Promise<boolean>} true if a process was stopped
 */
export async function stopPreview(port) {
  const state = await readState(port);
  if (!state) return false;
  await fs.rm(stateFile(port), { force: true });
  return killProcess(state.pid);
}
