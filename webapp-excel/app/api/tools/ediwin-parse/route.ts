export const dynamic = "force-dynamic";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";
import { NextResponse } from "next/server";

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const isDemo = process.env.DEMO_MODE === "true";

function getPythonBin() {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

function getStagingBaseDir() {
  return process.env.EDIWIN_STAGING_DIR || os.tmpdir();
}

function getOutputBaseDir(tipo: "EUROFIEL" | "ECI") {
  if (tipo === "EUROFIEL") {
    return process.env.EDIWIN_OUT_EUROFIEL_DIR || "./data/ediwin/out/eurofiel";
  }
  return process.env.EDIWIN_OUT_ECI_DIR || "./data/ediwin/out/eci";
}

function getCliPath() {
  return path.join(process.cwd(), "app", "(app)", "tools", "almacen", "ediwin-parse", "cli.py");
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function rmrf(p: string) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

async function writeUploadedFile(workDir: string, key: string, file: File) {
  const ext = path.extname(file.name) || "";
  const outPath = path.join(workDir, `${key}${ext}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return outPath;
}

export async function POST(req: Request) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });
  if (!userHasAnyGroup(user.groups, ["ALMACEN", "ADMIN"])) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const op = (url.searchParams.get("op") || "preview").toLowerCase(); // preview|export|folders|split-txt
  const format = (url.searchParams.get("format") || "").toLowerCase(); // csv|xlsx
  const demoMode = (process.env.DEMO_MODE ?? "false").toLowerCase() === "true";

  const form = await req.formData();
  const tipoRaw = String(form.get("tipo") || "").toUpperCase();
  const tipo = (tipoRaw === "ECI" ? "ECI" : "EUROFIEL") as "EUROFIEL" | "ECI";

  const pdf = form.get("file");
  if (!(pdf instanceof File)) {
    return NextResponse.json({ ok: false, error: "MISSING_PDF" }, { status: 400 });
  }

  // TXT opcionales
  const cabped = form.get("cabped");
  const linped = form.get("linped");
  const locped = form.get("locped");
  const obsped = form.get("obsped");
  const obslped = form.get("obslped");

  // flags
  const recortarModelo =
    url.searchParams.get("recortarModelo") === "0" ? false : true; // default true
  const sageMaxLenRaw = url.searchParams.get("sageMaxLen");
  const sageMaxLen = Number.isFinite(Number(sageMaxLenRaw)) ? String(Math.max(0, Math.min(50, Number(sageMaxLenRaw)))) : "20";

  const base = getStagingBaseDir();
  const workDir = path.join(base, "ediwin", randomUUID());
  await ensureDir(workDir);

  const inputPath = await writeUploadedFile(workDir, "input", pdf);

  // guardamos TXTs si vienen
  const txtPaths: Record<string, string> = {};
  if (cabped instanceof File) txtPaths.cabped = await writeUploadedFile(workDir, "cabped", cabped);
  if (linped instanceof File) txtPaths.linped = await writeUploadedFile(workDir, "linped", linped);
  if (locped instanceof File) txtPaths.locped = await writeUploadedFile(workDir, "locped", locped);
  if (obsped instanceof File) txtPaths.obsped = await writeUploadedFile(workDir, "obsped", obsped);
  if (obslped instanceof File) txtPaths.obslped = await writeUploadedFile(workDir, "obslped", obslped);

  const python = getPythonBin();
  const cliPath = getCliPath();

  try {
    if (demoMode) {
      if (op === "preview") {
        await rmrf(workDir);
        return NextResponse.json({
          ok: true,
          tipo,
          mode: "demo-mock",
          rows: [
            {
              MODELO: "DMO-BL-1001",
              COLOR: "AZUL NOCHE",
              TALLA: "M",
              CANTIDAD: 12,
              CLIENTE: "ACME Textiles",
            },
            {
              MODELO: "DMO-CH-2002",
              COLOR: "GRIS PERLA",
              TALLA: "40",
              CANTIDAD: 9,
              CLIENTE: "Cliente Demo Norte",
            },
          ],
        });
      }

      if (op === "export") {
        const content =
          format === "csv"
            ? "MODELO;COLOR;TALLA;CANTIDAD\nDMO-BL-1001;AZUL NOCHE;M;12\nDMO-CH-2002;GRIS PERLA;40;9\n"
            : "Demo mode: export generated without external integration.";
        const buf = Buffer.from(content, "utf8");
        await rmrf(workDir);
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type":
              format === "csv"
                ? "text/csv; charset=utf-8"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="ediwin_demo.${format === "csv" ? "csv" : "xlsx"}"`,
          },
        });
      }

      if (op === "folders" || op === "split-txt") {
        await rmrf(workDir);
        return NextResponse.json({
          ok: true,
          mode: "demo-mock",
          message: "Operacion simulada en DEMO_MODE.",
          outputDir: getOutputBaseDir(tipo),
        });
      }
    }

    if (op === "preview") {
      const args = [cliPath, "--op", "preview", "--tipo", tipo, "--input", inputPath, "--limit", "250"];
      const r = await run(python, args, workDir);

      if (r.code !== 0) {
        return NextResponse.json(
          { ok: false, error: "PYTHON_FAILED", detail: r.stderr || r.stdout },
          { status: 500 }
        );
      }

      const j = JSON.parse(r.stdout.trim() || "{}");
      return NextResponse.json(j);
    }

    if (op === "export") {
      if (format !== "csv" && format !== "xlsx") {
        return NextResponse.json({ ok: false, error: "BAD_FORMAT" }, { status: 400 });
      }

      const outFile = path.join(workDir, `export.${format}`);
      const args = [
        cliPath,
        "--op",
        "export",
        "--tipo",
        tipo,
        "--input",
        inputPath,
        "--format",
        format,
        "--out",
        outFile,
        "--sage-model-maxlen",
        String(sageMaxLen),
      ];

      const r = await run(python, args, workDir);
      if (r.code !== 0) {
        return NextResponse.json(
          { ok: false, error: "PYTHON_FAILED", detail: r.stderr || r.stdout },
          { status: 500 }
        );
      }

      const buf = await fs.readFile(outFile);
      await rmrf(workDir);

      const filename =
        format === "csv"
          ? `${tipo.toLowerCase()}_resumen_pedidos.csv`
          : `${tipo.toLowerCase()}_resumen_pedidos.xlsx`;

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (op === "folders") {
      const outBase = getOutputBaseDir(tipo);
      if (!outBase) {
        return NextResponse.json({ ok: false, error: "NO_OUTPUT_DIR" }, { status: 500 });
      }

      const args = [cliPath, "--op", "folders", "--tipo", tipo, "--input", inputPath, "--base-dir", outBase];

      const r = await run(python, args, workDir);
      if (r.code !== 0) {
        return NextResponse.json(
          { ok: false, error: "PYTHON_FAILED", detail: r.stderr || r.stdout },
          { status: 500 }
        );
      }

      const j = JSON.parse(r.stdout.trim() || "{}");
      await rmrf(workDir);
      return NextResponse.json(j);
    }

    if (op === "split-txt") {
      const outBase = getOutputBaseDir(tipo);
      if (!outBase) {
        return NextResponse.json({ ok: false, error: "NO_OUTPUT_DIR" }, { status: 500 });
      }

      // si quiere TXT => linped obligatorio
      if (!(txtPaths.linped && (linped instanceof File))) {
        await rmrf(workDir);
        return NextResponse.json({ ok: false, error: "LINPED_REQUIRED" }, { status: 400 });
      }

      const args = [
        cliPath,
        "--op",
        "split-txt",
        "--tipo",
        tipo,
        "--input",
        inputPath,
        "--base-dir",
        outBase,
        "--sage-model-maxlen",
        String(sageMaxLen),
        recortarModelo ? "--recortar-modelo-sage" : "--no-recortar-modelo-sage",
      ];

      if (txtPaths.cabped) args.push("--cabped", txtPaths.cabped);
      if (txtPaths.linped) args.push("--linped", txtPaths.linped);
      if (txtPaths.locped) args.push("--locped", txtPaths.locped);
      if (txtPaths.obsped) args.push("--obsped", txtPaths.obsped);
      if (txtPaths.obslped) args.push("--obslped", txtPaths.obslped);

      const r = await run(python, args, workDir);
      if (r.code !== 0) {
        return NextResponse.json(
          { ok: false, error: "PYTHON_FAILED", detail: r.stderr || r.stdout },
          { status: 500 }
        );
      }

      const j = JSON.parse(r.stdout.trim() || "{}");
      await rmrf(workDir);
      return NextResponse.json(j);
    }

    await rmrf(workDir);
    return NextResponse.json({ ok: false, error: "BAD_OP" }, { status: 400 });
  } catch (e: any) {
    await rmrf(workDir);
    return NextResponse.json({ ok: false, error: "SERVER_FAILED", detail: String(e?.message || e) }, { status: 500 });
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

  return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
}
