// app/(app)/tools/almacen/ediwin-parse/page.tsx
import Link from "next/link";
import EdiwinParseClient from "./EdiwinParseClient";

export default async function EdiwinParsePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 sm:px-6 lg:px-8 py-12">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Herramientas · Almacén
            </div>
            <h1 className="text-3xl font-bold">EDIWIN Parser</h1>
            <p className="mt-2 text-slate-400">
              Modo original: genera en carpeta de red. Opcional: descarga ZIP.
            </p>
          </div>

          <Link
            href="/tools/almacen"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            ← Volver
          </Link>
        </div>

        <EdiwinParseClient />
      </div>
    </main>
  );
}
