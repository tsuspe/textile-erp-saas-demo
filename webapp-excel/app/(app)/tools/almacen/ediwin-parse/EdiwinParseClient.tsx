"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tipo = "EUROFIEL" | "ECI";

type PreviewJson = {
  ok: true;
  columns: string[];
  rows: Array<Record<string, any>>;
  resumen?: Array<Record<string, any>>;
};
type SortDir = "asc" | "desc";


function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

/** descarga un blob como archivo */
async function downloadFromResponse(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Dado un array de .txt, intenta asignarlos a sus slots por nombre de archivo.
 * Acepta nombres tipo CABPED.TXT, linped.txt, etc.
 */
function mapTxtFiles(files: File[]) {
  const out: {
    cabped: File | null;
    linped: File | null;
    locped: File | null;
    obsped: File | null;
    obslped: File | null;
  } = {
    cabped: null,
    linped: null,
    locped: null,
    obsped: null,
    obslped: null,
  };

  for (const f of files) {
    const name = (f.name || "").toUpperCase();
    if (name.includes("CABPED")) out.cabped = f;
    else if (name.includes("LINPED")) out.linped = f;
    else if (name.includes("LOCPED")) out.locped = f;
    else if (name.includes("OBSLPED")) out.obslped = f; // ojo: primero OBSLPED
    else if (name.includes("OBSPED")) out.obsped = f;
  }

  return out;
}

export default function EdiwinParseClient() {
  const [tipo, setTipo] = useState<Tipo>("EUROFIEL");
  const [pdf, setPdf] = useState<File | null>(null);

  // TXT opcionales
  const [cabped, setCabped] = useState<File | null>(null);
  const [linped, setLinped] = useState<File | null>(null);
  const [locped, setLocped] = useState<File | null>(null);
  const [obsped, setObsped] = useState<File | null>(null);
  const [obslped, setObslped] = useState<File | null>(null);

  const [showTxt, setShowTxt] = useState(false);

  // Sage recorte (para split txt)
  const [recortarModelo, setRecortarModelo] = useState(true);
  const [sageMaxLen, setSageMaxLen] = useState<number>(20);

  // Preview
  const [preview, setPreview] = useState<PreviewJson | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Paso 2
  const [loadingExport, setLoadingExport] = useState<"csv" | "xlsx" | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [foldersOk, setFoldersOk] = useState(false); // “carpetas por modelo generadas”

  // Paso 3
  const [loadingSplit, setLoadingSplit] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
// ---- SORT (ordenar por columnas) ----
const [sortKey, setSortKey] = useState<string | null>(null);
const [sortDir, setSortDir] = useState<SortDir>("asc");
const sortKeyRef = useRef<string | null>(null);

useEffect(() => {
  sortKeyRef.current = sortKey;
}, [sortKey]);

function toggleSort(key: string) {
  // 1) primero decide el nuevo dir según la key anterior REAL
  setSortDir((prevDir) => {
    const sameKey = sortKeyRef.current === key;
    return sameKey ? (prevDir === "asc" ? "desc" : "asc") : "asc";
  });

  // 2) luego fija la key
  setSortKey(key);
}


  function isNumericLike(v: any) {
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return false;
      return !Number.isNaN(Number(s.replace(",", ".")));
    }
    return false;
  }

  function toNumberSafe(v: any) {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v.replace(",", "."));
    return NaN;
  }


    const PREVIEW_PALETTE = [
    "rgba(253, 226, 228, 0.10)",
    "rgba(190, 225, 230, 0.10)",
    "rgba(226, 240, 203, 0.10)",
    "rgba(255, 223, 186, 0.10)",
    "rgba(208, 189, 244, 0.10)",
    "rgba(199, 249, 204, 0.10)",
    "rgba(255, 204, 213, 0.10)",
    "rgba(241, 240, 255, 0.10)",
    "rgba(229, 244, 227, 0.10)",
    "rgba(255, 229, 180, 0.10)",
    "rgba(224, 187, 255, 0.10)",
    "rgba(202, 255, 191, 0.10)",
  ];

  const modelColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const rows = preview?.rows ?? [];
    let i = 0;

    for (const r of rows) {
      const m = String((r as any).MODELO ?? "").trim();
      if (!m || m.toUpperCase() === "TOTAL") continue;
      if (!map.has(m)) {
        map.set(m, PREVIEW_PALETTE[i % PREVIEW_PALETTE.length]);
        i++;
      }
    }
    return map;
  }, [preview?.rows]);

    const sortedRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (!sortKey) return rows;

    const dir = sortDir === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];

      // vacíos al final
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      const aIsNum = isNumericLike(av);
      const bIsNum = isNumericLike(bv);

      if (aIsNum && bIsNum) {
        const na = toNumberSafe(av);
        const nb = toNumberSafe(bv);
        if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
        if (Number.isNaN(na)) return 1;
        if (Number.isNaN(nb)) return -1;
        return (na - nb) * dir;
      }

      return (
        String(av).localeCompare(String(bv), "es", {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });
  }, [preview?.rows, sortKey, sortDir]);

  const sortedResumen = useMemo(() => {
    const res = preview?.resumen ?? [];
    if (!sortKey) return res;
    if (res.length === 0) return res;
    if (!(sortKey in (res[0] as any))) return res; // <- evita ordenar por columnas que no existen

 
    // Mantener TOTAL al final si existe
    const totalRow = res.find(
      (r) => String((r as any).MODELO ?? "").trim().toUpperCase() === "TOTAL"
    );
    const base = res.filter(
      (r) => String((r as any).MODELO ?? "").trim().toUpperCase() !== "TOTAL"
    );

    const dir = sortDir === "asc" ? 1 : -1;

    const sorted = [...base].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];

      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      const aIsNum = isNumericLike(av);
      const bIsNum = isNumericLike(bv);

      if (aIsNum && bIsNum) return (toNumberSafe(av) - toNumberSafe(bv)) * dir;

      return (
        String(av).localeCompare(String(bv), "es", {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });

    return totalRow ? [...sorted, totalRow] : sorted;
  }, [preview?.resumen, sortKey, sortDir]);



  // refs para resetear inputs
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const txtMultiRef = useRef<HTMLInputElement | null>(null);

  const wantsAnyTxt = useMemo(
    () => Boolean(cabped || linped || locped || obsped || obslped),
    [cabped, linped, locped, obsped, obslped]
  );

  const wantsTxtButMissingLinped = useMemo(() => {
    return Boolean((cabped || locped || obsped || obslped) && !linped);
  }, [cabped, locped, obsped, obslped, linped]);

  const pickedTxtNames = useMemo(() => {
    const list: Array<[string, File | null]> = [
      ["CABPED", cabped],
      ["LINPED", linped],
      ["LOCPED", locped],
      ["OBSPED", obsped],
      ["OBSLPED", obslped],
    ];
    return list.filter(([, f]) => Boolean(f)) as Array<[string, File]>;
  }, [cabped, linped, locped, obsped, obslped]);

  function resetAll() {
    setPdf(null);

    setCabped(null);
    setLinped(null);
    setLocped(null);
    setObsped(null);
    setObslped(null);

    setPreview(null);
    setFoldersOk(false);

    setErr(null);
    setOkMsg(null);

    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (txtMultiRef.current) txtMultiRef.current.value = "";
  }

  function clearTxts() {
    setCabped(null);
    setLinped(null);
    setLocped(null);
    setObsped(null);
    setObslped(null);
    if (txtMultiRef.current) txtMultiRef.current.value = "";
  }

  function handlePdfPicked(f: File | null) {
    setPdf(f);
    setErr(null);
    setOkMsg(null);
    setPreview(null);
    setFoldersOk(false);
    setSortKey(null);
    setSortDir("asc");
 // si cambias PDF, hay que regenerar carpetas si quieres el paso 3
  }

  function handleTxtMultiPicked(fileList: FileList | null) {
    setErr(null);
    setOkMsg(null);

    const files = fileList ? Array.from(fileList) : [];
    const txts = files.filter((f) => (f.name || "").toLowerCase().endsWith(".txt"));
    const mapped = mapTxtFiles(txts);

    if (mapped.cabped) setCabped(mapped.cabped);
    if (mapped.linped) setLinped(mapped.linped);
    if (mapped.locped) setLocped(mapped.locped);
    if (mapped.obsped) setObsped(mapped.obsped);
    if (mapped.obslped) setObslped(mapped.obslped);

    const unknown = txts.filter((f) => {
      const n = (f.name || "").toUpperCase();
      return (
        !n.includes("CABPED") &&
        !n.includes("LINPED") &&
        !n.includes("LOCPED") &&
        !n.includes("OBSPED") &&
        !n.includes("OBSLPED")
      );
    });

    if (unknown.length > 0) {
      setErr(
        `He detectado TXT con nombres raros y NO los he asignado: ${unknown
          .map((u) => u.name)
          .join(", ")}`
      );
    }
  }

  // --------- PASO 1: PREVIEW AUTOMÁTICO ----------
  useEffect(() => {
    let cancelled = false;

    async function runPreview() {
      if (!pdf) return;
      setLoadingPreview(true);
      setErr(null);
      setOkMsg(null);

      try {
        const fd = new FormData();
        fd.append("tipo", tipo);
        fd.append("file", pdf);

        const res = await fetch("/api/tools/ediwin-parse?op=preview", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.detail || j?.error || `HTTP_${res.status}`);
        }

        const j = (await res.json()) as PreviewJson | { ok: false; error?: string; detail?: any };
        if (!("ok" in j) || (j as any).ok !== true) {
          throw new Error((j as any)?.detail || (j as any)?.error || "Preview fallida.");
        }

        if (!cancelled) {
          setPreview(j as PreviewJson);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Error en preview.");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }

    runPreview();
    return () => {
      cancelled = true;
    };
  }, [pdf, tipo]);

  // --------- PASO 2: EXPORTS ----------
  async function exportFile(format: "csv" | "xlsx") {
    if (!pdf) return setErr("Selecciona un PDF primero.");
    setErr(null);
    setOkMsg(null);
    setLoadingExport(format);

    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("file", pdf);

      const res = await fetch(`/api/tools/ediwin-parse?op=export&format=${format}`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.error || `HTTP_${res.status}`);
      }

      const filename =
        format === "csv"
          ? `${tipo.toLowerCase()}_resumen_pedidos.csv`
          : `${tipo.toLowerCase()}_resumen_pedidos.xlsx`;

      await downloadFromResponse(res, filename);
      setOkMsg(`Descarga lista: ${filename}`);
    } catch (e: any) {
      setErr(e?.message || "Error exportando.");
    } finally {
      setLoadingExport(null);
    }
  }

  async function generarCarpetas() {
    if (!pdf) return setErr("Selecciona un PDF primero.");
    setErr(null);
    setOkMsg(null);
    setLoadingFolders(true);

    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("file", pdf);

      const res = await fetch(`/api/tools/ediwin-parse?op=folders`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.error || `HTTP_${res.status}`);
      }

      const j = (await res.json()) as { ok: true; base_dir: string } | { ok: false; error?: string; detail?: any };
      if (!("ok" in j) || (j as any).ok !== true) {
        throw new Error((j as any)?.detail || (j as any)?.error || "No se pudieron generar carpetas.");
      }

      setFoldersOk(true);
      setOkMsg("Carpetas por modelo generadas en la ruta de salida (modo original).");
    } catch (e: any) {
      setErr(e?.message || "Error generando carpetas.");
    } finally {
      setLoadingFolders(false);
    }
  }

  // --------- PASO 3: SPLIT TXT ----------
  async function repartirTxt() {
    setErr(null);
    setOkMsg(null);

    if (!pdf) return setErr("Selecciona un PDF primero.");
    if (!foldersOk) return setErr("Primero genera las carpetas por modelo (Paso 2).");
    if (!wantsAnyTxt) return setErr("Sube los TXT primero.");
    if (wantsTxtButMissingLinped) {
      return setErr("Si añades TXT, LINPED.TXT es obligatorio (para repartir por modelo).");
    }

    setLoadingSplit(true);
    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("file", pdf);

      if (cabped) fd.append("cabped", cabped);
      if (linped) fd.append("linped", linped);
      if (locped) fd.append("locped", locped);
      if (obsped) fd.append("obsped", obsped);
      if (obslped) fd.append("obslped", obslped);

      const qs = new URLSearchParams();
      qs.set("op", "split-txt");
      qs.set("recortarModelo", recortarModelo ? "1" : "0");
      qs.set("sageMaxLen", String(sageMaxLen));

      const res = await fetch(`/api/tools/ediwin-parse?${qs.toString()}`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.error || `HTTP_${res.status}`);
      }

      const j = (await res.json()) as
        | { ok: true; base_dir: string; model_changes_count?: number }
        | { ok: false; error?: string; detail?: any };

      if (!("ok" in j) || (j as any).ok !== true) {
        throw new Error((j as any)?.detail || (j as any)?.error || "Split TXT fallido.");
      }

      const count = typeof (j as any).model_changes_count === "number" ? (j as any).model_changes_count : 0;
      setOkMsg(
        `TXT repartidos en carpetas de modelos.${count > 0 ? ` Cambios Sage detectados: ${count}` : ""}`
      );
    } catch (e: any) {
      setErr(e?.message || "Error repartiendo TXT.");
    } finally {
      setLoadingSplit(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
      {/* TIPO */}
      <div>
        <label className="text-xs text-slate-400">Cliente</label>
        <div className="mt-2 flex gap-2">
          {(["EUROFIEL", "ECI"] as Tipo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t);
                setSortKey(null);
                setSortDir("asc");
              }}

              className={cx(
                "px-3 py-2 rounded-xl text-xs border transition",
                tipo === t
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              )}
            >
              {t === "EUROFIEL" ? "Eurofiel" : "El Corte Inglés"}
            </button>
          ))}
        </div>
      </div>

      {/* PASO 1 */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">Paso 1 — Cargar PDF + previsualizar</div>
            <div className="text-xs text-slate-500">Al seleccionar el PDF, se genera una previsualización automática.</div>
          </div>
        </div>

        <FilePickerButton
          id="ediwin-pdf"
          inputRef={pdfInputRef}
          accept="application/pdf"
          buttonText={pdf ? "Cambiar PDF" : "Seleccionar PDF"}
          helperText={pdf ? pdf.name : "Ningún archivo seleccionado"}
          onPicked={(f) => handlePdfPicked(f)}
        />

        {/* Preview */}
        <div className="mt-2">
          {loadingPreview && (
            <div className="text-xs text-slate-400">Cargando preview…</div>
          )}

          {preview?.ok && (
            <div className="space-y-3">
              {/* Resumen (si viene) */}
              {preview.resumen && preview.resumen.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-slate-400 mb-2">Resumen por modelo</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[520px] text-xs text-slate-200">
                      <thead className="text-slate-400">
                        <tr>
                          {Object.keys(preview.resumen[0]).map((k) => (
                            <th
                              key={k}
                              onClick={() => toggleSort(k)}
                              className="text-left font-semibold px-2 py-1 whitespace-nowrap cursor-pointer select-none hover:text-slate-200"
                            >
                              {k}
                              {sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                            </th>

                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResumen.slice(0, 50).map((r, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-white/5"
                            style={{
                              backgroundColor: modelColorMap.get(String((r as any).MODELO ?? "").trim()) || "transparent",
                            }}
                          >

                            {Object.keys(preview.resumen![0]).map((k) => (
                              <td key={k} className="px-2 py-1 whitespace-nowrap">
                                {String((r as any)[k] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tabla principal con scroll horizontal */}
              <div className="rounded-xl border border-white/10 bg-black/20">
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-white/10">
                  Preview (hasta {preview.rows.length} filas)
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] text-xs text-slate-200">
                    <thead className="text-slate-400">
                      <tr>
                        {preview.columns.map((c) => (
                          <th
                            key={c}
                            onClick={() => toggleSort(c)}
                            className="text-left font-semibold px-2 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-200"
                          >
                            {c}
                            {sortKey === c ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                          </th>

                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-t border-white/5"
                          style={{
                            backgroundColor: modelColorMap.get(String((row as any).MODELO ?? "").trim()) || "transparent",
                          }}
                        >

                          {preview.columns.map((c) => (
                            <td key={c} className="px-2 py-2 whitespace-nowrap">
                              {String((row as any)[c] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {preview.rows.length === 0 && (
                        <tr>
                          <td className="px-3 py-3 text-slate-400" colSpan={preview.columns.length}>
                            (Sin filas para mostrar)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Tip: puedes hacer scroll horizontal para ver tallas/columnas sin que se te rompa la vista.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PASO 2 */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Paso 2 — Exportar (CSV / Excel) + generar carpetas por modelo</div>
          <div className="text-xs text-slate-500">
            Exporta los ficheros y, si quieres, genera las carpetas por modelo (modo original).
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={!pdf || loadingExport !== null}
            onClick={() => exportFile("csv")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {loadingExport === "csv" ? "Descargando CSV…" : "Descargar CSV"}
          </button>

          <button
            type="button"
            disabled={!pdf || loadingExport !== null}
            onClick={() => exportFile("xlsx")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {loadingExport === "xlsx" ? "Descargando Excel…" : "Descargar Excel"}
          </button>

          <button
            type="button"
            disabled={!pdf || loadingFolders}
            onClick={generarCarpetas}
            className={cx(
              "rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50",
              foldersOk
                ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
            )}
          >
            {loadingFolders ? "Generando carpetas…" : foldersOk ? "Carpetas generadas ✓" : "Generar carpetas por modelo"}
          </button>
        </div>
      </div>

      {/* PASO 3 */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">Paso 3 — Subir TXT + repartir a carpetas de modelos</div>
            <div className="text-xs text-slate-500">
              Primero genera las carpetas (Paso 2). Luego sube TXT y reparte.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTxt((v) => !v)}
            className="text-xs text-slate-300 underline underline-offset-2 hover:text-slate-100"
          >
            {showTxt ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {showTxt && (
          <div className="space-y-3">
            {/* Multi upload TXT */}
            <div className="rounded-xl border border-white/10 p-4 bg-black/20 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-200 font-semibold">TXT (subida rápida)</div>
                  <div className="text-xs text-slate-500">
                    Selecciona los 5 a la vez: CABPED, LINPED, LOCPED, OBSPED, OBSLPED.
                    Los asigno por nombre automáticamente.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clearTxts}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                >
                  Limpiar TXT
                </button>
              </div>

              <input
                ref={txtMultiRef}
                id="ediwin-txt-multi"
                type="file"
                accept=".txt"
                multiple
                className="sr-only"
                onChange={(e) => handleTxtMultiPicked(e.target.files)}
              />

              <label
                htmlFor="ediwin-txt-multi"
                className={cx(
                  "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold cursor-pointer transition",
                  "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                )}
              >
                {pickedTxtNames.length > 0 ? "Añadir / Reemplazar TXT" : "Seleccionar TXT (hasta 5)"}
              </label>

              {pickedTxtNames.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {pickedTxtNames.map(([k, f]) => (
                    <div
                      key={k}
                      className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-400">{k}</span>
                      <span className="truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 mt-2">No hay TXT seleccionados.</div>
              )}
            </div>

            {/* Sage options */}
            <div className="rounded-xl border border-white/10 p-4 bg-black/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={recortarModelo}
                    onChange={(e) => setRecortarModelo(e.target.checked)}
                  />
                  Recortar nombre de modelo (Sage)
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Máx.</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={sageMaxLen}
                    onChange={(e) => setSageMaxLen(Number(e.target.value || 0))}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-200"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Si desactivas el recorte, no se aplican ajustes de nombre al repartir TXT.
              </div>
            </div>

            {/* Warnings */}
            {wantsAnyTxt && wantsTxtButMissingLinped && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                Ojo: has seleccionado TXT, pero falta <b>LINPED.TXT</b>. Sin LINPED no se puede repartir por modelo.
              </div>
            )}

            {!foldersOk && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                Aún no has generado las carpetas por modelo. Ve al <b>Paso 2</b> y pulsa <b>Generar carpetas por modelo</b>.
              </div>
            )}

            {/* Action split */}
            <button
              type="button"
              onClick={repartirTxt}
              disabled={!pdf || !foldersOk || loadingSplit || !wantsAnyTxt || wantsTxtButMissingLinped}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {loadingSplit ? "Repartiendo TXT…" : "Repartir TXT en carpetas de modelos"}
            </button>
          </div>
        )}
      </div>

      {/* MENSAGES */}
      {err && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {okMsg && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100 whitespace-pre-wrap">
          {okMsg}
        </div>
      )}

      {/* FOOTER ACTIONS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={resetAll}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10"
        >
          Limpiar todo
        </button>
      </div>
    </div>
  );
}

/**
 * FilePickerButton:
 * - Input real oculto (sr-only)
 * - Label como botón visible
 * - Muestra el nombre del archivo seleccionado
 */
function FilePickerButton({
  id,
  accept,
  multiple,
  buttonText,
  helperText,
  onPicked,
  inputRef,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  buttonText: string;
  helperText: string;
  onPicked: (file: File | null) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <input
        ref={inputRef as any}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => onPicked(e.target.files?.[0] ?? null)}
      />

      <label
        htmlFor={id}
        className={cx(
          "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold cursor-pointer transition",
          "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        )}
      >
        {buttonText}
      </label>

      <div className="text-xs text-slate-400 truncate">{helperText}</div>
    </div>
  );
}
