// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string; clienteId: string; temporadaId: string }>;
};

export default async function EscandallosPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId } = await params;

  if (!empresa) redirect("/");

  const cId = Number(clienteId);
  const tId = Number(temporadaId);

  if (!Number.isFinite(cId) || !Number.isFinite(tId)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-red-400">Ruta inválida.</p>
          <Link href={`/${empresa}/fichas`} className="underline text-sm mt-4 inline-block">
            Volver a fichas
          </Link>
        </div>
      </main>
    );
  }

  // 1) Resolver empresaId desde slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresaRow) redirect("/?err=empresa_no_existe");

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) Validar que el cliente pertenece a la empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true, codigo: true },
  });
  if (!cliente) notFound();

  // 3) Temporada global
  const temporada = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true, codigo: true, descripcion: true },
  });
  if (!temporada) notFound();

  // 4) Escandallos filtrados por empresaId + clienteId + temporadaId
  const escandallos = await prisma.escandallo.findMany({
    where: { empresaId, clienteId: cId, temporadaId: tId },
    select: {
      id: true,
      modeloInterno: true,
      modeloCliente: true,
      estado: true,
      totalCoste: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const eur = (n: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold">{cliente.nombre}</h1>
            <span className="text-sm text-slate-400">
              Temporada {temporada.codigo} — {temporada.descripcion}
            </span>
          </div>

          <Link href={`${base}/fichas/${cliente.id}`} className="text-sm underline text-slate-200">
            Volver a temporadas
          </Link>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Escandallos</h2>

          {escandallos.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hay escandallos para este cliente en esta temporada.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {escandallos.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {e.modeloInterno || `#${e.id}`}
                      {e.modeloCliente ? (
                        <span className="text-slate-400"> · {e.modeloCliente}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-slate-400">
                      Estado: {e.estado}
                      {typeof e.totalCoste === "number" ? ` · Coste ${eur(e.totalCoste)}` : ""}
                    </span>
                  </div>

                  <Link
                    href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${e.id}`}
                    className="text-emerald-400 text-xs underline"
                  >
                    Ver ficha
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
