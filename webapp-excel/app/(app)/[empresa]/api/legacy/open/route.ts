// app/(app)/[empresa]/api/legacy/open/route.ts
import { spawn } from "child_process";
import { existsSync } from "fs";
import { NextResponse } from "next/server";

function resolveXlsxAbsolutePath(p: string) {
  const root = process.env.LEGACY_ROOT || "./demo-assets/legacy";
  const rel = (p || "").replace(/\//g, "\\").replace(/^\\+/, "");
  const safeRoot = root.endsWith("\\") ? root : root + "\\";
  return safeRoot + rel;
}

function isExcelPath(absPath: string) {
  const lower = absPath.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("p");

  if (!p) return NextResponse.json({ error: "Missing p" }, { status: 400 });

  const abs = resolveXlsxAbsolutePath(p);

  if (!isExcelPath(abs)) {
    return NextResponse.json({ error: "Not an Excel file" }, { status: 400 });
  }

  if (!existsSync(abs)) {
    return NextResponse.json({ error: `File not found: ${abs}` }, { status: 404 });
  }

  // ✅ Método más fiable en Windows: cmd /c start "" "C:\ruta\archivo.xlsx"
  // - detached + stdio ignore para que no “dependa” del proceso de Next
  const child = spawn("cmd.exe", ["/c", "start", '""', abs], {
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });

  child.unref();

  // 204 = OK sin contenido (más limpio que 200)
  return new NextResponse(null, { status: 204 });
}
