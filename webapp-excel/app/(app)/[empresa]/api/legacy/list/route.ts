// app/(app)/[empresa]/api/legacy/list/route.ts
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

type Ctx = { params: Promise<{ empresa: string }> };

function getLegacyRootOrThrow() {
  const root = process.env.LEGACY_ROOT?.trim();
  if (!root) throw new Error("LEGACY_ROOT no configurado");
  return root;
}

function sanitizeRelPath(p: string) {
  const raw = (p || "").replace(/\\/g, "/").trim();
  if (!raw) return "";
  if (raw.includes("..")) throw new Error("Ruta inválida");
  return raw.replace(/^\/+/, "");
}

function ensureInsideRoot(root: string, full: string) {
  const rootResolved = path.resolve(root);
  const fullResolved = path.resolve(full);

  const rel = path.relative(rootResolved, fullResolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Fuera de root");

  return fullResolved;
}

function isOfficeTempFile(name: string) {
  // Excel/Office lock files
  return name.startsWith("~$");
}

function isSupportedLegacyFile(name: string) {
  const lower = name.toLowerCase();
  if (isOfficeTempFile(name)) return false;
  return lower.endsWith(".pdf") || lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { empresa } = await params;

    if (empresa !== "legacy") {
      return NextResponse.json({ error: "Solo disponible en legacy" }, { status: 400 });
    }

    const root = getLegacyRootOrThrow();
    const p = sanitizeRelPath(req.nextUrl.searchParams.get("p") || "");
    const target = ensureInsideRoot(root, path.join(root, p));

    const dirents = await fs.readdir(target, { withFileTypes: true });

    const entries = await Promise.all(
      dirents
        .filter((d) => !d.name.startsWith(".")) // oculta dotfiles
        .filter((d) => {
          // Carpetas siempre
          if (d.isDirectory()) return true;

          // Archivos: solo permitimos los “abribles”
          if (!d.isFile()) return false;
          return isSupportedLegacyFile(d.name);
        })
        .map(async (d) => {
          const full = path.join(target, d.name);
          const stat = await fs.stat(full);
          const ext = d.isFile() ? path.extname(d.name).toLowerCase() : "";
          return {
            name: d.name,
            type: d.isDirectory() ? "dir" : "file",
            ext,
            size: stat.size,
            mtime: stat.mtime,
          };
        }),
    );

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });

    return NextResponse.json({ cwd: p, entries });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error listando" }, { status: 500 });
  }
}
