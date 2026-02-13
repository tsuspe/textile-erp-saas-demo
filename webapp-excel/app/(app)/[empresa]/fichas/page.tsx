// app/(app)/[empresa]/fichas/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function FichasPage({ params, searchParams }: PageProps) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const soloConEscandallo = spGet(sp, "soloConEscandallo") === "1";

  // 1) Resolver empresaId desde slug
  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });

  if (!empresa) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">
            Empresa no encontrada: {empresaSlug}
          </p>
          <Link href="/" className="underline text-sm">
            Volver a selección de empresa
          </Link>
        </div>
      </main>
    );
  }

  const base = `/${empresa.slug}`;

  // 2) Filtrar SIEMPRE por empresaId
  //    + opcional: sólo clientes que tengan al menos 1 escandallo en esa empresa
  const clientes = await prisma.cliente.findMany({
    where: soloConEscandallo
      ? {
          empresaId: empresa.id,
          escandallos: { some: { empresaId: empresa.id } },
        }
      : { empresaId: empresa.id },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      _count: { select: { escandallos: true } },
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Fichas técnicas</h1>
            <p className="text-sm text-slate-400">
              Empresa:{" "}
              <span className="text-slate-200 font-semibold">
                {empresa.nombre}
              </span>
            </p>
          </div>

          <nav className="flex gap-3 text-sm underline">
            <Link href={base}>Home</Link>
            <Link href={`${base}/maestros`}>Maestros</Link>
          </nav>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Clientes</h2>

            {/* Toggle filtro (sin JS, sólo querystring) */}
            <div className="flex gap-2 text-xs">
              <Link
                href={`${base}/fichas`}
                className={`px-2 py-1 rounded border ${
                  !soloConEscandallo
                    ? "border-emerald-500 text-emerald-300"
                    : "border-slate-700 text-slate-300 hover:text-slate-100"
                }`}
              >
                Todos
              </Link>
              <Link
                href={`${base}/fichas?soloConEscandallo=1`}
                className={`px-2 py-1 rounded border ${
                  soloConEscandallo
                    ? "border-emerald-500 text-emerald-300"
                    : "border-slate-700 text-slate-300 hover:text-slate-100"
                }`}
              >
                Con escandallo
              </Link>
            </div>
          </div>

          {clientes.length === 0 ? (
            <p className="text-sm text-slate-400">
              {soloConEscandallo
                ? "No hay clientes con escandallo asignado en esta empresa."
                : "Todavía no hay clientes en esta empresa. Crea primero los maestros."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {clientes.map((c) => (
                <li
                  key={c.id}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-xs text-slate-400">
                      Código {c.codigo} · {c._count.escandallos} escandallos
                    </span>
                  </div>

                  <Link
                    href={`${base}/fichas/${c.id}`}
                    className="text-emerald-400 text-xs underline"
                  >
                    Ver temporadas
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
