// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/almacen/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PedidosTabs from "../produccion/PedidosTabs";

type PageProps = {
  // ✅ Next 16: params puede venir async en App Router (en tu proyecto ya lo usas así)
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

const formatDate = (d: Date | string | null) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
};

const formatCurrency = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(2)} €`;

const toNum = (v: number | null | undefined): number =>
  v == null || Number.isNaN(v) ? 0 : Number(v);

type PrepDate = string | Date | null;

type PreparacionAlmacen = {
  perchas?: { modelo?: string | null; unidades?: number | null; fecha?: PrepDate } | null;
  bolsas?: { modelo?: string | null; unidades?: number | null; fecha?: PrepDate } | null;
  checks?: Record<string, unknown> | null;
};

function asPreparacionAlmacen(value: unknown): PreparacionAlmacen | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as PreparacionAlmacen;
}

export default async function AlmacenPage({ params }: PageProps) {
  // ✅ IMPORTANTE: await params
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  // ✅ UX: ruta basura => 404 (no petar con throw)
  if (![cId, tId, eId].every(Number.isFinite)) notFound();

  // 1) ✅ Resolver empresaId por slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 2) ✅ Cliente debe pertenecer a empresa
  const clienteOk = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true },
  });
  if (!clienteOk) notFound();

  // 3) ✅ Temporada existe (si es compartida, no filtra por empresa)
  const temporadaOk = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true },
  });
  if (!temporadaOk) notFound();

  // 4) ✅ Escandallo SIEMPRE por empresaId + ids ruta
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
          colores: true,
          tejidos: true,
          forros: true,
          accesorios: true,
        },
      },
    },
  });

  if (!escandallo) notFound();

  const cliente = escandallo.cliente;
  const temporada = escandallo.temporada;
  const pedido = escandallo.pedidos[0] ?? null;
  const prep = asPreparacionAlmacen(pedido?.preparacionAlmacen);

  // Imagen priorizando pedido y luego escandallo
  const fotoModeloUrl = pedido?.imagenUrl || escandallo.imagenUrl || null;

  // 🔹 URLs base
  const escandalloHref = `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${escandallo.id}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;
  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const almacenEditHref = `${produccionBaseHref}/almacen`;
  const controlViewHref = `${escandalloHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;
  const almacenPrintHref = `${escandalloHref}/almacen/print`;

  // 🔹 Cálculos globales si hay pedido
  let prendasPedidoTotales = 0;
  let prendasCortadasTotales = 0;
  let prendasAdelantosTotales = 0;
  let prendasEntregasTotales = 0;

  if (pedido) {
    for (const c of pedido.colores) {
      const dist: any = c.distribucion || {};
      const tallas: string[] = dist.tallas ?? [];
      const unidadesPedido: number[] = dist.unidades ?? Array(tallas.length).fill(0);
      const corteUnidades: number[] = dist.corte?.unidades ?? Array(tallas.length).fill(0);
      const adelantosUnidades: number[] = dist.adelantos?.unidades ?? Array(tallas.length).fill(0);
      const entregasUnidades: number[] = dist.entregas?.unidades ?? Array(tallas.length).fill(0);

      prendasPedidoTotales += unidadesPedido.reduce((acc, n) => acc + (Number(n) || 0), 0);
      prendasCortadasTotales += corteUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);
      prendasAdelantosTotales += adelantosUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);
      prendasEntregasTotales += entregasUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);
    }
  }

  // 🔹 Tejidos: cálculos por línea y totales
  const tejidosCalculados =
    pedido?.tejidos.map((t) => {
      const consumoProduccion = toNum(t.consumoProduccion);
      const consumoCorte = t.consumoCorte != null ? toNum(t.consumoCorte) : consumoProduccion;

      const metrosPedidos = toNum(t.metrosPedidos);
      const metrosRecibidos = toNum(t.metrosRecibidos);

      const metrosGastados = prendasCortadasTotales * consumoCorte;
      const metrosQuedan = metrosRecibidos - metrosGastados;
      const metrosNecesarios = prendasCortadasTotales * consumoProduccion;

      return {
        t,
        consumoProduccion,
        consumoCorte,
        metrosPedidos,
        metrosRecibidos,
        metrosGastados,
        metrosQuedan,
        metrosNecesarios,
      };
    }) ?? [];

  const totalTejidosPedidos = tejidosCalculados.reduce((acc, item) => acc + item.metrosPedidos, 0);
  const totalTejidosRecibidos = tejidosCalculados.reduce((acc, item) => acc + item.metrosRecibidos, 0);

  // 🔹 Forros: cálculos por línea y totales
  const forrosCalculados =
    pedido?.forros.map((f) => {
      const consumoProduccion = toNum(f.consumoProduccion);
      const consumoCorte = f.consumoCorte != null ? toNum(f.consumoCorte) : consumoProduccion;

      const metrosPedidos = toNum(f.metrosPedidos);
      const metrosRecibidos = toNum(f.metrosRecibidos);

      const metrosGastados = prendasCortadasTotales * consumoCorte;
      const metrosQuedan = metrosRecibidos - metrosGastados;
      const metrosNecesarios = prendasCortadasTotales * consumoProduccion;

      return {
        f,
        consumoProduccion,
        consumoCorte,
        metrosPedidos,
        metrosRecibidos,
        metrosGastados,
        metrosQuedan,
        metrosNecesarios,
      };
    }) ?? [];

  const totalForrosPedidos = forrosCalculados.reduce((acc, item) => acc + item.metrosPedidos, 0);
  const totalForrosRecibidos = forrosCalculados.reduce((acc, item) => acc + item.metrosRecibidos, 0);

  // 🔹 Accesorios: cálculos por línea
  const accesoriosCalculados =
    pedido?.accesorios.map((a) => {
      const necesarios = toNum(a.cantidadPed);
      const recibidas = toNum(a.unidadesRecibidas);
      const sobran = recibidas - necesarios;
      return { a, necesarios, recibidas, sobran };
    }) ?? [];
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* BREADCRUMB + BOTONES */}
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              <Link href={`${base}/fichas`} className="hover:text-emerald-400">
                Fichas
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/fichas/${cliente.id}`}
                className="hover:text-emerald-400"
              >
                {cliente.nombre}
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`}
                className="hover:text-emerald-400"
              >
                Temporada {temporada.codigo}
              </Link>{" "}
              / Almacén{" "}
              {escandallo.modeloInterno ||
                escandallo.modeloCliente ||
                `#${escandallo.id}`}
            </p>

            <h1 className="text-2xl font-semibold">
              Ficha almacén{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno ||
                  escandallo.modeloCliente ||
                  `#${escandallo.id}`}
              </span>
            </h1>
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
                href={almacenEditHref}
                className="inline-flex items-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Editar almacén
              </Link>
            </div>

            {/* fila 2: PDFs */}
            {pedido && (
              <div className="flex flex-wrap gap-2 justify-end">
                <Link
                  href={`${almacenPrintHref}?modo=completo`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF completo
                </Link>

                <Link
                  href={`${almacenPrintHref}?modo=simple`}
                  target="_blank"
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  PDF sin precios
                </Link>
              </div>
            )}

          </div>

        </header>

        {/* 🔹 PESTAÑAS (solo si está en PRODUCCION) */}
        {escandallo.estado === "PRODUCCION" && (
          <PedidosTabs
            baseHref={produccionBaseHref}
            escandalloHref={escandalloHref}
            active="almacen"
            pedidoHref={pedidoViewHref}
            almacenHref={almacenViewHref}
            controlHref={controlViewHref}
            observacionesHref={observacionesViewHref}
          />
        )}

        {!pedido && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
            <p className="text-sm">
              Este modelo está en producción pero aún no tiene pedido asociado.
            </p>
          </section>
        )}

        {pedido && (
          <>
            {/* DATOS DEL PEDIDO + IMAGEN */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Bloque datos */}
              <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Datos del pedido</h2>

                <p className="text-xs text-slate-400">
                  Cliente{" "}
                  <span className="text-emerald-400">{cliente.nombre}</span> ·
                  Temporada{" "}
                  <span className="text-emerald-400">{temporada.codigo}</span> ·
                  Escandallo{" "}
                  <span className="text-emerald-400">
                    {escandallo.modeloInterno || `#${escandallo.id}`}
                  </span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">Nº pedido</p>
                    <p className="text-slate-100">
                      {pedido.numeroPedido || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Fecha pedido</p>
                    <p className="text-slate-100">
                      {formatDate(pedido.fechaPedido)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Fecha entrega</p>
                    <p className="text-slate-100">
                      {formatDate(pedido.fechaEntrega)}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400 mb-1">Modelo interno</p>
                    <p className="text-slate-100">
                      {pedido.modeloInterno ||
                        escandallo.modeloInterno ||
                        "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">
                      Modelo / ref. cliente
                    </p>
                    <p className="text-slate-100">
                      {pedido.modeloCliente ||
                        escandallo.modeloCliente ||
                        "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Patrón</p>
                    <p className="text-slate-100">
                      {pedido.patron || escandallo.patron || "—"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">
                      Descripción artículo pedido
                    </p>
                    <p className="text-slate-100">
                      {pedido.descripcionPedido || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">
                      Descripción interna (artículo)
                    </p>
                    <p className="text-slate-200">
                      {escandallo.articulo?.descripcion || "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">Coste escandallo</p>
                    <p className="text-slate-100">
                      {formatCurrency(
                        pedido.costeEscandallo ?? escandallo.totalCoste ?? null,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">
                      Precio venta pedido
                    </p>
                    <p className="text-slate-100">
                      {formatCurrency(pedido.precioVenta)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">PVP etiqueta</p>
                    <p className="text-slate-100">
                      {formatCurrency(pedido.pvp)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bloque imagen */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between gap-3">
                <div className="w-full aspect-[3/4] rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden">
                  {fotoModeloUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(fotoModeloUrl) as string}
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

            {/* CABECERA CORTE / CONFECCIÓN */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Datos de corte y confección
                </h2>

                {prendasPedidoTotales > 0 && (
                  <p className="text-xs text-slate-400">
                    Pedido:{" "}
                    <span className="font-semibold text-slate-100">
                      {prendasPedidoTotales}
                    </span>{" "}
                    · Corte:{" "}
                    <span className="font-semibold text-emerald-400">
                      {prendasCortadasTotales}
                    </span>{" "}
                    · Adelantos:{" "}
                    <span className="font-semibold text-sky-300">
                      {prendasAdelantosTotales}
                    </span>{" "}
                    · Entregadas:{" "}
                    <span className="font-semibold text-amber-300">
                      {prendasEntregasTotales}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* CORTE */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-emerald-400">Corte</h3>

                  <p>
                    <span className="text-slate-400">Taller:</span>{" "}
                    {pedido.tallerCorte || "—"}
                  </p>
                  <p>
                    <span className="text-slate-400">Fecha:</span>{" "}
                    {formatDate(pedido.fechaCorte)}
                  </p>
                  <p>
                    <span className="text-slate-400">Albarán:</span>{" "}
                    {pedido.albaranCorte || "—"}
                  </p>
                  <p>
                    <span className="text-slate-400">Precio corte:</span>{" "}
                    {formatCurrency(pedido.precioCorte)}
                  </p>
                </div>

                {/* CONFECCIÓN */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-emerald-400">Confección</h3>

                  <p>
                    <span className="text-slate-400">Taller:</span>{" "}
                    {pedido.tallerConfeccion || "—"}
                  </p>
                  <p>
                    <span className="text-slate-400">Fecha:</span>{" "}
                    {formatDate(pedido.fechaConfeccion)}
                  </p>
                  <p>
                    <span className="text-slate-400">Albarán:</span>{" "}
                    {pedido.albaranConfeccion || "—"}
                  </p>
                  <p>
                    <span className="text-slate-400">
                      Precio confección:
                    </span>{" "}
                    {formatCurrency(pedido.precioConfeccion)}
                  </p>
                </div>
              </div>
            </section>

            {/* RESUMEN ALMACÉN */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <h3 className="text-sm font-semibold">Resumen almacén</h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <p className="text-slate-300">
                  Pedido:{" "}
                  <span className="font-semibold">{prendasPedidoTotales}</span>
                </p>
                <p className="text-slate-300">
                  Cortadas:{" "}
                  <span className="font-semibold text-emerald-400">
                    {prendasCortadasTotales}
                  </span>
                </p>
                <p className="text-slate-300">
                  Adelantos:{" "}
                  <span className="font-semibold text-sky-300">
                    {prendasAdelantosTotales}
                  </span>
                </p>
                <p className="text-slate-300">
                  Entregadas:{" "}
                  <span className="font-semibold text-amber-300">
                    {prendasEntregasTotales}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <p className="text-slate-300">
                  Tejidos · pedidos / recibidos:{" "}
                  <span className="font-semibold">
                    {totalTejidosPedidos.toFixed(2)} m
                  </span>{" "}
                  /{" "}
                  <span className="font-semibold text-emerald-400">
                    {totalTejidosRecibidos.toFixed(2)} m
                  </span>
                </p>
                <p className="text-slate-300">
                  Forros · pedidos / recibidos:{" "}
                  <span className="font-semibold">
                    {totalForrosPedidos.toFixed(2)} m
                  </span>{" "}
                  /{" "}
                  <span className="font-semibold text-emerald-400">
                    {totalForrosRecibidos.toFixed(2)} m
                  </span>
                </p>
              </div>
            </section>

            {/* COLORES Y TALLAS */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">Colores y tallas</h2>

              {pedido.colores.length === 0 && (
                <p className="text-xs text-slate-400">
                  Este pedido no tiene colores/tallas definidos.
                </p>
              )}

              {pedido.colores.map((c) => {
                const dist: any = c.distribucion || {};
                const tallas: string[] = dist.tallas ?? [];
                const unidadesPedido: number[] = dist.unidades ?? [];
                const corteUnidades: number[] =
                  dist.corte?.unidades ?? Array(tallas.length).fill(0);
                const adelantosUnidades: number[] =
                  dist.adelantos?.unidades ?? Array(tallas.length).fill(0);
                const entregasUnidades: number[] =
                  dist.entregas?.unidades ?? Array(tallas.length).fill(0);

                const totalPedido = unidadesPedido.reduce(
                  (a, v) => a + (Number(v) || 0),
                  0,
                );
                const totalCorte = corteUnidades.reduce(
                  (a, v) => a + (Number(v) || 0),
                  0,
                );
                const totalAdelantos = adelantosUnidades.reduce(
                  (a, v) => a + (Number(v) || 0),
                  0,
                );
                const totalEntregas = entregasUnidades.reduce(
                  (a, v) => a + (Number(v) || 0),
                  0,
                );

                const displayUnidad = (value: number | undefined) => {
                  const n = Number(value ?? 0);
                  return n === 0 ? "" : n;
                };

                return (
                  <div
                    key={c.id}
                    className="border border-slate-800 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <p className="text-slate-400">Color</p>
                        <p className="font-medium">{c.color}</p>
                      </div>
                      <div className="text-right text-[11px] text-slate-400">
                        <p>Tipo talla: {c.tipoTalla}</p>
                      </div>
                    </div>

                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs border border-slate-800 rounded-md">
                        <thead className="bg-slate-900/60">
                          <tr>
                            <th className="px-2 py-1 text-left">Fila</th>
                            {tallas.map((t) => (
                              <th
                                key={t}
                                className="px-2 py-1 text-center font-normal"
                              >
                                {t}
                              </th>
                            ))}
                            <th className="px-2 py-1 text-right font-normal">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-2 py-1 font-semibold">Pedido</td>
                            {tallas.map((t, idx) => (
                              <td
                                key={t}
                                className="px-2 py-1 text-center text-slate-200"
                              >
                                {displayUnidad(unidadesPedido[idx])}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right">
                              {totalPedido}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-2 py-1 font-semibold">Corte</td>
                            {tallas.map((t, idx) => (
                              <td
                                key={t}
                                className="px-2 py-1 text-center text-emerald-300"
                              >
                                {displayUnidad(corteUnidades[idx])}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right">
                              {totalCorte}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-2 py-1 font-semibold">
                              Adelantos
                            </td>
                            {tallas.map((t, idx) => (
                              <td
                                key={t}
                                className="px-2 py-1 text-center text-sky-300"
                              >
                                {displayUnidad(adelantosUnidades[idx])}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right">
                              {totalAdelantos}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-2 py-1 font-semibold">
                              Entregadas
                            </td>
                            {tallas.map((t, idx) => (
                              <td
                                key={t}
                                className="px-2 py-1 text-center text-amber-300"
                              >
                                {displayUnidad(entregasUnidades[idx])}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-right">
                              {totalEntregas}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* TEJIDOS */}
            {tejidosCalculados.length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h2 className="text-lg font-semibold">Tejidos</h2>
                <p className="text-slate-400">
                  Metros gastados = prendas cortadas ({prendasCortadasTotales})
                  × consumo corte.
                </p>

                <div className="space-y-3">
                  {tejidosCalculados.map((item) => {
                    const { t } = item;
                    return (
                      <div
                        key={t.id}
                        className="border border-slate-800 rounded-lg p-4 space-y-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Proveedor</p>
                            <p>{t.proveedor || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Serie</p>
                            <p>{t.serie || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Color</p>
                            <p>{t.color || "—"}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-slate-400 mb-1">Composición</p>
                            <p>{t.composicion || "—"}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Consumo producción (m)</p>
                            <p>{item.consumoProduccion.toFixed(3)} m</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros necesarios (según producción)
                            </p>
                            <p>
                              {Number.isFinite(item.metrosNecesarios)
                                ? item.metrosNecesarios.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Consumo corte (m)</p>
                            <p className="text-emerald-300">
                              {item.consumoCorte.toFixed(3)} m / prenda
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Metros pedidos</p>
                            <p>{item.metrosPedidos.toFixed(2)} m</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Fecha pedido: {formatDate(t.fechaPedido)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Metros recibidos</p>
                            <p className="text-emerald-300">
                              {item.metrosRecibidos.toFixed(2)} m
                            </p>
                            <p className="text-[11px] text-emerald-400 mt-1">
                              Total recibido
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Fecha metros recibidos
                            </p>
                            <p className="text-emerald-300">
                              {formatDate(t.fechaMetrosRecibidos)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros gastados (corte)
                            </p>
                            <p className="text-emerald-300">
                              {Number.isFinite(item.metrosGastados)
                                ? item.metrosGastados.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros que quedan
                            </p>
                            <p className="text-emerald-300">
                              {Number.isFinite(item.metrosQuedan)
                                ? item.metrosQuedan.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* FORROS */}
            {forrosCalculados.length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h2 className="text-lg font-semibold">Forros</h2>
                <p className="text-slate-400">
                  Metros gastados = prendas cortadas ({prendasCortadasTotales})
                  × consumo corte.
                </p>

                <div className="space-y-3">
                  {forrosCalculados.map((item) => {
                    const { f } = item;
                    return (
                      <div
                        key={f.id}
                        className="border border-slate-800 rounded-lg p-4 space-y-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Proveedor</p>
                            <p>{f.proveedor || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Serie</p>
                            <p>{f.serie || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Color</p>
                            <p>{f.color || "—"}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-slate-400 mb-1">Composición</p>
                            <p>{f.composicion || "—"}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Consumo producción (m)</p>
                            <p>{item.consumoProduccion.toFixed(3)} m</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros necesarios (según producción)
                            </p>
                            <p>
                              {Number.isFinite(item.metrosNecesarios)
                                ? item.metrosNecesarios.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Consumo corte (m)</p>
                            <p className="text-emerald-300">
                              {item.consumoCorte.toFixed(3)} m / prenda
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Metros pedidos</p>
                            <p>{item.metrosPedidos.toFixed(2)} m</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Fecha pedido: {formatDate(f.fechaPedido)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Metros recibidos</p>
                            <p className="text-emerald-300">
                              {item.metrosRecibidos.toFixed(2)} m
                            </p>
                            <p className="text-[11px] text-emerald-400 mt-1">
                              Total recibido
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Fecha metros recibidos
                            </p>
                            <p className="text-emerald-300">
                              {formatDate(f.fechaMetrosRecibidos)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros gastados (corte)
                            </p>
                            <p className="text-emerald-300">
                              {Number.isFinite(item.metrosGastados)
                                ? item.metrosGastados.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Metros que quedan
                            </p>
                            <p className="text-emerald-300">
                              {Number.isFinite(item.metrosQuedan)
                                ? item.metrosQuedan.toFixed(2)
                                : "—"}{" "}
                              m
                            </p>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* FORNITURAS / ACCESORIOS */}
            {accesoriosCalculados.length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h2 className="text-lg font-semibold">
                  Fornituras y accesorios
                </h2>
                <p className="text-slate-400">
                  Sobran = unidades/metros recibidos – unidades/metros
                  necesarios del pedido.
                </p>

                <div className="space-y-3">
                  {accesoriosCalculados.map((item) => {
                    const { a } = item;
                    const unidad = a.unidad?.toLowerCase() || "uds";
                    return (
                      <div
                        key={a.id}
                        className="border border-slate-800 rounded-lg p-4 space-y-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">
                              Nombre accesorio
                            </p>
                            <p>{a.nombre || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Referencia</p>
                            <p>{a.referencia || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Proveedor</p>
                            <p>{a.proveedor || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Color</p>
                            <p>{a.color || "—"}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <p className="text-slate-400 mb-1">Medida</p>
                            <p>{a.medida || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">Unidad</p>
                            <p>{a.unidad || "—"}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 mb-1">
                              Consumo escandallo ({unidad})
                            </p>
                            <p>
                              {a.consumoEsc != null
                                ? a.consumoEsc.toFixed(2)
                                : "—"}{" "}
                              {unidad}
                            </p>
                          </div>
                        </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-slate-400 mb-1">
                            Necesarios pedido ({unidad})
                          </p>
                          <p>{item.necesarios.toFixed(2)}</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Fecha pedido: {formatDate(a.fechaPedido)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">
                            Unidades/metros recibidos
                          </p>
                          <p className="text-emerald-300">
                            {item.recibidas.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">
                            Fecha recibidos
                          </p>
                          <p className="text-emerald-300">
                            {formatDate(a.fechaRecibidas)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1">Albarán</p>
                          <p className="text-emerald-300">
                            {a.albaranAccesorio || "—"}
                          </p>
                          <p className="text-[11px] text-emerald-400 mt-1">
                            Sobran:{" "}
                            {Number.isFinite(item.sobran)
                              ? item.sobran.toFixed(2)
                              : "—"}{" "}
                            {unidad}
                          </p>
                        </div>
                      </div>

                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PREPARACIÓN ALMACÉN */}
            {prep && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Preparación de almacén</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="border border-slate-800 rounded-lg p-4 space-y-1">
                    <p className="text-sm font-semibold text-emerald-400">Perchas</p>
                    <p>
                      <span className="text-slate-400">Modelo:</span>{" "}
                      {prep.perchas?.modelo || "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Unidades:</span>{" "}
                      {prep.perchas?.unidades ?? "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Fecha:</span>{" "}
                      {formatDate(prep.perchas?.fecha ?? null)}
                    </p>
                  </div>

                  <div className="border border-slate-800 rounded-lg p-4 space-y-1">
                    <p className="text-sm font-semibold text-emerald-400">Bolsas</p>
                    <p>
                      <span className="text-slate-400">Modelo:</span>{" "}
                      {prep.bolsas?.modelo || "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Unidades:</span>{" "}
                      {prep.bolsas?.unidades ?? "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Fecha:</span>{" "}
                      {formatDate(prep.bolsas?.fecha ?? null)}
                    </p>
                  </div>
                </div>

                {prep.checks && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {(
                      [
                        ["etiquetasMarca", "Etiquetas marca"],
                        ["etiquetasTalla", "Etiquetas talla"],
                        ["compos", "Composiciones"],
                        ["alarmas", "Alarmas"],
                        ["etiquetasCarton", "Etiquetas cartón"],
                        ["marchamos", "Marchamos"],
                        ["etiquetasPrecio", "Etiquetas precio"],
                        ["pegatinas", "Pegatinas"],
                        ["talladores", "Talladores"],
                      ] as const
                    ).map(([key, label]) => {
                      const checks = prep.checks as Record<string, unknown>;
                      const checked = Boolean(checks?.[key]);
                      const comentario =
                        (checks?.[`${key}Comentario`] as string | null | undefined) ?? null;

                      return (
                        <div
                          key={key}
                          className="border border-slate-800 rounded-lg p-3 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-slate-200 text-xs">{label}</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold ${
                                checked
                                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                                  : "bg-slate-800 text-slate-400 border border-slate-600"
                              }`}
                            >
                              {checked ? "OK" : "No"}
                            </span>
                          </div>

                          {comentario && comentario.trim().length > 0 && (
                            <p className="text-[11px] text-slate-300">{comentario}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}


            {/* OBSERVACIONES ALMACÉN */}
            {pedido.observaciones && pedido.observaciones.trim().length > 0 && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">Observaciones almacén</h2>
                <p className="text-sm text-slate-100 whitespace-pre-line">
                  {pedido.observaciones}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
