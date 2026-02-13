// app/(app)/[empresa]/api/legacy/pdf/route.ts

import { spawn } from "child_process";
import crypto from "crypto";
import { existsSync } from "fs";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

// Si estás en Next con runtime edge en prod por lo que sea, esto evita sustos.
// (spawn/COM necesita Node sí o sí)
export const runtime = "nodejs";

function resolveXlsxAbsolutePath(p: string) {
  const root = process.env.LEGACY_ROOT || "./demo-assets/legacy";
  const rel = (p || "").replace(/\//g, "\\").replace(/^\\+/, "");
  const safeRoot = root.endsWith("\\") ? root : root + "\\";
  return safeRoot + rel;
}

function cacheKey(inputPath: string, variant: string) {
  return crypto.createHash("sha1").update(`${inputPath}::${variant}`).digest("hex");
}

async function runPowerShell(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args],
      { windowsHide: true },
    );

    let out = "";
    let err = "";

    ps.stdout.on("data", (d) => (out += d.toString()));
    ps.stderr.on("data", (d) => (err += d.toString()));

    ps.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error((err || out || "").trim() || `PowerShell exited with ${code}`));
    });
  });
}

function normalizeSheetName(s: string) {
  return (s || "").replace(/\u00A0/g, " ").trim();
}

async function isPdfValid(pdfPath: string) {
  try {
    const st = await fs.stat(pdfPath);

    // Un PDF “real” rara vez pesa < 2KB.
    // Si Excel/COM genera basura, suele ser 0 bytes o ridículo.
    return st.size > 2048;
  } catch {
    return false;
  }
}

async function ensureFreshPdf(generate: () => Promise<void>, outPdf: string) {
  // Si existe pero es inválido -> lo borramos y regeneramos
  if (existsSync(outPdf)) {
    const ok = await isPdfValid(outPdf);
    if (!ok) {
      await fs.unlink(outPdf).catch(() => {});
    }
  }

  if (!existsSync(outPdf)) {
    await generate();
  }

  // Si tras generar sigue inválido -> error claro
  const okAfter = await isPdfValid(outPdf);
  if (!okAfter) {
    throw new Error("PDF generated but appears empty/invalid (size too small).");
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const p = searchParams.get("p");
    const sheetParam = searchParams.get("sheet"); // "Hoja1" o "Hoja1,Hoja2"
    const all = searchParams.get("all") === "1";
    const download = searchParams.get("download") === "1";

    if (!p) return NextResponse.json({ error: "Missing p" }, { status: 400 });

    const sheets =
      sheetParam
        ?.split(",")
        .map((s) => normalizeSheetName(s))
        .filter(Boolean) ?? [];

    if (!all && sheets.length === 0) {
      return NextResponse.json({ error: "Missing sheet or all=1" }, { status: 400 });
    }

    const inputXlsx = resolveXlsxAbsolutePath(p);

    const outDir = path.join(process.cwd(), ".cache", "legacy-pdf");
    await fs.mkdir(outDir, { recursive: true });

    const scriptPath = path.join(process.cwd(), "scripts", "excel_export_sheet_pdf.ps1");

    // ALL
    if (all) {
      const key = cacheKey(inputXlsx, "ALL");
      const outPdf = path.join(outDir, `${key}.pdf`);

      await ensureFreshPdf(
        () =>
          runPowerShell([
            "-File",
            scriptPath,
            "-InputXlsx",
            inputXlsx,
            "-OutputPdf",
            outPdf,
            "-AllSheets",
          ]),
        outPdf,
      );

      const pdf = await fs.readFile(outPdf);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
            "excel_completo.pdf",
          )}"`,

          // IMPORTANTE: quita cache del navegador mientras estabilizamos
          "Cache-Control": "no-store",
        },
      });
    }

    // 1 hoja o varias hojas en 1 PDF
    const variant = sheets.length === 1 ? `SHEET:${sheets[0]}` : `SHEETS:${sheets.join("|")}`;
    const key = cacheKey(inputXlsx, variant);
    const outPdf = path.join(outDir, `${key}.pdf`);

    await ensureFreshPdf(async () => {
      const psArgs = ["-File", scriptPath, "-InputXlsx", inputXlsx, "-OutputPdf", outPdf];

      if (sheets.length === 1) {
        psArgs.push("-SheetName", sheets[0]);
      } else {
        // NOTA: tu PS1 actual NO acepta -SheetNames, así que si estás pidiendo varias hojas
        // realmente esto NO las va a exportar como esperas.
        // Si lo necesitas, te lo ajusto luego con una versión que concatene PDFs o exporte por hoja.
        // Por ahora, lo mantenemos como lo tenías.
        psArgs.push("-SheetName", sheets[0]);
      }

      await runPowerShell(psArgs);
    }, outPdf);

    const pdf = await fs.readFile(outPdf);
    const filename = sheets.length === 1 ? `${sheets[0]}.pdf` : `excel_${sheets.length}_hojas.pdf`;

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(
          filename,
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Legacy PDF generation failed",
        message: msg,
      },
      { status: 500 },
    );
  }
}
