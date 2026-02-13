// app/(app)/tools/almacen/globalia-stock/GlobaliaStockClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type StatusResp =
  | { ok: true; paths: Record<string, string>; exists: Record<string, boolean>; num_modelos: number }
  | { ok: false; error: string; detail?: string; stdout?: string; stderr?: string; exit?: number };

type PreviewResp =
  | { ok: true; columns: string[]; rows: Array<Record<string, any>> }
  | { ok: false; error: string; detail?: string; stdout?: string; stderr?: string; exit?: number };

type ModelItem = { modelo: string; descripcion?: string; color?: string; cliente?: string };
type CatalogResp =
  | { ok: true; modelos: ModelItem[]; talleres: string[]; clientes: string[] }
  | { ok: false; error: string; detail?: string; stdout?: string; stderr?: string; exit?: number };

type LastUpdate = { action: string; whenIso: string; whenHuman: string };



function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

const LAST_UPDATE_KEY = "globalia_stock_last_update";

function normCol(name: string) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_"); // convierte "STOCK ESTIMADO" -> "STOCK_ESTIMADO"
}

    
function asStringList(input: any): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((x) => {
      if (typeof x === "string") return x;

      if (x && typeof x === "object") {
        // soporta minúsculas y MAYÚSCULAS (tus JSON vienen con NOMBRE)
        const v =
          (x as any).NOMBRE ??
          (x as any).nombre ??
          (x as any).NAME ??
          (x as any).name ??
          (x as any).LABEL ??
          (x as any).label ??
          (x as any).VALUE ??
          (x as any).value ??
          (x as any).TALLER ??
          (x as any).taller ??
          (x as any).CLIENTE ??
          (x as any).cliente ??
          (x as any).ID ??
          (x as any).id ??
          "";

        return v;
      }

      return "";
    })
    .map((s) => String(s).trim())
    .filter(Boolean);
}


function toNum(v: any): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizePreviewResp(input: any): PreviewResp {
  if (!input || input.ok === false) return input as PreviewResp;
  const columns = Array.isArray(input.columns) ? input.columns : [];
  const rows = Array.isArray(input.rows) ? input.rows : [];
  return { ...input, ok: true, columns, rows } as PreviewResp;
}

function modelLabel(m: ModelItem) {
  const base = (m.modelo || "").trim();
  const extra = [m.descripcion, m.color].filter(Boolean).join(" - ");
  return extra ? `${base} | ${extra}` : base;
}


function normModelItem(x: any): ModelItem | null {
  if (!x) return null;

  const modelo =
    x.modelo ??
    x.model ??
    x.MODELO ??
    x.codigo ??
    x.code ??
    x.CODIGO ??
    x.referencia ??
    x.ref ??
    x.REF ??
    "";

  const descripcion =
    x.descripcion ??
    x.desc ??
    x.DESCRIPCION ??
    x.nombre ??
    x.name ??
    x.NOMBRE ??
    "";

  const color =
    x.color ??
    x.COLOR ??
    "";

  const cliente =
    x.cliente ??
    x.CLIENTE ??
    "";

  const m = String(modelo).trim();
  if (!m) return null;

  return {
    modelo: m,
    descripcion: descripcion ? String(descripcion).trim() : undefined,
    color: color ? String(color).trim() : undefined,
    cliente: cliente ? String(cliente).trim() : undefined,
  };
}

function normModelList(input: any): ModelItem[] {
  if (!Array.isArray(input)) return [];
  return input.map(normModelItem).filter(Boolean) as ModelItem[];
}

function pickNameContact(item: any) {
  const nombre =
    item?.NOMBRE ??
    item?.nombre ??
    item?.NAME ??
    item?.name ??
    item?.value ??
    item?.label ??
    "";
  const contacto = item?.CONTACTO ?? item?.contacto ?? item?.contact ?? "";
  return { nombre: String(nombre || "").trim(), contacto: String(contacto || "").trim() };
}


function stockSemaforoBg(q: number) {
  if (q <= 0) return "bg-rose-500/10";      // rojo
  if (q > 0 && q <= 10) return "bg-orange-500/10"; // naranja
  if (q > 10 && q <= 25) return "bg-yellow-500/10"; // amarillo
  return ""; // normal
}

function stockSemaforoText(q: number) {
  if (q <= 0) return "text-rose-200";
  if (q > 0 && q <= 10) return "text-orange-200";
  if (q > 10 && q <= 25) return "text-yellow-200";
  return "text-slate-200";
}

function monthIndex(d: Date) {
  return d.getFullYear() * 12 + (d.getMonth() + 1);
}

function parseDateFlexible(val: any): Date | null {
  if (!val) return null;
  const s = String(val).trim().slice(0, 10);
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  // DD/MM/YYYY o DD-MM-YYYY
  if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(s)) {
    const parts = s.split(/[\/-]/).map(Number);
    const [d, m, y] = parts;
    const dt = new Date(y, m - 1, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  return null;
}

// Semáforo de pedidos por MES (igual mental-model que Streamlit/Excel del CLI):
// - pasado => verdes
// - futuro => rojos
// - mes actual => normal
function pendingMonthSemaforoInfo(fecha: any) {
  const dt = parseDateFlexible(fecha);
  if (!dt) return { bgClass: "", textClass: "" };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  const deltaDays = Math.round((target.getTime() - today.getTime()) / msPerDay);

  if (deltaDays === 0) return { bgClass: "", textClass: "" };

  const monthDelta = monthIndex(target) - monthIndex(today);

  const pastBgByMonth = [
    "",
    "bg-emerald-500/5",
    "bg-emerald-500/10",
    "bg-emerald-500/15",
    "bg-emerald-500/20",
    "bg-emerald-500/25",
    "bg-emerald-500/30",
  ];
  const futureBgByMonth = [
    "",
    "bg-rose-500/5",
    "bg-rose-500/10",
    "bg-rose-500/15",
    "bg-rose-500/20",
    "bg-rose-500/25",
    "bg-rose-500/30",
  ];

  const clampMonths = (monthsAway: number) => Math.min(Math.max(monthsAway, 1), 6);
  const textClassForMonths = (monthsAway: number) =>
    monthsAway >= 5 ? "text-white" : "";

  if (deltaDays < 0) {
    // Pasado: mismo mes => verde claro, meses anteriores => oscurece por mes
    if (monthDelta === 0) {
      return { bgClass: "bg-emerald-500/5", textClass: "" };
    }
    const monthsAway = clampMonths(Math.abs(monthDelta) + 1);
    return {
      bgClass: pastBgByMonth[monthsAway],
      textClass: textClassForMonths(monthsAway),
    };
  } else {
    // Futuro: mismo mes => rojo claro, meses siguientes => oscurece por mes
    if (monthDelta === 0) {
      return { bgClass: "bg-rose-500/5", textClass: "" };
    }
    const monthsAway = clampMonths(monthDelta + 1);
    return {
      bgClass: futureBgByMonth[monthsAway],
      textClass: textClassForMonths(monthsAway),
    };
  }
}

function fabGroupKey(r: any) {
  const modelo = String(r?.MODELO ?? r?.modelo ?? "").trim();
  const fecha = String(r?.FECHA ?? r?.fecha ?? "").trim().slice(0, 10);
  return `${modelo}__${fecha}`;
}

const FAB_GROUP_COLORS = [
  "bg-indigo-500/10",
  "bg-emerald-500/10",
  "bg-sky-500/10",
  "bg-amber-500/10",
  "bg-fuchsia-500/10",
  "bg-rose-500/10",
];

function fabGroupBgClass(groupIndex: number) {
  return FAB_GROUP_COLORS[groupIndex % FAB_GROUP_COLORS.length] || "bg-slate-500/5";
}

type ApiReq = {
  op: string;
  payload?: Record<string, any>;
};

async function postJson<T>(url: string, body: ApiReq): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let detail = "";
    try {
      if (ct.includes("application/json")) {
        const j = await r.json();
        detail = j?.detail || j?.error || JSON.stringify(j);
      } else {
        detail = await r.text();
      }
    } catch {}
    throw new Error(detail || `HTTP ${r.status}`);
  }

  if (!ct.includes("application/json")) {
    throw new Error("Respuesta no JSON (esperaba application/json).");
  }
  return (await r.json()) as T;
}

async function downloadZip(url: string, body: ApiReq, filename: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.detail || j?.error || JSON.stringify(j));
    }
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }

  const blob = await r.blob();
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const r = await fetch(url, { method: "POST", body: form });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let detail = "";
    try {
      if (ct.includes("application/json")) {
        const j = await r.json();
        detail = j?.detail || j?.error || JSON.stringify(j);
      } else {
        detail = await r.text();
      }
    } catch {}
    throw new Error(detail || `HTTP ${r.status}`);
  }
  if (!ct.includes("application/json")) {
    throw new Error("Respuesta no JSON (esperaba application/json).");
  }
  return (await r.json()) as T;
}

function parseIndexSelection(raw: string, maxIdx: number): number[] {
  const sel = new Set<number>();
  const tokens = raw.replace(/\s+/g, "").split(",").filter(Boolean);
  for (const token of tokens) {
    if (token.includes("-")) {
      const [aStr, bStr] = token.split("-", 2);
      const a = Number(aStr);
      const b = Number(bStr);
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i += 1) {
          if (i >= 1 && i <= maxIdx) sel.add(i);
        }
      }
    } else {
      const x = Number(token);
      if (Number.isFinite(x) && x >= 1 && x <= maxIdx) sel.add(x);
    }
  }
  return Array.from(sel).sort((a, b) => a - b);
}

function BoolPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-400")} />
      {ok ? "OK" : "NO"}
    </span>
  );
}

function ErrorBox({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">
      <div className="font-semibold">{title}</div>
      {detail ? <div className="mt-1 whitespace-pre-wrap opacity-90">{detail}</div> : null}
    </div>
  );
}

function InfoBox({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 text-sm text-slate-200">
      <div className="font-semibold">{title}</div>
      {detail ? <div className="mt-1 whitespace-pre-wrap text-slate-300">{detail}</div> : null}
    </div>
  );
}

function ModelTip({ className }: { className?: string }) {
  return (
    <div className={cx("mt-1 text-[11px] text-slate-500", className)}>
      Tip: Doble click para listar modelos disponibles o escribe y Tab/Enter. Si no salen opciones, pulsa “Status”.
    </div>
  );
}

function MissingPathsBox() {
  return (
    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">
      <div className="font-semibold">Faltan rutas obligatorias</div>
      <div className="mt-1 text-rose-100/90">
        Rellena <span className="font-semibold">inv / prev / talleres / clientes</span> en “Rutas & Configuración”
        y pulsa <span className="font-semibold">Status</span>.
      </div>
      <div className="mt-2 text-xs text-rose-100/70">
        Tip: se guardan en este navegador (localStorage). Si entras desde otro PC/usuario/URL, tendrás que ponerlas una vez.
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  title,
  variant = "secondary",
  className,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
      : variant === "ghost"
      ? "bg-transparent text-slate-200 hover:bg-slate-800/40"
      : "border border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60";
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={cx(base, styles, className)}>
      {children}
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  className,
  requiredLike,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
  requiredLike?: boolean;
}) {
  const isEmpty = requiredLike && String(value || "").trim() === "";
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      type={type}
      className={cx(
        "w-full rounded-lg border bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition",
        "border-slate-700/60 placeholder:text-slate-500",
        "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15",
        isEmpty && "border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/15",
        className
      )}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-medium text-slate-300">{children}</div>;
}

function TableFilterPanel({
  title,
  preview,
  busyDisabled,

  model,
  setModel,
  talla,
  setTalla,
  modelosOpt,
  tallasOpt,
  tallasLoading,
  onModelChange,

  colKey,
  setColKey,
  colVal,
  setColVal,

  sortKey,
  sortDir,

  totalRows,
  filteredCount,
  onReset,
  debounceMs = 300,
}: {
  title?: string;
  preview: PreviewResp | null;
  busyDisabled: boolean;

  model: string;
  setModel: (v: string) => void;
  talla: string;
  setTalla: (v: string) => void;
  modelosOpt: ModelItem[];
  tallasOpt: string[];
  tallasLoading: boolean;
  onModelChange?: (v: string) => void;

  colKey: string;
  setColKey: (v: string) => void;
  colVal: string;
  setColVal: (v: string) => void;

  sortKey: string;
  sortDir: "asc" | "desc";

  totalRows: number;
  filteredCount: number;
  onReset: () => void;
  debounceMs?: number;
}) {
  const canUseCols = !!preview && preview.ok !== false;
  const showModelSelect = Array.isArray(modelosOpt) && modelosOpt.length > 0;
  const showTallaSelect = Array.isArray(tallasOpt) && tallasOpt.length > 0;
  const handleModelChange = (val: string) => {
    if (onModelChange) onModelChange(val);
    else setModel(val);
  };
  const [colValLocal, setColValLocal] = useState(colVal);

  useEffect(() => {
    setColValLocal(colVal);
  }, [colVal]);

  useEffect(() => {
    const t = setTimeout(() => setColVal(colValLocal), debounceMs);
    return () => clearTimeout(t);
  }, [colValLocal, setColVal, debounceMs]);

  return (
    <div className="mb-3 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
      {title ? (
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Label>Modelo</Label>
          {showModelSelect ? (
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={busyDisabled}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
            >
              <option value="">(todos)</option>
              {modelosOpt.map((it, idx) => (
                <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                  {modelLabel(it)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              list="globalia-modelos"
              placeholder="(todos) · escribe para buscar…"
              disabled={busyDisabled}
              className={cx(
                "w-full rounded-lg border bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition",
                "border-slate-700/60 placeholder:text-slate-500",
                "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
              )}
            />
          )}

          <ModelTip />
        </div>

        <div className="lg:col-span-3">
          <Label>
            Talla {tallasLoading ? <span className="text-xs text-slate-500">· cargando…</span> : null}
          </Label>
          {showTallaSelect ? (
            <select
              value={talla}
              onChange={(e) => setTalla(e.target.value)}
              disabled={busyDisabled}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
            >
              <option value="">(todas)</option>
              {tallasOpt.map((t, idx) => (
                <option key={`${t}__${idx}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <Input value={talla} onChange={setTalla} placeholder="(todas)" disabled={busyDisabled} />
          )}
        </div>

        <div className="lg:col-span-2">
          <Label>Columna</Label>
          <select
            value={colKey}
            onChange={(e) => setColKey(e.target.value)}
            disabled={busyDisabled || !canUseCols}
            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
          >
            <option value="">(ninguna)</option>
            {preview && preview.ok ? preview.columns.map((c) => (
              <option key={c} value={c}>{c}</option>
            )) : null}
          </select>
        </div>

        <div className="lg:col-span-2">
          <Label>Valor contiene</Label>
          <Input
            value={colValLocal}
            onChange={setColValLocal}
            placeholder="..."
            disabled={busyDisabled || !colKey}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          Filas: <span className="font-semibold text-slate-100">{filteredCount}</span>
          <span className="mx-2 text-slate-600">/</span>
          Total: <span className="font-semibold text-slate-100">{totalRows}</span>
          {sortKey ? (
            <>
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-slate-500">
                Orden: <span className="text-slate-200">{sortKey}</span> ({sortDir})
              </span>
            </>
          ) : null}
        </div>

        <Button variant="secondary" onClick={onReset} disabled={busyDisabled}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function SimpleTable({
  rows,
  maxRows = 200,
}: {
  rows: Array<Record<string, any>>;
  maxRows?: number;
}) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-slate-400">Sin datos.</div>;
  }

  const colSet = new Set<string>();
  rows.forEach((r) => {
    Object.keys(r || {}).forEach((k) => colSet.add(k));
  });
  const cols = Array.from(colSet);

  const slice = rows.slice(0, maxRows);

  return (
    <div className="overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/20">
      <table className="min-w-[800px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap border-b border-slate-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row, idx) => (
            <tr
              key={idx}
              className={cx(
                "border-b border-slate-800/50 last:border-b-0",
                idx % 2 ? "bg-slate-950/0" : "bg-slate-950/10"
              )}
            >
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">
                  {String(row?.[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows ? (
        <div className="border-t border-slate-800/60 px-3 py-2 text-xs text-slate-400">
          Mostrando {maxRows} de {rows.length} filas.
        </div>
      ) : null}
    </div>
  );
}


const LS_KEY = "globalia_stock_paths_v1";

type PathsState = {
  inv: string;
  prev: string;
  talleres: string;
  clientes: string;
  exportDir: string;
  backupDir: string;
};

function getDefaultPaths(): PathsState {
  const isPublicDemoMode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").trim().toLowerCase() === "true";
  const demoDefaults = isPublicDemoMode
    ? {
        inv: "./public/demo/datos_almacen.json",
        prev: "./public/demo/prevision.json",
        talleres: "./public/demo/talleres.json",
        clientes: "./public/demo/clientes.json",
        exportDir: "",
        backupDir: "",
      }
    : null;

  const fromPublic = {
    inv: (process.env.NEXT_PUBLIC_GLOBALIA_INV_PATH as string) || demoDefaults?.inv || "",
    prev: (process.env.NEXT_PUBLIC_GLOBALIA_PREV_PATH as string) || demoDefaults?.prev || "",
    talleres: (process.env.NEXT_PUBLIC_GLOBALIA_TALLERES_PATH as string) || demoDefaults?.talleres || "",
    clientes: (process.env.NEXT_PUBLIC_GLOBALIA_CLIENTES_PATH as string) || demoDefaults?.clientes || "",
    exportDir: (process.env.NEXT_PUBLIC_GLOBALIA_EXPORT_DIR as string) || demoDefaults?.exportDir || "",
    backupDir: (process.env.NEXT_PUBLIC_GLOBALIA_BACKUP_DIR as string) || demoDefaults?.backupDir || "",
  };

  return {
    inv: fromPublic.inv || "",
    prev: fromPublic.prev || "",
    talleres: fromPublic.talleres || "",
    clientes: fromPublic.clientes || "",
    exportDir: fromPublic.exportDir || "",
    backupDir: fromPublic.backupDir || "",
  };
}

function hasRequiredPaths(p: PathsState) {
  return !!(p.inv && p.prev && p.talleres && p.clientes);
}

type TabKey =
  | "stock"
  | "movimientos"
  | "prevision"
  | "auditoria"
  | "catalogo"
  | "importaciones"
  | "backups"
  | "exportar";

const TABS: Array<{ key: TabKey; label: string; sub?: string }> = [
  { key: "stock", label: "📦 Stock", sub: "Preview y tabla" },
  { key: "movimientos", label: "➡️ Movimientos", sub: "Entradas/salidas" },
  { key: "prevision", label: "📈 Previsión", sub: "Estimado y pendientes" },
  { key: "auditoria", label: "🧮 Auditoría", sub: "Cuadres y saneos" },
  { key: "catalogo", label: "📇 Catálogo", sub: "Maestros" },
  { key: "importaciones", label: "📥 Importaciones", sub: "Excel/PDF" },
  { key: "backups", label: "💾 Backups", sub: "Copias/restaurar" },
  { key: "exportar", label: "📤 Exportar", sub: "CSV/Excel pack" },
];

export default function GlobaliaStockClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("stock");

  const [busy, setBusy] = useState<null | string>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [paths, setPaths] = useState<PathsState>(() => {
    // 1) intenta localStorage (si existe)
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === "object") return { ...getDefaultPaths(), ...j };
      }
    } catch {}
    // 2) fallback a defaults del .env
    return getDefaultPaths();
  });


  const [modelo, setModelo] = useState("");
  const [talla, setTalla] = useState("");
  const [limit, setLimit] = useState(500);

  const [modelosOpt, setModelosOpt] = useState<ModelItem[]>([]);
  const [tallasOpt, setTallasOpt] = useState<string[]>([]);
  const [talleresOpt, setTalleresOpt] = useState<string[]>([]);
  const [clientesOpt, setClientesOpt] = useState<string[]>([]);

  const [loadingModelos, setLoadingModelos] = useState(false);
  const [loadingTallas, setLoadingTallas] = useState(false);

    // filtros UI (solo frontend)
  const [onlyNeg, setOnlyNeg] = useState(false);
  const [range, setRange] = useState<"ALL" | "LE0" | "LE10" | "LE25" | "GT25">("ALL");
  const [colFilterKey, setColFilterKey] = useState("");
  const [colFilterVal, setColFilterVal] = useState("");
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [colOrder, setColOrder] = useState<string[]>([]);


    // ===== Movimientos (tab) =====
  const [movKind, setMovKind] = useState<"entry" | "exit">("entry");

  const [movModelLabel, setMovModelLabel] = useState("");
  const [movTalla, setMovTalla] = useState("");
  const [movTallaManual, setMovTallaManual] = useState("");

  const [movCantidad, setMovCantidad] = useState("1");
  const [movFecha, setMovFecha] = useState(() => new Date().toISOString().slice(0, 10));

  // entrada
  const [movTaller, setMovTaller] = useState("");
  const [movObs, setMovObs] = useState("");

  // salida
  const [movCliente, setMovCliente] = useState("");
  const [movPedido, setMovPedido] = useState("");
  const [movAlbaran, setMovAlbaran] = useState("");

  const [debugCatalog, setDebugCatalog] = useState<any>(null);


    // ===== Previsión (tab) =====
  const [estPreview, setEstPreview] = useState<PreviewResp | null>(null);
  const [pendPreview, setPendPreview] = useState<PreviewResp | null>(null);
  const [fabPreview, setFabPreview] = useState<PreviewResp | null>(null);

  // ===== Fabricación UI (solo frontend) =====
  const [fabColKey, setFabColKey] = useState("");
  const [fabColVal, setFabColVal] = useState("");
  const [fabSortKey, setFabSortKey] = useState("");
  const [fabSortDir, setFabSortDir] = useState<"asc" | "desc">("asc");
  const [fabTallaUi, setFabTallaUi] = useState("");
  const [fabTallasOpt, setFabTallasOpt] = useState<string[]>([]);
  const [fabTallasLoading, setFabTallasLoading] = useState(false);

  // ===== Stock estimado UI (solo frontend) =====
  const [estColKey, setEstColKey] = useState("");
  const [estColVal, setEstColVal] = useState("");
  const [estSortKey, setEstSortKey] = useState("");
  const [estSortDir, setEstSortDir] = useState<"asc" | "desc">("asc");
  const [estTallaUi, setEstTallaUi] = useState("");
  const [estTallasOpt, setEstTallasOpt] = useState<string[]>([]);
  const [estTallasLoading, setEstTallasLoading] = useState(false);

  // ===== Pendientes UI (solo frontend) =====
  const [pendColKey, setPendColKey] = useState("");
  const [pendColVal, setPendColVal] = useState("");
  const [pendSortKey, setPendSortKey] = useState("");
  const [pendSortDir, setPendSortDir] = useState<"asc" | "desc">("asc");
  const [pendTallaUi, setPendTallaUi] = useState("");
  const [pendTallasOpt, setPendTallasOpt] = useState<string[]>([]);
  const [pendTallasLoading, setPendTallasLoading] = useState(false);

  // ===== Stock (tab) filtros UI =====
  const [stockModelUi, setStockModelUi] = useState("");
  const [stockTallaUi, setStockTallaUi] = useState("");
  const [stockTallasOpt, setStockTallasOpt] = useState<string[]>([]);
  const [stockTallasLoading, setStockTallasLoading] = useState(false);
  const [stockSelectedKey, setStockSelectedKey] = useState("");

  // ===== Previsión: filtro por modelo (solo frontend) =====
  const [estModelUi, setEstModelUi] = useState("");
  const [pendModelUi, setPendModelUi] = useState("");
  const [fabModelUi, setFabModelUi] = useState("");







  // Añadir pendiente
  const [pAddModel, setPAddModel] = useState("");
  const [pAddTalla, setPAddTalla] = useState("");
  const [pAddTallaManual, setPAddTallaManual] = useState("");
  const [pAddCantidad, setPAddCantidad] = useState("1");
  const [pAddCliente, setPAddCliente] = useState("");
  const [pAddPedido, setPAddPedido] = useState("");
  const [pAddNumeroPedido, setPAddNumeroPedido] = useState("");
  const [pAddFecha, setPAddFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [pAddTallasOpt, setPAddTallasOpt] = useState<string[]>([]);
  const [pAddTallasLoading, setPAddTallasLoading] = useState(false);

  // Editar pendiente
  const [pEditIdx, setPEditIdx] = useState<string>("");
  const [pEditModel, setPEditModel] = useState("");
  const [pEditTalla, setPEditTalla] = useState("");
  const [pEditCantidad, setPEditCantidad] = useState("");
  const [pEditCliente, setPEditCliente] = useState("");
  const [pEditPedido, setPEditPedido] = useState("");
  const [pEditNumeroPedido, setPEditNumeroPedido] = useState("");
  const [pEditFecha, setPEditFecha] = useState("");

  // Eliminar pendiente
  const [pDelIdx, setPDelIdx] = useState<string>("");

  // Añadir fabricación
  const [fAddModel, setFAddModel] = useState("");
  const [fAddTalla, setFAddTalla] = useState("");
  const [fAddCantidad, setFAddCantidad] = useState("1");
  const [fAddFecha, setFAddFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fAddTallasOpt, setFAddTallasOpt] = useState<string[]>([]);
  const [fAddTallasLoading, setFAddTallasLoading] = useState(false);

  // Editar / eliminar fabricación (qty 0 = eliminar)
  const [fEditIdx, setFEditIdx] = useState<string>("");
  const [fEditCantidad, setFEditCantidad] = useState("0");

  // ===== Auditoría + saneos =====
  const [auditPreview, setAuditPreview] = useState<PreviewResp | null>(null);
  const [auditModel, setAuditModel] = useState("");
  const [auditApplyMode, setAuditApplyMode] = useState<"all" | "pos" | "neg">("all");
  const [auditApplyIdx, setAuditApplyIdx] = useState("");
  const [auditRegMode, setAuditRegMode] = useState<"all" | "pos" | "neg">("all");
  const [auditRegIdx, setAuditRegIdx] = useState("");
  const [auditFecha, setAuditFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [auditObs, setAuditObs] = useState("Ajuste auditoría (GUI)");
  const [auditMsg, setAuditMsg] = useState<string | null>(null);

  const [fixNegRes, setFixNegRes] = useState<any>(null);
  const [fixBadRes, setFixBadRes] = useState<any>(null);
  const [purgeRes, setPurgeRes] = useState<any>(null);

  // ===== Catálogo =====
  const [catalogModelos, setCatalogModelos] = useState<ModelItem[]>([]);
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);
  const [catalogTalleres, setCatalogTalleres] = useState<Array<Record<string, any>>>([]);
  const [catalogClientes, setCatalogClientes] = useState<Array<Record<string, any>>>([]);

  const [catModelo, setCatModelo] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catColor, setCatColor] = useState("");
  const [catCliente, setCatCliente] = useState("");
  const [catModeloSel, setCatModeloSel] = useState("");

  const [newTaller, setNewTaller] = useState("");
  const [newTallerContacto, setNewTallerContacto] = useState("");
  const [tallerSel, setTallerSel] = useState("");
  const [newCliente, setNewCliente] = useState("");
  const [newClienteContacto, setNewClienteContacto] = useState("");
  const [clienteSel, setClienteSel] = useState("");

  // ===== Importaciones =====
  const [albFile, setAlbFile] = useState<File | null>(null);
  const [albPath, setAlbPath] = useState("./demo-assets/globalia/ALBARANES_SERVIDOS_DEMO.xlsx");
  const [albModo, setAlbModo] = useState("d");
  const [albSkip, setAlbSkip] = useState("25");
  const [albSim, setAlbSim] = useState(false);
  const [albRes, setAlbRes] = useState<any>(null);

  const [pedFile, setPedFile] = useState<File | null>(null);
  const [pedPath, setPedPath] = useState("./demo-assets/globalia/PEDIDOS_PENDIENTES_DEMO.xlsx");
  const [pedSkip, setPedSkip] = useState("26");
  const [pedSim, setPedSim] = useState(false);
  const [pedRes, setPedRes] = useState<any>(null);
  const albInputRef = useRef<HTMLInputElement | null>(null);
  const pedInputRef = useRef<HTMLInputElement | null>(null);
  const [albDrag, setAlbDrag] = useState(false);
  const [pedDrag, setPedDrag] = useState(false);

  // ===== Backups =====
  const [backupFiles, setBackupFiles] = useState<string[]>([]);
  const [backupDirInfo, setBackupDirInfo] = useState("");
  const [backupSel, setBackupSel] = useState("");
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  // ===== Ajuste manual stock =====
  const [manualModel, setManualModel] = useState("");
  const [manualTalla, setManualTalla] = useState("");
  const [manualActual, setManualActual] = useState<string>("");
  const [manualNuevo, setManualNuevo] = useState<string>("");
  const [manualObs, setManualObs] = useState("Ajuste manual (GUI)");
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const [manualTallasOpt, setManualTallasOpt] = useState<string[]>([]);
  const [manualTallasLoading, setManualTallasLoading] = useState(false);
  const [lastUpdate, setLastUpdateState] = useState<LastUpdate | null>(null);





  useEffect(() => {
    if (!hasRequiredPaths(paths)) return;
    if (status) return;
    doStatus().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.inv, paths.prev, paths.talleres, paths.clientes]);



  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j && typeof j === "object") setPaths((p) => ({ ...p, ...j }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(paths));
    } catch {}
  }, [paths]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_UPDATE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j && typeof j === "object") setLastUpdateState(j);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab !== "movimientos" && activeTab !== "prevision") return;
    if (!hasRequiredPaths(paths)) return;
    if (busy) return;

    if (modelosOpt.length === 0 || talleresOpt.length === 0 || clientesOpt.length === 0) {
      loadCatalog().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, paths.inv, paths.prev, paths.talleres, paths.clientes]);

  useEffect(() => {
    if (!hasRequiredPaths(paths)) return;
    if (activeTab === "catalogo") {
      if (catalogModelos.length === 0 || talleresOpt.length === 0 || clientesOpt.length === 0) {
        loadCatalog().catch(() => {});
      }
    }
    if (activeTab === "backups") {
      listBackups().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, paths.inv, paths.prev, paths.talleres, paths.clientes, paths.backupDir]);

  useEffect(() => {
    if (activeTab !== "stock") return;
    if (!hasRequiredPaths(paths)) return;
    if (busy) return;
    if (preview) return;
    doPreview(true).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, paths.inv, paths.prev, paths.talleres, paths.clientes, preview, busy]);

  useEffect(() => {
    if (activeTab !== "prevision") return;
    if (!hasRequiredPaths(paths)) return;
    if (busy) return;
    if (estPreview || pendPreview || fabPreview) return;
    loadPrevisionAll(true).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, paths.inv, paths.prev, paths.talleres, paths.clientes, estPreview, pendPreview, fabPreview, busy]);

  useEffect(() => {
    if (!hasRequiredPaths(paths)) return;

    // Si no hay catálogo aún, lo cargamos (y así los datalist siempre tienen datos)
    if (modelosOpt.length === 0 || talleresOpt.length === 0 || clientesOpt.length === 0) {
      loadCatalog().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.inv, paths.prev, paths.talleres, paths.clientes]);



  const filteredRows = useMemo(() => {
    if (!preview || preview.ok === false) return [];
    let rows = (preview.rows || []) as Array<Record<string, any>>;


    // detectar columna de stock de forma robusta
    const stockCol =
      preview.columns.find((c) => normCol(c) === "STOCK") ||
      preview.columns.find((c) => normCol(c) === "STOCK_ESTIMADO") ||
      preview.columns.find((c) => c.toUpperCase() === "STOCK") ||
      "STOCK";

    if (onlyNeg) {
      rows = rows.filter((r) => (toNum(r[stockCol]) ?? 0) < 0);
    }

    if (range !== "ALL") {
      rows = rows.filter((r) => {
        const q = toNum(r[stockCol]) ?? 0;
        if (range === "LE0") return q <= 0;
        if (range === "LE10") return q > 0 && q <= 10;
        if (range === "LE25") return q > 10 && q <= 25;
        if (range === "GT25") return q > 25;
        return true;
      });
    }

    const modelCol =
      preview.columns.find((c) => normCol(c) === "MODELO") ||
      preview.columns.find((c) => normCol(c) === "MODEL") ||
      "";
    if (stockModelUi.trim() && modelCol) {
      const wanted = stockModelUi.trim().toLowerCase();
      rows = rows.filter((r) => String(r[modelCol] ?? "").toLowerCase().startsWith(wanted));
    }

    const tallaCol =
      preview.columns.find((c) => normCol(c) === "TALLA") ||
      preview.columns.find((c) => normCol(c) === "SIZE") ||
      "";
    if (stockTallaUi.trim() && tallaCol) {
      const wanted = stockTallaUi.trim().toLowerCase();
      rows = rows.filter((r) => String(r[tallaCol] ?? "").toLowerCase().startsWith(wanted));
    }

    if (colFilterKey && colFilterVal.trim()) {
      const needle = colFilterVal.trim().toLowerCase();
      rows = rows.filter((r) => String(r[colFilterKey] ?? "").toLowerCase().includes(needle));
    }

    return rows;
  }, [preview, stockModelUi, stockTallaUi, onlyNeg, range, colFilterKey, colFilterVal]);

    const colsToShow = useMemo(() => {
      if (!preview || preview.ok === false) return [];
      const hidden = new Set(hiddenCols);

      const baseCols = colOrder.length ? colOrder : preview.columns;
      // por si acaso: solo columnas que existan en este preview
      const exists = new Set(preview.columns);

      return baseCols.filter((c) => exists.has(c) && !hidden.has(c));
    }, [preview, hiddenCols, colOrder]);


type TableUiState = {
  model: string;           // NUEVO
  talla: string;
  colKey: string;
  colVal: string;
  sortKey: string;
  sortDir: "asc" | "desc";
};


function applyTableFilters(
preview: PreviewResp | null,
ui: TableUiState
): Array<Record<string, any>> {
if (!preview || preview.ok === false) return [];
let rows = [...(preview.rows || [])] as Array<Record<string, any>>;
const cols = Array.isArray(preview.columns) ? preview.columns : [];




// Filtro por MODELO (si existe columna MODELO o MODEL)
const modelCol =
  cols.find((c) => normCol(c) === "MODELO") ||
  cols.find((c) => normCol(c) === "MODEL") ||
  "";

if (ui.model.trim() && modelCol) {
  const wanted = ui.model.trim().toLowerCase();
  rows = rows.filter((r) =>
    String(r[modelCol] ?? "").toLowerCase().startsWith(wanted)
  );
}

// Filtro por TALLA (si existe columna TALLA o SIZE)
const tallaCol =
  cols.find((c) => normCol(c) === "TALLA") ||
  cols.find((c) => normCol(c) === "SIZE") ||
  "";

if (ui.talla.trim() && tallaCol) {
  const wanted = ui.talla.trim().toLowerCase();
  rows = rows.filter((r) =>
    String(r[tallaCol] ?? "").toLowerCase().startsWith(wanted)
  );
}



// Filtro por columna
if (ui.colKey && ui.colVal.trim()) {
  const needle = ui.colVal.trim().toLowerCase();
  rows = rows.filter((r) => String(r[ui.colKey] ?? "").toLowerCase().includes(needle));
}

// Sort
if (ui.sortKey) {
  const dir = ui.sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = String(a[ui.sortKey] ?? "");
    const bv = String(b[ui.sortKey] ?? "");
    return av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" }) * dir;
  });
}

return rows;
}
const filteredEstRows = useMemo(() => {
  return applyTableFilters(estPreview, {
    model: estModelUi,
    talla: estTallaUi,
    colKey: estColKey,
    colVal: estColVal,
    sortKey: estSortKey,
    sortDir: estSortDir,
  });
}, [estPreview, estModelUi, estTallaUi, estColKey, estColVal, estSortKey, estSortDir]);

const filteredPendRows = useMemo(() => {
  return applyTableFilters(pendPreview, {
    model: pendModelUi,
    talla: pendTallaUi,
    colKey: pendColKey,
    colVal: pendColVal,
    sortKey: pendSortKey,
    sortDir: pendSortDir,
  });
}, [pendPreview, pendModelUi, pendTallaUi, pendColKey, pendColVal, pendSortKey, pendSortDir]);

const filteredFabRows = useMemo(() => {
  return applyTableFilters(fabPreview, {
    model: fabModelUi,
    talla: fabTallaUi,
    colKey: fabColKey,
    colVal: fabColVal,
    sortKey: fabSortKey,
    sortDir: fabSortDir,
  });
}, [fabPreview, fabModelUi, fabTallaUi, fabColKey, fabColVal, fabSortKey, fabSortDir]);

const pendingSelectedIdx = useMemo(() => {
  return (pEditIdx || pDelIdx || "").trim();
}, [pEditIdx, pDelIdx]);

const pendingSelectedRow = useMemo(() => {
  if (!pendPreview || pendPreview.ok === false) return null;
  if (!pendingSelectedIdx) return null;
  return (
    pendPreview.rows.find((r) => String((r as any)["IDX"] ?? "") === pendingSelectedIdx) ?? null
  );
}, [pendPreview, pendingSelectedIdx]);

const fabSelectedRow = useMemo(() => {
  const idx = fEditIdx.trim();
  if (!fabPreview || fabPreview.ok === false) return null;
  if (!idx) return null;
  return fabPreview.rows.find((r) => String((r as any)["IDX"] ?? "") === idx) ?? null;
}, [fabPreview, fEditIdx]);

useEffect(() => {
  if (!pendingSelectedRow) return;
  const r: any = pendingSelectedRow;
  setPEditModel(String(r["MODELO"] ?? ""));
  setPEditTalla(String(r["TALLA"] ?? ""));
  setPEditCantidad(String(r["CANTIDAD"] ?? ""));
  setPEditCliente(String(r["CLIENTE"] ?? ""));
  setPEditPedido(String(r["PEDIDO"] ?? ""));
  setPEditNumeroPedido(String(r["NUMERO_PEDIDO"] ?? ""));
  setPEditFecha(String(r["FECHA"] ?? "").slice(0, 10));
}, [pendingSelectedRow]);






  useEffect(() => {
    if (!preview || preview.ok === false) return;
    const cols = preview.columns || [];
    if (!cols.length) return;

    // 1) Captura/actualiza orden base sin “recolocar” columnas ya conocidas
    setColOrder((prev) => {
      if (!prev.length) return cols; // primera carga
      // Mantén el orden previo y añade nuevas columnas al final
      const setPrev = new Set(prev);
      const added = cols.filter((c) => !setPrev.has(c));
      // También elimina columnas que ya no existan
      const kept = prev.filter((c) => cols.includes(c));
      return [...kept, ...added];
    });

    // 2) Limpia hiddenCols para evitar basura (ocultas que ya no existan)
    setHiddenCols((prev) => prev.filter((c) => cols.includes(c)));
  }, [preview]);




  function basePayload(): Record<string, any> {
    return {
      inv: paths.inv,
      prev: paths.prev,
      talleres: paths.talleres,
      clientes: paths.clientes,
      exportDir: paths.exportDir,
      backupDir: paths.backupDir,
    };
  }

  function setLastUpdate(action: string) {
    const now = new Date();
    const payload: LastUpdate = {
      action,
      whenIso: now.toISOString(),
      whenHuman: now.toLocaleString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setLastUpdateState(payload);
    try {
      localStorage.setItem(LAST_UPDATE_KEY, JSON.stringify(payload));
    } catch {}
  }

  async function refreshActiveTab(skipLastUpdate = true) {
    if (!hasRequiredPaths(paths)) return;
    if (activeTab === "stock") {
      await doPreview(skipLastUpdate);
      return;
    }
    if (activeTab === "prevision") {
      await loadPrevisionAll(skipLastUpdate);
      return;
    }
    if (activeTab === "auditoria") {
      await loadAuditPreview(skipLastUpdate);
      return;
    }
    if (activeTab === "catalogo") {
      await loadCatalog();
      return;
    }
    if (activeTab === "backups") {
      await listBackups(skipLastUpdate);
    }
  }


  async function loadCatalog() {
    setErr(null);
    try {
      if (!hasRequiredPaths(paths)) return;

      const j = await postJson<CatalogResp>("/api/tools/globalia-stock", {
        op: "list_catalog",
        payload: basePayload(),
      });

      // DEBUG: ver qué llega
      console.log("[list_catalog] resp:", j);
      setDebugCatalog(j);

      if (!j.ok) throw new Error((j as any).error || "No se pudo cargar el catálogo.");

      // OJO: aquí aún no asumimos nombres: lo dejamos como estaba y luego ajustamos con el debug
      const rawModelos = (j as any).modelos ?? (j as any).items ?? (j as any).data?.modelos ?? [];
      const rawTalleres = (j as any).talleres ?? (j as any).data?.talleres ?? [];
      const rawClientes = (j as any).clientes ?? (j as any).data?.clientes ?? [];

      const normalized = normModelList(rawModelos);
      setModelosOpt(normalized);
      setCatalogModelos(normalized);
      setTalleresOpt(asStringList(rawTalleres));
      setClientesOpt(asStringList(rawClientes));
      setCatalogTalleres(Array.isArray(rawTalleres) ? rawTalleres : []);
      setCatalogClientes(Array.isArray(rawClientes) ? rawClientes : []);

    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function loadModelos() {
  setLoadingModelos(true);
  try {
    const j = await postJson<{ ok: true; items: ModelItem[] } | { ok: false; error: string; detail?: string }>(
      "/api/tools/globalia-stock",
      { op: "list_modelos", payload: basePayload() }
    );
    if ((j as any).ok) setModelosOpt(normModelList((j as any).items));
    else throw new Error((j as any).detail || (j as any).error || "Error list_modelos");
  } finally {
    setLoadingModelos(false);
  }
}

async function loadTallas(m: string) {
  const mm = (m || "").trim().toUpperCase();
  setTallasOpt([]);
  if (!mm) return;
  setLoadingTallas(true);
  try {
    const j = await postJson<{ ok: true; items: string[] } | { ok: false; error: string; detail?: string }>(
      "/api/tools/globalia-stock",
      { op: "list_tallas", payload: { ...basePayload(), modelo: mm } }
    );
    if ((j as any).ok) setTallasOpt((j as any).items || []);
    else throw new Error((j as any).detail || (j as any).error || "Error list_tallas");
  } finally {
    setLoadingTallas(false);
  }
}

async function fetchTallasList(m: string): Promise<string[]> {
  const mm = (m || "").trim().toUpperCase();
  if (!mm) return [];
  const j = await postJson<{ ok: true; items: string[] } | { ok: false; error: string; detail?: string }>(
    "/api/tools/globalia-stock",
    { op: "list_tallas", payload: { ...basePayload(), modelo: mm } }
  );
  if ((j as any).ok) return (j as any).items || [];
  throw new Error((j as any).detail || (j as any).error || "Error list_tallas");
}

async function updateFilterModel(
  model: string,
  setModel: (v: string) => void,
  setTalla: (v: string) => void,
  setList: (v: string[]) => void,
  setLoading: (v: boolean) => void
) {
  setModel(model);
  setTalla("");
  setList([]);
  if (!model) return;
  setLoading(true);
  try {
    const items = await fetchTallasList(model);
    setList(items);
  } catch {
    setList([]);
  } finally {
    setLoading(false);
  }
}

async function updateManualModel(
  model: string,
  setModel: (v: string) => void,
  setTalla: (v: string) => void,
  setList: (v: string[]) => void,
  setLoading: (v: boolean) => void
) {
  setModel(model);
  setTalla("");
  setList([]);
  if (!model) return;
  setLoading(true);
  try {
    const items = await fetchTallasList(model);
    setList(items);
  } catch {
    setList([]);
  } finally {
    setLoading(false);
  }
}

useEffect(() => {
  const mm = (modelo || "").trim().toUpperCase();

  const t = setTimeout(() => {
    if (!mm) {
      setTalla("");
      setTallasOpt([]);
      return;
    }
    setTalla("");
    loadTallas(mm).catch(() => {});
  }, 250);

  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [modelo]);

useEffect(() => {
  if (!manualModel || !manualTalla) return;
  if (busy) return;
  const t = setTimeout(() => {
    loadManualActual().catch(() => {});
  }, 250);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [manualModel, manualTalla]);




  async function doStatus() {
    setErr(null);
    setBusy("status");
    try {
      if (!hasRequiredPaths(paths)) {
        throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes). Rellénalas arriba y vuelve a probar.");
      }
      const j = await postJson<StatusResp>("/api/tools/globalia-stock", {
        op: "status",
        payload: basePayload(),
      });
      setStatus(j);

      if (j && (j as any).ok) {
        // Cargamos catálogo completo para tener modelos+talleres+clientes
        loadCatalog().catch(() => {});
      }
      setLastUpdate("Status (comprobar rutas)");


    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doPreview(skipLastUpdate = false) {
    setErr(null);
    setBusy("preview");
    try {
      if (!hasRequiredPaths(paths)) {
        throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes). Rellénalas arriba y vuelve a probar.");
      }

      const j = await postJson<PreviewResp>("/api/tools/globalia-stock", {
        op: "preview_stock",
        payload: {
          ...basePayload(),
          limit,
          modelo: modelo.trim() ? modelo.trim() : "",
          talla: talla.trim() ? talla.trim() : "",
        },
      });
      setPreview(normalizePreviewResp(j));
      if (!skipLastUpdate) setLastUpdate("Preview stock");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadPrevisionAll(skipLastUpdate = false) {
    setErr(null);
    setBusy("prevision");
    try {
      if (!hasRequiredPaths(paths)) throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes).");

      // asegura catálogo para los selects de esta tab
      if (modelosOpt.length === 0 || clientesOpt.length === 0) {
        await loadCatalog();
      }

      const [est, pend, fab] = await Promise.all([
        postJson<PreviewResp>("/api/tools/globalia-stock", { op: "calc_estimated", payload: basePayload() }),
        postJson<PreviewResp>("/api/tools/globalia-stock", { op: "list_pendings", payload: basePayload() }),
        postJson<PreviewResp>("/api/tools/globalia-stock", { op: "list_fabrication", payload: basePayload() }),
      ]);

      setEstPreview(normalizePreviewResp(est));
      setPendPreview(normalizePreviewResp(pend));
      setFabPreview(normalizePreviewResp(fab));
      if (!skipLastUpdate) setLastUpdate("Previsión recargada");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }


  async function addPending() {
    setErr(null);
    setBusy("pending_add");
    try {
      const tallaFinal = (pAddTallaManual || pAddTalla).trim();
      const payload = {
        ...basePayload(),
        modelo: pAddModel.trim().toUpperCase(),
        talla: tallaFinal,
        cantidad: Number(pAddCantidad),
        cliente: pAddCliente.trim(),
        pedido: pAddPedido.trim(),
        numero_pedido: pAddNumeroPedido.trim(),
        fecha: pAddFecha.trim(),
      };
      const j = await postJson<any>("/api/tools/globalia-stock", { op: "add_pending", payload });
      if (!j?.ok) throw new Error(j?.error || "No se pudo añadir el pendiente.");
      setLastUpdate("Añadir pedido pendiente");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function editPending() {
    setErr(null);
    setBusy("pending_edit");
    try {
      const idx = Number(pEditIdx);
      if (!Number.isFinite(idx) || idx <= 0) throw new Error("IDX inválido.");

      const payload = {
        ...basePayload(),
        idx,
        // vacíos => sin cambio (el CLI ya lo interpreta así)
        modelo: pEditModel,
        talla: pEditTalla,
        cantidad: pEditCantidad,
        cliente: pEditCliente,
        pedido: pEditPedido,
        numero_pedido: pEditNumeroPedido,
        fecha: pEditFecha,
      };

      const j = await postJson<any>("/api/tools/globalia-stock", { op: "edit_pending", payload });
      if (!j?.ok) throw new Error(j?.error || "No se pudo editar el pendiente.");
      setLastUpdate("Editar pedido pendiente");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deletePending() {
    setErr(null);
    setBusy("pending_del");
    try {
      const idx = Number(pDelIdx);
      if (!Number.isFinite(idx) || idx <= 0) throw new Error("IDX inválido.");
      const j = await postJson<any>("/api/tools/globalia-stock", { op: "delete_pending", payload: { ...basePayload(), idx } });
      if (!j?.ok) throw new Error(j?.error || "No se pudo eliminar el pendiente.");
      setLastUpdate("Eliminar pedido pendiente");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addFabrication() {
    setErr(null);
    setBusy("fab_add");
    try {
      const payload = {
        ...basePayload(),
        modelo: fAddModel.trim().toUpperCase(),
        talla: fAddTalla.trim(),
        cantidad: Number(fAddCantidad),
        fecha: fAddFecha.trim(),
      };
      const j = await postJson<any>("/api/tools/globalia-stock", { op: "add_fabrication", payload });
      if (!j?.ok) throw new Error(j?.error || "No se pudo añadir la orden.");
      setLastUpdate("Añadir orden de fabricación");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function editFabricationQty() {
    setErr(null);
    setBusy("fab_edit");
    try {
      const idx = Number(fEditIdx);
      const cantidad = Number(fEditCantidad);
      if (!Number.isFinite(idx) || idx <= 0) throw new Error("IDX inválido.");
      if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error("Cantidad inválida (>=0).");

      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "edit_fabrication_qty",
        payload: { ...basePayload(), idx, cantidad },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo aplicar el cambio.");
      setLastUpdate("Editar/eliminar orden de fabricación");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }


  async function doDownloadCsvPack() {
    setErr(null);
    setBusy("csv");
    try {
      if (!hasRequiredPaths(paths)) {
        throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes). Rellénalas arriba y vuelve a probar.");
      }
      await downloadZip(
        "/api/tools/globalia-stock",
        { op: "export_csv_pack", payload: basePayload() },
        "globalia_export_csv_pack.zip"
      );
      setLastUpdate("Exportar CSV pack");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doDownloadExcelPack() {
    setErr(null);
    setBusy("excel");
    try {
      if (!hasRequiredPaths(paths)) {
        throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes). Rellénalas arriba y vuelve a probar.");
      }
      await downloadZip(
        "/api/tools/globalia-stock",
        { op: "export_excel_pack", payload: basePayload() },
        "globalia_export_excel_pack.zip"
      );
      setLastUpdate("Exportar Excel pack");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doDownloadStockNegativo() {
    setErr(null);
    setBusy("stock_negativo");
    try {
      if (!hasRequiredPaths(paths)) {
        throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes). Rellénalas arriba y vuelve a probar.");
      }
      await downloadZip(
        "/api/tools/globalia-stock",
        { op: "export_stock_negativo", payload: basePayload() },
        "globalia_stock_negativo.zip"
      );
      setLastUpdate("Exportar stock negativo");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadAuditPreview(skipLastUpdate = false) {
    setErr(null);
    setAuditMsg(null);
    setBusy("audit_preview");
    try {
      if (!hasRequiredPaths(paths)) throw new Error("Faltan rutas JSON (inv/prev/talleres/clientes).");
      const j = await postJson<PreviewResp>("/api/tools/globalia-stock", {
        op: "audit_preview",
        payload: { ...basePayload(), modelo: auditModel.trim().toUpperCase() || "" },
      });
      setAuditPreview(normalizePreviewResp(j));
      if (!skipLastUpdate) setLastUpdate("Auditoría: preview");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function pickAuditRows(mode: "all" | "pos" | "neg", idxText: string) {
    if (!auditPreview || auditPreview.ok === false) return [];
    const rows = [...(auditPreview.rows || [])];
    let base = rows;
    if (mode === "pos") base = rows.filter((r: any) => Number(r?.delta || 0) > 0);
    if (mode === "neg") base = rows.filter((r: any) => Number(r?.delta || 0) < 0);
    if (!idxText.trim()) return base;

    const idxs = parseIndexSelection(idxText, base.length);
    if (!idxs.length) return base;
    return idxs.map((i) => base[i - 1]).filter(Boolean);
  }

  async function applyAuditChanges() {
    setErr(null);
    setAuditMsg(null);
    setBusy("audit_apply");
    try {
      const cambios = pickAuditRows(auditApplyMode, auditApplyIdx);
      if (!cambios.length) throw new Error("No hay cambios para aplicar.");
      const payloadJson = JSON.stringify({ cambios });
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "audit_apply",
        payload: { ...basePayload(), payloadJson },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo aplicar la auditoría.");
      setAuditMsg(`Ajustes aplicados: ${j?.updated ?? cambios.length}`);
      setLastUpdate("Auditoría: aplicar ajustes");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function regularizeAuditChanges() {
    setErr(null);
    setAuditMsg(null);
    setBusy("audit_regularize");
    try {
      const cambios = pickAuditRows(auditRegMode, auditRegIdx);
      if (!cambios.length) throw new Error("No hay cambios para regularizar.");
      const payloadJson = JSON.stringify({
        cambios,
        fecha: auditFecha.trim() || new Date().toISOString().slice(0, 10),
        obs: auditObs.trim() || "Ajuste auditoría (GUI)",
      });
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "audit_regularize",
        payload: { ...basePayload(), payloadJson },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo regularizar.");
      setAuditMsg(`Asientos creados: ${j?.created ?? cambios.length}`);
      setLastUpdate("Auditoría: regularizar histórico");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fixNegativesToZero() {
    setErr(null);
    setAuditMsg(null);
    setBusy("fix_neg");
    try {
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "fix_negatives_to_zero",
        payload: basePayload(),
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo ajustar negativos.");
      setFixNegRes(j);
      setAuditMsg(j?.changed ? `Negativos ajustados: ${j.changed}` : "No había negativos.");
      setLastUpdate("Saneo: negativos a 0");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fixBadStockValues() {
    setErr(null);
    setAuditMsg(null);
    setBusy("fix_bad");
    try {
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "fix_bad_stock_values",
        payload: basePayload(),
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo sanear.");
      setFixBadRes(j);
      setAuditMsg(j?.changed ? `Valores saneados: ${j.changed}` : "No había valores anómalos.");
      setLastUpdate("Saneo: reemplazar NaN/None/no enteros");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function purgeBadTallas(onlyZero: boolean) {
    setErr(null);
    setAuditMsg(null);
    setBusy("purge_tallas");
    try {
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "purge_bad_talla_keys",
        payload: { ...basePayload(), onlyZero: onlyZero ? 1 : 0 },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo purgar.");
      setPurgeRes(j);
      setAuditMsg(j?.deleted ? `Tallas purgadas: ${j.deleted}` : "No había tallas anómalas.");
      setLastUpdate("Saneo: purga tallas anómalas");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function updateModelInfo() {
    setErr(null);
    setCatalogMsg(null);
    setBusy("model_update");
    try {
      const payload = {
        ...basePayload(),
        modelo: catModelo.trim().toUpperCase(),
        descripcion: catDesc.trim(),
        color: catColor.trim(),
        cliente: catCliente.trim(),
      };
      if (!payload.modelo) throw new Error("Modelo obligatorio.");
      const j = await postJson<any>("/api/tools/globalia-stock", { op: "update_model_info", payload });
      if (!j?.ok) throw new Error(j?.error || "No se pudo actualizar.");
      setCatalogMsg("Modelo actualizado.");
      setLastUpdate("Catálogo: actualizar modelo");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addTaller() {
    setErr(null);
    setCatalogMsg(null);
    setBusy("add_taller");
    try {
      const nombre = newTaller.trim();
      if (!nombre) throw new Error("Nombre de taller obligatorio.");
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "add_taller",
        payload: { ...basePayload(), nombre, contacto: newTallerContacto.trim() },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo añadir taller.");
      setCatalogMsg("Taller añadido.");
      setNewTaller("");
      setNewTallerContacto("");
      setLastUpdate("Catálogo: añadir taller");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addCliente() {
    setErr(null);
    setCatalogMsg(null);
    setBusy("add_cliente");
    try {
      const nombre = newCliente.trim();
      if (!nombre) throw new Error("Nombre de cliente obligatorio.");
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "add_cliente",
        payload: { ...basePayload(), nombre, contacto: newClienteContacto.trim() },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo añadir cliente.");
      setCatalogMsg("Cliente añadido.");
      setNewCliente("");
      setNewClienteContacto("");
      setLastUpdate("Catálogo: añadir cliente");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function importAlbaranesWithFile() {
    setErr(null);
    setBusy("import_alb");
    setAlbRes(null);
    try {
      if (!albFile) throw new Error("Selecciona un Excel.");
      const form = new FormData();
      form.append("op", "import_albaranes");
      form.append(
        "payload",
        JSON.stringify({
          ...basePayload(),
          modo: albModo,
          simular: albSim ? 1 : 0,
          skip: Number(albSkip) || 25,
        })
      );
      form.append("file", albFile);
      const j = await postForm<any>("/api/tools/globalia-stock", form);
      if (!j?.ok) throw new Error(j?.error || "No se pudo importar albaranes.");
      setAlbRes(j);
      setLastUpdate("Importar albaranes (archivo)");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function importAlbaranesWithPath() {
    setErr(null);
    setBusy("import_alb_path");
    setAlbRes(null);
    try {
      if (!albPath.trim()) throw new Error("Indica una ruta de Excel.");
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "import_albaranes",
        payload: {
          ...basePayload(),
          excelPath: albPath.trim(),
          modo: albModo,
          simular: albSim ? 1 : 0,
          skip: Number(albSkip) || 25,
        },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo importar albaranes.");
      setAlbRes(j);
      setLastUpdate("Importar albaranes (ruta fija)");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function importPedidosWithFile() {
    setErr(null);
    setBusy("import_ped");
    setPedRes(null);
    try {
      if (!pedFile) throw new Error("Selecciona un Excel.");
      const form = new FormData();
      form.append("op", "import_pedidos");
      form.append(
        "payload",
        JSON.stringify({
          ...basePayload(),
          simular: pedSim ? 1 : 0,
          skip: Number(pedSkip) || 26,
        })
      );
      form.append("file", pedFile);
      const j = await postForm<any>("/api/tools/globalia-stock", form);
      if (!j?.ok) throw new Error(j?.error || "No se pudo importar pedidos.");
      setPedRes(j);
      setLastUpdate("Importar pedidos (archivo)");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function importPedidosWithPath() {
    setErr(null);
    setBusy("import_ped_path");
    setPedRes(null);
    try {
      if (!pedPath.trim()) throw new Error("Indica una ruta de Excel.");
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "import_pedidos",
        payload: {
          ...basePayload(),
          excelPath: pedPath.trim(),
          simular: pedSim ? 1 : 0,
          skip: Number(pedSkip) || 26,
        },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo importar pedidos.");
      setPedRes(j);
      setLastUpdate("Importar pedidos (ruta fija)");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function listBackups(skipLastUpdate = false) {
    setErr(null);
    setBackupMsg(null);
    setBusy("backup_list");
    try {
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "backup_list",
        payload: basePayload(),
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo listar backups.");
      setBackupFiles(j?.files || []);
      setBackupDirInfo(j?.dir || "");
      if (!skipLastUpdate) setLastUpdate("Backups: listar");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function createBackup() {
    setErr(null);
    setBackupMsg(null);
    setBusy("backup_create");
    try {
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "backup_create",
        payload: basePayload(),
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo crear backup.");
      setBackupMsg("Backup creado.");
      setLastUpdate("Backup creado");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    setErr(null);
    setBackupMsg(null);
    setBusy("backup_restore");
    try {
      if (!backupSel) throw new Error("Selecciona un backup.");
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "backup_restore",
        payload: { ...basePayload(), name: backupSel },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo restaurar backup.");
      setBackupMsg(`Restaurado: ${backupSel}`);
      setLastUpdate("Backup restaurado");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadManualActual() {
    setErr(null);
    setManualMsg(null);
    setBusy("manual_actual");
    try {
      const model = manualModel.trim().toUpperCase();
      const talla = manualTalla.trim();
      if (!model || !talla) throw new Error("Modelo y talla son obligatorios.");

      setStockModelUi(model);
      setStockTallaUi("");
      setStockTallasOpt([]);
      setStockTallasLoading(false);

      if (preview && preview.ok) {
        const mcol = preview.columns.find((c) => normCol(c) === "MODELO") || "MODELO";
        const tcol = preview.columns.find((c) => normCol(c) === "TALLA") || "TALLA";
        const scol =
          preview.columns.find((c) => normCol(c) === "STOCK") ||
          preview.columns.find((c) => normCol(c) === "STOCK_ESTIMADO") ||
          "STOCK";

        const found = preview.rows.find(
          (r: any) =>
            String(r?.[mcol] ?? "").trim().toUpperCase() === model &&
            String(r?.[tcol] ?? "").trim().toUpperCase() === talla.trim().toUpperCase()
        );
        if (found) {
          setManualActual(String(found?.[scol] ?? ""));
          setManualNuevo(String(found?.[scol] ?? ""));
          return;
        }
      }

      const j = await postJson<PreviewResp>("/api/tools/globalia-stock", {
        op: "preview_stock",
        payload: { ...basePayload(), limit: 10, modelo: model, talla: talla },
      });
      if (j.ok && j.rows && j.rows.length) {
        const stockCol =
          j.columns.find((c) => normCol(c) === "STOCK") ||
          j.columns.find((c) => normCol(c) === "STOCK_ESTIMADO") ||
          "STOCK";
        const val = j.rows[0]?.[stockCol];
        setManualActual(String(val ?? ""));
        setManualNuevo(String(val ?? ""));
      } else {
        setManualActual("0");
        setManualNuevo("0");
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function applyManualAdjust() {
    setErr(null);
    setManualMsg(null);
    setBusy("manual_apply");
    try {
      const model = manualModel.trim().toUpperCase();
      const talla = manualTalla.trim();
      const antes = Number(manualActual);
      const despues = Number(manualNuevo);
      if (!model || !talla) throw new Error("Modelo y talla son obligatorios.");
      if (!Number.isFinite(antes) || !Number.isFinite(despues)) throw new Error("Stock inválido.");

      const cambios = [
        {
          modelo: model,
          talla,
          antes: antes,
          despues: despues,
          delta: Number(despues) - Number(antes),
          observacion: manualObs.trim(),
        },
      ];
      const payloadJson = JSON.stringify({ cambios });
      const j = await postJson<any>("/api/tools/globalia-stock", {
        op: "audit_apply",
        payload: { ...basePayload(), payloadJson },
      });
      if (!j?.ok) throw new Error(j?.error || "No se pudo aplicar el ajuste.");
      setManualMsg(`Ajuste aplicado. Registros modificados: ${j?.updated ?? 1}`);
      setLastUpdate("Ajuste manual de stock");
      await refreshActiveTab();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  const missingRequired = !hasRequiredPaths(paths);
  return (
    <div className="min-h-[calc(100vh-64px)] rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-slate-400">
            HERRAMIENTAS · ALMACÉN
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-slate-300">Globalia Stock</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100 md:text-xl">Globalia Stock</h1>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-200">
              parser/pack
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Gestion de STOCK actual, control de entradas y salidas, Prevision de STOCK y ordenes de corte, volcado automatico albaranes y pedidos, Backup y Exportacion de Excel.
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2">
          {lastUpdate ? (
            <div className="hidden min-w-[320px] rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-200 lg:block lg:min-w-[380px]">
              <div className="font-semibold text-slate-100">Última actualización</div>
              <div className="text-slate-300">{lastUpdate.whenHuman}</div>
              <div className="text-slate-400">{lastUpdate.action}</div>
            </div>
          ) : null}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800/60"
          >
            ← Volver
          </Link>
        </div>
      </div>

      {lastUpdate ? (
        <div className="mb-4 block min-w-[300px] rounded-xl border border-slate-800/60 bg-slate-900/30 px-4 py-3 text-sm text-slate-200 lg:hidden">
          <div className="font-semibold text-slate-100">Última actualización</div>
          <div className="text-slate-300">{lastUpdate.whenHuman}</div>
          <div className="text-slate-400">{lastUpdate.action}</div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mb-4 rounded-2xl border border-slate-800/60 bg-slate-900/30 p-2">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cx(
                  "group rounded-xl border px-3 py-2 text-left text-sm transition",
                  active
                    ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-100"
                    : "border-slate-800/60 bg-slate-950/20 text-slate-200 hover:bg-slate-800/40"
                )}
              >
                <div className="font-medium">{t.label}</div>
                {t.sub ? (
                  <div className={cx("text-[11px]", active ? "text-emerald-200/80" : "text-slate-400")}>{t.sub}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global error */}
      {err ? (
        <div className="mb-4">
          <ErrorBox title="Error" detail={err} />
        </div>
      ) : null}

       {/* ===== Streamlit-like: Rutas + Status (contraído) ===== */}
      <details className="group mb-4 rounded-2xl border border-slate-800/60 bg-slate-900/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 transition hover:bg-slate-800/30">
          <div>
            <div className="text-sm font-semibold text-slate-100">Rutas & Configuración</div>
            <div className="text-xs text-slate-400">Solo se toca una vez · Persisten en este navegador</div>
          </div>

          <div className="flex items-center gap-2">
            {missingRequired ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200">
                ⚠️ incompleto
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                ✓ OK
              </span>
            )}
            <span className="text-slate-400 transition group-open:rotate-180">▾</span>
          </div>
        </summary>

        <div className="border-t border-slate-800/60 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Panel izquierda: inputs + acciones */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/15 p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-100">Rutas (persisten en este navegador)</div>
                <div className="mt-1 text-xs text-slate-400">
                  Si no quieres depender de <span className="font-medium text-slate-300">NEXT_PUBLIC_*</span>, rellena aquí una
                  vez y listo. Se guarda en <span className="font-medium text-slate-300">localStorage</span>.
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">
                  <Label>Inventario (datos_almacen.json)</Label>
                  <Input
                    value={paths.inv}
                    onChange={(v) => setPaths((p) => ({ ...p, inv: v }))}
                    placeholder="C:/.../datos_almacen.json o /data/.../datos_almacen.json"
                    disabled={!!busy}
                    requiredLike
                  />
                </label>

                <label className="text-sm">
                  <Label>Previsión (prevision.json)</Label>
                  <Input
                    value={paths.prev}
                    onChange={(v) => setPaths((p) => ({ ...p, prev: v }))}
                    placeholder="C:/.../prevision.json"
                    disabled={!!busy}
                    requiredLike
                  />
                </label>

                <label className="text-sm">
                  <Label>Talleres (talleres.json)</Label>
                  <Input
                    value={paths.talleres}
                    onChange={(v) => setPaths((p) => ({ ...p, talleres: v }))}
                    placeholder="C:/.../talleres.json"
                    disabled={!!busy}
                    requiredLike
                  />
                </label>

                <label className="text-sm">
                  <Label>Clientes (clientes.json)</Label>
                  <Input
                    value={paths.clientes}
                    onChange={(v) => setPaths((p) => ({ ...p, clientes: v }))}
                    placeholder="C:/.../clientes.json"
                    disabled={!!busy}
                    requiredLike
                  />
                </label>

                <label className="text-sm">
                  <Label>EXPORT_DIR (opcional)</Label>
                  <Input
                    value={paths.exportDir}
                    onChange={(v) => setPaths((p) => ({ ...p, exportDir: v }))}
                    placeholder="C:/.../EXPORTAR_CSV"
                    disabled={!!busy}
                  />
                </label>

                <label className="text-sm">
                  <Label>BACKUP_DIR (opcional)</Label>
                  <Input
                    value={paths.backupDir}
                    onChange={(v) => setPaths((p) => ({ ...p, backupDir: v }))}
                    placeholder="C:/.../backups"
                    disabled={!!busy}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={doStatus}
                  disabled={!!busy}
                  className={cx(busy === "status" && "opacity-60")}
                >
                  {busy === "status" ? "Cargando…" : "Status"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={doDownloadCsvPack}
                  disabled={!!busy}
                  title="Genera y descarga el pack de CSV en ZIP"
                  className={cx(busy === "csv" && "opacity-60")}
                >
                  {busy === "csv" ? "Generando…" : "Descargar CSV pack"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={doDownloadExcelPack}
                  disabled={!!busy}
                  title="ZIP del export dir (y cuando portemos el IMPRIMIR, traerá los Excels con colores)"
                  className={cx(busy === "excel" && "opacity-60")}
                >
                  {busy === "excel" ? "Generando…" : "Descargar Excel pack"}
                </Button>

                {missingRequired ? (
                  <div className="ml-1 inline-flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                    <span className="font-semibold">⚠️</span>
                    <span>Falta alguna ruta obligatoria (inv/prev/talleres/clientes).</span>
                  </div>
                ) : (
                  <div className="ml-1 inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    <span className="font-semibold">✓</span>
                    <span>Rutas mínimas OK</span>
                  </div>
                )}
              </div>
            </div>

            {/* Panel derecha: status paths/existencia */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/15 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-100">Rutas y existencia (backend)</div>

              {!status ? (
                <div className="text-sm text-slate-400">Pulsa “Status” para cargar.</div>
              ) : status.ok === false ? (
                <ErrorBox title={status.error} detail={status.detail} />
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/20 px-3 py-2">
                    <span className="text-slate-400">Modelos en inventario</span>
                    <span className="font-semibold text-slate-100">{status.num_modelos}</span>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(status.paths).map(([k, v]) => {
                      const exists = status.exists?.[k] ?? true;
                      const isMain = ["inv", "prev", "talleres", "clientes"].includes(k);
                      return (
                        <div
                          key={k}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-800/60 bg-slate-950/15 p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100">{k}</div>
                            <div className="break-all text-xs text-slate-400">{v || "—"}</div>
                          </div>
                          <div className="pt-0.5">{isMain ? <BoolPill ok={!!exists} /> : null}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-slate-400">
                    Si alguno sale <span className="font-medium text-slate-200">NO</span>, revisa paths o el .env del server.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </details>



      {/* ===== Contenido por tabs (mismo mental model que Streamlit) ===== */}
      {activeTab === "stock" ? (
        <div className="space-y-4">
          {/* Preview (ancho completo) */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Preview Stock</div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <label className="text-sm lg:col-span-2">
                <Label>
                  Modelo {loadingModelos ? <span className="text-xs text-slate-500">· cargando…</span> : null}
                </Label>
                {modelosOpt.length ? (
                  <select
                    value={modelo}
                    onChange={(e) =>
                      updateFilterModel(
                        e.target.value,
                        setModelo,
                        setTalla,
                        setTallasOpt,
                        setLoadingTallas
                      )
                    }
                    disabled={!!busy}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                  >
                    <option value="">(todos)</option>
                    {modelosOpt.map((it, idx) => (
                      <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                        {modelLabel(it)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    list="globalia-modelos"
                    placeholder="Ej: ABC123"
                    disabled={!!busy}
                    className={cx(
                      "w-full rounded-lg border bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition",
                      "border-slate-700/60 placeholder:text-slate-500",
                      "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15",
                      "tabular-nums"
                    )}
                  />
                )}

                <div className="mt-1 text-[11px] text-slate-500">Tip: Doble click para listar modelos disponibles o escribe y Tab/Enter. Si no salen opciones, pulsa “Status”.</div>
              </label>

              <label className="text-sm">
                <Label>
                  Talla {loadingTallas ? <span className="text-xs text-slate-500">· cargando…</span> : null}
                </Label>
                {tallasOpt.length ? (
                  <select
                    value={talla}
                    onChange={(e) => setTalla(e.target.value)}
                    disabled={!!busy}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                  >
                    <option value="">(todas)</option>
                    {tallasOpt.map((t, idx) => (
                      <option key={`${t}__${idx}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={talla}
                    onChange={(e) => setTalla(e.target.value)}
                    list="globalia-tallas"
                    placeholder="Ej: M / 42 / U"
                    disabled={!!busy}
                    className={cx(
                      "w-full rounded-lg border bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition",
                      "border-slate-700/60 placeholder:text-slate-500",
                      "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15",
                      "tabular-nums"
                    )}
                  />
                )}
              </label>



              <label className="text-sm">
                <Label>Límite</Label>
                <Input
                  value={String(limit)}
                  onChange={(v) => setLimit(Number(v || 0))}
                  type="number"
                  disabled={!!busy}
                  className="tabular-nums"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={doPreview} disabled={!!busy}>
                {busy === "preview" ? "Cargando…" : "Cargar preview"}
              </Button>
            </div>


              {/* Filtros (solo frontend) */}
              <div className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Filtros</div>

                  {preview && preview.ok ? (
                    <div className="text-xs text-slate-400">
                      Filas: <span className="font-semibold text-slate-100">{filteredRows.length}</span>
                      <span className="mx-2 text-slate-600">/</span>
                      Total: <span className="font-semibold text-slate-100">{preview.rows.length}</span>
                    </div>
                  ) : null}
                </div>

                {/* fila 1 */}
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <Label>Modelo</Label>
                    {modelosOpt.length ? (
                      <select
                        value={stockModelUi}
                        onChange={(e) =>
                          updateFilterModel(
                            e.target.value,
                            setStockModelUi,
                            setStockTallaUi,
                            setStockTallasOpt,
                            setStockTallasLoading
                          )
                        }
                        disabled={!!busy}
                        className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                      >
                        <option value="">(todos)</option>
                        {modelosOpt.map((it, idx) => (
                          <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                            {modelLabel(it)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={stockModelUi}
                        onChange={(e) => setStockModelUi(e.target.value)}
                        list="globalia-modelos"
                        placeholder="(todos) · escribe para buscar…"
                        disabled={!!busy}
                        className={cx(
                          "w-full rounded-lg border bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition",
                          "border-slate-700/60 placeholder:text-slate-500",
                          "focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                        )}
                      />
                    )}
                  </div>

                  <div className="lg:col-span-3">
                    <Label>
                      Talla {stockTallasLoading ? <span className="text-xs text-slate-500">· cargando…</span> : null}
                    </Label>
                    {stockTallasOpt.length ? (
                      <select
                        value={stockTallaUi}
                        onChange={(e) => setStockTallaUi(e.target.value)}
                        disabled={!!busy}
                        className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                      >
                        <option value="">(todas)</option>
                        {stockTallasOpt.map((t, idx) => (
                          <option key={`${t}__${idx}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={stockTallaUi}
                        onChange={setStockTallaUi}
                        placeholder="(todas)"
                        disabled={!!busy}
                      />
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <Label>Rango stock</Label>
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value as any)}
                      disabled={!!busy}
                      className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                    >
                      <option value="ALL">Todos</option>
                      <option value="LE0">≤ 0</option>
                      <option value="LE10">1..10</option>
                      <option value="LE25">11..25</option>
                      <option value="GT25">&gt; 25</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <Label>Solo negativos</Label>
                    <button
                      type="button"
                      onClick={() => setOnlyNeg((v) => !v)}
                      disabled={!!busy}
                      className={cx(
                        "w-full rounded-lg border px-3 py-2 text-sm font-medium transition",
                        onlyNeg
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                          : "border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60"
                      )}
                    >
                      {onlyNeg ? "Activado" : "Desactivado"}
                    </button>
                  </div>
                </div>

                {/* fila 2 */}
                <div className="mt-3 grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-3">
                    <Label>Columna</Label>
                    <select
                      value={colFilterKey}
                      onChange={(e) => setColFilterKey(e.target.value)}
                      disabled={!!busy || !preview || preview.ok === false}
                      className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                    >
                      <option value="">(ninguna)</option>
                      {preview && preview.ok ? preview.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      )) : null}
                    </select>
                  </div>

                  <div className="lg:col-span-7">
                    <Label>Valor contiene</Label>
                    <Input
                      value={colFilterVal}
                      onChange={setColFilterVal}
                      placeholder="Ej: 42 / ROJO / 2025-02"
                      disabled={!!busy || !colFilterKey}
                    />
                  </div>

                  <div className="lg:col-span-2 flex items-end justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setStockModelUi("");
                        setStockTallaUi("");
                        setStockTallasOpt([]);
                        setStockTallasLoading(false);
                        setOnlyNeg(false);
                        setRange("ALL");
                        setColFilterKey("");
                        setColFilterVal("");
                      }}

                      disabled={!!busy}
                      className="w-full lg:w-auto"
                    >
                      Reset filtros
                    </Button>
                  </div>
                </div>
              </div>



          {preview && preview.ok === false ? (
            <div className="mt-3">
              <ErrorBox title={preview.error} detail={preview.detail} />
            </div>
          ) : null}

            </div>




          {/* Tabla stock */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Tabla (Stock)</div>
                <div className="mt-1 text-xs text-slate-400">
                  Nota: resaltamos stock negativo en rojo (igual que la vida real: duele).
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={!!busy}>
                  Limpiar
                </Button>
              </div>
            </div>

            {!preview ? (
              <div className="text-sm text-slate-400">Carga un preview para ver datos.</div>
            ) : preview.ok === false ? (
              <div className="text-sm text-slate-400">No hay datos por error.</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-sm text-slate-400">Sin filas (filtros muy estrictos o inventario vacío).</div>
            ) : (
              <>
                {preview && preview.ok ? (
                  <details className="mb-3 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">Columnas visibles</summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {preview.columns.map((c) => {
                        const on = !hiddenCols.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              setHiddenCols((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                            }
                            className={cx(
                              "rounded-full border px-3 py-1 text-xs transition",
                              on
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-700/60 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                            )}
                          >
                            {c}
                          </button>
                        );
                      })}
                      <div className="w-full" />
                        <Button variant="ghost" onClick={() => setHiddenCols([])} disabled={!!busy}>
                          Mostrar todas
                        </Button>
                        <Button variant="ghost" onClick={() => setHiddenCols(preview.columns)} disabled={!!busy}>
                          Ocultar todas
                        </Button>

                    </div>
                  </details>
                ) : null}

                <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/20">
                  <table className="min-w-[1000px] w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur">
                      <tr>
                        {colsToShow.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap border-b border-slate-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, idx) => {
                        const stockCol =
                          preview.columns.find((c) => normCol(c) === "STOCK") ||
                          preview.columns.find((c) => normCol(c) === "STOCK_ESTIMADO") ||
                          preview.columns[0];

                        const q = toNum(row[stockCol]) ?? 0;
                        const rowSemaforo = stockSemaforoBg(q);
                        const modelCol =
                          preview.columns.find((c) => normCol(c) === "MODELO") ||
                          preview.columns.find((c) => normCol(c) === "MODEL") ||
                          "MODELO";
                        const tallaCol =
                          preview.columns.find((c) => normCol(c) === "TALLA") ||
                          preview.columns.find((c) => normCol(c) === "SIZE") ||
                          "TALLA";
                        const modelVal = String(row[modelCol] ?? "").trim().toUpperCase();
                        const tallaVal = String(row[tallaCol] ?? "").trim().toUpperCase();
                        const rowKey = modelVal && tallaVal ? `${modelVal}__${tallaVal}` : "";
                        const isSelected = !!rowKey && rowKey === stockSelectedKey;
                        const isManualRow =
                          manualModel.trim() &&
                          manualTalla.trim() &&
                          modelVal === manualModel.trim().toUpperCase() &&
                          tallaVal === manualTalla.trim().toUpperCase();

                        return (
                          <tr
                            key={idx}
                            onClick={async () => {
                              if (!rowKey) return;
                              setStockSelectedKey(rowKey);
                              await updateManualModel(
                                modelVal,
                                setManualModel,
                                setManualTalla,
                                setManualTallasOpt,
                                setManualTallasLoading
                              );
                              setManualTalla(tallaVal);
                            }}
                            className={cx(
                              "cursor-pointer border-b border-slate-800/50 transition last:border-b-0 hover:bg-emerald-500/10",
                              idx % 2 === 0 ? "bg-slate-950/10" : "bg-slate-950/0",
                              rowSemaforo,
                              isManualRow ? "ring-1 ring-emerald-400/40 bg-emerald-500/10" : null,
                              isSelected ? "bg-emerald-500/15 ring-1 ring-emerald-500/40" : null
                            )}
                          >
                            {colsToShow.map((c) => {
                              const cell = row[c];
                              const nc = normCol(c);
                              const isStockCol = nc === "STOCK" || nc === "STOCK_ESTIMADO";
                              const qCell = isStockCol ? toNum(cell) ?? 0 : null;

                              return (
                                <td
                                  key={c}
                                  className={cx(
                                    "whitespace-nowrap px-3 py-2 tabular-nums",
                                    rowSemaforo,
                                    isStockCol ? cx("font-semibold", stockSemaforoText(qCell ?? 0)) : "text-slate-200"
                                  )}
                                >
                                  {isStockCol && (qCell ?? 0) < 0 ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="inline-flex h-5 items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 text-xs font-semibold text-rose-100">
                                        NEG
                                      </span>
                                      <span>{String(cell ?? "")}</span>
                                    </span>
                                  ) : (
                                    String(cell ?? "")
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

          </div>

          {/* Saneos rápidos (stock) */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">🧹 Utilidades de saneo de stock</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={fixNegativesToZero} disabled={!!busy}>
                {busy === "fix_neg" ? "Ajustando…" : "Ajustar negativos a 0"}
              </Button>
              <Button variant="secondary" onClick={fixBadStockValues} disabled={!!busy}>
                {busy === "fix_bad" ? "Saneando…" : "Reemplazar NaN/None/no enteros"}
              </Button>
              <Button variant="secondary" onClick={() => purgeBadTallas(true)} disabled={!!busy}>
                {busy === "purge_tallas" ? "Purgando…" : "Purgar tallas anómalas (stock 0)"}
              </Button>
            </div>

            {fixNegRes?.rows?.length ? (
              <div className="mt-3">
                <div className="mb-1 text-xs text-slate-400">Negativos ajustados</div>
                <SimpleTable rows={fixNegRes.rows} />
              </div>
            ) : null}

            {fixBadRes?.rows?.length ? (
              <div className="mt-3">
                <div className="mb-1 text-xs text-slate-400">Valores saneados</div>
                <SimpleTable rows={fixBadRes.rows} />
              </div>
            ) : null}

            {purgeRes?.rows?.length ? (
              <div className="mt-3">
                <div className="mb-1 text-xs text-slate-400">Tallas purgadas</div>
                <SimpleTable rows={purgeRes.rows} />
              </div>
            ) : null}
          </div>

          {/* Ajuste manual de stock */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">✍️ Ajuste manual de stock</div>
            <div className="grid gap-3 lg:grid-cols-12">
              <label className="lg:col-span-4">
                <div className="mb-1 text-xs text-slate-400">Modelo</div>
                {modelosOpt.length ? (
                  <select
                    value={manualModel}
                    onChange={(e) =>
                      updateManualModel(
                        e.target.value,
                        setManualModel,
                        setManualTalla,
                        setManualTallasOpt,
                        setManualTallasLoading
                      )
                    }
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">(elige)</option>
                    {modelosOpt.map((it, idx) => (
                      <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                        {modelLabel(it)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    list="globalia-modelos"
                    placeholder="Ej: ABC123"
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                )}
              </label>
              <label className="lg:col-span-3">
                <div className="mb-1 text-xs text-slate-400">
                  Talla {manualTallasLoading ? <span className="text-xs text-slate-500">· cargando…</span> : null}
                </div>
                {manualTallasOpt.length ? (
                  <select
                    value={manualTalla}
                    onChange={(e) => setManualTalla(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">(elige)</option>
                    {manualTallasOpt.map((t, idx) => (
                      <option key={`${t}__${idx}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={manualTalla}
                    onChange={(e) => setManualTalla(e.target.value)}
                    list="globalia-tallas"
                    placeholder="Ej: 42"
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                  />
                )}
              </label>
              <label className="lg:col-span-2">
                <div className="mb-1 text-xs text-slate-400">Stock actual</div>
                <input
                  value={manualActual}
                  onChange={(e) => setManualActual(e.target.value)}
                  disabled
                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="lg:col-span-3">
                <div className="mb-1 text-xs text-slate-400">Nuevo stock</div>
                <input
                  value={manualNuevo}
                  onChange={(e) => setManualNuevo(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-12">
              <label className="lg:col-span-9">
                <div className="mb-1 text-xs text-slate-400">Observación</div>
                <input
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <div className="lg:col-span-3 flex gap-2">
                <Button variant="secondary" disabled={!!busy} onClick={loadManualActual}>
                  {busy === "manual_actual" ? "Buscando…" : "Buscar actual"}
                </Button>
                <Button variant="primary" disabled={!!busy} onClick={applyManualAdjust}>
                  {busy === "manual_apply" ? "Aplicando…" : "Aplicar ajuste"}
                </Button>
              </div>
            </div>

            {manualMsg ? <InfoBox title="Ajuste manual" detail={manualMsg} /> : null}
          </div>
        </div>

      ) : activeTab === "movimientos" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">Registrar entradas/salidas</div>
                <div className="text-xs text-slate-400">
                  Igual que Streamlit: modelo+talla+cantidad (+taller en entradas; +cliente/pedido/albarán en salidas).
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setMovKind("entry")}
                  variant={movKind === "entry" ? "primary" : "secondary"}
                >
                  ➕ Entrada
                </Button>
                <Button
                  onClick={() => setMovKind("exit")}
                  variant={movKind === "exit" ? "primary" : "secondary"}
                >
                  ➖ Salida
                </Button>
              </div>
            </div>
          </div>

          {!hasRequiredPaths(paths) ? (
            <MissingPathsBox />
          ) : (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-xs text-slate-400">Modelo</div>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={movModelLabel}
                      onChange={(e) => {
                        const model = e.target.value; // ya es el modelo puro
                        setMovModelLabel(model);

                        // al cambiar modelo, cargamos tallas y limpiamos talla actual
                        setMovTalla("");
                        setMovTallaManual("");
                        if (model) loadTallas(model).catch(() => {});
                      }}
                    >
                      <option value="">(elige)</option>
                        {modelosOpt.map((it, idx) => {
                        const label = modelLabel(it);
                        return (
                          <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                            {label}
                          </option>
                        );
                      })}

                    </select>
                    <ModelTip />
                </label>

                <label className="block">
                  <div className="mb-1 text-xs text-slate-400">Fecha (YYYY-MM-DD)</div>
                  <input
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    value={movFecha}
                    onChange={(e) => setMovFecha(e.target.value)}
                    placeholder="2026-01-22"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-slate-400">Talla</div>

                  {tallasOpt.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={movTalla}
                        onChange={(e) => setMovTalla(e.target.value)}
                      >
                        <option value="">(elige)</option>
                        <option value="__manual__">(escribir manual)</option>
                        {tallasOpt.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      {movTalla === "__manual__" ? (
                        <input
                          className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                          value={movTallaManual}
                          onChange={(e) => setMovTallaManual(e.target.value)}
                          placeholder="Escribe talla…"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={movTallaManual}
                      onChange={(e) => setMovTallaManual(e.target.value)}
                      placeholder="Escribe talla…"
                    />
                  )}
                </div>

                <label className="block">
                  <div className="mb-1 text-xs text-slate-400">Cantidad</div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                    value={movCantidad}
                    onChange={(e) => setMovCantidad(e.target.value)}
                  />
                </label>
              </div>


              {movKind === "entry" ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-xs text-slate-400">Taller (opcional)</div>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={movTaller}
                      onChange={(e) => setMovTaller(e.target.value)}
                    >
                      <option value="">(ninguno)</option>
                    {talleresOpt.map((t, idx) => (
                      <option key={`${t}__${idx}`} value={t}>
                        {t}
                      </option>
                    ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-slate-400">Observaciones (opcional)</div>
                    <input
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={movObs}
                      onChange={(e) => setMovObs(e.target.value)}
                      placeholder="..."
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-xs text-slate-400">Cliente (opcional)</div>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={movCliente}
                      onChange={(e) => setMovCliente(e.target.value)}
                    >
                      <option value="">(ninguno)</option>
                      {clientesOpt.map((c, idx) => (
                        <option key={`${c}__${idx}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Pedido</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={movPedido}
                        onChange={(e) => setMovPedido(e.target.value)}
                        placeholder="..."
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Albarán</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={movAlbaran}
                        onChange={(e) => setMovAlbaran(e.target.value)}
                        placeholder="..."
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-slate-400">
                  Consejo: si al volver a este tab no hay modelos, pulsa “Status” arriba (o recarga).
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // refrescar catálogo + tallas del modelo actual
                      loadCatalog().catch(() => {});
                      const m = (movModelLabel || "").trim().toUpperCase();
                      if (m) loadTallas(m).catch(() => {});
                    }}
                    disabled={busy !== null}
                  >
                    🔁 Refrescar
                  </Button>

                  {movKind === "entry" ? (
                    <Button
                      variant="primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setErr(null);
                        try {
                          const model = (movModelLabel || "").trim().toUpperCase();
                          const talla = (movTalla === "__manual__" ? movTallaManual : movTallaManual || movTalla || "").trim();
                          const cant = Number(movCantidad);

                          if (!model || !talla) throw new Error("Modelo y talla son obligatorios.");
                          if (!Number.isFinite(cant) || cant <= 0) throw new Error("Cantidad inválida.");

                          setBusy("entry");
                          const j = await postJson<any>("/api/tools/globalia-stock", {
                            op: "register_entry",
                            payload: {
                              ...basePayload(),
                              modelo: model,
                              talla,
                              cantidad: cant,
                              fecha: movFecha?.trim() || null,
                              taller: movTaller?.trim() || "",
                              proveedor: "",
                              obs: movObs?.trim() || "",
                            },
                          });

                          if (!j?.ok) throw new Error(j?.error || "No se pudo registrar la entrada.");

                          // refresca previews
                          setLastUpdate("Entrada registrada");
                          await refreshActiveTab();
                        } catch (e: any) {
                          setErr(e?.message || String(e));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === "entry" ? "Guardando…" : "Guardar entrada"}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={busy !== null}
                      onClick={async () => {
                        setErr(null);
                        try {
                          const model = (movModelLabel.split("|")[0] || "").trim().toUpperCase();
                          const talla = (movTalla === "__manual__" ? movTallaManual : movTallaManual || movTalla || "").trim();
                          const cant = Number(movCantidad);

                          if (!model || !talla) throw new Error("Modelo y talla son obligatorios.");
                          if (!movPedido.trim() || !movAlbaran.trim())
                            throw new Error("Pedido y albarán son obligatorios.");
                          if (!Number.isFinite(cant) || cant <= 0) throw new Error("Cantidad inválida.");

                          setBusy("exit");
                          const j = await postJson<any>("/api/tools/globalia-stock", {
                            op: "register_exit",
                            payload: {
                              ...basePayload(),
                              modelo: model,
                              talla,
                              cantidad: cant,
                              fecha: movFecha?.trim() || null,
                              cliente: movCliente?.trim() || "",
                              pedido: movPedido.trim(),
                              albaran: movAlbaran.trim(),
                            },
                          });

                          if (!j?.ok) throw new Error(j?.error || "No se pudo registrar la salida.");

                          setLastUpdate("Salida registrada");
                          await refreshActiveTab();
                        } catch (e: any) {
                          setErr(e?.message || String(e));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === "exit" ? "Guardando…" : "Guardar salida"}
                    </Button>
                  )}
                </div>
              </div>

              {err ? <ErrorBox title="Error" detail={err} /> : null}
            </div>
          )}
        </div>

       ) : activeTab === "prevision" ? (
          <div className="space-y-4">
            {!hasRequiredPaths(paths) ? (
              <MissingPathsBox />
            ) : (
              <>
                {/* Cabecera */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Previsión</div>
                      <div className="text-xs text-slate-400">
                        Stock estimado (Real + Fabricación - Pendientes) + Pedidos pendientes + Órdenes de fabricación.
                      </div>
                    </div>
                    <Button variant="primary" onClick={loadPrevisionAll} disabled={busy !== null}>
                      {busy === "prevision" ? "Cargando…" : "Recalcular / Recargar"}
                    </Button>
                  </div>
                </div>

                {/* ================= STOCK ESTIMADO ================= */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">Stock estimado</div>

                  {!estPreview ? (
                    <div className="text-sm text-slate-400">Pulsa “Recalcular / Recargar”.</div>
                  ) : estPreview.ok === false ? (
                    <ErrorBox title={estPreview.error} detail={estPreview.detail} />
                  ) : (
                    <>
                    <TableFilterPanel
                      title="Filtros"
                      preview={estPreview}
                      busyDisabled={!!busy}

                      model={estModelUi}
                      setModel={setEstModelUi}
                      talla={estTallaUi}
                      setTalla={setEstTallaUi}
                      modelosOpt={modelosOpt}
                      tallasOpt={estTallasOpt}
                      tallasLoading={estTallasLoading}
                      onModelChange={(val) =>
                        updateFilterModel(val, setEstModelUi, setEstTallaUi, setEstTallasOpt, setEstTallasLoading)
                      }

                      colKey={estColKey}
                      setColKey={setEstColKey}
                      colVal={estColVal}
                      setColVal={setEstColVal}

                      sortKey={estSortKey}
                      sortDir={estSortDir}
                      totalRows={estPreview.rows.length}
                      filteredCount={filteredEstRows.length}
                      onReset={() => {
                        setEstModelUi("");
                        setEstTallaUi("");
                        setEstTallasOpt([]);
                        setEstColKey("");
                        setEstColVal("");
                        setEstSortKey("");
                        setEstSortDir("asc");
                      }}
                    
                    />


                      <div className="rounded-xl border border-slate-800/60 bg-slate-950/20">
                        <div className="max-h-[420px] overflow-auto">
                          <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-slate-950/80 backdrop-blur">
                              <tr>
                                {estPreview.columns.map((c) => (
                                  <th
                                    key={c}
                                    onClick={() => {
                                      if (estSortKey === c) setEstSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                      else { setEstSortKey(c); setEstSortDir("asc"); }
                                    }}
                                    className="cursor-pointer select-none whitespace-nowrap border-b border-slate-800/60 px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100"
                                  >
                                    {c}{estSortKey === c ? (estSortDir === "asc" ? " ▲" : " ▼") : ""}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredEstRows.map((r, i) => {
                                const stockCol =
                                  estPreview.columns.find((c) => normCol(c) === "STOCK_ESTIMADO") ||
                                  estPreview.columns.find((c) => normCol(c) === "STOCK") ||
                                  "stock_estimado";

                                const q = toNum((r as any)[stockCol]) ?? 0;
                                const rowBg = stockSemaforoBg(q);

                                return (
                                  <tr key={i} className={cx("border-b border-slate-900/40", rowBg)}>
                                    {estPreview.columns.map((c) => {
                                      const isStock = normCol(c) === normCol(stockCol);
                                      const cell = (r as any)[c];
                                      return (
                                        <td
                                          key={c}
                                          className={cx(
                                            "whitespace-nowrap px-3 py-2 tabular-nums",
                                            isStock ? cx("font-semibold", stockSemaforoText(q)) : "text-slate-200"
                                          )}
                                        >
                                          {String(cell ?? "")}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ================= PEDIDOS PENDIENTES ================= */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">Pedidos pendientes</div>

                  {!pendPreview ? (
                    <div className="text-sm text-slate-400">Pulsa “Recalcular / Recargar”.</div>
                  ) : pendPreview.ok === false ? (
                    <ErrorBox title={pendPreview.error} detail={pendPreview.detail} />
                  ) : (
                    <>
                      <TableFilterPanel
                        title="Filtros"
                        preview={pendPreview}
                        busyDisabled={!!busy}

                        model={pendModelUi}
                        setModel={setPendModelUi}
                        talla={pendTallaUi}
                        setTalla={setPendTallaUi}
                        modelosOpt={modelosOpt}
                        tallasOpt={pendTallasOpt}
                        tallasLoading={pendTallasLoading}
                        onModelChange={(val) =>
                          updateFilterModel(val, setPendModelUi, setPendTallaUi, setPendTallasOpt, setPendTallasLoading)
                        }

                        colKey={pendColKey}
                        setColKey={setPendColKey}
                        colVal={pendColVal}
                        setColVal={setPendColVal}

                        sortKey={pendSortKey}
                        sortDir={pendSortDir}

                        totalRows={pendPreview.rows.length}
                        filteredCount={filteredPendRows.length}
                        onReset={() => {
                          setPendModelUi("");
                          setPendTallaUi("");
                          setPendTallasOpt([]);
                          setPendColKey("");
                          setPendColVal("");
                          setPendSortKey("");
                          setPendSortDir("asc");
                        }}
                      />


                      <div className="rounded-xl border border-slate-800/60 bg-slate-950/20">
                        <div className="max-h-[420px] overflow-auto">
                          <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-slate-950/80 backdrop-blur">
                              <tr>
                                {pendPreview.columns.map((c) => (
                                  <th
                                    key={c}
                                    onClick={() => {
                                      if (pendSortKey === c) setPendSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                      else { setPendSortKey(c); setPendSortDir("asc"); }
                                    }}
                                    className="cursor-pointer select-none whitespace-nowrap border-b border-slate-800/60 px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100"
                                  >
                                    {c}{pendSortKey === c ? (pendSortDir === "asc" ? " ▲" : " ▼") : ""}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredPendRows.map((r, i) => {
                                const idx = String((r as any)["IDX"] ?? "");
                                const isSelected = !!idx && idx === pendingSelectedIdx;
                                const sem = pendingMonthSemaforoInfo((r as any)["FECHA"]);
                                return (
                                  <tr
                                    key={i}
                                    onClick={() => idx && setPEditIdx(idx)}
                                    className={cx(
                                      "border-b border-slate-900/40 transition hover:bg-emerald-500/10",
                                      sem.bgClass,
                                      isSelected && "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                                    )}
                                  >
                                    {pendPreview.columns.map((c) => (
                                      <td
                                        key={c}
                                        className={cx(
                                          "whitespace-nowrap px-3 py-2 tabular-nums text-slate-200",
                                          sem.textClass
                                        )}
                                      >
                                        {String((r as any)[c] ?? "")}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* Añadir pendiente */}
                      <details className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-100">➕ Añadir pendiente</summary>

                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Modelo</div>
                              <select
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={pAddModel}
                                onChange={(e) => {
                                  setPAddTallaManual("");
                                  updateFilterModel(
                                    e.target.value,
                                    setPAddModel,
                                    setPAddTalla,
                                    setPAddTallasOpt,
                                    setPAddTallasLoading
                                  );
                                }}
                              >
                                <option value="">(elige)</option>
                                {modelosOpt.map((it, idx) => (
                                  <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                                    {modelLabel(it)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Talla</div>
                              <div className="grid gap-2 lg:grid-cols-2">
                                {pAddTallasOpt.length ? (
                                  <select
                                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                    value={pAddTalla}
                                    onChange={(e) => setPAddTalla(e.target.value)}
                                    disabled={pAddTallasLoading}
                                  >
                                    <option value="">(elige)</option>
                                    {pAddTallasOpt.map((t, idx) => (
                                      <option key={`${t}__${idx}`} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                    value={pAddTalla}
                                    onChange={(e) => setPAddTalla(e.target.value)}
                                    placeholder="Ej: 40"
                                  />
                                )}

                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pAddTallaManual}
                                  onChange={(e) => setPAddTallaManual(e.target.value)}
                                  placeholder="Talla manual (opcional)"
                                />
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                Si escribes talla manual, se usarÃ¡ esa (y quedarÃ¡ registrada para el modelo).
                              </div>
                            </label>

                          <label className="block">
                            <div className="mb-1 text-xs text-slate-400">Cantidad</div>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                              value={pAddCantidad}
                              onChange={(e) => setPAddCantidad(e.target.value)}
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs text-slate-400">Fecha (YYYY-MM-DD)</div>
                            <input
                              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                              value={pAddFecha}
                              onChange={(e) => setPAddFecha(e.target.value)}
                              placeholder="2026-01-22"
                            />
                          </label>

                          <label className="block lg:col-span-2">
                            <div className="mb-1 text-xs text-slate-400">Cliente</div>
                            <select
                              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                              value={pAddCliente}
                              onChange={(e) => setPAddCliente(e.target.value)}
                            >
                              <option value="">(elige)</option>
                              {clientesOpt.map((c, idx) => (
                                <option key={`${c}__${idx}`} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs text-slate-400">Pedido</div>
                            <input
                              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                              value={pAddPedido}
                              onChange={(e) => setPAddPedido(e.target.value)}
                              placeholder="Ej: 00822/2025"
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs text-slate-400">Número pedido (opcional)</div>
                            <input
                              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                              value={pAddNumeroPedido}
                              onChange={(e) => setPAddNumeroPedido(e.target.value)}
                              placeholder="Ej: 24841"
                            />
                          </label>

                          <div className="lg:col-span-2 flex gap-2">
                            <Button variant="primary" disabled={busy !== null} onClick={addPending}>
                              {busy === "pending_add" ? "Guardando…" : "Añadir"}
                            </Button>
                          </div>
                        </div>
                      </details>

                      {/* Editar / Eliminar */}
                      <details className="mt-3 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-100">✏️ Editar / 🗑️ Eliminar pedidos pendientes</summary>

                        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {/* Editar */}
                          <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3">
                            <div className="text-sm font-semibold text-slate-100">Editar por IDX</div>

                            <div className="mt-2">
                              <div className="mb-1 text-xs text-slate-400">Selecciona pedido a editar</div>
                              <select
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={pEditIdx}
                                onChange={(e) => setPEditIdx(e.target.value)}
                              >
                                <option value="">(elige)</option>
                                {pendPreview?.ok
                                  ? pendPreview.rows.map((r: any, idx: number) => (
                                      <option key={idx} value={String(r["IDX"] ?? "")}>
                                        {`${r["IDX"]} | ${r["MODELO"]} | T:${r["TALLA"]} | Q:${r["CANTIDAD"]} | Ped:${r["PEDIDO"]} | Nº:${r["NUMERO_PEDIDO"]} | ${r["CLIENTE"]} | ${String(r["FECHA"] ?? "").slice(0, 10)}`}
                                      </option>
                                    ))
                                  : null}
                              </select>
                              {pendingSelectedRow ? (
                                <div className="mt-3">
                                  <div className="mb-1 text-xs text-slate-400">Unidades actuales</div>
                                  <input
                                    readOnly
                                    className="w-full rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
                                    value={String((pendingSelectedRow as any)["CANTIDAD"] ?? "")}
                                  />
                                </div>
                              ) : (
                                <div className="mt-3 text-xs text-slate-500">
                                  Selecciona un pedido para ver unidades actuales.
                                </div>
                              )}
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3">
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">MODELO</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditModel}
                                  onChange={(e) => setPEditModel(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">TALLA</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditTalla}
                                  onChange={(e) => setPEditTalla(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">CANTIDAD</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditCantidad}
                                  onChange={(e) => setPEditCantidad(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">PEDIDO</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditPedido}
                                  onChange={(e) => setPEditPedido(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">NUMERO_PEDIDO</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditNumeroPedido}
                                  onChange={(e) => setPEditNumeroPedido(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">CLIENTE</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditCliente}
                                  onChange={(e) => setPEditCliente(e.target.value)}
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs text-slate-400">FECHA</div>
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={pEditFecha}
                                  onChange={(e) => setPEditFecha(e.target.value)}
                                  placeholder="YYYY-MM-DD"
                                />
                              </label>
                            </div>

                            <div className="mt-3">
                              <Button variant="primary" disabled={busy !== null} onClick={editPending}>
                                {busy === "pending_edit" ? "Aplicando…" : "Aplicar cambios"}
                              </Button>
                            </div>
                          </div>

                          {/* Eliminar */}
                          <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3">
                            <div className="text-sm font-semibold text-slate-100">Eliminar por IDX</div>

                            <div className="mt-2">
                              <div className="mb-1 text-xs text-slate-400">Selecciona pedido a eliminar</div>
                              <select
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={pDelIdx}
                                onChange={(e) => setPDelIdx(e.target.value)}
                              >
                                <option value="">(elige)</option>
                                {pendPreview?.ok
                                  ? pendPreview.rows.map((r: any, idx: number) => (
                                      <option key={idx} value={String(r["IDX"] ?? "")}>
                                        {`${r["IDX"]} | ${r["MODELO"]} | T:${r["TALLA"]} | Q:${r["CANTIDAD"]} | ${r["CLIENTE"]}`}
                                      </option>
                                    ))
                                  : null}
                              </select>
                            </div>

                            <div className="mt-3">
                              <Button variant="secondary" disabled={busy !== null} onClick={deletePending}>
                                {busy === "pending_del" ? "Eliminando…" : "Eliminar"}
                              </Button>
                            </div>

                            <div className="mt-2 text-xs text-slate-400">
                              Nota: esto borra del JSON (como Streamlit). Sin “undo”, así que ojo.
                            </div>
                          </div>
                        </div>
                      </details>
                    </>
                  )}
                </div>

                {/* ================= FABRICACIÓN ================= */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">Órdenes de fabricación</div>

                  {!fabPreview ? (
                    <div className="text-sm text-slate-400">Pulsa “Recalcular / Recargar”.</div>
                  ) : fabPreview.ok === false ? (
                    <ErrorBox title={fabPreview.error} detail={fabPreview.detail} />
                  ) : (
                    <>
                      <TableFilterPanel
                        title="Filtros"
                        preview={fabPreview}
                        busyDisabled={!!busy}

                        model={fabModelUi}
                        setModel={setFabModelUi}
                        talla={fabTallaUi}
                        setTalla={setFabTallaUi}
                        modelosOpt={modelosOpt}
                        tallasOpt={fabTallasOpt}
                        tallasLoading={fabTallasLoading}
                        onModelChange={(val) =>
                          updateFilterModel(val, setFabModelUi, setFabTallaUi, setFabTallasOpt, setFabTallasLoading)
                        }

                        colKey={fabColKey}
                        setColKey={setFabColKey}
                        colVal={fabColVal}
                        setColVal={setFabColVal}

                        sortKey={fabSortKey}
                        sortDir={fabSortDir}

                        totalRows={fabPreview.rows.length}
                        filteredCount={filteredFabRows.length}
                        onReset={() => {
                          setFabModelUi("");
                          setFabTallaUi("");
                          setFabTallasOpt([]);
                          setFabColKey("");
                          setFabColVal("");
                          setFabSortKey("");
                          setFabSortDir("asc");
                        }}
                      />

                      <div className="rounded-xl border border-slate-800/60 bg-slate-950/20">
                        <div className="max-h-[420px] overflow-auto">
                          <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-slate-950/80 backdrop-blur">
                              <tr>
                                {fabPreview.columns.map((c) => (
                                  <th
                                    key={c}
                                    onClick={() => {
                                      if (fabSortKey === c) setFabSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                      else { setFabSortKey(c); setFabSortDir("asc"); }
                                    }}
                                    className="cursor-pointer select-none whitespace-nowrap border-b border-slate-800/60 px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100"
                                  >
                                    {c}{fabSortKey === c ? (fabSortDir === "asc" ? " ▲" : " ▼") : ""}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const map = new Map<string, number>();
                                let idx = 0;
                                return filteredFabRows.map((r, i) => {
                                  const key = fabGroupKey(r);
                                  if (!map.has(key)) map.set(key, idx++);
                                  const rowIdx = String((r as any)["IDX"] ?? "");
                                  const isSelected = !!rowIdx && rowIdx === fEditIdx.trim();
                                  return (
                                    <tr
                                      key={i}
                                      onClick={() => rowIdx && setFEditIdx(rowIdx)}
                                      className={cx(
                                        "border-b border-slate-900/40 transition hover:bg-emerald-500/10",
                                        fabGroupBgClass(map.get(key)!),
                                        isSelected && "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                                      )}
                                    >
                                      {fabPreview.columns.map((c) => (
                                        <td key={c} className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">
                                          {String((r as any)[c] ?? "")}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* Añadir orden */}
                        <details className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-100">➕ Añadir orden</summary>

                          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Modelo</div>
                              <select
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={fAddModel}
                                onChange={(e) =>
                                  updateFilterModel(
                                    e.target.value,
                                    setFAddModel,
                                    setFAddTalla,
                                    setFAddTallasOpt,
                                    setFAddTallasLoading
                                  )
                                }
                              >
                                <option value="">(elige)</option>
                                {modelosOpt.map((it, idx) => (
                                  <option key={`${it.modelo}__${idx}`} value={it.modelo}>
                                    {modelLabel(it)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Talla</div>
                              {fAddTallasOpt.length ? (
                                <select
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={fAddTalla}
                                  onChange={(e) => setFAddTalla(e.target.value)}
                                  disabled={fAddTallasLoading}
                                >
                                  <option value="">(elige)</option>
                                  {fAddTallasOpt.map((t, idx) => (
                                    <option key={`${t}__${idx}`} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                  value={fAddTalla}
                                  onChange={(e) => setFAddTalla(e.target.value)}
                                  placeholder="Ej: 48"
                                />
                              )}
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Cantidad</div>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={fAddCantidad}
                                onChange={(e) => setFAddCantidad(e.target.value)}
                              />
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Fecha (YYYY-MM-DD)</div>
                              <input
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={fAddFecha}
                                onChange={(e) => setFAddFecha(e.target.value)}
                                placeholder="2026-01-22"
                              />
                            </label>

                            <div className="lg:col-span-2">
                              <Button variant="primary" disabled={busy !== null} onClick={addFabrication}>
                                {busy === "fab_add" ? "Guardando…" : "Añadir orden"}
                              </Button>
                            </div>
                          </div>
                        </details>

                        {/* Editar / eliminar (qty=0) */}
                        <div className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                          <div className="text-sm font-semibold text-slate-100">Editar / eliminar orden</div>
                          <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <label className="block lg:col-span-2">
                              <div className="mb-1 text-xs text-slate-400">Selecciona orden a editar/eliminar</div>
                              <select
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={fEditIdx}
                                onChange={(e) => setFEditIdx(e.target.value)}
                              >
                                <option value="">(elige)</option>
                                {fabPreview?.ok
                                  ? fabPreview.rows.map((r: any, idx: number) => (
                                      <option key={idx} value={String(r["IDX"] ?? "")}>
                                        {`${r["IDX"]} | ${r["MODELO"]} | ${r["TALLA"]} | ${r["FECHA"]}`}
                                      </option>
                                    ))
                                  : null}
                              </select>
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Unidades actuales</div>
                              <input
                                readOnly
                                className="w-full rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
                                value={fabSelectedRow ? String((fabSelectedRow as any)["CANTIDAD"] ?? "") : ""}
                                placeholder="(selecciona una orden)"
                              />
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-slate-400">Nueva cantidad (0 = eliminar)</div>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                                value={fEditCantidad}
                                onChange={(e) => setFEditCantidad(e.target.value)}
                              />
                            </label>

                            <div className="lg:col-span-2">
                              <Button variant="primary" disabled={busy !== null} onClick={editFabricationQty}>
                                {busy === "fab_edit" ? "Aplicando…" : "Aplicar cambio"}
                              </Button>
                              <div className="mt-2 text-xs text-slate-400">
                                “Eliminar” aquí es dejar cantidad a 0 (idéntico a lo que ya vienes usando).
                              </div>
                            </div>
                          </div>
                        </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>



  
       ) : activeTab === "auditoria" ? (
        <div className="space-y-4">
          {!hasRequiredPaths(paths) ? (
            <MissingPathsBox />
          ) : (
            <>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Auditoría de stock vs histórico</div>
                    <div className="text-xs text-slate-400">
                      Recalcula stock desde el historial y muestra diferencias.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={auditModel}
                      onChange={setAuditModel}
                      placeholder="Filtrar por modelo (opcional)"
                      className="w-[220px]"
                    />
                    <Button variant="primary" onClick={loadAuditPreview} disabled={!!busy}>
                      {busy === "audit_preview" ? "Auditando…" : "Auditar"}
                    </Button>
                  </div>
                </div>
              </div>

              {auditMsg ? <InfoBox title="Auditoría" detail={auditMsg} /> : null}

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">Diferencias</div>
                {!auditPreview ? (
                  <div className="text-sm text-slate-400">Pulsa “Auditar” para cargar.</div>
                ) : auditPreview.ok === false ? (
                  <ErrorBox title={auditPreview.error} detail={auditPreview.detail} />
                ) : auditPreview.rows.length === 0 ? (
                  <div className="text-sm text-slate-400">Sin diferencias.</div>
                ) : (
                  <SimpleTable rows={auditPreview.rows} />
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="text-sm font-semibold text-slate-100">Aplicar ajustes</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Modo</div>
                      <select
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditApplyMode}
                        onChange={(e) => setAuditApplyMode(e.target.value as any)}
                      >
                        <option value="all">Todos</option>
                        <option value="pos">Solo Δ positivo</option>
                        <option value="neg">Solo Δ negativo</option>
                      </select>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Índices (1,3,5-8)</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditApplyIdx}
                        onChange={(e) => setAuditApplyIdx(e.target.value)}
                        placeholder="Opcional"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      Se aplicarán{" "}
                      <span className="font-semibold text-slate-200">
                        {pickAuditRows(auditApplyMode, auditApplyIdx).length}
                      </span>{" "}
                      cambios.
                    </div>
                    <Button variant="primary" onClick={applyAuditChanges} disabled={!!busy}>
                      {busy === "audit_apply" ? "Aplicando…" : "Aplicar ajustes"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="text-sm font-semibold text-slate-100">Regularizar histórico</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Fecha</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditFecha}
                        onChange={(e) => setAuditFecha(e.target.value)}
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Observación</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditObs}
                        onChange={(e) => setAuditObs(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Modo</div>
                      <select
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditRegMode}
                        onChange={(e) => setAuditRegMode(e.target.value as any)}
                      >
                        <option value="all">Todos</option>
                        <option value="pos">Solo Δ positivo → SALIDAS</option>
                        <option value="neg">Solo Δ negativo → ENTRADAS</option>
                      </select>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Índices (1,3,5-8)</div>
                      <input
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                        value={auditRegIdx}
                        onChange={(e) => setAuditRegIdx(e.target.value)}
                        placeholder="Opcional"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      Se crearán{" "}
                      <span className="font-semibold text-slate-200">
                        {pickAuditRows(auditRegMode, auditRegIdx).length}
                      </span>{" "}
                      asientos.
                    </div>
                    <Button variant="primary" onClick={regularizeAuditChanges} disabled={!!busy}>
                      {busy === "audit_regularize" ? "Creando…" : "Crear asientos"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">Saneos rápidos</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={fixNegativesToZero} disabled={!!busy}>
                    {busy === "fix_neg" ? "Ajustando…" : "Ajustar negativos a 0"}
                  </Button>
                  <Button variant="secondary" onClick={fixBadStockValues} disabled={!!busy}>
                    {busy === "fix_bad" ? "Saneando…" : "Reemplazar NaN/None/no enteros"}
                  </Button>
                  <Button variant="secondary" onClick={() => purgeBadTallas(true)} disabled={!!busy}>
                    {busy === "purge_tallas" ? "Purgando…" : "Purgar tallas anómalas (stock 0)"}
                  </Button>
                </div>

                {fixNegRes?.rows?.length ? (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-slate-400">Negativos ajustados</div>
                    <SimpleTable rows={fixNegRes.rows} />
                  </div>
                ) : null}

                {fixBadRes?.rows?.length ? (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-slate-400">Valores saneados</div>
                    <SimpleTable rows={fixBadRes.rows} />
                  </div>
                ) : null}

                {purgeRes?.rows?.length ? (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-slate-400">Tallas purgadas</div>
                    <SimpleTable rows={purgeRes.rows} />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

      ) : activeTab === "catalogo" ? (
        <div className="space-y-4">
          {!hasRequiredPaths(paths) ? (
            <MissingPathsBox />
          ) : (
            <>
              {catalogMsg ? <InfoBox title="Catálogo" detail={catalogMsg} /> : null}

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">Modelos</div>
                <SimpleTable
                  rows={catalogModelos.map((m) => ({
                    MODELO: m.modelo,
                    DESCRIPCION: m.descripcion || "",
                    COLOR: m.color || "",
                    CLIENTE: m.cliente || "",
                  }))}
                />
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">Editar info de modelo</div>
                <div className="grid gap-3 lg:grid-cols-4">
                  <label className="block lg:col-span-2">
                    <div className="mb-1 text-xs text-slate-400">Modelo existente</div>
                    <div className="flex gap-2">
                      <select
                        value={catModeloSel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCatModeloSel(val);
                          if (!val) {
                            setCatModelo("");
                            setCatDesc("");
                            setCatColor("");
                            setCatCliente("");
                            return;
                          }
                          const found = catalogModelos.find((m) => m.modelo === val);
                          if (found) {
                            setCatModelo(found.modelo);
                            setCatDesc(found.descripcion || "");
                            setCatColor(found.color || "");
                            setCatCliente(found.cliente || "");
                          }
                        }}
                        className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                      >
                        <option value="">(nuevo)</option>
                        {catalogModelos.map((m, idx) => (
                          <option key={`${m.modelo}__${idx}`} value={m.modelo}>
                            {modelLabel(m)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCatModeloSel("");
                          setCatModelo("");
                          setCatDesc("");
                          setCatColor("");
                          setCatCliente("");
                        }}
                        disabled={!!busy}
                      >
                        Nuevo
                      </Button>
                    </div>
                  </label>

                  <Input value={catModelo} onChange={setCatModelo} placeholder="Modelo" />
                  <Input value={catDesc} onChange={setCatDesc} placeholder="Descripción" />
                  <Input value={catColor} onChange={setCatColor} placeholder="Color" />
                  <Input value={catCliente} onChange={setCatCliente} placeholder="Cliente" />
                </div>
                <div className="mt-3">
                  <Button variant="primary" onClick={updateModelInfo} disabled={!!busy}>
                    {busy === "model_update" ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">Talleres</div>
                  <SimpleTable rows={catalogTalleres} />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="block lg:col-span-2">
                      <div className="mb-1 text-xs text-slate-400">Taller existente</div>
                      <div className="flex gap-2">
                        <select
                          value={tallerSel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTallerSel(val);
                            if (!val) {
                              setNewTaller("");
                              setNewTallerContacto("");
                              return;
                            }
                            const found = (catalogTalleres || [])
                              .map((t: any) => pickNameContact(t))
                              .find((t) => t.nombre === val);
                            if (found) {
                              setNewTaller(found.nombre);
                              setNewTallerContacto(found.contacto || "");
                            }
                          }}
                          className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                        >
                          <option value="">(nuevo)</option>
                          {catalogTalleres.map((t: any, idx: number) => {
                            const info = pickNameContact(t);
                            if (!info.nombre) return null;
                            return (
                              <option key={`${info.nombre}__${idx}`} value={info.nombre}>
                                {info.nombre}
                              </option>
                            );
                          })}
                        </select>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setTallerSel("");
                            setNewTaller("");
                            setNewTallerContacto("");
                          }}
                          disabled={!!busy}
                        >
                          Nuevo
                        </Button>
                      </div>
                    </label>

                    <Input value={newTaller} onChange={setNewTaller} placeholder="Nombre taller" />
                    <Input value={newTallerContacto} onChange={setNewTallerContacto} placeholder="Contacto (opcional)" />
                  </div>
                  <div className="mt-3">
                    <Button variant="primary" onClick={addTaller} disabled={!!busy}>
                      {busy === "add_taller" ? "Añadiendo…" : "Añadir taller"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-100">Clientes</div>
                  <SimpleTable rows={catalogClientes} />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="block lg:col-span-2">
                      <div className="mb-1 text-xs text-slate-400">Cliente existente</div>
                      <div className="flex gap-2">
                        <select
                          value={clienteSel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setClienteSel(val);
                            if (!val) {
                              setNewCliente("");
                              setNewClienteContacto("");
                              return;
                            }
                            const found = (catalogClientes || [])
                              .map((c: any) => pickNameContact(c))
                              .find((c) => c.nombre === val);
                            if (found) {
                              setNewCliente(found.nombre);
                              setNewClienteContacto(found.contacto || "");
                            }
                          }}
                          className="w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15"
                        >
                          <option value="">(nuevo)</option>
                          {catalogClientes.map((c: any, idx: number) => {
                            const info = pickNameContact(c);
                            if (!info.nombre) return null;
                            return (
                              <option key={`${info.nombre}__${idx}`} value={info.nombre}>
                                {info.nombre}
                              </option>
                            );
                          })}
                        </select>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setClienteSel("");
                            setNewCliente("");
                            setNewClienteContacto("");
                          }}
                          disabled={!!busy}
                        >
                          Nuevo
                        </Button>
                      </div>
                    </label>

                    <Input value={newCliente} onChange={setNewCliente} placeholder="Nombre cliente" />
                    <Input value={newClienteContacto} onChange={setNewClienteContacto} placeholder="Contacto (opcional)" />
                  </div>
                  <div className="mt-3">
                    <Button variant="primary" onClick={addCliente} disabled={!!busy}>
                      {busy === "add_cliente" ? "Añadiendo…" : "Añadir cliente"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

      ) : activeTab === "importaciones" ? (
        <div className="space-y-4">
          {!hasRequiredPaths(paths) ? (
            <MissingPathsBox />
          ) : (
            <>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">🚚 Importar albaranes servidos</div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-300">Subir Excel</div>
                    <div
                      onDragEnter={() => setAlbDrag(true)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setAlbDrag(true);
                      }}
                      onDragLeave={() => setAlbDrag(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setAlbDrag(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setAlbFile(f);
                      }}
                      className={cx(
                        "rounded-xl border border-dashed px-3 py-4 text-xs text-slate-300 transition",
                        albDrag
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-700/70 bg-slate-950/30"
                      )}
                    >
                      <div className="font-medium">Arrastra y suelta el Excel aqui</div>
                      <div className="mt-1 text-[11px] text-slate-400">o usa el boton de examinar</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => albInputRef.current?.click()}
                          disabled={!!busy}
                        >
                          Browse file
                        </Button>
                        <span className="text-xs text-slate-300">
                          {albFile ? albFile.name : "Sin archivo seleccionado"}
                        </span>
                      </div>
                      <input
                        ref={albInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setAlbFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <label className="block">
                        <div className="mb-1 text-xs text-slate-400">Modo duplicadas</div>
                        <select
                          className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                          value={albModo}
                          onChange={(e) => setAlbModo(e.target.value)}
                        >
                          <option value="d">Descontar diferencia (recomendado)</option>
                          <option value="i">Ignorar duplicadas</option>
                          <option value="t">Procesar todo igualmente</option>
                        </select>
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs text-slate-400">Filas a saltar</div>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                          value={albSkip}
                          onChange={(e) => setAlbSkip(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={albSim} onChange={(e) => setAlbSim(e.target.checked)} />
                      Simular (no escribir)
                    </label>
                    <div className="mt-3">
                      <Button variant="primary" onClick={importAlbaranesWithFile} disabled={!!busy}>
                        {busy === "import_alb" ? "Procesando…" : "Procesar albaranes"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-300">Ruta fija</div>
                    <Input
                      value={albPath}
                      onChange={setAlbPath}
                      placeholder="Ruta al Excel"
                    />
                    <div className="mt-3">
                      <Button variant="secondary" onClick={importAlbaranesWithPath} disabled={!!busy}>
                        {busy === "import_alb_path" ? "Procesando…" : "Procesar ruta"}
                      </Button>
                    </div>
                  </div>
                </div>

                {albRes ? (
                  <div className="mt-4 space-y-3">
                    <InfoBox
                      title="Resultado albaranes"
                      detail={`Nuevas salidas: ${albRes?.nuevas_salidas ?? 0}`}
                    />
                    {albRes?.import_rows?.length ? (
                      <SimpleTable rows={albRes.import_rows} />
                    ) : null}
                    {albRes?.servidos?.length ? (
                      <>
                        <div className="text-xs text-slate-400">Pedidos servidos</div>
                        <SimpleTable rows={albRes.servidos} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">🧾 Importar pedidos pendientes</div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-300">Subir Excel</div>
                    <div
                      onDragEnter={() => setPedDrag(true)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setPedDrag(true);
                      }}
                      onDragLeave={() => setPedDrag(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setPedDrag(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setPedFile(f);
                      }}
                      className={cx(
                        "rounded-xl border border-dashed px-3 py-4 text-xs text-slate-300 transition",
                        pedDrag
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-700/70 bg-slate-950/30"
                      )}
                    >
                      <div className="font-medium">Arrastra y suelta el Excel aqui</div>
                      <div className="mt-1 text-[11px] text-slate-400">o usa el boton de examinar</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => pedInputRef.current?.click()}
                          disabled={!!busy}
                        >
                          Browse file
                        </Button>
                        <span className="text-xs text-slate-300">
                          {pedFile ? pedFile.name : "Sin archivo seleccionado"}
                        </span>
                      </div>
                      <input
                        ref={pedInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setPedFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <label className="block">
                        <div className="mb-1 text-xs text-slate-400">Filas a saltar</div>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                          value={pedSkip}
                          onChange={(e) => setPedSkip(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={pedSim} onChange={(e) => setPedSim(e.target.checked)} />
                      Simular (no escribir)
                    </label>
                    <div className="mt-3">
                      <Button variant="primary" onClick={importPedidosWithFile} disabled={!!busy}>
                        {busy === "import_ped" ? "Procesando…" : "Procesar pedidos"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-300">Ruta fija</div>
                    <Input
                      value={pedPath}
                      onChange={setPedPath}
                      placeholder="Ruta al Excel"
                    />
                    <div className="mt-3">
                      <Button variant="secondary" onClick={importPedidosWithPath} disabled={!!busy}>
                        {busy === "import_ped_path" ? "Procesando…" : "Procesar ruta"}
                      </Button>
                    </div>
                  </div>
                </div>

                {pedRes ? (
                  <div className="mt-4 space-y-3">
                    <InfoBox
                      title="Resultado pedidos"
                      detail={`Nuevos: ${pedRes?.nuevos ?? 0} · Duplicados: ${pedRes?.duplicados ?? 0}`}
                    />
                    {pedRes?.import_rows?.length ? <SimpleTable rows={pedRes.import_rows} /> : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

      ) : activeTab === "backups" ? (
        <div className="space-y-4">
          {!hasRequiredPaths(paths) ? (
            <MissingPathsBox />
          ) : (
            <>
              {backupMsg ? <InfoBox title="Backups" detail={backupMsg} /> : null}
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-100">Copias de seguridad</div>
                {backupDirInfo ? (
                  <div className="text-xs text-slate-400">Carpeta: {backupDirInfo}</div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={createBackup} disabled={!!busy}>
                    {busy === "backup_create" ? "Creando…" : "Crear backup"}
                  </Button>
                  <Button variant="secondary" onClick={listBackups} disabled={!!busy}>
                    {busy === "backup_list" ? "Cargando…" : "Refrescar lista"}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-xs text-slate-400">Selecciona backup</div>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
                      value={backupSel}
                      onChange={(e) => setBackupSel(e.target.value)}
                    >
                      <option value="">(elige)</option>
                      {backupFiles.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <Button variant="primary" onClick={restoreBackup} disabled={!!busy}>
                      {busy === "backup_restore" ? "Restaurando…" : "Restaurar seleccionado"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

       ) : activeTab === "exportar" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Exportar (pack)</div>
            <div className="text-sm text-slate-400">
              Igual que el Streamlit: botón y a volar. Aquí devolvemos ZIP (CSV pack / Excel pack).
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={doDownloadCsvPack} disabled={!!busy}>
                {busy === "csv" ? "Generando…" : "Descargar CSV pack"}
              </Button>
              <Button variant="secondary" onClick={doDownloadExcelPack} disabled={!!busy}>
                {busy === "excel" ? "Generando…" : "Descargar Excel pack"}
              </Button>
              <Button variant="secondary" onClick={doDownloadStockNegativo} disabled={!!busy}>
                {busy === "stock_negativo" ? "Generando…" : "Stock negativo"}
              </Button>
              <Button variant="secondary" onClick={doStatus} disabled={!!busy}>
                {busy === "status" ? "Cargando…" : "Status (comprobar rutas)"}
              </Button>
            </div>

            {missingRequired ? (
              <div className="mt-4">
                <ErrorBox title="Faltan rutas obligatorias" detail="Rellena inv/prev/talleres/clientes en el panel superior." />
              </div>
            ) : (
              <div className="mt-4">
                <InfoBox
                  title="Tip"
                  detail="Si quieres que el usuario no escriba rutas nunca: define NEXT_PUBLIC_GLOBALIA_* (solo si te da igual exponer rutas en cliente). Si no, localStorage y listo."
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4">
          <InfoBox
            title="Módulo en preparación"
            detail={
              "Aquí iría el contenido equivalente al Streamlit (movimientos, previsión, auditoría, catálogo, importaciones, backups). " +
              "De momento este cliente está conectado a: status / preview_stock / export packs. " +
              "Cuando añadamos endpoints, esta UI ya está lista para encajar todo con la estética."
            }
          />
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        Globalia Stock · Based in Python · Demo Edition
      </div>
        {/* DATALISTS GLOBALES (siempre presentes en el DOM) */}
        <datalist id="globalia-modelos">
          {modelosOpt.map((m) => (
            <option key={m.modelo} value={m.modelo}>
              {modelLabel(m)}
            </option>
          ))}
        </datalist>

        <datalist id="globalia-tallas">
          {tallasOpt.map((t, idx) => (
            <option key={`${t}__${idx}`} value={t} />
          ))}
        </datalist>
    </div>
  );
}
