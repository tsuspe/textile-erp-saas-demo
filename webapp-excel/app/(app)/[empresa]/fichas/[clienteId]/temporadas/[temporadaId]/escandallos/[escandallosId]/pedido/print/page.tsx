// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/pedido/print/page.tsx
import { PrintButton } from "@/app/components/PrintButton";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
  searchParams?: Promise<{
    modo?: string;
  }>;
};

export default async function PedidoPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;
  const search = (await searchParams) ?? {};

  const base = `/${empresa}`;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if ([cId, tId, eId].some((n) => Number.isNaN(n))) {
    throw new Error(
      `Ruta inválida en pedido/print: empresa=${empresa}, clienteId=${clienteId}, temporadaId=${temporadaId}, escandallosId=${escandallosId}`,
    );
  }

  const today = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const escandallo = await prisma.escandallo.findFirst({
    where: { id: eId, clienteId: cId, temporadaId: tId },
    include: {
      cliente: true,
      temporada: true,
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
    throw new Error("Escandallo no encontrado para impresión de pedido.");
  }

  const pedido = escandallo.pedidos[0];
  if (!pedido) {
    throw new Error("Este escandallo no tiene pedido asociado para imprimir.");
  }

  const showPrecios = search.modo !== "simple"; // por defecto CON precios

  // ---- Datos artículo (cabecera izquierda) ----
  const articulo = {
    modeloInterno:
      pedido.modeloInterno || escandallo.modeloInterno || `#${escandallo.id}`,
    descripcion:
      pedido.descripcionPedido ||
      escandallo.observaciones ||
      "Descripción no especificada",
    refCliente:
      pedido.modeloCliente || escandallo.modeloCliente || "Sin referencia",
    cliente: escandallo.cliente?.nombre || "-",
    temporada: escandallo.temporada?.codigo || "-",
  };

  // total unidades: sumamos por colores si existe distribución, si no usamos el campo del pedido
  let totalUnidades = 0;
  if (pedido.colores.length > 0) {
    for (const c of pedido.colores) {
      const dist: any = c.distribucion || {};
      if (typeof dist.total === "number") totalUnidades += dist.total;
    }
  } else if (typeof (pedido as any).unidadesTotales === "number") {
    totalUnidades = (pedido as any).unidadesTotales;
  }

  const pedidoData = {
    numero: pedido.numeroPedido || "-",
    fechaPedido: pedido.fechaPedido
      ? pedido.fechaPedido.toISOString().slice(0, 10)
      : "-",
    fechaEntrega: pedido.fechaEntrega
      ? pedido.fechaEntrega.toISOString().slice(0, 10)
      : "-",
    precioUnidad: typeof pedido.precioVenta === "number" ? pedido.precioVenta : null,
    totalUnidades,
  };

  // precios extra (coste escandallo, precio venta, PVP)
  const preciosData = {
    costeEscandallo:
      pedido.costeEscandallo != null
        ? pedido.costeEscandallo
        : escandallo.totalCoste ?? null,
    precioVenta: pedido.precioVenta != null ? Number(pedido.precioVenta) : null,
    pvp: pedido.pvp != null ? Number(pedido.pvp) : null,
  };

  // ---- Reparto de tallas (simplificado a letras XXS–XXL) ----
  const ordenTallas = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;

  type TallaRow = {
    color: string;
    xxs: number;
    xs: number;
    s: number;
    m: number;
    l: number;
    xl: number;
    xxl: number;
  };

  let tallas: TallaRow[] = [];

  if (pedido.colores.length > 0) {
    tallas = pedido.colores.map((c) => {
      const dist: any = c.distribucion || {};
      const tallasArr: string[] = dist.tallas ?? [];
      const unidadesArr: number[] = dist.unidades ?? [];

      const baseRow: TallaRow = {
        color: c.color || "-",
        xxs: 0,
        xs: 0,
        s: 0,
        m: 0,
        l: 0,
        xl: 0,
        xxl: 0,
      };

      tallasArr.forEach((talla, idx) => {
        const u = unidadesArr[idx] ?? 0;
        switch (String(talla).toUpperCase()) {
          case "XXS": baseRow.xxs = u; break;
          case "XS":  baseRow.xs = u; break;
          case "S":   baseRow.s = u; break;
          case "M":   baseRow.m = u; break;
          case "L":   baseRow.l = u; break;
          case "XL":  baseRow.xl = u; break;
          case "XXL": baseRow.xxl = u; break;
          default: break;
        }
      });

      return baseRow;
    });
  } else {
    tallas = [{
      color: "-",
      xxs: 0, xs: 0, s: 0, m: 0, l: 0, xl: 0, xxl: 0,
    }];
  }

  const totalLinea = tallas.reduce(
    (acc, t) => acc + t.xxs + t.xs + t.s + t.m + t.l + t.xl + t.xxl,
    0,
  );

  const observacionesPedido = pedido.observaciones || "";

  return (
    <>
      {/* A4 horizontal */}
      <style>
        {`
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          @media print {
            body { margin: 0; }
          }
        `}
      </style>

      <main className="min-h-screen print:min-h-0 flex justify-center py-6 print:py-0 bg-slate-100 print:bg-white">
        {/* Contenedor A4 horizontal */}
        <div
          className="relative bg-white text-slate-900 shadow print:shadow-none mx-auto"
          style={{ width: "277mm", padding: "8mm 10mm" }}
        >
          {/* Botón imprimir (sólo pantalla) */}
          <div className="absolute right-40 top-3 print:hidden">
            <PrintButton />
          </div>

          {/* CABECERA */}
          <header className="mb-3 flex items-start justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-[0.18em] uppercase">
                HOJA DE PEDIDO
              </h1>
              <p className="text-[10px] text-slate-500">
                Modelo interno:{" "}
                <span className="font-semibold">{articulo.modeloInterno}</span>
              </p>
            </div>

            <div className="text-right text-[10px] space-y-0.5">
              <p>
                Nº pedido:{" "}
                <span className="font-semibold">{pedidoData.numero}</span>
              </p>
              <p className="text-slate-500">
                Modo:{" "}
                <span className="font-semibold uppercase">
                  {showPrecios ? "PDF COMPLETO" : "PDF SIN PRECIOS"}
                </span>
              </p>
              <p className="text-slate-500">Generado el {today}</p>
            </div>
          </header>

          {/* FILA 1: Datos artículo / Datos pedido */}
          <section className="grid grid-cols-2 gap-3 mb-3 text-[10px]">
            {/* Datos artículo */}
            <div className="border border-slate-300 rounded px-3 py-2 space-y-0.5">
              <p className="font-semibold uppercase text-[9px] mb-1">
                Datos artículo (escandallo)
              </p>
              <p>
                <span className="font-semibold">Descripción:</span>{" "}
                {articulo.descripcion}
              </p>
              <p>
                <span className="font-semibold">Cliente:</span>{" "}
                {articulo.cliente}
              </p>
              <p>
                <span className="font-semibold">Temporada:</span>{" "}
                {articulo.temporada}
              </p>
              <p>
                <span className="font-semibold">Ref. cliente:</span>{" "}
                {articulo.refCliente}
              </p>
            </div>

            {/* Datos pedido / fechas / precios */}
            <div className="border border-slate-300 rounded px-3 py-2">
              <p className="font-semibold uppercase text-[9px] mb-1">
                Datos pedido / fechas {showPrecios && " / precios"}
              </p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                <p>
                  <span className="font-semibold">Nº pedido:</span>{" "}
                  {pedidoData.numero}
                </p>
                <p>
                  <span className="font-semibold">Fecha pedido:</span>{" "}
                  {pedidoData.fechaPedido}
                </p>

                <p>
                  <span className="font-semibold">Fecha entrega:</span>{" "}
                  {pedidoData.fechaEntrega}
                </p>

                {showPrecios && pedidoData.precioUnidad != null && (
                  <p>
                    <span className="font-semibold">Precio unidad:</span>{" "}
                    {pedidoData.precioUnidad.toFixed(2)} €
                  </p>
                )}

                {showPrecios && preciosData.costeEscandallo != null && (
                  <p>
                    <span className="font-semibold">Coste escandallo:</span>{" "}
                    {preciosData.costeEscandallo.toFixed(2)} €
                  </p>
                )}

                {showPrecios && preciosData.pvp != null && (
                  <p>
                    <span className="font-semibold">PVP (etiqueta):</span>{" "}
                    {preciosData.pvp.toFixed(2)} €
                  </p>
                )}

                <p className="col-span-2">
                  <span className="font-semibold">Unidades totales:</span>{" "}
                  {pedidoData.totalUnidades}
                </p>
              </div>
            </div>
          </section>

          {/* FILA 2: Tejidos + Forros */}
          <section className="grid grid-cols-2 gap-3 mb-2 text-[10px]">
            {/* TEJIDOS */}
            <div className="border border-slate-300 rounded px-3 py-2">
              <p className="font-semibold uppercase text-[9px] mb-1">Tejidos</p>

              {pedido.tejidos.length === 0 ? (
                <p className="text-[9px] text-slate-500">Sin tejidos definidos.</p>
              ) : (
                <table className="w-full border-collapse text-[8px]">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 px-1 py-0.5">Proveedor</th>
                      <th className="border border-slate-300 px-1 py-0.5">Serie</th>
                      <th className="border border-slate-300 px-1 py-0.5">Color</th>
                      <th className="border border-slate-300 px-1 py-0.5">Composición</th>
                      <th className="border border-slate-300 px-1 py-0.5">Consumo</th>
                      <th className="border border-slate-300 px-1 py-0.5">Metros</th>
                      <th className="border border-slate-300 px-1 py-0.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.tejidos.map((t) => (
                      <tr key={t.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{t.proveedor || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{t.serie || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{t.color || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{t.composicion || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{t.consumoProduccion?.toFixed(3) ?? "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{t.metrosPedidos?.toFixed(2) ?? "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">
                          {t.fechaPedido ? t.fechaPedido.toISOString().slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* FORROS */}
            <div className="border border-slate-300 rounded px-3 py-2">
              <p className="font-semibold uppercase text-[9px] mb-1">Forros</p>

              {pedido.forros.length === 0 ? (
                <p className="text-[9px] text-slate-500">Sin forros definidos.</p>
              ) : (
                <table className="w-full border-collapse text-[8px]">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 px-1 py-0.5">Proveedor</th>
                      <th className="border border-slate-300 px-1 py-0.5">Serie</th>
                      <th className="border border-slate-300 px-1 py-0.5">Color</th>
                      <th className="border border-slate-300 px-1 py-0.5">Composición</th>
                      <th className="border border-slate-300 px-1 py-0.5">Consumo</th>
                      <th className="border border-slate-300 px-1 py-0.5">Metros</th>
                      <th className="border border-slate-300 px-1 py-0.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.forros.map((f) => (
                      <tr key={f.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{f.proveedor || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{f.serie || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{f.color || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{f.composicion || "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{f.consumoProduccion?.toFixed(3) ?? "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{f.metrosPedidos?.toFixed(2) ?? "—"}</td>
                        <td className="border border-slate-300 px-1 py-0.5">
                          {f.fechaPedido ? f.fechaPedido.toISOString().slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* FILA 3: FOTO / Accesorios + tallas + obs */}
          <section className="grid grid-cols-3 gap-3 text-[10px]">
            {/* FOTO */}
            <div
              className="col-span-1 border border-slate-300 rounded flex items-center justify-center overflow-hidden"
              style={{ height: "100mm" }}
            >
              {pedido.imagenUrl || escandallo.imagenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(pedido.imagenUrl || escandallo.imagenUrl) as string}
                  alt="Foto modelo"
                  className="max-h-full w-auto object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-400">FOTO MODELO</span>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              {/* Accesorios */}
              <div className="border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">
                  Accesorios / Fornituras
                </p>

                {pedido.accesorios.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Sin accesorios definidos.</p>
                ) : (
                  <table className="w-full border-collapse text-[8px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 px-1 py-0.5">Nombre</th>
                        <th className="border border-slate-300 px-1 py-0.5">Proveedor</th>
                        <th className="border border-slate-300 px-1 py-0.5">Ref.</th>
                        <th className="border border-slate-300 px-1 py-0.5">Color</th>
                        <th className="border border-slate-300 px-1 py-0.5">Medida</th>
                        <th className="border border-slate-300 px-1 py-0.5">Unidad</th>
                        <th className="border border-slate-300 px-1 py-0.5">Consumo</th>
                        <th className="border border-slate-300 px-1 py-0.5">Pedido</th>
                        <th className="border border-slate-300 px-1 py-0.5">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.accesorios.map((a) => (
                        <tr key={a.id}>
                          <td className="border border-slate-300 px-1 py-0.5">{a.nombre || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.proveedor || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.referencia || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.color || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.medida || "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.unidad || "UNIDADES"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.consumoEsc?.toFixed(3) ?? "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">{a.cantidadPed?.toFixed(2) ?? "—"}</td>
                          <td className="border border-slate-300 px-1 py-0.5">
                            {a.fechaPedido ? a.fechaPedido.toISOString().slice(0, 10) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Tallas */}
              <div className="border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-2">
                  Reparto de tallas
                </p>

                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 px-1 py-0.5 text-left">
                        Color
                      </th>
                      {ordenTallas.map((talla) => (
                        <th
                          key={talla}
                          className="border border-slate-300 px-1 py-0.5 text-center"
                        >
                          {talla}
                        </th>
                      ))}
                      <th className="border border-slate-300 px-1 py-0.5 text-center">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {tallas.map((row, idx) => {
                      const total =
                        row.xxs + row.xs + row.s + row.m + row.l + row.xl + row.xxl;

                      return (
                        <tr key={idx}>
                          <td className="border border-slate-300 px-1 py-0.5">{row.color}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.xxs || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.xs || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.s || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.m || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.l || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.xl || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{row.xxl || "-"}</td>
                          <td className="border border-slate-300 px-1 py-0.5 text-center">{total}</td>
                        </tr>
                      );
                    })}

                    <tr>
                      <td className="border border-slate-300 px-1 py-0.5 font-semibold text-right">
                        TOTAL
                      </td>
                      <td colSpan={7} className="border border-slate-300 px-1 py-0.5 text-right" />
                      <td className="border border-slate-300 px-1 py-0.5 text-center font-semibold">
                        {totalLinea}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Observaciones */}
              <div className="border border-slate-300 rounded px-3 py-2">
                <span className="font-semibold mr-2">Observaciones pedido:</span>
                <span>
                  {observacionesPedido ||
                    "______________________________________________"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
