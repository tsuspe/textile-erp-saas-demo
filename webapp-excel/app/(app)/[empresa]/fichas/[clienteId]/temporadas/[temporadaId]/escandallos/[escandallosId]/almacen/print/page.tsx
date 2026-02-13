// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/almacen/print/page.tsx
import { PrintButton } from "@/app/components/PrintButton";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{
    empresa: string; // slug
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
  searchParams?: Promise<{
    modo?: string; // "completo" | "simple"
  }>;
};

const formatDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
};

const formatCurrency = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${Number(n).toFixed(2)} €`;

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function sumNums(arr: unknown) {
  const a = Array.isArray(arr) ? arr : [];
  return a.reduce((acc, x) => acc + (Number(x) || 0), 0);
}

export default async function AlmacenPrintPage({ params, searchParams }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;
  const sp = (await searchParams) ?? {};

  const modo = String(sp.modo ?? "completo").toLowerCase();
  const sinPrecios = modo === "simple";

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if (![cId, tId, eId].every(Number.isFinite)) notFound();

  // ✅ 1) MULTI-EMPRESA: resolver empresaId por slug (canónico)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;

  // ✅ 2) Cliente debe pertenecer a la empresa
  const clienteOk = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true },
  });
  if (!clienteOk) notFound();

  // ✅ 3) Temporada existe (si es global, esto vale)
  const temporadaOk = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true },
  });
  if (!temporadaOk) notFound();

  // ✅ 4) Escandallo SIEMPRE filtrado por empresaId + ids ruta
  const escandallo = await prisma.escandallo.findFirst({
    where: {
      empresaId,
      id: eId,
      clienteId: cId,
      temporadaId: tId,
    },
    include: {
      cliente: true,
      temporada: true,
      pedidos: {
        orderBy: { id: "desc" },
        take: 1,
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

  const cliente = escandallo.cliente!;
  const temporada = escandallo.temporada!;
  const pedido = escandallo.pedidos[0] ?? null;

  if (!pedido) notFound();

  // ✅ today por request (no module scope)
  const today = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Imagen modelo
  const fotoModeloUrl = (pedido as any).imagenUrl || (escandallo as any).imagenUrl || null;

  // ---------- CÁLCULOS GLOBALES ----------
  let prendasPedidoTotales = 0;
  let prendasCortadasTotales = 0;
  let prendasAdelantosTotales = 0;
  let prendasEntregasTotales = 0;

  for (const c of pedido.colores) {
    const dist: any = c.distribucion ?? {};
    const tallas: string[] = Array.isArray(dist.tallas) ? dist.tallas : [];

    const unidadesPedido: number[] = Array.isArray(dist.unidades)
      ? dist.unidades
      : Array(tallas.length).fill(0);

    const corteUnidades: number[] = Array.isArray(dist.corte?.unidades)
      ? dist.corte.unidades
      : Array(tallas.length).fill(0);

    const adelantosUnidades: number[] = Array.isArray(dist.adelantos?.unidades)
      ? dist.adelantos.unidades
      : Array(tallas.length).fill(0);

    const entregasUnidades: number[] = Array.isArray(dist.entregas?.unidades)
      ? dist.entregas.unidades
      : Array(tallas.length).fill(0);

    prendasPedidoTotales += sumNums(unidadesPedido);
    prendasCortadasTotales += sumNums(corteUnidades);
    prendasAdelantosTotales += sumNums(adelantosUnidades);
    prendasEntregasTotales += sumNums(entregasUnidades);
  }

  // ---------- TEJIDOS ----------
  const tejidosCalculados =
    pedido.tejidos?.map((t) => {
      const consumoProduccion = toNum(t.consumoProduccion);
      const consumoCorte = t.consumoCorte != null ? toNum(t.consumoCorte) : consumoProduccion;

      const metrosPedidos = toNum(t.metrosPedidos);
      const metrosRecibidos = toNum(t.metrosRecibidos);

      const metrosGastados = prendasCortadasTotales * consumoCorte;
      const metrosQuedan = metrosRecibidos - metrosGastados;

      return {
        t,
        consumoProduccion,
        consumoCorte,
        metrosPedidos,
        metrosRecibidos,
        metrosGastados,
        metrosQuedan,
      };
    }) ?? [];

  // ---------- FORROS ----------
  const forrosCalculados =
    pedido.forros?.map((f) => {
      const consumoProduccion = toNum(f.consumoProduccion);
      const consumoCorte = f.consumoCorte != null ? toNum(f.consumoCorte) : consumoProduccion;

      const metrosPedidos = toNum(f.metrosPedidos);
      const metrosRecibidos = toNum(f.metrosRecibidos);

      const metrosGastados = prendasCortadasTotales * consumoCorte;
      const metrosQuedan = metrosRecibidos - metrosGastados;

      return {
        f,
        consumoProduccion,
        consumoCorte,
        metrosPedidos,
        metrosRecibidos,
        metrosGastados,
        metrosQuedan,
      };
    }) ?? [];

  // ---------- ACCESORIOS ----------
  const accesoriosCalculados =
    pedido.accesorios?.map((a) => {
      const necesarios = toNum(a.cantidadPed);
      const recibidas = toNum(a.unidadesRecibidas);
      const sobran = recibidas - necesarios;
      return { a, necesarios, recibidas, sobran };
    }) ?? [];

  const displayUnidad = (value: number | undefined) => {
    const n = Number(value ?? 0);
    return n === 0 ? "" : n;
  };

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 4mm; }
        * { box-sizing: border-box; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .print-scale {
            transform: scale(0.93);
            transform-origin: top left;
            width: calc(100% / 0.93);
          }

          .no-break { break-inside: avoid; page-break-inside: avoid; }
        }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { word-break: break-word; overflow-wrap: anywhere; }
      `}</style>

      <main className="min-h-screen print:min-h-0 flex justify-center py-4 print:py-0 bg-slate-100 print:bg-white">
        <div className="print-scale">
          <div
            className="relative bg-white text-slate-900 shadow print:shadow-none mx-auto"
            style={{ width: "277mm", padding: "4mm 6mm" }}
          >
            {/* Botón imprimir */}
            <div className="absolute right-40 top-3 print:hidden">
              <PrintButton />
            </div>

            {/* CABECERA */}
            <header className="mb-2 flex items-start justify-between">
              <div>
                <h1 className="text-sm font-semibold tracking-[0.18em] uppercase">
                  HOJA DE ALMACÉN
                </h1>
                <p className="text-[10px] text-slate-500">
                  Modelo interno:{" "}
                  <span className="font-semibold">
                    {escandallo.modeloInterno || pedido.modeloInterno || `#${escandallo.id}`}
                  </span>
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Cliente: <span className="font-semibold">{cliente.nombre}</span> · Temporada{" "}
                  <span className="font-semibold">{temporada.codigo}</span>
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Modo: <span className="font-semibold">{sinPrecios ? "sin precios" : "completo"}</span>
                </p>
              </div>

              <div className="text-right text-[10px] space-y-0.5">
                <p>
                  Nº pedido: <span className="font-semibold">{pedido.numeroPedido || "—"}</span>
                </p>
                <p>
                  Fecha pedido: <span className="font-semibold">{formatDate(pedido.fechaPedido)}</span>
                </p>
                <p>
                  Fecha entrega: <span className="font-semibold">{formatDate(pedido.fechaEntrega)}</span>
                </p>
                <p className="text-slate-500">Generado el {today}</p>
              </div>
            </header>

            {/* FILA 1 */}
            <section className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
              <div className="no-break border border-slate-300 rounded px-3 py-2 space-y-0.5">
                <p className="font-semibold uppercase text-[9px] mb-1">Datos del pedido</p>
                <p>
                  <span className="font-semibold">Descripción pedido:</span> {pedido.descripcionPedido || "—"}
                </p>
                <p>
                  <span className="font-semibold">Modelo / ref. cliente:</span>{" "}
                  {pedido.modeloCliente || escandallo.modeloCliente || "—"}
                </p>

                {!sinPrecios && (
                  <>
                    <p>
                      <span className="font-semibold">Coste escandallo:</span>{" "}
                      {formatCurrency((pedido as any).costeEscandallo ?? escandallo.totalCoste ?? null)}
                    </p>
                    <p>
                      <span className="font-semibold">Precio venta pedido:</span> {formatCurrency(pedido.precioVenta)}
                    </p>
                    <p>
                      <span className="font-semibold">PVP etiqueta:</span> {formatCurrency(pedido.pvp)}
                    </p>
                  </>
                )}
              </div>

              <div className="no-break border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">Datos de corte y confección</p>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
                  <div>
                    <p className="font-semibold mb-0.5">Corte</p>
                    <p><span className="font-semibold">Taller:</span> {pedido.tallerCorte || "—"}</p>
                    <p><span className="font-semibold">Fecha:</span> {formatDate(pedido.fechaCorte)}</p>
                    <p><span className="font-semibold">Albarán:</span> {pedido.albaranCorte || "—"}</p>
                    {!sinPrecios && (
                      <p><span className="font-semibold">Precio corte:</span> {formatCurrency(pedido.precioCorte)}</p>
                    )}
                  </div>

                  <div>
                    <p className="font-semibold mb-0.5">Confección</p>
                    <p><span className="font-semibold">Taller:</span> {pedido.tallerConfeccion || "—"}</p>
                    <p><span className="font-semibold">Fecha:</span> {formatDate(pedido.fechaConfeccion)}</p>
                    <p><span className="font-semibold">Albarán:</span> {pedido.albaranConfeccion || "—"}</p>
                    {!sinPrecios && (
                      <p><span className="font-semibold">Precio confección:</span> {formatCurrency(pedido.precioConfeccion)}</p>
                    )}
                  </div>

                  <p className="col-span-2 mt-1 text-[9px]">
                    <span className="font-semibold">Estado producción:</span> Pedido {prendasPedidoTotales} · Corte{" "}
                    <span className="font-semibold">{prendasCortadasTotales}</span> · Adelantos {prendasAdelantosTotales} ·
                    Entregadas {prendasEntregasTotales}
                  </p>
                </div>
              </div>
            </section>

            {/* FILA 2 */}
            <section className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
              <div className="no-break border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">Tejidos</p>

                {tejidosCalculados.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Sin tejidos definidos.</p>
                ) : (
                  <table className="text-[8px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 px-1 py-0.5">Proveedor</th>
                        <th className="border border-slate-300 px-1 py-0.5">Serie</th>
                        <th className="border border-slate-300 px-1 py-0.5">Color</th>
                        <th className="border border-slate-300 px-1 py-0.5">Cons. corte</th>
                        <th className="border border-slate-300 px-1 py-0.5">Pedidos</th>
                        <th className="border border-slate-300 px-1 py-0.5">Recibidos</th>
                        <th className="border border-slate-300 px-1 py-0.5">Gastados</th>
                        <th className="border border-slate-300 px-1 py-0.5">Quedan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tejidosCalculados.map((item) => (
                        <tr key={item.t.id}>
                          <td className="border border-slate-300 px-1 py-0.5">{item.t.proveedor || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.t.serie || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.t.color || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.consumoCorte.toFixed(3)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosPedidos.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosRecibidos.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosGastados.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosQuedan.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="no-break border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">Forros</p>

                {forrosCalculados.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Sin forros definidos.</p>
                ) : (
                  <table className="text-[8px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 px-1 py-0.5">Proveedor</th>
                        <th className="border border-slate-300 px-1 py-0.5">Serie</th>
                        <th className="border border-slate-300 px-1 py-0.5">Color</th>
                        <th className="border border-slate-300 px-1 py-0.5">Cons. prod.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Cons. corte</th>
                        <th className="border border-slate-300 px-1 py-0.5">Pedidos</th>
                        <th className="border border-slate-300 px-1 py-0.5">Recibidos</th>
                        <th className="border border-slate-300 px-1 py-0.5">Gastados</th>
                        <th className="border border-slate-300 px-1 py-0.5">Quedan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forrosCalculados.map((item) => (
                        <tr key={item.f.id}>
                          <td className="border border-slate-300 px-1 py-0.5">{item.f.proveedor || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.f.serie || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.f.color || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.consumoProduccion.toFixed(3)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.consumoCorte.toFixed(3)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosPedidos.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosRecibidos.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosGastados.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.metrosQuedan.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* BLOQUE FINAL */}
            <section className="grid grid-cols-3 gap-2 text-[10px]">
              <div
                className="no-break border border-slate-300 rounded flex items-center justify-center overflow-hidden row-span-3"
                style={{ height: "75mm" }}
              >
                {fotoModeloUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoModeloUrl} alt="Foto modelo" className="max-h-full w-auto object-contain" />
                ) : (
                  <span className="text-[11px] text-slate-400">FOTO MODELO</span>
                )}
              </div>

              <div className="col-span-2 border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">Fornituras / Accesorios</p>

                {accesoriosCalculados.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Sin accesorios definidos.</p>
                ) : (
                  <table className="text-[8px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 px-1 py-0.5">Nombre</th>
                        <th className="border border-slate-300 px-1 py-0.5">Ref.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Prov.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Color</th>
                        <th className="border border-slate-300 px-1 py-0.5">Nec.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Recib.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Sobran</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accesoriosCalculados.map((item) => (
                        <tr key={item.a.id}>
                          <td className="border border-slate-300 px-1 py-0.5">{item.a.nombre || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.a.referencia || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.a.proveedor || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.a.color || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.necesarios.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.recibidas.toFixed(2)}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{item.sobran.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="col-span-2 border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">Colores y tallas</p>

                {pedido.colores.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Este pedido no tiene colores/tallas definidos.</p>
                ) : (
                  <div className="space-y-2">
                    {pedido.colores.map((c) => {
                      const dist: any = c.distribucion ?? {};
                      const tallas: string[] = Array.isArray(dist.tallas) ? dist.tallas : [];
                      const unidadesPedido: number[] = Array.isArray(dist.unidades) ? dist.unidades : [];

                      const corteUnidades: number[] = Array.isArray(dist.corte?.unidades) ? dist.corte.unidades : Array(tallas.length).fill(0);
                      const adelantosUnidades: number[] = Array.isArray(dist.adelantos?.unidades) ? dist.adelantos.unidades : Array(tallas.length).fill(0);
                      const entregasUnidades: number[] = Array.isArray(dist.entregas?.unidades) ? dist.entregas.unidades : Array(tallas.length).fill(0);

                      const totalPedido = sumNums(unidadesPedido);
                      const totalCorte = sumNums(corteUnidades);
                      const totalAdelantos = sumNums(adelantosUnidades);
                      const totalEntregas = sumNums(entregasUnidades);

                      return (
                        <div key={c.id} className="border border-slate-300 rounded">
                          <div className="px-2 py-1 flex items-center justify-between text-[8px] bg-slate-50">
                            <span><span className="font-semibold">Color:</span> {c.color}</span>
                            <span><span className="font-semibold">Tipo talla:</span> {c.tipoTalla}</span>
                          </div>

                          <table className="w-full text-[8px] border-t border-slate-300">
                            <thead>
                              <tr>
                                <th className="px-1 py-0.5 text-left">Fila</th>
                                {tallas.map((t) => (
                                  <th key={t} className="px-1 py-0.5 text-center font-normal">{t}</th>
                                ))}
                                <th className="px-1 py-0.5 text-right font-normal">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="px-1 py-0.5 font-semibold">Pedido</td>
                                {tallas.map((t, idx) => (
                                  <td key={`p-${t}`} className="px-1 py-0.5 text-center">
                                    {displayUnidad(unidadesPedido[idx])}
                                  </td>
                                ))}
                                <td className="px-1 py-0.5 text-right">{totalPedido}</td>
                              </tr>
                              <tr>
                                <td className="px-1 py-0.5 font-semibold">Corte</td>
                                {tallas.map((t, idx) => (
                                  <td key={`c-${t}`} className="px-1 py-0.5 text-center">
                                    {displayUnidad(corteUnidades[idx])}
                                  </td>
                                ))}
                                <td className="px-1 py-0.5 text-right">{totalCorte}</td>
                              </tr>
                              <tr>
                                <td className="px-1 py-0.5 font-semibold">Adelantos</td>
                                {tallas.map((t, idx) => (
                                  <td key={`a-${t}`} className="px-1 py-0.5 text-center">
                                    {displayUnidad(adelantosUnidades[idx])}
                                  </td>
                                ))}
                                <td className="px-1 py-0.5 text-right">{totalAdelantos}</td>
                              </tr>
                              <tr>
                                <td className="px-1 py-0.5 font-semibold">Entregadas</td>
                                {tallas.map((t, idx) => (
                                  <td key={`e-${t}`} className="px-1 py-0.5 text-center">
                                    {displayUnidad(entregasUnidades[idx])}
                                  </td>
                                ))}
                                <td className="px-1 py-0.5 text-right">{totalEntregas}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-2">
                <div className="border border-slate-300 rounded px-3 py-2 text-[9px]">
                  <p className="font-semibold uppercase text-[9px] mb-1">Preparación almacén</p>

                  {(pedido as any).preparacionAlmacen && typeof (pedido as any).preparacionAlmacen === "object" ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
                      <div>
                        <p className="font-semibold mb-0.5">Perchas</p>
                        <p><span className="font-semibold">Modelo:</span> {(pedido as any).preparacionAlmacen.perchas?.modelo || "—"}</p>
                        <p><span className="font-semibold">Unidades:</span> {(pedido as any).preparacionAlmacen.perchas?.unidades ?? "—"}</p>
                        <p><span className="font-semibold">Fecha:</span> {formatDate((pedido as any).preparacionAlmacen.perchas?.fecha ?? null)}</p>
                      </div>

                      <div>
                        <p className="font-semibold mb-0.5">Bolsas</p>
                        <p><span className="font-semibold">Modelo:</span> {(pedido as any).preparacionAlmacen.bolsas?.modelo || "—"}</p>
                        <p><span className="font-semibold">Unidades:</span> {(pedido as any).preparacionAlmacen.bolsas?.unidades ?? "—"}</p>
                        <p><span className="font-semibold">Fecha:</span> {formatDate((pedido as any).preparacionAlmacen.bolsas?.fecha ?? null)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[9px] text-slate-500">Sin datos de preparación de almacén.</p>
                  )}
                </div>

                <div className="border border-slate-300 rounded px-3 py-2 text-[9px]">
                  <p className="font-semibold uppercase text-[9px] mb-1">Observaciones almacén</p>
                  <p className="text-[9px]">
                    {pedido.observaciones && pedido.observaciones.trim().length > 0
                      ? pedido.observaciones
                      : "______________________________________________"}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
