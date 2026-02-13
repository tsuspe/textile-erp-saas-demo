// app/(app)/[empresa]/legacy/view/page.tsx
import Link from "next/link";

function sanitizePath(input?: string) {
  return (input || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function legacyHref(
  empresa: string,
  params: Record<string, string | undefined>,
  base: "legacy" | "legacy/view" = "legacy",
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return `/${empresa}/${base}${s ? `?${s}` : ""}`;
}

export default async function LegacyViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ p?: string; file?: string; sheet?: string; all?: string; t?: string }>;
}) {
  const { empresa } = await params;
  const sp = await searchParams;

  if (empresa !== "legacy") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <p className="text-sm text-slate-300">
          Este módulo solo está disponible en la empresa{" "}
          <span className="font-mono">legacy</span>.
        </p>
      </main>
    );
  }

  const cwd = sanitizePath(sp.p);
  const file = sanitizePath(sp.file);
  const all = sp.all === "1";
  const t = sp.t || "";

  const sheetParam = sp.sheet || "";
  const sheets = sheetParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const fileName = file ? file.split("/").pop() : "";
  const isExcel = file.toLowerCase().endsWith(".xlsx") || file.toLowerCase().endsWith(".xls");

  const backHref = legacyHref(empresa, { p: cwd || undefined, t: t || undefined }, "legacy");

  if (!file || !isExcel || (!all && sheets.length === 0)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-sm font-semibold text-red-300">No se puede generar PDF</p>
          <p className="text-xs text-slate-400">
            Esta vista admite Excel y requiere <span className="font-mono">all=1</span> o{" "}
            <span className="font-mono">sheet=...</span>.
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  const cacheBust = t ? `&t=${encodeURIComponent(t)}` : `&t=${Date.now()}`;

  const pdfSrc = `/${empresa}/api/legacy/pdf?p=${encodeURIComponent(file)}${
    all ? "&all=1" : `&sheet=${encodeURIComponent(sheets.join(","))}`
  }${cacheBust}`;


  const subtitle = all
    ? " · Todas las hojas"
    : sheets.length === 1
      ? ` · Hoja: ${sheets[0]}`
      : ` · Hojas: ${sheets.length}`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">LEGACY · PDF</h1>
            <p className="text-xs text-slate-400">
              Archivo: <span className="font-mono text-emerald-300">{fileName}</span>
              {subtitle}
            </p>

            {!all && sheets.length > 1 && (
              <p className="text-[11px] text-slate-500 truncate">{sheets.join(" · ")}</p>
            )}

            <p className="text-[11px] text-slate-500">
              Tip: para <span className="text-slate-300">guardar</span> o{" "}
              <span className="text-slate-300">imprimir</span>, usa los iconos del visor PDF (arriba a la derecha).
            </p>
          </div>


        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
          <iframe
            className="w-full h-[80vh] rounded-lg border border-slate-800 bg-slate-950"
            src={pdfSrc}
          />
        </section>
      </div>
    </main>
  );
}
