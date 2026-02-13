// app/(app)/[empresa]/maestros/subfamilias/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

// ✅ En prod evita listado “pegado”
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ empresa: string }>;
};

export default async function SubfamiliasPage({ params }: PageProps) {
  const { empresa } = await params;
  const base = `/${empresa}`;

  const subfamiliasRaw = await prisma.subfamilia.findMany({
    include: {
      _count: { select: { articulos: true } },
    },
  });

  const subfamilias = [...subfamiliasRaw].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, "es", { numeric: true }),
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              / <span className="text-slate-300">Subfamilias</span>
            </p>
            <h1 className="text-3xl font-bold mt-1">Subfamilias</h1>
          </div>

          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`${base}/maestros/articulos`}
              className="underline text-slate-200 hover:text-emerald-400"
            >
              Ver artículos
            </Link>
            <Link
              href={`${base}/maestros/temporadas`}
              className="underline text-slate-200 hover:text-emerald-400"
            >
              Ver temporadas
            </Link>
            <Link
              href={`${base}/maestros/clientes`}
              className="underline text-slate-200 hover:text-emerald-400"
            >
              Ver clientes
            </Link>
          </nav>
        </header>

        {/* Form nueva subfamilia */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Nueva subfamilia</h2>

          <form
            action={`${base}/api/subfamilias`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                required
                placeholder="AB, BL, BO..."
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Descripción</label>
              <input
                type="text"
                name="descripcion"
                required
                placeholder="ABRIGO-KIMONO"
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

        {/* Listado */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-2">Listado de subfamilias</h2>

          {/* ✅ Fix hydration: mismo wrapper siempre */}
          <ul className="divide-y divide-slate-800">
            {subfamilias.length === 0 ? (
              <li className="text-sm text-slate-400 py-2">
                Todavía no hay subfamilias.
              </li>
            ) : (
              subfamilias.map((s) => (
                <li
                  key={s.id}
                  className="py-2 flex items-center justify-between text-sm gap-4"
                >
                  <div className="flex gap-4 min-w-0">
                    <span className="font-mono shrink-0">{s.codigo}</span>
                    <span className="text-slate-200 truncate">
                      {s.descripcion}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">
                      {s._count.articulos} art.
                    </span>

                    <Link
                      href={`${base}/maestros/subfamilias/${s.id}`}
                      className="text-xs text-emerald-400 hover:text-emerald-300 underline"
                    >
                      Editar
                    </Link>

                    {s._count.articulos === 0 ? (
                      <form
                        action={`${base}/api/subfamilias/${s.id}/delete`}
                        method="POST"
                      >
                        <DeleteButton
                          label="Eliminar"
                          confirmText={`Eliminar "${s.codigo} - ${s.descripcion}". Esta acción no se puede deshacer. ¿Continuar?`}
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
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
