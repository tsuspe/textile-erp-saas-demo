// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/pedido/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PedidosTabs from "../produccion/PedidosTabs";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

export default async function PedidoPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  // ✅ UX: si la ruta es basura, vuelve a fichas (no petes la app)
  if (![cId, tId, eId].every(Number.isFinite)) {
    redirect(`/${empresa}/fichas?err=ruta_invalida`);
  }

  // 1) Resolver empresaId por slug (CLAVE multi-empresa)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) Cliente debe pertenecer a empresa
  const clienteOk = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true },
  });
  if (!clienteOk) notFound();

  // 3) Temporada existe (compartida)
  const temporadaOk = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true, codigo: true },
  });
  if (!temporadaOk) notFound();

  // 4) Escandallo SIEMPRE filtrado por empresaId + ids ruta
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
      articulo: { select: { descripcion: true } },
      pedidos: {
        include: {
          tejidos: true,
          forros: true,
          accesorios: true,
          colores: true,
        },
      },
    },
  });

  if (!escandallo) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-red-400">Escandallo no encontrado.</p>
          <Link
            href={`${base}/fichas`}
            className="underline text-sm mt-4 inline-block"
          >
            Volver a fichas
          </Link>
        </div>
      </main>
    );
  }

  // 🔹 Datos base
  const cliente = escandallo.cliente;
  const temporada = escandallo.temporada;
  const pedido = escandallo.pedidos[0] ?? null;

  // 🔹 URLs base para pestañas y navegación (YA CON EMPRESA)
  const escandalloHref = `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${escandallo.id}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;
  const produccionPedidoHref = produccionBaseHref;

  // 🔹 Rutas de VISUALIZACIÓN para pestañas
  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const controlViewHref = `${escandalloHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* BREADCRUMB + BOTONES SUPERIORES */}
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              <Link
                href={`${base}/fichas`}
                className="hover:text-emerald-400 transition-colors"
              >
                Fichas
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/fichas/${cliente.id}`}
                className="hover:text-emerald-400 transition-colors"
              >
                {cliente.nombre}
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`}
                className="hover:text-emerald-400 transition-colors"
              >
                Temporada {temporada.codigo}
              </Link>{" "}
              / Pedido{" "}
              {escandallo.modeloInterno ||
                escandallo.modeloCliente ||
                `#${escandallo.id}`}
            </p>

            <h1 className="text-2xl font-semibold">
              Pedido{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno ||
                  escandallo.modeloCliente ||
                  `#${escandallo.id}`}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Cliente: {cliente.nombre} · Temporada {temporada.codigo}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* fila 1: navegación estándar */}
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
                href={produccionBaseHref}
                className="inline-flex items-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
              >
                Editar pedido
              </Link>
            </div>

            {/* fila 2: PDFs */}
            {pedido && (
              <div className="flex flex-wrap gap-2 justify-end">
                <Link
                  href={`${escandalloHref}/pedido/print?modo=completo`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF completo
                </Link>

                <Link
                  href={`${escandalloHref}/pedido/print?modo=simple`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF sin precios
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* PESTAÑAS */}
        <PedidosTabs
          baseHref={produccionBaseHref}
          escandalloHref={escandalloHref}
          active="pedido"
          pedidoHref={pedidoViewHref}
          almacenHref={almacenViewHref}
          controlHref={controlViewHref}
          observacionesHref={observacionesViewHref}
        />

        {/* SI NO HAY PEDIDO */}
        {!pedido && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
            <p className="text-sm text-slate-200">
              Este escandallo todavía no tiene pedido asociado.
            </p>
            <Link
              href={produccionPedidoHref}
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Crear pedido desde producción
            </Link>
          </section>
        )}

        {/* SI HAY PEDIDO, MOSTRAMOS DETALLE */}
        {pedido && (
          <>
            {/* DATOS GENERALES */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-semibold mb-1">Datos del pedido</h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">Nº pedido</p>
                    <p className="font-medium">{pedido.numeroPedido || "—"}</p>
                  </div>

                  <div>
                    <p className="text-slate-400">Fecha pedido</p>
                    <p className="font-medium">
                      {pedido.fechaPedido
                        ? pedido.fechaPedido.toISOString().slice(0, 10)
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Fecha entrega</p>
                    <p className="font-medium">
                      {pedido.fechaEntrega
                        ? pedido.fechaEntrega.toISOString().slice(0, 10)
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Modelo interno</p>
                    <p className="font-medium">
                      {pedido.modeloInterno || escandallo.modeloInterno || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Modelo / cod. alternativo 1</p>
                    <p className="font-medium">
                      {pedido.modeloCliente || escandallo.modeloCliente || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Patrón / cod. alternativo 2</p>
                    <p className="font-medium">
                      {pedido.patron || escandallo.patron || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <p className="text-slate-400">Descripción artículo pedido</p>
                    <p className="font-medium">
                      {pedido.descripcionPedido || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Descripción interna (artículo)</p>
                    <p className="text-slate-200">
                      {escandallo.articulo?.descripcion || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">Coste (escandallo)</p>
                    <p className="font-medium">
                      {pedido.costeEscandallo != null
                        ? `${pedido.costeEscandallo.toFixed(2)} €`
                        : escandallo.totalCoste != null
                          ? `${escandallo.totalCoste.toFixed(2)} €`
                          : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Precio venta (pedido)</p>
                    <p className="font-medium">
                      {pedido.precioVenta != null
                        ? `${Number(pedido.precioVenta).toFixed(2)} €`
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">PVP (etiqueta)</p>
                    <p className="font-medium">
                      {pedido.pvp != null
                        ? `${Number(pedido.pvp).toFixed(2)} €`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* IMAGEN */}
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
                    <span className="text-xs text-slate-500">
                      Sin imagen asociada
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  Imagen modelo / referencia visual del pedido.
                </p>
              </div>
            </section>

            {/* COLORES Y TALLAS */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Colores y tallas</h2>

              {pedido.colores.length === 0 && (
                <p className="text-xs text-slate-400">
                  No hay colores/tallas definidos en este pedido.
                </p>
              )}

              {pedido.colores.map((c) => {
                const dist = (c.distribucion as any) || {};
                const tallas: string[] = dist.tallas ?? [];
                const unidades: number[] = dist.unidades ?? [];
                const total: number = dist.total ?? 0;

                return (
                  <div
                    key={c.id}
                    className="border border-slate-800 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <p className="text-slate-400">Color</p>
                        <p className="font-medium">{c.color || "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Tipo de tallas</p>
                        <p className="font-medium">
                          {c.tipoTalla === "LETRAS"
                            ? "Letras (XXS–XXL)"
                            : c.tipoTalla === "NUMEROS"
                              ? "Números (34–48)"
                              : "Personalizado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Total unidades</p>
                        <p className="font-medium">{total}</p>
                      </div>
                    </div>

                    {tallas.length > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-xs border border-slate-800 rounded-md">
                          <thead className="bg-slate-900/60">
                            <tr>
                              {tallas.map((talla) => (
                                <th
                                  key={talla}
                                  className="px-2 py-1 border-b border-slate-800 text-center font-normal"
                                >
                                  {talla}
                                </th>
                              ))}
                              <th className="px-2 py-1 border-b border-slate-800 text-right font-normal">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {tallas.map((talla, idx) => {
                                const valor = unidades[idx] ?? 0;
                                return (
                                  <td
                                    key={talla}
                                    className="px-2 py-1 text-center text-slate-200"
                                  >
                                    {valor > 0 ? valor : ""}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-1 text-right text-slate-200">
                                {total}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Sin distribución de tallas definida.
                      </p>
                    )}
                  </div>
                );
              })}
            </section>

            {/* TEJIDOS */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Tejidos</h2>

              {pedido.tejidos.length === 0 && (
                <p className="text-xs text-slate-400">
                  No hay tejidos registrados para este pedido.
                </p>
              )}

              {pedido.tejidos.map((t) => (
                <div
                  key={t.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400">Proveedor</p>
                      <p className="font-medium">{t.proveedor || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Serie</p>
                      <p className="font-medium">{t.serie || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Color tejido</p>
                      <p className="font-medium">{t.color || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Composición</p>
                      <p className="font-medium">{t.composicion || "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400">
                        Consumo producción (m / prenda)
                      </p>
                      <p className="font-medium">
                        {t.consumoProduccion != null
                          ? t.consumoProduccion.toFixed(3)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Metros pedidos</p>
                      <p className="font-medium">
                        {t.metrosPedidos != null
                          ? t.metrosPedidos.toFixed(2)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Fecha pedido tejido</p>
                      <p className="font-medium">
                        {t.fechaPedido
                          ? t.fechaPedido.toISOString().slice(0, 10)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* FORROS */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Forros</h2>

              {pedido.forros.length === 0 && (
                <p className="text-xs text-slate-400">
                  No hay forros registrados para este pedido.
                </p>
              )}

              {pedido.forros.map((f) => (
                <div
                  key={f.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400">Proveedor</p>
                      <p className="font-medium">{f.proveedor || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Serie</p>
                      <p className="font-medium">{f.serie || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Color forro</p>
                      <p className="font-medium">{f.color || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Composición</p>
                      <p className="font-medium">{f.composicion || "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400">
                        Consumo producción (m / prenda)
                      </p>
                      <p className="font-medium">
                        {f.consumoProduccion != null
                          ? f.consumoProduccion.toFixed(3)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Metros pedidos</p>
                      <p className="font-medium">
                        {f.metrosPedidos != null
                          ? f.metrosPedidos.toFixed(2)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Fecha pedido forro</p>
                      <p className="font-medium">
                        {f.fechaPedido
                          ? f.fechaPedido.toISOString().slice(0, 10)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* ACCESORIOS */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Fornituras / Accesorios</h2>

              {pedido.accesorios.length === 0 && (
                <p className="text-xs text-slate-400">
                  No hay accesorios registrados para este pedido.
                </p>
              )}

              {pedido.accesorios.map((a) => (
                <div
                  key={a.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-slate-400">Nombre</p>
                      <p className="font-medium">{a.nombre || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Proveedor</p>
                      <p className="font-medium">{a.proveedor || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Referencia</p>
                      <p className="font-medium">{a.referencia || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Color accesorio</p>
                      <p className="font-medium">{a.color || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Medida</p>
                      <p className="font-medium">{a.medida || "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-slate-400">Unidad</p>
                      <p className="font-medium">{a.unidad || "UNIDADES"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">
                        Consumo escandallo (por prenda)
                      </p>
                      <p className="font-medium">
                        {a.consumoEsc != null ? a.consumoEsc.toFixed(3) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Cantidad / metros pedidos</p>
                      <p className="font-medium">
                        {a.cantidadPed != null ? a.cantidadPed.toFixed(2) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Fecha pedido</p>
                      <p className="font-medium">
                        {a.fechaPedido
                          ? a.fechaPedido.toISOString().slice(0, 10)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* OBSERVACIONES */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-semibold">Observaciones</h2>
              <p className="text-sm text-slate-200 whitespace-pre-line">
                {pedido.observaciones || "Sin observaciones adicionales."}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
