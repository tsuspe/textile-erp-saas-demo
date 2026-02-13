// app/(app)/[empresa]/api/legacy/file/route.ts
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
  if (!raw) throw new Error("Ruta requerida");
  if (raw.includes("\0")) throw new Error("Ruta inválida");
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

function contentTypeFromExt(ext: string) {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function safeFilenameAscii(name: string) {
  return name.replace(/["\\]/g, "_");
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { empresa } = await params;

    if (empresa !== "legacy") {
      return NextResponse.json({ error: "Solo disponible en legacy" }, { status: 400 });
    }

    const root = getLegacyRootOrThrow();
    const p = sanitizeRelPath(req.nextUrl.searchParams.get("p") || "");
    const download = req.nextUrl.searchParams.get("download") === "1";
    const raw = req.nextUrl.searchParams.get("raw") === "1";

    const full = ensureInsideRoot(root, path.join(root, p));
    const stat = await fs.stat(full);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "No es un archivo" }, { status: 400 });
    }

    const ext = path.extname(full).toLowerCase();
    const ct = contentTypeFromExt(ext);
    const buf = await fs.readFile(full);
    const filename = path.basename(full);

    const headers = new Headers();
    headers.set("Content-Type", ct);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-store, max-age=0");

    // PDFs: inline por defecto.
    // Excel/otros: attachment por defecto.
    // raw=1 fuerza inline para que el frontend lea arrayBuffer (preview).
    const shouldDownload = download || (!raw && ext !== ".pdf");

    headers.set(
      "Content-Disposition",
      `${shouldDownload ? "attachment" : "inline"}; filename="${safeFilenameAscii(
        filename,
      )}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    return new NextResponse(buf, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error sirviendo archivo" },
      { status: 500 },
    );
  }
}
