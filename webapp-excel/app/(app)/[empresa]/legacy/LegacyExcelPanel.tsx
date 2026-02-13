"use client";

import LegacySheetPicker from "@/app/components/LegacySheetPicker";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ExcelPreview from "./ExcelPreview";

type Props = {
  empresa: string;
  cwd: string;
  filePath: string;
  initialSheet?: string;
};

function sanitizePath(input?: string) {
  return (input || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

export default function LegacyExcelPanel({
  empresa,
  cwd,
  filePath,
  initialSheet,
}: Props) {
  const sp = useSearchParams();

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const safeCwd = useMemo(() => sanitizePath(cwd), [cwd]);
  const safeFile = useMemo(() => sanitizePath(filePath), [filePath]);

  const urlSheet = sp.get("sheet") || "";
  const t = sp.get("t") || "";

  const [activeSheet, setActiveSheet] = useState<string>(
    urlSheet || initialSheet || "",
  );

  useEffect(() => {
    if (urlSheet && urlSheet !== activeSheet) setActiveSheet(urlSheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSheet]);

  useEffect(() => {
    if (!sheetNames.length) return;
    if (activeSheet && sheetNames.includes(activeSheet)) return;
    setActiveSheet(sheetNames[0]);
  }, [sheetNames, activeSheet]);

  async function handleOpenExcel() {
    try {
      setOpening(true);
      setOpenErr(null);

      const res = await fetch(
        `/${empresa}/api/legacy/open?p=${encodeURIComponent(safeFile)}`,
        { method: "POST" },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          txt ||
            "No se pudo abrir el archivo en Excel en el servidor",
        );
      }
    } catch (e: any) {
      setOpenErr(
        e?.message ||
          "Error abriendo el archivo en Excel en el servidor",
      );
    } finally {
      setOpening(false);
    }
  }

  const downloadHref = `/${empresa}/api/legacy/download?p=${encodeURIComponent(
    safeFile,
  )}`;

  return (
    <div className="space-y-3">
      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpenExcel}
          disabled={opening}
          className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 disabled:opacity-60"
          title="Abre el archivo en Excel en el PC servidor (no en tu ordenador)"
        >
          {opening ? "Abriendo en servidor…" : "Abrir en Excel (servidor)"}
        </button>

        <a
          href={downloadHref}
          className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
          title="Descarga el archivo para abrirlo en tu propio ordenador"
        >
          Descargar .xlsx (este PC)
        </a>

        <LegacySheetPicker
          empresa={empresa}
          filePath={safeFile}
          sheetNames={sheetNames}
          cwd={safeCwd || undefined}
          t={t || undefined}
          initialSheet={activeSheet || undefined}
          className="ml-auto"
        />
      </div>

      {/* Ayuda contextual */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/30 px-3 py-2 text-[11px] text-slate-400">
        <strong className="text-slate-300">Nota:</strong>{" "}
        “Abrir en Excel (servidor)” abre el archivo en el ordenador donde
        está corriendo la aplicación.  
        Para trabajar en tu equipo, usa{" "}
        <strong className="text-slate-300">Descargar .xlsx</strong>.
      </div>

      {openErr && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs font-semibold text-red-300">
            No se pudo abrir el archivo
          </p>
          <p className="mt-1 text-xs text-slate-300">{openErr}</p>
        </div>
      )}

      {/* Preview */}
      <ExcelPreview
        empresa={empresa}
        filePath={safeFile}
        initialSheet={activeSheet}
        onSheetsLoaded={(names) => setSheetNames(names)}
      />
    </div>
  );
}
