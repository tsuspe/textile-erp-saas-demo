// app/api/tools/globalia-stock/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

// AJUSTA ESTO si tu auth está en otro sitio:
import { getAppSession } from "@/lib/auth-server";

const isDemo = process.env.DEMO_MODE === "true";

// Si tienes helpers de permisos, enchúfalos aquí.
// Por ahora: si hay sesión, dejamos pasar.
// (Tú luego puedes restringirlo a grupo ALMACEN/ADMIN.)
async function requireSession() {
  const session = await getAppSession();
  if (!session?.user) return null;
  return session;
}

type CliResultOk = { ok: true; [k: string]: any };
type CliResultErr = { ok: false; error: string; detail?: string };
type CliResult = CliResultOk | CliResultErr;

function isExportOp(op: string) {
  return op === "export_csv_pack" || op === "export_excel_pack" || op === "export_stock_negativo";
}

function isImportOp(op: string) {
  return op === "import_albaranes" || op === "import_pedidos";
}

function safeStr(v: unknown) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function parseCliJson(stdout: string): CliResult | null {
  const s = (stdout || "").trim();
  if (!s) return null;

  // Caso normal: stdout es SOLO JSON
  try {
    return JSON.parse(s);
  } catch {
    // sigue
  }

  // Caso típico: logs + JSON al final (última línea JSON)
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Intento 1: última línea que parezca JSON
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!(l.startsWith("{") && l.endsWith("}"))) continue;
    try {
      return JSON.parse(l);
    } catch {
      // sigue
    }
  }

  // Intento 2: desde el último "{" hasta el final
  const lastBrace = s.lastIndexOf("{");
  if (lastBrace >= 0) {
    const tail = s.slice(lastBrace).trim();
    try {
      return JSON.parse(tail);
    } catch {
      // nada
    }
  }

  return null;
}

async function readJsonSafe(filePath: string, fallback: any) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveDemoJsonPath(filename: string) {
  const candidates = [
    path.join(process.cwd(), "public", "demo", filename),
    path.join(process.cwd(), "data", "demo", filename),
    path.join(process.cwd(), "..", "data", "demo", filename),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  // Fallback predecible para logs/diagnóstico aunque no exista.
  return candidates[0];
}

async function buildDemoMock(op: string, payload: Record<string, any>) {
  const invPath =
    payload.inv || process.env.GLOBALIA_INV_PATH || (await resolveDemoJsonPath("datos_almacen.json"));
  const prevPath = payload.prev || process.env.GLOBALIA_PREV_PATH || (await resolveDemoJsonPath("prevision.json"));
  const clientesPath =
    payload.clientes || process.env.GLOBALIA_CLIENTES_PATH || (await resolveDemoJsonPath("clientes.json"));
  const talleresPath =
    payload.talleres || process.env.GLOBALIA_TALLERES_PATH || (await resolveDemoJsonPath("talleres.json"));

  const inv = await readJsonSafe(String(invPath), {});
  const prev = await readJsonSafe(String(prevPath), {});
  const clientes = await readJsonSafe(String(clientesPath), {});
  const talleres = await readJsonSafe(String(talleresPath), {});

  const stockRows = Object.entries((inv as any).almacen || {}).flatMap(([modelo, tallas]) =>
    Object.entries(tallas as Record<string, number>).map(([talla, cantidad]) => ({
      MODELO: modelo,
      TALLA: talla,
      STOCK: cantidad,
    })),
  );
  const pedidosRows = Array.isArray((prev as any).pedidos)
    ? (prev as any).pedidos.map((p: any, i: number) => ({
        IDX: i + 1,
        MODELO: p?.modelo ?? "",
        TALLA: p?.talla ?? "",
        CANTIDAD: Number(p?.cantidad ?? 0),
        PEDIDO: p?.pedido ?? "",
        NUMERO_PEDIDO: p?.numero_pedido ?? "",
        CLIENTE: p?.cliente ?? "",
        FECHA: p?.fecha ?? "",
      }))
    : [];
  const fabricationRows = Object.entries((prev as any).pedidos_fabricacion || {}).flatMap(
    ([modelo, items]) =>
      (Array.isArray(items) ? items : []).map((x: any, idx: number) => ({
        IDX: `${modelo}-${idx + 1}`,
        MODELO: modelo,
        TALLA: x?.talla ?? "",
        CANTIDAD: Number(x?.cantidad ?? 0),
        FECHA: x?.fecha ?? "",
      })),
  );
  const estimatedRows = stockRows.map((r: any, idx: number) => {
    const pendingQty = pedidosRows
      .filter((p: any) => p.MODELO === r.MODELO && p.TALLA === r.TALLA)
      .reduce((acc: number, p: any) => acc + Number(p.CANTIDAD || 0), 0);
    const fabQty = fabricationRows
      .filter((f: any) => f.MODELO === r.MODELO && f.TALLA === r.TALLA)
      .reduce((acc: number, f: any) => acc + Number(f.CANTIDAD || 0), 0);
    return {
      IDX: idx + 1,
      MODELO: r.MODELO,
      TALLA: r.TALLA,
      STOCK: Number(r.STOCK || 0),
      PENDIENTE: pendingQty,
      FABRICACION: fabQty,
      STOCK_ESTIMADO: Number(r.STOCK || 0) + fabQty - pendingQty,
    };
  });

  if (op === "status") {
    const numModelos = Object.keys((inv as any).almacen || {}).length;
    return {
      ok: true,
      mode: "demo-mock",
      paths: {
        inv: String(invPath),
        prev: String(prevPath),
        talleres: String(talleresPath),
        clientes: String(clientesPath),
      },
      exists: {
        inv: await fileExists(String(invPath)),
        prev: await fileExists(String(prevPath)),
        talleres: await fileExists(String(talleresPath)),
        clientes: await fileExists(String(clientesPath)),
      },
      num_modelos: numModelos,
    };
  }

  if (op.startsWith("preview")) {
    if (op === "preview_stock") {
      return { ok: true, mode: "demo-mock", columns: ["MODELO", "TALLA", "STOCK"], rows: stockRows.slice(0, 200) };
    }
    if (op === "preview_estimada" || op === "preview_pendiente" || op === "preview_fabricacion") {
      const rows =
        op === "preview_estimada"
          ? estimatedRows
          : op === "preview_fabricacion"
          ? fabricationRows
          : pedidosRows;
      return {
        ok: true,
        mode: "demo-mock",
        columns: rows.length ? Object.keys(rows[0]) : [],
        rows: rows.slice(0, 200),
      };
    }
  }

  if (op === "calc_estimated") {
    return {
      ok: true,
      mode: "demo-mock",
      columns: [
        "IDX",
        "MODELO",
        "TALLA",
        "STOCK",
        "PENDIENTE",
        "FABRICACION",
        "STOCK_ESTIMADO",
      ],
      rows: estimatedRows.slice(0, 300),
    };
  }

  if (op === "list_pendings") {
    return {
      ok: true,
      mode: "demo-mock",
      columns: ["IDX", "MODELO", "TALLA", "CANTIDAD", "PEDIDO", "NUMERO_PEDIDO", "CLIENTE", "FECHA"],
      rows: pedidosRows.slice(0, 300),
    };
  }

  if (op === "list_fabrication") {
    return {
      ok: true,
      mode: "demo-mock",
      columns: ["IDX", "MODELO", "TALLA", "CANTIDAD", "FECHA"],
      rows: fabricationRows.slice(0, 300),
    };
  }

  if (op === "audit_preview") {
    const rows = estimatedRows
      .map((r: any, i: number) => {
        const expected = Number(r.STOCK_ESTIMADO || 0);
        const actual = Number(r.STOCK || 0);
        return {
          IDX: i + 1,
          modelo: r.MODELO,
          talla: r.TALLA,
          esperado: expected,
          actual,
          delta: expected - actual,
        };
      })
      .filter((r: any) => r.delta !== 0);

    return {
      ok: true,
      mode: "demo-mock",
      columns: ["IDX", "modelo", "talla", "esperado", "actual", "delta"],
      rows: rows.slice(0, 300),
    };
  }

  if (op === "catalogo") {
    const modelos = Object.entries((inv as any).info_modelos || {}).map(([modelo, v]: any) => ({
      modelo,
      descripcion: v?.descripcion || "",
      color: v?.color || "",
      cliente: v?.cliente || "",
    }));
    return {
      ok: true,
      mode: "demo-mock",
      modelos,
      talleres: Object.keys(talleres || {}),
      clientes: Object.keys(clientes || {}),
    };
  }

  return {
    ok: true,
    mode: "demo-mock",
    op,
    message: "Operacion simulada en DEMO_MODE.",
  };
}


async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function saveUploadedFileToDisk(file: File, fullPath: string) {
  await ensureDir(path.dirname(fullPath));

  // Node 18+ File has arrayBuffer()
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buf);
}

async function runPythonCli(opts: {
  op: string;
  args: Record<string, any>;
  uploadExcelPath?: string;
  outZipPath?: string;
  env?: Record<string, string>;
}) {
  const { op, args, uploadExcelPath, outZipPath, env } = opts;

  // Ruta al CLI (ajústala si cambiaste la ubicación)
  const cliPath = path.join(process.cwd(), "app", "(app)", "tools", "almacen", "globalia-stock", "cli.py");

  const pyBin = process.env.GLOBALIA_PYTHON_BIN || process.env.PYTHON_BIN || "python3";

  const cliArgs: string[] = [
    cliPath,
    "--op",
    op,
  ];

  // Mapeo estándar de flags
  const mapping: Array<[string, string]> = [
    ["inv", "--inv"],
    ["prev", "--prev"],
    ["talleres", "--talleres"],
    ["clientes", "--clientes"],
    ["exportDir", "--export-dir"],
    ["backupDir", "--backup-dir"],

    ["modelo", "--modelo"],
    ["talla", "--talla"],
    ["cantidad", "--cantidad"],
    ["fecha", "--fecha"],
    ["cliente", "--cliente"],
    ["taller", "--taller"],
    ["pedido", "--pedido"],
    ["albaran", "--albaran"],
    ["proveedor", "--proveedor"],
    ["obs", "--obs"],

    ["idx", "--idx"],
    ["numeroPedido", "--numero-pedido"],
    ["payloadJson", "--payload-json"],

    ["onlyZero", "--only-zero"],

    ["excelPath", "--excel-path"],
    ["modo", "--modo"],
    ["simular", "--simular"],
    ["skip", "--skip"],

    ["name", "--name"],

    ["descripcion", "--descripcion"],
    ["color", "--color"],
    ["nombre", "--nombre"],
    ["contacto", "--contacto"],
  ];

  for (const [k, flag] of mapping) {
    const v = args[k];
    if (v === undefined || v === null || v === "") continue;
    cliArgs.push(flag, safeStr(v));
  }

  // Upload de Excel (multipart) tiene prioridad sobre excelPath si es import op
  if (uploadExcelPath) {
    cliArgs.push("--excel-path", uploadExcelPath);
  }

  // Exports -> out zip
  if (outZipPath) {
    cliArgs.push("--out", outZipPath);
  }

  // Ejecutamos
  const child = spawn(pyBin, cliArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      ...env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      // Por si quieres enrutar paths por env en vez de flags
      // GLOBALIA_INV_PATH: "...",
      // GLOBALIA_PREV_PATH: "...",
      // GLOBALIA_TALLERES_PATH: "...",
      // GLOBALIA_CLIENTES_PATH: "...",
    },
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));

  const code: number = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  // Intentamos parsear JSON de stdout
  const parsed = parseCliJson(stdout);


  return { code, stdout, stderr, parsed };
}

async function buildTempWorkspace() {
  const base = process.env.GLOBALIA_TMP_DIR || "/tmp";
  const dir = path.join(base, `globalia-stock-${Date.now()}-${randomUUID()}`);
  await ensureDir(dir);
  return dir;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Detectamos content-type
  const ct = req.headers.get("content-type") || "";
  const isMultipart = ct.includes("multipart/form-data");

  const tempDir = await buildTempWorkspace();
  const demoMode = (process.env.DEMO_MODE ?? "false").toLowerCase() === "true";

  try {
    let op = "";
    let payload: Record<string, any> = {};
    let uploadExcelPath: string | undefined;

    if (isMultipart) {
      const form = await req.formData();
      op = safeStr(form.get("op"));
      const rawPayload = form.get("payload");

      if (rawPayload) {
        try {
          payload = JSON.parse(safeStr(rawPayload));
        } catch {
          payload = {};
        }
      }

      // Archivo excel
      const file = form.get("file");
      if (file && file instanceof File) {
        const ext = (file.name || "").toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".xlsx";
        uploadExcelPath = path.join(tempDir, `upload${ext}`);
        await saveUploadedFileToDisk(file, uploadExcelPath);
      }
    } else {
      const body = await req.json().catch(() => null);
      op = safeStr(body?.op);
      payload = (body?.payload && typeof body.payload === "object") ? body.payload : {};
    }

    if (!op) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST", detail: "Falta op" }, { status: 400 });
    }

    const args = payload || {};

    if (demoMode) {
      // Export ops: devuelve un archivo zip demo para mantener el flujo funcional.
      if (isExportOp(op)) {
        const zipPath = path.join(tempDir, `demo_export_${Date.now()}.zip`);
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file(
          "README.txt",
          "Archivo generado en DEMO_MODE. No contiene datos reales ni integraciones externas.",
        );
        zip.file("op.json", JSON.stringify({ op, payload: args }, null, 2));
        const content = await zip.generateAsync({ type: "nodebuffer" });
        await fs.writeFile(zipPath, content);
        const zipBuf = await fs.readFile(zipPath);
        return new NextResponse(zipBuf, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${path.basename(zipPath)}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      const mock = await buildDemoMock(op, args);
      return NextResponse.json({ ...mock, stdout: "", stderr: "", exit: 0 }, { status: 200 });
    }

    // Export ops -> generamos ZIP
    let outZipPath: string | undefined;
    if (isExportOp(op)) {
      outZipPath = path.join(tempDir, `export_${op}_${Date.now()}.zip`);
    }

    // Ejecutar CLI
    const { code, parsed, stdout, stderr } = await runPythonCli({
      op,
      args,
      uploadExcelPath: isImportOp(op) ? uploadExcelPath : undefined,
      outZipPath,
    });

    // Si era export y salió OK, devolvemos ZIP como download
    if (outZipPath) {
      if (!parsed || parsed.ok !== true || code !== 0) {
        return NextResponse.json(
          {
            ok: false,
            error: parsed && "error" in parsed ? parsed.error : "PY_EXPORT_FAILED",
            detail: parsed && "detail" in parsed ? parsed.detail : stderr || stdout || `exit=${code}`,
            stdout,
            stderr,
          },
          { status: 500 }
        );
      }

      const zipBuf = await fs.readFile(outZipPath);
      return new NextResponse(zipBuf, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${path.basename(outZipPath)}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Respuesta normal JSON
    if (!parsed) {
      const tail = (stdout || "").split(/\r?\n/).slice(-80).join("\n"); // últimas 80 líneas
      return NextResponse.json(
        {
          ok: false,
          error: "PY_BAD_OUTPUT",
          detail: "El CLI no devolvió JSON válido",
          stdout_tail: tail,
          stderr,
          exit: code,
        },
        { status: 500 }
      );
    }


    // Propagamos status según ok
    if (parsed.ok !== true) {
      return NextResponse.json(
        { ...parsed, stdout, stderr, exit: code },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ...parsed, stdout, stderr, exit: code },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "EXCEPTION", detail: e?.message || String(e) },
      { status: 500 }
    );
  } finally {
    // Limpieza best-effort
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export async function GET() {
  if (isDemo) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Demo mock: endpoint accesible sin auth en DEMO_MODE",
      sample: {
        items: 3,
        warnings: 0,
      },
    });
  }

  // Simple ping/status
  const session = await requireSession();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    message: "globalia-stock route online",
    pythonBin: process.env.GLOBALIA_PYTHON_BIN || process.env.PYTHON_BIN || "python3",
  });
}
