export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";
import {
  copyDirRecursive,
  dirSizeEstimate,
  ensureDir,
  isRestoreInProgress,
  maskEnvToSample,
  newBackupId,
  readTextIfExists,
  resolveBackupRoot,
  runCommand,
  safeJoin,
  summarizeLog,
  copyFileNoOverwrite,
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

function getPgDumpBin() {
  return process.env.PG_DUMP_BIN || "pg_dump";
}

function getAppVersion() {
  return process.env.APP_VERSION || process.env.npm_package_version || null;
}

async function listBackups() {
  const root = resolveBackupRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const items = [] as any[];
    for (const backupId of dirs.sort().reverse()) {
      try {
        const full = safeJoin(root, backupId);
        const manifestPath = path.join(full, "manifest.json");
        const manifestRaw = await readTextIfExists(manifestPath);
        let manifest = null as any;
        if (manifestRaw) {
          try {
            manifest = JSON.parse(manifestRaw);
          } catch {
            manifest = null;
          }
        }
        items.push({
          backupId,
          manifest,
        });
      } catch {
        // ignore invalid backupId
      }
    }
    return { root, items };
  } catch {
    return { root, items: [] as any[] };
  }
}

export async function GET() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });
  if (!userHasAnyGroup(user.groups, ["ADMIN"])) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { root, items } = await listBackups();
  return NextResponse.json({ ok: true, root, items });
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

  const includeEnv = Boolean(body?.includeEnv);
  const backupRoot = resolveBackupRoot();
  await ensureDir(backupRoot);

  const backupId = newBackupId();
  const backupDir = safeJoin(backupRoot, backupId);
  const dbDir = path.join(backupDir, "db");
  const fsDir = path.join(backupDir, "fs");
  const fsGlobaliaDir = path.join(fsDir, "globalia");
  const fsUploadsDir = path.join(fsDir, "uploads");
  const fsEnvDir = path.join(fsDir, "env");

  await ensureDir(dbDir);
  await ensureDir(fsDir);

  const dumpPath = path.join(dbDir, "db.dump");
  const databaseUrl = process.env.DATABASE_URL || "";
  let dumpUrl = databaseUrl;
  let schema: string | null = null;
  try {
    const parsed = new URL(databaseUrl);
    schema = parsed.searchParams.get("schema");
    if (schema) parsed.searchParams.delete("schema");
    dumpUrl = parsed.toString();
    if (dumpUrl.endsWith("?")) dumpUrl = dumpUrl.slice(0, -1);
  } catch {
    // keep raw URL if parsing fails
  }
  const dumpArgs = ["-Fc", "--no-owner", "--no-privileges"];
  if (schema) dumpArgs.push("--schema", schema);
  dumpArgs.push("--file", dumpPath, dumpUrl);

  const logs: any = {
    db: null as any,
    fs: {
      globalia: null as any,
      uploads: null as any,
      env: null as any,
    },
  };

  const errors: string[] = [];

  if (!databaseUrl) {
    errors.push("MISSING_DATABASE_URL");
  }

  let dbResult = null as any;
  if (!errors.length) {
    dbResult = await runCommand(getPgDumpBin(), dumpArgs);
    logs.db = {
      code: dbResult.code,
      stdout: summarizeLog(dbResult.stdout),
      stderr: summarizeLog(dbResult.stderr),
      durationMs: dbResult.durationMs,
    };
    if (dbResult.code !== 0) errors.push("PG_DUMP_FAILED");
  }

  const copyOps: Array<Promise<void>> = [];
  const missingDirs: string[] = [];

  const globaliaSrc = getDataDir("globalia");
  const uploadsSrc = getDataDir("uploads");

  try {
    const st = await fs.lstat(globaliaSrc);
    if (st.isDirectory()) {
      await ensureDir(fsGlobaliaDir);
      copyOps.push(copyDirRecursive(globaliaSrc, fsGlobaliaDir));
    } else {
      missingDirs.push("data/globalia");
    }
  } catch {
    missingDirs.push("data/globalia");
  }

  try {
    const st = await fs.lstat(uploadsSrc);
    if (st.isDirectory()) {
      await ensureDir(fsUploadsDir);
      copyOps.push(copyDirRecursive(uploadsSrc, fsUploadsDir));
    } else {
      missingDirs.push("data/uploads");
    }
  } catch {
    missingDirs.push("data/uploads");
  }

  await Promise.all(copyOps);

  logs.fs.globalia = missingDirs.includes("data/globalia") ? "MISSING" : "OK";
  logs.fs.uploads = missingDirs.includes("data/uploads") ? "MISSING" : "OK";

  let envBackupPath: string | null = null;
  let envSamplePath: string | null = null;
  if (includeEnv) {
    const envSrc = path.join(process.cwd(), ".env");
    try {
      const envText = await fs.readFile(envSrc, "utf8");
      await ensureDir(fsEnvDir);
      envBackupPath = await copyFileNoOverwrite(envSrc, path.join(fsEnvDir, ".env.backup"));
      const masked = maskEnvToSample(envText);
      envSamplePath = path.join(fsEnvDir, ".env.sample");
      await fs.writeFile(envSamplePath, masked, "utf8");
      logs.fs.env = "OK";
    } catch {
      logs.fs.env = "MISSING";
    }
  }

  const sizes = {
    dbDumpBytes: await dirSizeEstimate(dumpPath),
    globaliaBytes: await dirSizeEstimate(fsGlobaliaDir),
    uploadsBytes: await dirSizeEstimate(fsUploadsDir),
  };

  const manifest = {
    backupId,
    backupRoot,
    createdAt: new Date().toISOString(),
    createdBy: user.email || user.username || user.name || "unknown",
    appVersion: getAppVersion(),
    includesEnv: includeEnv,
    engine: "postgres",
    sizes,
    missingDirs,
    env: includeEnv
      ? {
          backupPath: envBackupPath,
          samplePath: envSamplePath,
        }
      : null,
    dumpCommand: {
      bin: getPgDumpBin(),
      args: dumpArgs,
    },
    result: {
      ok: errors.length === 0,
      errors,
    },
    logs,
  };

  await fs.writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  if (errors.length) {
    return NextResponse.json({ ok: false, error: "BACKUP_FAILED", manifest }, { status: 500 });
  }

  return NextResponse.json({ ok: true, manifest });
}
