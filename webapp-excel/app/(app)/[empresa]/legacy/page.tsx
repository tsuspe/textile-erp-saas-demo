import Link from "next/link";
import LegacyExcelPanel from "./LegacyExcelPanel";
import { headers } from "next/headers";
import { redirect } from "next/navigation";


type Entry = {
  name: string;
  type: "dir" | "file";
  ext: string;
  size: number;
  mtime: string;
};

type HeaderBag = Awaited<ReturnType<typeof headers>>;


// ✅ Next 16: headers() es async
function getOrigin(h: HeaderBag) {
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  if (!host) throw new Error("No host header");
  return `${proto}://${host}`;
}

// ✅ En Server Components: usa URL absoluta
async function getListing(empresa: string, p: string, t?: string) {
  const h = await headers();
  const origin = getOrigin(h);

  const qs = new URLSearchParams();
  if (p) qs.set("p", p);
  if (t) qs.set("t", t);

  const url = `${origin}/${empresa}/api/legacy/list${qs.toString() ? `?${qs.toString()}` : ""}`;

  const cookie = h.get("cookie");
  const res = await fetch(url, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let extra = "";
    try {
      if (isJson) {
        const j = await res.json();
        if (j?.error) extra = ` (${j.error})`;
      }
    } catch {}
    throw new Error(`No se pudo listar legacy${extra}`);
  }

  if (!isJson) {
    throw new Error("Respuesta no JSON del endpoint legacy");
  }

  return res.json() as Promise<{ cwd: string; entries: Entry[] }>;
}

function joinPath(a: string, b: string) {
  if (!a) return b;
  return `${a.replace(/\/+$/, "")}/${b.replace(/^\/+/, "")}`;
}

function crumbsFrom(p: string) {
  const parts = (p || "").split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: "ROOT", path: "" }];
  let acc = "";
  for (const part of parts) {
    acc = joinPath(acc, part);
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

function fmtSize(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isOfficeTempFile(name: string) {
  // Archivos temporales típicos de Excel/Office: "~$....xlsx"
  return name.startsWith("~$");
}

function isSupportedLegacyFile(name: string) {
  const lower = name.toLowerCase();
  if (isOfficeTempFile(name)) return false;

  // Solo permitimos PDFs y Excels
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  );
}


function sanitizePath(input?: string) {
  return (input || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function legacyHref(empresa: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return `/${empresa}/legacy${s ? `?${s}` : ""}`;
}

export default async function LegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ p?: string; file?: string; t?: string; sheet?: string }>;
}) {
  const { empresa } = await params;
  const sp = await searchParams;

  if (empresa !== "legacy") {
    redirect("/legacy/legacy");
  }
  
  const cwd = sanitizePath(sp.p);
  const selectedFile = sanitizePath(sp.file);
  const activeSheetFromQuery = sp.sheet || "";
  const t = sp.t || "";

  const crumbs = crumbsFrom(cwd);

  const selectedIsPdf = selectedFile.toLowerCase().endsWith(".pdf");
  const selectedIsExcel =
    selectedFile.toLowerCase().endsWith(".xlsx") || selectedFile.toLowerCase().endsWith(".xls");

  const retryHref = legacyHref(empresa, {
    p: cwd || undefined,
    file: selectedFile || undefined,
    sheet: activeSheetFromQuery || undefined,
    t: String(Date.now()),
  });

  const upPath = cwd ? cwd.split("/").slice(0, -1).join("/") : "";
  const upHref = legacyHref(empresa, { p: upPath || undefined, t: t || undefined });

  let data: { cwd: string; entries: Entry[] } | null = null;
  let legacyError: string | null = null;

  try {
    data = await getListing(empresa, cwd, t || undefined);
  } catch (e: any) {
    legacyError = e?.message || "Legacy no disponible";
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">LEGACY · Fichas antiguas</h1>

            <nav className="text-xs text-slate-400 flex flex-wrap gap-2">
              {crumbs.map((c, i) => {
                const href = legacyHref(empresa, { p: c.path || undefined, t: t || undefined });
                return (
                  <span key={c.path}>
                    <Link className="hover:text-emerald-400 underline" href={href}>
                      {c.label}
                    </Link>
                    {i < crumbs.length - 1 ? <span className="mx-2">/</span> : null}
                  </span>
                );
              })}
            </nav>
          </div>

        </header>

        {legacyError && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="text-sm font-semibold text-red-300">Legacy no disponible</p>
            <p className="text-xs text-slate-300 mt-1">{legacyError}</p>

            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold text-slate-200">Checklist rápido</p>
              <ol className="mt-2 space-y-1 text-xs text-slate-300 list-decimal list-inside">
                <li>¿Está disponible la carpeta compartida configurada en LEGACY_ROOT?</li>
                <li>¿Tienes red/VPN correcta y acceso a la unidad compartida?</li>
                <li>¿Tienes permisos de lectura en “Ficha Tecnica”?</li>
                <li>
                  Si acabas de reconectar, espera 2–3s y pulsa{" "}
                  <span className="font-semibold">Reintentar</span>.
                </li>
              </ol>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={retryHref}
                className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                ↻ Reintentar
              </Link>
            </div>
          </section>
        )}

        {data && (() => {
          const filteredEntries = data.entries.filter((e) => {
            if (e.type === "dir") return true; // carpetas siempre
            return isSupportedLegacyFile(e.name);
          });

          return (
            <section className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">

            {/* LISTADO */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Contenido</p>
                <p className="text-[11px] text-slate-500">{filteredEntries.length} items</p>
              </div>

              <div className="space-y-1 text-xs">
                {cwd && (
                  <Link
                    className="block rounded-md px-2 py-2 hover:bg-slate-800/60 text-slate-200"
                    href={upHref}
                  >
                    ⬅️ .. (subir)
                  </Link>
                )}

                {filteredEntries.map((e) => {
                  const p = joinPath(cwd, e.name);

                  if (e.type === "dir") {
                    return (
                      <Link
                        key={p}
                        className="block rounded-md px-2 py-2 hover:bg-slate-800/60"
                        href={legacyHref(empresa, { p, t: t || undefined })}
                      >
                        📁 {e.name}
                      </Link>
                    );
                  }

                  const hrefSelect = legacyHref(empresa, {
                    p: cwd || undefined,
                    file: p,
                    t: t || undefined,
                    ...(p === selectedFile ? { sheet: activeSheetFromQuery } : {}),
                  });

                  return (
                    <div
                      key={p}
                      className="rounded-md px-2 py-2 hover:bg-slate-800/40 flex items-center justify-between gap-3"
                    >
                      <Link
                        className="truncate underline text-slate-200 hover:text-emerald-300"
                        href={hrefSelect}
                      >
                        {e.ext === ".pdf" ? "📄" : "📎"} {e.name}
                      </Link>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
                        <span>{fmtSize(e.size)}</span>
                        <Link
                          className="underline hover:text-emerald-300"
                          href={`/${empresa}/api/legacy/file?p=${encodeURIComponent(p)}&download=1`}
                        >
                          Descargar
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PREVIEW */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
              <p className="text-sm font-semibold mb-3">Vista previa</p>

              {!selectedFile ? (
                <p className="text-xs text-slate-400">
                  Selecciona un archivo del panel izquierdo para previsualizarlo.
                </p>
              ) : selectedIsPdf ? (
                <iframe
                  className="w-full h-[70vh] rounded-lg border border-slate-800 bg-slate-950"
                  src={`/${empresa}/api/legacy/file?p=${encodeURIComponent(selectedFile)}`}
                />
              ) : selectedIsExcel ? (
                <LegacyExcelPanel
                  empresa={empresa}
                  cwd={cwd}
                  filePath={selectedFile}
                  initialSheet={activeSheetFromQuery}
                />
              ) : (
                <div className="space-y-2 text-xs text-slate-300">
                  <p>
                    Este tipo de archivo no tiene preview.{" "}
                    <span className="text-slate-400">Descárgalo para abrirlo.</span>
                  </p>
                  <Link
                    className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    href={`/${empresa}/api/legacy/file?p=${encodeURIComponent(selectedFile)}&download=1`}
                  >
                    Descargar archivo
                  </Link>
                </div>
              )}
            </div>
          </section>
        );
      })()}
      </div>
    </main>
  );
}
