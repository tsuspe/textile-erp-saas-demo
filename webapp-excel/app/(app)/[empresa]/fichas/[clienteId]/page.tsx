// app/(app)/[empresa]/fichas/[clienteId]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string; clienteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function FichasClientePage({ params, searchParams }: PageProps) {
  const { empresa, clienteId } = await params;
  const sp = (await searchParams) ?? {};
  const soloConEscandallo = spGet(sp, "soloConEscandallo") === "1";

  const cId = Number(clienteId);

  if (!empresa) redirect("/");
  if (!Number.isFinite(cId)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-red-400">ID de cliente no válido.</p>
          <Link
            href={`/${empresa}/fichas`}
            className="underline text-sm mt-4 inline-block"
          >
            Volver a fichas
          </Link>
        </div>
      </main>
    );
  }

  // 1) Resolver empresaId desde slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) redirect("/");

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) Validar pertenencia del cliente a la empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true, codigo: true },
  });
  if (!cliente) notFound();

  // 3) Temporadas globales + escandallos filtrados por empresaId
  const [temporadas, escandallos] = await Promise.all([
    prisma.temporada.findMany({ orderBy: { codigo: "desc" } }),
    prisma.escandallo.findMany({
      where: { empresaId, clienteId: cId },
      select: { id: true, temporadaId: true, totalCoste: true },
    }),
  ]);

  const temporadasOrdenadas = temporadas.slice().sort((a, b) => {
    const an = Number(a.codigo);
    const bn = Number(b.codigo);
    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);
    if (aIsNum && bIsNum) return bn - an;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return b.codigo.localeCompare(a.codigo, "es", { numeric: true });
  });

  // Mapa temporada -> { count, total }
  const stats = new Map<number, { count: number; total: number }>();

  for (const e of escandallos) {
    const current = stats.get(e.temporadaId) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += e.totalCoste ?? 0;
    stats.set(e.temporadaId, current);
  }

  // 4) Aplicar filtro “sólo temporadas con escandallo”
  const temporadasToShow = soloConEscandallo
    ? temporadasOrdenadas.filter((t) => (stats.get(t.id)?.count ?? 0) > 0)
    : temporadasOrdenadas;

  const toggleBase = `${base}/fichas/${cliente.id}`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{cliente.nombre}</h1>
            <p className="text-sm text-slate-400">Código {cliente.codigo}</p>
          </div>

          <Link
            href={`${base}/fichas`}
            className="underline text-sm text-slate-300 hover:text-emerald-400"
          >
            Volver a fichas
          </Link>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Temporadas</h2>

            {/* Toggle filtro */}
            <div className="flex gap-2 text-xs">
              <Link
                href={toggleBase}
                className={`px-2 py-1 rounded border ${
                  !soloConEscandallo
                    ? "border-emerald-500 text-emerald-300"
                    : "border-slate-700 text-slate-300 hover:text-slate-100"
                }`}
              >
                Todas
              </Link>
              <Link
                href={`${toggleBase}?soloConEscandallo=1`}
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

          {temporadasToShow.length === 0 ? (
            <p className="text-sm text-slate-400">
              {soloConEscandallo
                ? "Este cliente no tiene temporadas con escandallo asignado."
                : "Todavía no hay temporadas creadas."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {temporadasToShow.map((t) => {
                const info = stats.get(t.id) ?? { count: 0, total: 0 };
                return (
                  <li
                    key={t.id}
                    className="py-3 flex items-center justify-between text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {t.codigo} – {t.descripcion}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {info.count} escandallo{info.count !== 1 ? "s" : ""} · Total{" "}
                        {info.total.toFixed(2)} €
                      </span>
                    </div>

                    <Link
                      href={`${base}/fichas/${cliente.id}/temporadas/${t.id}`}
                      className="text-emerald-400 text-xs underline hover:text-emerald-300"
                    >
                      Ver escandallos
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
