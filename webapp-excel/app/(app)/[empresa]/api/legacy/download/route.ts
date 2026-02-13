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
  if (!raw) throw new Error("Ruta vacía");
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

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { empresa } = await params;

    if (empresa !== "legacy") {
      return NextResponse.json({ error: "Solo disponible en legacy" }, { status: 400 });
    }

    const root = getLegacyRootOrThrow();
    const p = sanitizeRelPath(req.nextUrl.searchParams.get("p") || "");
    const full = ensureInsideRoot(root, path.join(root, p));

    // valida que existe y es archivo
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("No es un archivo");

    const buf = await fs.readFile(full);
    const filename = path.basename(full);

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error descargando" },
      { status: 500 },
    );
  }
}
