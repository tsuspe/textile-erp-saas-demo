// app/components/LegacySheetPicker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  empresa: string;
  filePath: string;
  sheetNames: string[];
  cwd?: string;
  t?: string;
  initialSheet?: string;
  className?: string;
};

function buildUrl(empresa: string, base: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return `/${empresa}/${base}${s ? `?${s}` : ""}`;
}

export default function LegacySheetPicker({
  empresa,
  filePath,
  sheetNames,
  cwd,
  t,
  initialSheet,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");

  // ✅ sincroniza selección inicial
  useEffect(() => {
    if (!sheetNames?.length) return;

    // si ya hay selección, no la machaques
    if (selected) return;

    if (initialSheet && sheetNames.includes(initialSheet)) {
      setSelected(initialSheet);
    } else {
      setSelected(sheetNames[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetNames, initialSheet]);

  const warning = useMemo(() => {
    if (!selected) return "Elige una hoja o usa “Todas las hojas”.";
    return "";
  }, [selected]);

  function pickAll() {
    const href = buildUrl(empresa, "legacy/view", {
      p: cwd || undefined,
      file: filePath,
      all: "1",
      t: t || undefined,
    });
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  function openPdfForSingle() {
    if (!selected) return;

    const href = buildUrl(empresa, "legacy/view", {
      p: cwd || undefined,
      file: filePath,
      sheet: selected,
      t: t || undefined,
    });

    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  if (!sheetNames?.length) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
        title="Elegir hoja para PDF / imprimir"
      >
        🖨️ PDF / Imprimir…
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            type="button"
          />

          <div className="absolute left-1/2 top-1/2 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Selecciona hoja para PDF</p>
                <p className="text-[11px] text-slate-400">
                  Archivo:{" "}
                  <span className="font-mono text-slate-300">{filePath.split("/").pop()}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-xs text-slate-400">Elige 1 hoja o usa “Todas las hojas”.</p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected("")}
                    className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900"
                    title="Limpiar selección"
                  >
                    Limpiar
                  </button>

                  <button
                    type="button"
                    onClick={pickAll}
                    className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900"
                    title="Genera PDF de todas las hojas"
                  >
                    Todas las hojas
                  </button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-800 bg-slate-900/40 p-2">
                <ul className="space-y-1">
                  {sheetNames.map((name) => {
                    const checked = selected === name;
                    return (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/40">
                          <input
                            type="radio"
                            name="legacy_sheet"
                            checked={checked}
                            onChange={() => setSelected(name)}
                            className="h-4 w-4"
                          />
                          <span className="text-xs text-slate-200">{name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {warning && <p className="mt-3 text-[11px] text-amber-300">⚠️ {warning}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={openPdfForSingle}
                disabled={!selected}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                title={selected ? "Generar PDF de la hoja seleccionada" : "Selecciona 1 hoja"}
              >
                Generar PDF (hoja)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
