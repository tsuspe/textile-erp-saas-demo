// app/(app)/[empresa]/fichas/[clienteId]/temporadas/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string; clienteId: string }>;
};

export default async function TemporadasClientePage({ params }: PageProps) {
  const { empresa, clienteId } = await params;
  const cId = Number(clienteId);

  if (!empresa) redirect("/");
  if (!Number.isFinite(cId)) {
    return <main className="p-8 text-slate-100">Cliente inválido</main>;
  }

  // 1) Empresa real (id) desde slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) redirect("/");

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) Cliente debe pertenecer a la empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true, codigo: true },
  });
  if (!cliente) notFound();

  // 3) Escandallos filtrados por empresaId + clienteId
  const escs = await prisma.escandallo.findMany({
    where: { empresaId, clienteId: cId },
    select: {
      temporada: { select: { id: true, codigo: true, descripcion: true } },
      totalCoste: true,
    },
  });

  const map = new Map<
    number,
    { id: number; codigo: string; descripcion: string; count: number; total: number }
  >();

  for (const e of escs) {
    const t = e.temporada;
    if (!t) continue;

    const prev = map.get(t.id);
    if (!prev) {
      map.set(t.id, {
        ...t,
        count: 1,
        total: e.totalCoste ?? 0,
      });
    } else {
      prev.count += 1;
      prev.total += e.totalCoste ?? 0;
    }
  }

  // Orden por "codigo" numérico desc si se puede, si no fallback string
  const temporadas = Array.from(map.values()).sort((a, b) => {
    const an = Number(a.codigo);
    const bn = Number(b.codigo);
    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);

    if (aIsNum && bIsNum) return bn - an;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return b.codigo.localeCompare(a.codigo, "es", { numeric: true });
  });

  const eur = (n: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold">{cliente.nombre}</h1>
            <span className="text-sm text-slate-400">Código {cliente.codigo}</span>
          </div>

          <Link href={`${base}/fichas`} className="text-sm underline text-slate-200">
            Volver a fichas
          </Link>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Temporadas</h2>

          {temporadas.length === 0 ? (
            <p className="text-sm text-slate-400">
              Este cliente aún no tiene escandallos asociados a ninguna temporada.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {temporadas.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {t.codigo} — {t.descripcion}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t.count} escandallo{t.count !== 1 ? "s" : ""} · Total {eur(t.total)}
                    </span>
                  </div>

                  <Link
                    href={`${base}/fichas/${cliente.id}/temporadas/${t.id}/escandallos`}
                    className="text-emerald-400 text-xs underline"
                  >
                    Ver escandallos
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
