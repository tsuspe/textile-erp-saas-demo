"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const PREVIEW_LIMIT = 200;
const SUGGEST_DEBOUNCE_MS = 320;
const PREVIEW_DEBOUNCE_MS = 360;
const OPTIONS_DEBOUNCE_MS = 320;
const EMPRESA_QUERY_KEY = "empresaId";

type EmpresaLite = { id: number; slug: string; nombre: string };

type SuggestItem = {
  label: string;
  value: string;
  prefix: string;
};

type PartsInfo = {
  temporada?: { codigo: string; descripcion?: string } | null;
  cliente?: { codigo: string; descripcion?: string } | null;
  subfamilia?: { codigo: string; descripcion?: string } | null;
} | null;

type SuggestResp =
  | {
      ok: true;
      kind: "temporada" | "cliente" | "subfamilia" | "articulo";
      suggestions: SuggestItem[];
      parts?: PartsInfo;
    }
  | { ok: false; error: string };

type PreviewRow = {
  pedidoId: number;
  pedidoColorId: number;
  color: string;
  temporada: { codigo: string; descripcion?: string } | null;
  cliente: { codigo: string; descripcion?: string; id?: number } | null;
  subfamilia: { codigo: string; descripcion?: string } | null;
  articulo: { codigo: string; descripcion?: string; id?: number } | null;
  escandalloId: number | null;
  temporadaId: number | null;
  clienteId: number | null;
  totalPedido: number | null;
  totalCorte: number | null;
  totalRecibidas: number | null;
  tallerCorte: string | null;
  fechaCorte: string | null;
  tallerConfeccion: string | null;
  fechaRecibidas: string | null;
  facturado: boolean;
  numeroFactura: string | null;
  fechaFactura: string | null;
  updatedAt: string;
};

type PreviewResp =
  | { ok: true; rows: PreviewRow[]; totalApprox: number }
  | { ok: false; error: string };

type SaveFacturaResp =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string };

type Filters = {
  temporada: string;
  cliente: string;
  subfamilia: string;
  articulo: string;
  tallerCorte: string;
  tallerConfeccion: string;
  dateFrom: string;
  dateTo: string;
};

type OptionItem = { value: string; label: string };

type OptionsResp =
  | {
      ok: true;
      options: {
        articulos: OptionItem[];
        talleresCorte: OptionItem[];
        talleresConfeccion: OptionItem[];
      };
    }
  | { ok: false; error: string };

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function normalizeModelInput(input: string) {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function parseModelo(input: string) {
  const s = normalizeModelInput(input);
  // Solo se extraen segmentos cuando hay suficientes caracteres.
  const temporada = s.length >= 2 ? s.slice(0, 2) : "";
  const cliente = s.length >= 4 ? s.slice(2, 4) : "";
  const subfamilia = s.length >= 6 ? s.slice(4, 6) : "";
  const resto = s.length > 6 ? s.slice(6) : "";
  return { raw: s, temporada, cliente, subfamilia, resto };
}

function fmtNumber(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES");
  } catch {
    return "—";
  }
}

function diffLabel(base: number | null, target: number | null) {
  if (base == null || target == null) return { text: "—", negative: false };
  const diff = target - base;
  const sign = diff >= 0 ? "+" : "";
  return { text: `${sign}${fmtNumber(diff)}`, negative: diff < 0 };
}

export default function ModelosReportClient({ empresas }: { empresas: EmpresaLite[] }) {
  const [empresaId, setEmpresaId] = useState<number>(empresas[0]?.id ?? 0);
  const [empresaSlug, setEmpresaSlug] = useState<string>(empresas[0]?.slug ?? "");
  const didInitEmpresa = useRef(false);

  const [modeloInput, setModeloInput] = useState<string>("");
  const [filters, setFilters] = useState<Filters>({
    temporada: "",
    cliente: "",
    subfamilia: "",
    articulo: "",
    tallerCorte: "",
    tallerConfeccion: "",
    dateFrom: "",
    dateTo: "",
  });

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [articuloOptions, setArticuloOptions] = useState<OptionItem[]>([]);
  const [tallerCorteOptions, setTallerCorteOptions] = useState<OptionItem[]>([]);
  const [tallerConfeccionOptions, setTallerConfeccionOptions] = useState<OptionItem[]>([]);

  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [suggestKind, setSuggestKind] = useState<
    "temporada" | "cliente" | "subfamilia" | "articulo" | null
  >(null);
  const [partsInfo, setPartsInfo] = useState<PartsInfo>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalApprox, setTotalApprox] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [facturacion, setFacturacion] = useState<Record<string, {
    facturado: boolean;
    numeroFactura: string;
    fechaFactura: string;
    updatedAt: string;
    editing: boolean;
    saving: boolean;
  }>>({});

  const suggestAbort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const optionsAbort = useRef<AbortController | null>(null);

  const modeloParts = useMemo(() => parseModelo(modeloInput), [modeloInput]);

  useEffect(() => {
    if (didInitEmpresa.current) return;
    if (!empresas.length) return;

    // Prioridad: querystring -> default Javier Bustos (buspar) -> primera empresa
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const fromQuery = params ? Number(params.get(EMPRESA_QUERY_KEY) || 0) : 0;
    const queryEmpresa = empresas.find((e) => e.id === fromQuery);

    const bySlug = empresas.find((e) => e.slug.toLowerCase() === "buspar");
    const byName = empresas.find((e) => {
      const name = e.nombre.toLowerCase();
      return name.includes("javier") && name.includes("bustos");
    });

    const fallback = empresas[0];
    const chosen = queryEmpresa ?? bySlug ?? byName ?? fallback;

    if (chosen) {
      setEmpresaId(chosen.id);
      setEmpresaSlug(chosen.slug);

      if (params && !queryEmpresa) {
        params.set(EMPRESA_QUERY_KEY, String(chosen.id));
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
    }

    didInitEmpresa.current = true;
  }, [empresas]);

  useEffect(() => {
    if (!empresaId) return;
    const empresa = empresas.find((e) => e.id === empresaId);
    setEmpresaSlug(empresa?.slug ?? "");
  }, [empresaId, empresas]);

  useEffect(() => {
    if (!empresaId) return;
    const input = modeloInput.trim();
    if (!input) {
      setSuggestions([]);
      setSuggestKind(null);
      setPartsInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      suggestAbort.current?.abort();
      const controller = new AbortController();
      suggestAbort.current = controller;
      setSuggestLoading(true);

      try {
        const res = await fetch("/api/tools/modelos-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            op: "suggest",
            modeloInput: input,
            filters: { empresaId },
          }),
        });

        const data: SuggestResp = await res.json();
        if (data.ok) {
          setSuggestions(data.suggestions ?? []);
          setSuggestKind(data.kind ?? null);
          setPartsInfo(data.parts ?? null);
        } else {
          setSuggestions([]);
          setSuggestKind(null);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setSuggestions([]);
          setSuggestKind(null);
        }
      } finally {
        setSuggestLoading(false);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [empresaId, modeloInput]);

  useEffect(() => {
    if (!empresaId) return;

    const timer = setTimeout(async () => {
      optionsAbort.current?.abort();
      const controller = new AbortController();
      optionsAbort.current = controller;
      setOptionsLoading(true);

      try {
        const res = await fetch("/api/tools/modelos-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            op: "options",
            modeloInput: modeloInput.trim(),
            filters: {
              empresaId,
              temporada: filters.temporada,
              cliente: filters.cliente,
              subfamilia: filters.subfamilia,
              articulo: filters.articulo,
              tallerCorte: filters.tallerCorte,
              tallerConfeccion: filters.tallerConfeccion,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            },
          }),
        });

        const data: OptionsResp = await res.json();
        if (data.ok) {
          setArticuloOptions(data.options.articulos || []);
          setTallerCorteOptions(data.options.talleresCorte || []);
          setTallerConfeccionOptions(data.options.talleresConfeccion || []);

          // Reset si la opción seleccionada ya no existe
          setFilters((prev) => {
            const articuloOk =
              !prev.articulo || data.options.articulos.some((o) => o.value === prev.articulo);
            const tallerCorteOk =
              !prev.tallerCorte || data.options.talleresCorte.some((o) => o.value === prev.tallerCorte);
            const tallerConfeccionOk =
              !prev.tallerConfeccion ||
              data.options.talleresConfeccion.some((o) => o.value === prev.tallerConfeccion);

            if (articuloOk && tallerCorteOk && tallerConfeccionOk) return prev;
            return {
              ...prev,
              articulo: articuloOk ? prev.articulo : "",
              tallerCorte: tallerCorteOk ? prev.tallerCorte : "",
              tallerConfeccion: tallerConfeccionOk ? prev.tallerConfeccion : "",
            };
          });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setArticuloOptions([]);
          setTallerCorteOptions([]);
          setTallerConfeccionOptions([]);
        }
      } finally {
        setOptionsLoading(false);
      }
    }, OPTIONS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    empresaId,
    modeloInput,
    filters.temporada,
    filters.cliente,
    filters.subfamilia,
    filters.articulo,
    filters.tallerCorte,
    filters.tallerConfeccion,
    filters.dateFrom,
    filters.dateTo,
  ]);

  useEffect(() => {
    if (!empresaId) return;

    const timer = setTimeout(async () => {
      previewAbort.current?.abort();
      const controller = new AbortController();
      previewAbort.current = controller;

      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const res = await fetch("/api/tools/modelos-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            op: "preview",
            modeloInput: modeloInput.trim(),
            filters: {
              empresaId,
              ...filters,
              limit: PREVIEW_LIMIT,
            },
          }),
        });

        const data: PreviewResp = await res.json();
        if (data.ok) {
          setRows(data.rows);
          setTotalApprox(data.totalApprox ?? data.rows.length);
        } else {
          setRows([]);
          setTotalApprox(0);
          setPreviewError(data.error || "Error en preview");
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setPreviewError("Error al consultar");
        }
      } finally {
        setPreviewLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [empresaId, modeloInput, filters]);

  useEffect(() => {
    setFacturacion((prev) => {
      const next: typeof prev = { ...prev };
      rows.forEach((row) => {
        const key = String(row.pedidoId);
        if (!next[key]) {
          next[key] = {
            facturado: row.facturado,
            numeroFactura: row.numeroFactura ?? "",
            fechaFactura: row.fechaFactura ? row.fechaFactura.slice(0, 10) : "",
            updatedAt: row.updatedAt,
            editing: true,
            saving: false,
          };
        } else if (!next[key].editing && !next[key].saving && next[key].updatedAt !== row.updatedAt) {
          next[key] = {
            ...next[key],
            facturado: row.facturado,
            numeroFactura: row.numeroFactura ?? "",
            fechaFactura: row.fechaFactura ? row.fechaFactura.slice(0, 10) : "",
            updatedAt: row.updatedAt,
          };
        }
      });
      return next;
    });
  }, [rows]);

  function handleModeloChange(value: string) {
    setModeloInput(value);

    const parts = parseModelo(value);
    setFilters((prev) => ({
      ...prev,
      temporada: prev.temporada || parts.temporada,
      cliente: prev.cliente || parts.cliente,
      subfamilia: prev.subfamilia || parts.subfamilia,
    }));
  }

  async function handleExport() {
    if (!empresaId) return;

    try {
      const res = await fetch("/api/tools/modelos-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "export",
          modeloInput: modeloInput.trim(),
          filters: {
            empresaId,
            ...filters,
          },
        }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") || "";
      const match = dispo.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] ?? "modelos-report.xlsx";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // noop
    }
  }

  async function saveFactura(pedidoId: number) {
    const key = String(pedidoId);
    const current = facturacion[key];
    if (!current) return;

    setFacturacion((prev) => ({
      ...prev,
      [key]: { ...prev[key], saving: true },
    }));

    try {
      const res = await fetch("/api/tools/modelos-report/facturacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId,
          pedidoId,
          facturado: current.facturado,
          numeroFactura: current.numeroFactura || null,
          fechaFactura: current.fechaFactura || null,
          updatedAt: current.updatedAt,
        }),
      });

      const data: SaveFacturaResp = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo guardar");
        return;
      }

      setFacturacion((prev) => ({
        ...prev,
        [key]: { ...prev[key], updatedAt: data.updatedAt, editing: false },
      }));

      setRows((prev) =>
        prev.map((row) =>
          row.pedidoId === pedidoId
            ? {
                ...row,
                facturado: current.facturado,
                numeroFactura: current.numeroFactura || null,
                fechaFactura: current.fechaFactura ? new Date(current.fechaFactura).toISOString() : null,
                updatedAt: data.updatedAt,
              }
            : row,
        ),
      );
    } finally {
      setFacturacion((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false },
      }));
    }
  }

  const interpretation = useMemo(() => {
    const temporadaDesc = partsInfo?.temporada?.descripcion || "";
    const clienteDesc = partsInfo?.cliente?.descripcion || "";
    const subfamiliaDesc = partsInfo?.subfamilia?.descripcion || "";

    return {
      temporada: modeloParts.temporada
        ? `${modeloParts.temporada}${temporadaDesc ? ` · ${temporadaDesc}` : ""}`
        : "—",
      cliente: modeloParts.cliente
        ? `${modeloParts.cliente}${clienteDesc ? ` · ${clienteDesc}` : ""}`
        : "—",
      subfamilia: modeloParts.subfamilia
        ? `${modeloParts.subfamilia}${subfamiliaDesc ? ` · ${subfamiliaDesc}` : ""}`
        : "—",
      resto: modeloParts.resto || "—",
    };
  }, [modeloParts, partsInfo]);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400">Empresa</label>
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              value={empresaId}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setEmpresaId(nextId);
                if (typeof window !== "undefined" && Number.isFinite(nextId)) {
                  const params = new URLSearchParams(window.location.search);
                  params.set(EMPRESA_QUERY_KEY, String(nextId));
                  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
                }
              }}
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-3 space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400">Modelo</label>
            <div className="relative">
              <input
                value={modeloInput}
                onChange={(e) => handleModeloChange(e.target.value)}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
                placeholder="Ej. 1920AB3065"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              />

              {suggestOpen && suggestions.length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-xl">
                  <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500">
                    Sugerencias · {suggestKind ?? "modelo"}
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {suggestions.map((s) => (
                      <button
                        key={`${s.prefix}-${s.label}`}
                        type="button"
                        className="w-full text-left rounded-lg px-2 py-2 text-sm hover:bg-slate-800"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleModeloChange(s.prefix);
                          setSuggestions([]);
                          setSuggestOpen(false);
                        }}
                      >
                        <div className="text-slate-100">{s.label}</div>
                        <div className="text-[11px] text-slate-500">{s.prefix}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {suggestLoading && (
                <div className="absolute right-3 top-2 text-xs text-slate-400">…</div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 text-base text-slate-300 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Temporada</div>
                <div className="font-semibold">{interpretation.temporada}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Cliente</div>
                <div className="font-semibold">{interpretation.cliente}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Subfamilia</div>
                <div className="font-semibold">{interpretation.subfamilia}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Nº Modelo</div>
                <div className="font-semibold">{interpretation.resto}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Temporada</label>
            <input
              value={filters.temporada}
              onChange={(e) => setFilters((prev) => ({ ...prev, temporada: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Código o descripción"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Cliente</label>
            <input
              value={filters.cliente}
              onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Código o nombre"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Subfamilia</label>
            <input
              value={filters.subfamilia}
              onChange={(e) => setFilters((prev) => ({ ...prev, subfamilia: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="Código o descripción"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Artículo</label>
            <select
              value={filters.articulo}
              onChange={(e) => setFilters((prev) => ({ ...prev, articulo: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              disabled={optionsLoading && articuloOptions.length === 0}
            >
              <option value="">
                {optionsLoading ? "Cargando opciones…" : articuloOptions.length ? "Todos" : "(sin opciones)"}
              </option>
              {articuloOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Taller corte</label>
            <select
              value={filters.tallerCorte}
              onChange={(e) => setFilters((prev) => ({ ...prev, tallerCorte: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              disabled={optionsLoading && tallerCorteOptions.length === 0}
            >
              <option value="">
                {optionsLoading ? "Cargando opciones…" : tallerCorteOptions.length ? "Todos" : "(sin opciones)"}
              </option>
              {tallerCorteOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Taller confección</label>
            <select
              value={filters.tallerConfeccion}
              onChange={(e) => setFilters((prev) => ({ ...prev, tallerConfeccion: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              disabled={optionsLoading && tallerConfeccionOptions.length === 0}
            >
              <option value="">
                {optionsLoading ? "Cargando opciones…" : tallerConfeccionOptions.length ? "Todos" : "(sin opciones)"}
              </option>
              {tallerConfeccionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Fecha desde</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Fecha hasta</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Mostrando {rows.length} de ~{totalApprox} filas
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="print-hide rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
            >
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 overflow-auto">
        {previewLoading && (
          <div className="py-6 text-sm text-slate-400">Cargando preview…</div>
        )}
        {previewError && !previewLoading && (
          <div className="py-6 text-sm text-rose-300">{previewError}</div>
        )}

        {!previewLoading && rows.length === 0 && !previewError && (
          <div className="py-6 text-sm text-slate-400">Sin resultados</div>
        )}

        {!previewLoading && rows.length > 0 && (
          <table className="w-full text-[11px] border-separate border-spacing-0">
            <thead className="sticky top-0 bg-slate-950/90 print:bg-white">
              <tr>
                {[
                  "TEMPORADA",
                  "CLIENTE",
                  "SUBFAMILIA",
                  "ARTICULO",
                  "DESCRIPCION ARTICULO",
                  "COLOR",
                  "TOTAL_UNIDADES_PEDIDO",
                  "TOTAL_UNIDADES_CORTE",
                  "TOTAL_UNIDADES_RECIBIDAS",
                  "DIF_CORTE",
                  "DIF_RECIBIDAS",
                  "TALLER_CORTE",
                  "FECHA_CORTE",
                  "TALLER_CONFECCION",
                  "FECHA_RECIBIDAS",
                  "FACTURADO",
                  "NUM_FACTURA",
                  "FECHA_FACTURA",
                  "ACCIONES",
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-slate-700 px-2 py-2 text-left font-semibold text-slate-300"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const factura = facturacion[String(row.pedidoId)];
                const diffCorte = diffLabel(row.totalPedido, row.totalCorte);
                const diffRec = diffLabel(row.totalPedido, row.totalRecibidas);
                const articuloHref =
                  // TODO: si faltan IDs, el link queda null hasta tener datos completos.
                  empresaSlug && row.escandalloId && row.temporadaId && row.clienteId
                    ? `/${empresaSlug}/fichas/${row.clienteId}/temporadas/${row.temporadaId}/escandallos/${row.escandalloId}`
                    : null;

                return (
                  <tr key={row.pedidoColorId} className="border-b border-slate-800">
                    <td className="px-2 py-2">{row.temporada?.codigo ?? "—"}</td>
                    <td className="px-2 py-2">{row.cliente?.codigo ?? "—"}</td>
                    <td className="px-2 py-2">{row.subfamilia?.codigo ?? "—"}</td>
                    <td className="px-2 py-2">
                      {articuloHref ? (
                        <Link className="text-emerald-300 hover:underline" href={articuloHref}>
                          {row.articulo?.codigo ?? "—"}
                        </Link>
                      ) : (
                        row.articulo?.codigo ?? "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-300">{row.articulo?.descripcion ?? "—"}</td>
                    <td className="px-2 py-2">{row.color}</td>
                    <td className="px-2 py-2">{fmtNumber(row.totalPedido)}</td>
                    <td className="px-2 py-2">{fmtNumber(row.totalCorte)}</td>
                    <td className="px-2 py-2">{fmtNumber(row.totalRecibidas)}</td>
                    <td className={cx("px-2 py-2", diffCorte.negative && "text-rose-300")}>{diffCorte.text}</td>
                    <td className={cx("px-2 py-2", diffRec.negative && "text-rose-300")}>{diffRec.text}</td>
                    <td className="px-2 py-2">{row.tallerCorte ?? "—"}</td>
                    <td className="px-2 py-2">{fmtDate(row.fechaCorte)}</td>
                    <td className="px-2 py-2">{row.tallerConfeccion ?? "—"}</td>
                    <td className="px-2 py-2">{fmtDate(row.fechaRecibidas)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={factura?.facturado ?? false}
                        disabled={!factura?.editing}
                        onChange={(e) =>
                          setFacturacion((prev) => ({
                            ...prev,
                            [String(row.pedidoId)]: {
                              ...prev[String(row.pedidoId)],
                              facturado: e.target.checked,
                              numeroFactura: e.target.checked
                                ? prev[String(row.pedidoId)].numeroFactura
                                : "",
                              fechaFactura: e.target.checked
                                ? prev[String(row.pedidoId)].fechaFactura
                                : "",
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-28 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1"
                        value={factura?.numeroFactura ?? ""}
                        disabled={!factura?.editing || !factura?.facturado}
                        onChange={(e) =>
                          setFacturacion((prev) => ({
                            ...prev,
                            [String(row.pedidoId)]: {
                              ...prev[String(row.pedidoId)],
                              numeroFactura: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1"
                        value={factura?.fechaFactura ?? ""}
                        disabled={!factura?.editing || !factura?.facturado}
                        onChange={(e) =>
                          setFacturacion((prev) => ({
                            ...prev,
                            [String(row.pedidoId)]: {
                              ...prev[String(row.pedidoId)],
                              fechaFactura: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      {factura?.editing ? (
                        <button
                          type="button"
                          disabled={factura?.saving}
                          onClick={() => saveFactura(row.pedidoId)}
                          className="print-hide rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                        >
                          {factura?.saving ? "Guardando…" : "Guardar"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="print-hide rounded-lg border border-slate-600 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200"
                          onClick={() =>
                            setFacturacion((prev) => ({
                              ...prev,
                              [String(row.pedidoId)]: { ...prev[String(row.pedidoId)], editing: true },
                            }))
                          }
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-[11px] text-slate-500">
        <div>Notas:</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            TOTAL_UNIDADES_CORTE y TOTAL_UNIDADES_RECIBIDAS se calculan desde distribucion.corte/entregas
            de PedidoColor (formato actual de almacén).
          </li>
          <li>
            FECHA_RECIBIDAS se toma de Pedido.fechaConfeccion como proxy actual.
          </li>
        </ul>
      </div>
    </section>
  );
}
