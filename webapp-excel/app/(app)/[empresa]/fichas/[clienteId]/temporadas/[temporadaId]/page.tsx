// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string; clienteId: string; temporadaId: string }>;
};

export default async function EscandallosTemporadaPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId } = await params;

  if (!empresa) redirect("/");

  const cId = Number(clienteId);
  const tId = Number(temporadaId);

  if (!Number.isFinite(cId) || !Number.isFinite(tId)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-red-400">Cliente o temporada inválidos.</p>
          <Link href={`/${empresa}/fichas`} className="underline text-sm">
            Volver a fichas
          </Link>
        </div>
      </main>
    );
  }

  // 1) Resolver empresaId por slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) redirect("/");

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) Cliente debe pertenecer a empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true, codigo: true },
  });
  if (!cliente) notFound();

  // 3) Temporada (compartida) puede ir sin empresaId
  const temporada = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true, codigo: true, descripcion: true },
  });
  if (!temporada) notFound();

  // 4) Escandallos SIEMPRE filtrados por empresaId + clienteId + temporadaId
  const [escandallosEnEstudio, escandallosProduccion] = await Promise.all([
    prisma.escandallo.findMany({
      where: { empresaId, clienteId: cId, temporadaId: tId, estado: "ESCANDALLO" },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { pedidos: true } },
        articulo: { select: { descripcion: true } },
      },
    }),
    prisma.escandallo.findMany({
      where: { empresaId, clienteId: cId, temporadaId: tId, estado: "PRODUCCION" },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { pedidos: true } },
        articulo: { select: { descripcion: true } },
      },
    }),
  ]);


  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {cliente.nombre} – Temporada {temporada.codigo}
            </h1>
            <p className="text-sm text-slate-400">{temporada.descripcion}</p>
          </div>

          <nav className="flex gap-3 text-sm underline">
            <Link href={`${base}/fichas/${cliente.id}`}>Ver temporadas</Link>
            <Link href={`${base}/fichas`}>Todos los clientes</Link>
          </nav>
        </header>

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Escandallos</h2>

            <Link
              href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/nuevo`}
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Nuevo escandallo
            </Link>
          </div>

          {escandallosEnEstudio.length === 0 && escandallosProduccion.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todavía no hay escandallos para esta temporada.
            </p>
          ) : (
            <div className="space-y-8">
              {/* BLOQUE 1: Escandallos en estudio */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Escandallos en estudio</h3>

                {escandallosEnEstudio.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No hay escandallos en estudio. Crea uno nuevo o pasa alguno a producción.
                  </p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-900/80">
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-2">Modelo interno</th>
                        <th className="text-left py-2 px-2">Modelo cliente</th>
                        <th className="text-left py-2 px-2">Patrón</th>
                        <th className="text-left py-2 px-2">Estado</th>
                        <th className="text-right py-2 px-2">Total</th>
                        <th className="text-right py-2 px-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {escandallosEnEstudio.map((e) => (
                        <tr key={e.id} className="border-b border-slate-800 last:border-0">
                          <td className="py-2 pr-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-100">
                                {e.modeloInterno || `#${e.id}`}
                              </span>

                              <span className="text-[11px] text-slate-500">
                                Ref. cliente: {e.modeloCliente || "—"}
                              </span>

                              <span className="text-[11px] text-slate-400 line-clamp-2">
                                {e.articulo?.descripcion || "—"}
                              </span>
                            </div>
                          </td>

                          <td className="py-2 px-2 text-xs text-slate-300">{e.modeloCliente || "—"}</td>
                          <td className="py-2 px-2 text-xs text-slate-300">{e.patron || "—"}</td>

                          <td className="py-2 px-2 text-xs">
                            <span className="inline-flex items-center rounded-full px-2 py-[2px] border text-[11px] border-slate-600 text-slate-300">
                              Escandallo
                            </span>
                          </td>

                          <td className="py-2 px-2 text-xs text-right">
                            {e.totalCoste != null ? `${e.totalCoste.toFixed(2)} €` : "—"}
                          </td>

                          <td className="py-2 pl-2 text-right space-x-2">
                            <Link
                              href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${e.id}`}
                              className="text-xs text-emerald-400 hover:text-emerald-300 underline"
                            >
                              Ver
                            </Link>

                            {e._count.pedidos === 0 ? (
                              <form
                                action={`${base}/api/escandallos/${e.id}/delete`}
                                method="POST"
                                className="inline"
                              >
                                <DeleteButton
                                  label="Eliminar"
                                  confirmText={`Eliminar escandallo "${e.modeloInterno || `#${e.id}`}". Esta acción no se puede deshacer. ¿Continuar?`}
                                />
                              </form>
                            ) : (
                              <span className="text-[11px] text-slate-500">Bloqueado</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* BLOQUE 2: Modelos en producción */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Modelos en producción</h3>

                {escandallosProduccion.length === 0 ? (
                  <p className="text-xs text-slate-500">Ningún modelo ha sido pasado aún a producción.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-900/80">
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-2">Modelo interno</th>
                        <th className="text-left py-2 px-2">Modelo cliente</th>
                        <th className="text-left py-2 px-2">Patrón</th>
                        <th className="text-left py-2 px-2">Estado</th>
                        <th className="text-right py-2 px-2">Total</th>
                        <th className="text-right py-2 px-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {escandallosProduccion.map((e) => {
                        const tienePedido = e._count.pedidos > 0;
                        const hrefVer = tienePedido
                          ? `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${e.id}/pedido`
                          : `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${e.id}/produccion/pedido`;

                        return (
                          <tr key={e.id} className="border-b border-slate-800 last:border-0">
                            <td className="py-2 pr-2">
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-100">
                                  {e.modeloInterno || `#${e.id}`}
                                </span>

                                <span className="text-[11px] text-slate-500">
                                  Ref. cliente: {e.modeloCliente || "—"}
                                </span>

                                <span className="text-[11px] text-slate-400 line-clamp-2">
                                  {e.articulo?.descripcion || "—"}
                                </span>
                              </div>
                            </td>


                            <td className="py-2 px-2 text-xs text-slate-300">{e.modeloCliente || "—"}</td>
                            <td className="py-2 px-2 text-xs text-slate-300">{e.patron || "—"}</td>

                            <td className="py-2 px-2 text-xs">
                              <span className="inline-flex items-center rounded-full px-2 py-[2px] border text-[11px] border-emerald-500 text-emerald-400">
                                En producción
                              </span>
                            </td>

                            <td className="py-2 px-2 text-xs text-right">
                              {e.totalCoste != null ? `${e.totalCoste.toFixed(2)} €` : "—"}
                            </td>

                            <td className="py-2 pl-2 text-right space-x-2">
                              <Link href={hrefVer} className="text-xs text-emerald-400 hover:text-emerald-300 underline">
                                Ver
                              </Link>

                              {!tienePedido ? (
                                <form
                                  action={`${base}/api/escandallos/${e.id}/delete`}
                                  method="POST"
                                  className="inline"
                                >
                                  <DeleteButton
                                    label="Eliminar"
                                    confirmText={`Eliminar escandallo "${e.modeloInterno || `#${e.id}`}". Esta acción no se puede deshacer. ¿Continuar?`}
                                  />
                                </form>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  Bloqueado ({e._count.pedidos})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
