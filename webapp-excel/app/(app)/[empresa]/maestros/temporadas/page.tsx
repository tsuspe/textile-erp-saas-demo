// app/(app)/[empresa]/maestros/temporadas/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

// ✅ En prod evita listado “pegado”
export const dynamic = "force-dynamic";

type TemporadaRow = {
  id: number;
  codigo: string;
  descripcion: string;
  _count: { articulos: number; escandallos: number };
};

type PageProps = {
  params: Promise<{ empresa: string }>;
};

export default async function TemporadasPage({ params }: PageProps) {
  const { empresa } = await params;
  const base = `/${empresa}`;

  const temporadasRaw: TemporadaRow[] = await prisma.temporada.findMany({
    include: {
      _count: { select: { articulos: true, escandallos: true } },
    },
  });

  const temporadas = [...temporadasRaw].sort((a, b) => {
    const an = Number(a.codigo);
    const bn = Number(b.codigo);

    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);

    if (aIsNum && bIsNum) return an - bn;
    if (aIsNum) return -1;
    if (bIsNum) return 1;

    return a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Temporadas</h1>

          <nav className="flex gap-3 text-sm underline">
            <Link href={`${base}/maestros/articulos`}>Ver artículos</Link>
            <Link href={`${base}/maestros/clientes`}>Ver clientes</Link>
            <Link href={`${base}/maestros/subfamilias`}>Ver subfamilias</Link>
          </nav>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Nueva temporada</h2>

          <form
            action={`${base}/api/temporadas`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                required
                placeholder="19, 20..."
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Descripción</label>
              <input
                type="text"
                name="descripcion"
                required
                placeholder="Primavera-Verano 2026, Otoño-Invierno 2026/2027"
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-start">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Guardar
              </button>
            </div>
          </form>
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-2">Listado de temporadas</h2>

          {/* ✅ Fix hydration: siempre el mismo wrapper */}
          <ul className="divide-y divide-slate-800">
            {temporadas.length === 0 ? (
              <li className="text-sm text-slate-400 py-2">
                Todavía no hay temporadas.
              </li>
            ) : (
              temporadas.map((t) => {
                const puedeEliminar =
                  t._count.articulos === 0 && t._count.escandallos === 0;

                return (
                  <li
                    key={t.id}
                    className="py-2 flex items-center justify-between text-sm"
                  >
                    <div className="flex gap-4">
                      <span className="font-mono">{t.codigo}</span>
                      <span className="text-slate-200">{t.descripcion}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {t._count.articulos} art. · {t._count.escandallos} esc.
                      </span>

                      <Link
                        href={`${base}/maestros/temporadas/${t.id}`}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Editar
                      </Link>

                      {puedeEliminar ? (
                        <form
                          action={`${base}/api/temporadas/${t.id}/delete`}
                          method="POST"
                        >
                          <DeleteButton
                            label="Eliminar"
                            confirmText={`Eliminar temporada "${t.codigo} - ${t.descripcion}". Esta acción no se puede deshacer. ¿Continuar?`}
                            className="text-xs"
                          />
                        </form>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Bloqueado
                        </span>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
