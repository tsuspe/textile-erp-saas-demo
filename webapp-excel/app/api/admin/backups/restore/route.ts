export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";
import {
  acquireRestoreLock,
  copyDirRecursive,
  ensureDir,
  isRestoreInProgress,
  releaseRestoreLock,
  resolveBackupRoot,
  runCommand,
  safeJoin,
  summarizeLog,
} from "@/lib/backups";

import { promises as fs } from "fs";
import path from "path";

function getDataRoot() {
  const envRoot = (process.env.DATA_DIR || "").trim();
  if (envRoot) return envRoot;
  return path.resolve(process.cwd(), "..", "data");
}

function getDataDir(name: "globalia" | "uploads") {
  return path.join(getDataRoot(), name);
}

function getPgRestoreBin() {
  return process.env.PG_RESTORE_BIN || "pg_restore";
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

async function renameIfExists(p: string, suffix: string) {
  try {
    const st = await fs.lstat(p);
    if (!st.isDirectory()) return null;
    const next = `${p}.old-${suffix}`;
    await fs.rename(p, next);
    return next;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });
  if (!userHasAnyGroup(user.groups, ["ADMIN"])) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  if (isRestoreInProgress()) {
    return NextResponse.json({ ok: false, error: "RESTORE_IN_PROGRESS" }, { status: 423 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const backupId = String(body?.backupId || "");
  const confirmText = String(body?.confirmText || "");

  if (!backupId) {
    return NextResponse.json({ ok: false, error: "MISSING_BACKUP_ID" }, { status: 400 });
  }
  if (confirmText !== `RESTORE ${backupId}`) {
    return NextResponse.json({ ok: false, error: "CONFIRM_MISMATCH" }, { status: 400 });
  }

  const root = resolveBackupRoot();
  let backupDir: string;
  try {
    backupDir = safeJoin(root, backupId);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BACKUP_ID" }, { status: 400 });
  }

  const dbDumpPath = path.join(backupDir, "db", "db.dump");
  const dbExists = await fs
    .access(dbDumpPath)
    .then(() => true)
    .catch(() => false);

  if (!dbExists) {
    return NextResponse.json({ ok: false, error: "MISSING_DB_DUMP" }, { status: 400 });
  }

  if (!acquireRestoreLock()) {
    return NextResponse.json({ ok: false, error: "RESTORE_IN_PROGRESS" }, { status: 423 });
  }

  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    releaseRestoreLock();
    return NextResponse.json({ ok: false, error: "MISSING_DATABASE_URL" }, { status: 500 });
  }
  let restoreUrl = databaseUrl;
  try {
    const parsed = new URL(databaseUrl);
    const schema = parsed.searchParams.get("schema");
    if (schema) parsed.searchParams.delete("schema");
    restoreUrl = parsed.toString();
    if (restoreUrl.endsWith("?")) restoreUrl = restoreUrl.slice(0, -1);
  } catch {
    // keep raw URL if parsing fails
  }

  const restoreArgs = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    restoreUrl,
    dbDumpPath,
  ];

  const logs: any = {
    db: null as any,
    fs: {
      globalia: null as any,
      uploads: null as any,
    },
    renames: {
      globalia: null as any,
      uploads: null as any,
    },
  };

  try {
    const dbResult = await runCommand(getPgRestoreBin(), restoreArgs);
    logs.db = {
      code: dbResult.code,
      stdout: summarizeLog(dbResult.stdout),
      stderr: summarizeLog(dbResult.stderr),
      durationMs: dbResult.durationMs,
    };

    if (dbResult.code !== 0) {
      return NextResponse.json({ ok: false, error: "PG_RESTORE_FAILED", logs }, { status: 500 });
    }

    const suffix = nowStamp();
    const globaliaCurrent = getDataDir("globalia");
    const uploadsCurrent = getDataDir("uploads");

    logs.renames.globalia = await renameIfExists(globaliaCurrent, suffix);
    logs.renames.uploads = await renameIfExists(uploadsCurrent, suffix);

    const globaliaBackup = path.join(backupDir, "fs", "globalia");
    const uploadsBackup = path.join(backupDir, "fs", "uploads");

    try {
      const st = await fs.lstat(globaliaBackup);
      if (st.isDirectory()) {
        await ensureDir(globaliaCurrent);
        await copyDirRecursive(globaliaBackup, globaliaCurrent);
        logs.fs.globalia = "OK";
      } else {
        logs.fs.globalia = "MISSING";
      }
    } catch {
      logs.fs.globalia = "MISSING";
    }

    try {
      const st = await fs.lstat(uploadsBackup);
      if (st.isDirectory()) {
        await ensureDir(uploadsCurrent);
        await copyDirRecursive(uploadsBackup, uploadsCurrent);
        logs.fs.uploads = "OK";
      } else {
        logs.fs.uploads = "MISSING";
      }
    } catch {
      logs.fs.uploads = "MISSING";
    }

    return NextResponse.json({ ok: true, logs });
  } finally {
    releaseRestoreLock();
  }
}
