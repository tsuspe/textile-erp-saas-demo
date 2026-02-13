// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/control/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PedidosTabs from "../produccion/PedidosTabs";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

const formatDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export default async function ControlPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if (![cId, tId, eId].every(Number.isFinite)) notFound();

  // ✅ 1) Resolver empresaId por slug (y usar slug canónico para base)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // ✅ 2) Cliente debe pertenecer a la empresa
  const clienteOk = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true },
  });
  if (!clienteOk) notFound();

  // ✅ 3) Temporada existe (si es global, con esto vale)
  const temporadaOk = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true },
  });
  if (!temporadaOk) notFound();

  // ✅ 4) Escandallo SIEMPRE filtrado por empresaId + ids de ruta
  const escandallo = await prisma.escandallo.findFirst({
    where: {
      id: eId,
      empresaId,
      clienteId: cId,
      temporadaId: tId,
    },
    include: {
      cliente: true,
      temporada: true,
      pedidos: {
        include: {
          colores: true,
        },
      },
    },
  });

  if (!escandallo) notFound();

  const cliente = escandallo.cliente;
  const temporada = escandallo.temporada;
  const pedido = escandallo.pedidos[0] ?? null;

  const escandalloHref = `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${escandallo.id}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;

  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const almacenEditHref = `${produccionBaseHref}/almacen`;

  const controlViewHref = `${escandalloHref}/control`;
  const controlEditHref = `${produccionBaseHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;
  const controlPrintHref = `${escandalloHref}/control/print`;

  // ¿Hay ficha de almacén guardada?
  const tienePreparacionAlmacen = !!pedido?.preparacionAlmacen;

  // Pestaña "Almacén": vista si hay datos, edición si no.
  const almacenHrefForTabs = tienePreparacionAlmacen ? almacenViewHref : almacenEditHref;

  const control = (pedido?.controlCalidad || null) as any;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* HEADER */}
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              <Link href={`${base}/fichas`} className="hover:text-emerald-400">
                Fichas
              </Link>{" "}
              /{" "}
              <Link href={`${base}/fichas/${cliente.id}`} className="hover:text-emerald-400">
                {cliente.nombre}
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`}
                className="hover:text-emerald-400"
              >
                Temporada {temporada.codigo}
              </Link>{" "}
              / Control calidad{" "}
              {escandallo.modeloInterno || escandallo.modeloCliente || `#${escandallo.id}`}
            </p>

            <h1 className="text-2xl font-semibold">
              Control de calidad{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno || escandallo.modeloCliente || `#${escandallo.id}`}
              </span>
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* fila 1: navegación + editar */}
            <div className="flex flex-wrap gap-2 justify-end">
              <Link
                href={`${base}/fichas/${cliente.id}`}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Volver a cliente
              </Link>

              <Link
                href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Volver a temporada
              </Link>

              <Link
                href={controlEditHref}
                className="inline-flex items-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Editar control calidad
              </Link>
            </div>

            {/* fila 2: PDFs */}
            {pedido && (
              <div className="flex flex-wrap gap-2 justify-end">
                <Link
                  href={`${controlPrintHref}?modo=completo`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF completo
                </Link>

                <Link
                  href={`${controlPrintHref}?modo=simple`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF solo medidas
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* TABS: solo cuando está en PRODUCCION */}
        {escandallo.estado === "PRODUCCION" && (
          <PedidosTabs
            baseHref={produccionBaseHref}
            escandalloHref={escandalloHref}
            active="control"
            pedidoHref={pedidoViewHref}
            almacenHref={almacenHrefForTabs}
            controlHref={controlViewHref}
            observacionesHref={observacionesViewHref}
          />
        )}

        {!pedido && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
            <p className="text-sm">Este modelo está en producción pero aún no tiene pedido asociado.</p>
          </section>
        )}

        {pedido && (
          <>
            {/* CABECERA + FOTO (versión compacta) */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3 text-xs">
                <h2 className="text-lg font-semibold mb-1">Datos del pedido</h2>
                <p className="text-slate-400 mb-2">
                  Cliente <span className="text-emerald-400">{cliente.nombre}</span> · Temporada{" "}
                  <span className="text-emerald-400">{temporada.codigo}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-slate-400">Nº pedido</p>
                    <p className="font-medium">{pedido.numeroPedido || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Fecha pedido</p>
                    <p className="font-medium">{formatDate(pedido.fechaPedido)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Fecha entrega</p>
                    <p className="font-medium">{formatDate(pedido.fechaEntrega)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <p className="text-slate-400">Modelo interno</p>
                    <p className="font-medium">{pedido.modeloInterno || escandallo.modeloInterno || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Modelo / ref. cliente</p>
                    <p className="font-medium">{pedido.modeloCliente || escandallo.modeloCliente || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Patrón</p>
                    <p className="font-medium">{pedido.patron || escandallo.patron || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between gap-3">
                <div className="w-full aspect-[3/4] rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden">
                  {pedido.imagenUrl || escandallo.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(pedido.imagenUrl || escandallo.imagenUrl) as string}
                      alt="Imagen modelo"
                      className="max-h-full w-auto object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-500">Sin imagen asociada</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  Imagen modelo / referencia visual para control de calidad.
                </p>
              </div>
            </section>

            {/* EMPTY STATE si no hay control guardado */}
            {(!control || !Array.isArray(control.colores) || control.colores.length === 0) && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
                <p className="text-sm text-slate-200">
                  Todavía no hay un control de calidad guardado para este pedido.
                </p>
                <div className="mt-3">
                  <Link
                    href={controlEditHref}
                    className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Crear / editar control de calidad
                  </Link>
                </div>
              </section>
            )}

            {/* MEDIDAS POR COLOR */}
            {control && Array.isArray(control.colores) && control.colores.length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h2 className="text-lg font-semibold">Medidas importantes</h2>

                {asArray<any>(control.colores).map((c) => {
                  const tallas = asArray<string>(c?.tallas);
                  const medidas = asArray<any>(c?.medidas);

                  return (
                    <div
                      key={String(c?.pedidoColorId ?? crypto.randomUUID())}
                      className="border border-slate-800 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-400 text-xs">Color</p>
                          <p className="font-medium text-sm">{c?.color || "—"}</p>
                          <p className="text-[11px] text-slate-500">Tipo talla: {c?.tipoTalla || "—"}</p>
                        </div>
                      </div>

                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-xs border border-slate-800 rounded-md">
                          <thead className="bg-slate-900/60">
                            <tr>
                              <th className="px-2 py-1 text-left">Medida</th>
                              {tallas.map((t) => (
                                <th key={t} className="px-2 py-1 text-center font-normal">
                                  {t}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {medidas.map((m, idx) => {
                              const valores = asArray<any>(m?.valores);
                              const allEmpty = !valores.some(
                                (v) => v != null && String(v).trim().length > 0,
                              );

                              if ((!m?.nombre || String(m.nombre).trim() === "") && allEmpty) return null;

                              return (
                                <tr key={String(m?.id ?? idx)} className="border-t border-slate-800/60">
                                  <td className="px-2 py-1">{m?.nombre ? String(m.nombre) : "—"}</td>
                                  {tallas.map((_, i) => (
                                    <td key={i} className="px-2 py-1 text-center">
                                      {valores[i] != null && String(valores[i]).trim() !== "" ? valores[i] : "—"}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* OBSERVACIONES */}
            {control?.observaciones && String(control.observaciones).trim().length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">Observaciones de control de calidad</h2>
                <p className="text-sm text-slate-100 whitespace-pre-line">{String(control.observaciones)}</p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
