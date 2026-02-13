// lib/backups/index.ts
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const BACKUP_ID_REGEX = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}__[A-Za-z0-9_-]{4,}$/;

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

let restoreLock = false;

export function acquireRestoreLock(): boolean {
  if (restoreLock) return false;
  restoreLock = true;
  return true;
}

export function releaseRestoreLock() {
  restoreLock = false;
}

export function isRestoreInProgress() {
  return restoreLock;
}

export function resolveBackupRoot() {
  const envRoot = (process.env.BACKUP_ROOT_DIR || "").trim();
  if (envRoot) return path.resolve(envRoot);
  return path.join(os.homedir(), "Desktop", "WEBAPP_BACKUPS");
}

export function newBackupId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const suffix = randomBytes(4).toString("hex");
  return `${stamp}__${suffix}`;
}

export function safeJoin(root: string, backupId: string) {
  if (!BACKUP_ID_REGEX.test(backupId)) {
    throw new Error("INVALID_BACKUP_ID");
  }
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(root, backupId);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.sep)) {
    throw new Error("PATH_TRAVERSAL");
  }
  return full;
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function copyDirRecursive(src: string, dest: string) {
  const st = await fs.lstat(src);
  if (!st.isDirectory()) {
    throw new Error("SRC_NOT_DIR");
  }
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDirRecursive(from, to);
    } else if (e.isFile()) {
      await fs.copyFile(from, to);
    } else {
      // skip symlinks and special files
    }
  }
}

export async function dirSizeEstimate(p: string): Promise<number> {
  try {
    const st = await fs.lstat(p);
    if (st.isFile()) return st.size;
    if (!st.isDirectory()) return 0;
    let total = 0;
    const entries = await fs.readdir(p, { withFileTypes: true });
    for (const e of entries) {
      const entryPath = path.join(p, e.name);
      if (e.isDirectory()) {
        total += await dirSizeEstimate(entryPath);
      } else if (e.isFile()) {
        const s = await fs.lstat(entryPath);
        total += s.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export function runCommand(cmd: string, args: string[], cwd?: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, durationMs: Date.now() - start });
    });
  });
}

export function maskEnvToSample(envText: string) {
  const sensitiveKeys = ["DATABASE_URL", "PASSWORD", "SECRET", "TOKEN", "API_KEY", "KEY"];
  const lines = envText.split(/\r?\n/);
  const out = lines.map((line) => {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) return line;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1);
    const upper = key.toUpperCase();
    if (upper === "DATABASE_URL") return `${key}=postgresql://***`;
    if (sensitiveKeys.some((k) => upper.includes(k))) return `${key}=***`;
    return `${key}=${rest}`;
  });
  return out.join("\n");
}

export async function readTextIfExists(p: string) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function copyFileNoOverwrite(src: string, dest: string) {
  try {
    await fs.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
    return dest;
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err;
  }

  const base = path.basename(dest);
  const dir = path.dirname(dest);
  for (let i = 1; i < 9999; i += 1) {
    const next = path.join(dir, `${base}-${i}`);
    try {
      await fs.copyFile(src, next, fs.constants.COPYFILE_EXCL);
      return next;
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
    }
  }
  throw new Error("COPYFILE_LIMIT");
}

export function summarizeLog(txt: string, max = 4000) {
  if (txt.length <= max) return txt;
  return `${txt.slice(0, max)}\n...`;
}
