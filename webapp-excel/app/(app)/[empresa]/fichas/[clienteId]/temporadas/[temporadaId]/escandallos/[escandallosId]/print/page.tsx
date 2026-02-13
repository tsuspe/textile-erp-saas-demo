// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/print/page.tsx
import { PrintButton } from "@/app/components/PrintButton";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
  searchParams?: Promise<{ modo?: string }>;
};

const formatCurrency = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return "-";
  return `${n.toFixed(2)} €`;
};

const formatDate = (d: Date | string | null | undefined) => {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

export default async function EscandalloPrintPage({ params, searchParams }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;
  const search = (await searchParams) ?? {};
  // const base = `/${empresa}`; // si no lo usas, bórralo

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if ([cId, tId, eId].some((n) => Number.isNaN(n))) {
    throw new Error(
      `Ruta inválida en escandallo/print: clienteId=${clienteId}, temporadaId=${temporadaId}, escandallosId=${escandallosId}`,
    );
  }

  const modo = search.modo === "simple" ? "simple" : "completo";
  const showPrecios = modo === "completo";

  const escandallo = await prisma.escandallo.findFirst({
    where: { id: eId, clienteId: cId, temporadaId: tId },
    include: {
      cliente: true,
      temporada: true,
      tejidos: true,
      forros: true,
      accesorios: true,
      otrosGastos: true,
      pedidos: true,
      articulo: true,
    },
  });

  if (!escandallo) {
    throw new Error("Escandallo no encontrado");
  }

  const pedido = escandallo.pedidos?.[0] ?? null;

  // Descripción artículo
  let descripcionArticulo: string | null =
    escandallo.articulo?.descripcion ?? null;

  if (!descripcionArticulo && escandallo.modeloInterno) {
    const articuloVinculado = await prisma.articulo.findFirst({
      where: {
        codigo: escandallo.modeloInterno,
        clienteId: escandallo.clienteId,
        temporadaId: escandallo.temporadaId,
      },
      select: { descripcion: true },
    });

    if (articuloVinculado) {
      descripcionArticulo = articuloVinculado.descripcion;
    }
  }

  const tejidos = escandallo.tejidos ?? [];
  const forros = escandallo.forros ?? [];
  const accesorios = escandallo.accesorios ?? [];
  const gastos = escandallo.otrosGastos ?? [];

  const totalTejidos = tejidos.reduce((acc, t) => {
    if (t.consumoProduccion && t.precio) {
      return acc + Number(t.consumoProduccion) * Number(t.precio);
    }
    return acc;
  }, 0);

  const totalForros = forros.reduce((acc, f) => {
    if (f.consumoProduccion && f.precio) {
      return acc + Number(f.consumoProduccion) * Number(f.precio);
    }
    return acc;
  }, 0);

  const totalAccesorios = accesorios.reduce((acc, a) => {
    if (a.cantidad && a.precioUnidad) {
      return acc + Number(a.cantidad) * Number(a.precioUnidad);
    }
    return acc;
  }, 0);

  const totalGastos = gastos.reduce((acc, g) => {
    if (g.importe) return acc + Number(g.importe);
    return acc;
  }, 0);

  const totalCalculado =
    totalTejidos + totalForros + totalAccesorios + totalGastos;

  const totalMostrar =
    escandallo.totalCoste && !Number.isNaN(escandallo.totalCoste)
      ? escandallo.totalCoste
      : totalCalculado;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* ✅ CSS para impresión A4 */}
      <style>
        {`
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          body {
            margin: 0;
          }
        }
      `}
      </style>

      {/* Contenedor centrado tamaño A4 */}
    <main className="min-h-screen print:min-h-0 flex justify-center py-6 print:py-0 bg-slate-100 print:bg-white">
    <div
        className="bg-white text-slate-900 shadow print:shadow-none mx-auto"
        style={{ width: "210mm", padding: "10mm" }}
    >

        {/* CABECERA */}
        <header className="mb-4 space-y-3">

        {/* Línea superior: título + modo + botón imprimir */}
        <div className="flex items-start justify-between">
        <div>
            <h1 className="text-sm font-semibold tracking-[0.18em] uppercase">
            ESCANDALLO
            </h1>
        </div>

        <div className="flex items-start gap-4">
            {/* Botón imprimir (no se ve en el papel) */}
            <div className="print:hidden">
              <PrintButton />
            </div>


            <div className="text-right space-y-1">
            <p className="text-[11px]">
                Modo:{" "}
                <span className="font-semibold uppercase">
                {showPrecios ? "PDF COMPLETO" : "PDF SIN PRECIOS"}
                </span>
            </p>
            <p className="text-[11px] text-slate-500">
                Generado el {today}
            </p>
            </div>
        </div>
        </div>


        {/* DATOS GENERALES COMPACTOS */}
        <div className="border border-slate-200 rounded-sm p-3 text-[10px] space-y-1">

            {/* FILA 1 */}
            <div className="flex justify-between">
            <span><strong>MODELO INTERNO:</strong> {escandallo.modeloInterno || "-"}</span>
            <span><strong>PEDIDO:</strong> {pedido?.numeroPedido || "-"}</span>
            </div>

            {/* FILA 2 */}
            <div className="flex justify-between">
            <span><strong>DESCRIPCIÓN:</strong> {descripcionArticulo || "—"}</span>
            <span><strong>PATRÓN:</strong> {escandallo.patron || "-"}</span>
            </div>

            {/* FILA 3 */}
            <div className="flex justify-between">
            <span><strong>CLIENTE:</strong> {escandallo.cliente?.nombre || "-"}</span>
            <span><strong>FECHA:</strong> {formatDate(escandallo.fecha)}</span>
            </div>

            {/* FILA 4 */}
            <div className="flex justify-between">
            <span><strong>TEMPORADA:</strong> {escandallo.temporada?.codigo || "-"}</span>
            <span><strong>PATRONISTA:</strong> {escandallo.patronista || "-"}</span>
            </div>

            {/* FILA 5 */}
            <div className="flex justify-between">
            <span><strong>REF CLIENTE:</strong> {escandallo.modeloCliente || "-"}</span>
            <span><strong>TALLA BASE:</strong> {escandallo.talla || "-"}</span>
            </div>
        </div>

        </header>


          {/* FOTO + TEJIDOS + FORROS */}
          <section className="border border-slate-200 rounded-sm mb-4">
            <div className="flex justify-between items-center px-3 py-2 border-b border-slate-200">
              <p className="uppercase text-[10px] tracking-wide">
                Muestra de modelo / Tejidos y forros
              </p>
            </div>

            <div className="px-3 py-3 flex items-start gap-4">
              {/* FOTO */}
              <div className="border border-slate-200 rounded-sm overflow-hidden bg-slate-100 w-[210px] h-[260px] flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {escandallo.imagenUrl ? (
                  <img 
                    src={escandallo.imagenUrl}
                    alt={escandallo.modeloInterno ?? "Modelo"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-slate-500">
                    Sin imagen de modelo
                  </span>
                )}
              </div>

              {/* TEJIDOS + FORROS A LA DERECHA */}
              <div className="flex-1 space-y-3 text-[11px]">
                {/* TEJIDOS */}
                <div className="border border-slate-300 rounded">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-slate-300">
                    <p className="text-[11px] font-semibold uppercase">
                      Tejidos
                    </p>
                    {showPrecios && (
                      <p className="text-[11px] text-slate-600">
                        Total tejidos: {formatCurrency(totalTejidos)}
                      </p>
                    )}
                  </div>

                  {tejidos.length === 0 ? (
                    <p className="text-[11px] text-slate-500 px-2 py-2">
                      Sin tejidos registrados.
                    </p>
                  ) : (
                    <div className="text-[11px]">
                      {tejidos.map((t, index) => (
                        <div
                          key={t.id ?? index}
                          className="border-b border-slate-200 last:border-b-0 px-2 py-1.5"
                        >
                          <div className="flex justify-between items-center mb-0.5">
                            <p className="font-semibold">
                              Tejido {index + 1}: {t.proveedor || "-"}
                              {t.serie && ` · Serie ${t.serie}`}
                              {t.color && ` · Color ${t.color}`}
                            </p>
                            {showPrecios &&
                              t.consumoProduccion &&
                              t.precio && (
                                <p className="text-[11px]">
                                  Coste:{" "}
                                  <span className="font-semibold">
                                    {formatCurrency(
                                      Number(t.consumoProduccion) *
                                        Number(t.precio),
                                    )}
                                  </span>
                                </p>
                              )}
                          </div>

                          <div className="grid grid-cols-6 gap-1">
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Ancho real (cm)
                              </p>
                              <p>{t.anchoReal ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Ancho útil (cm)
                              </p>
                              <p>{t.anchoUtil ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Consumo prod. (m)
                              </p>
                              <p>{t.consumoProduccion ?? "-"}</p>
                            </div>
                            {showPrecios && (
                              <>
                                <div>
                                  <p className="text-slate-500 text-[10px]">
                                    Precio €/m
                                  </p>
                                  <p>
                                    {t.precio
                                      ? `${t.precio.toFixed(2)} €`
                                      : "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-500 text-[10px]">
                                    Coste
                                  </p>
                                  <p>
                                    {t.consumoProduccion && t.precio
                                      ? formatCurrency(
                                          Number(t.consumoProduccion) *
                                            Number(t.precio),
                                        )
                                      : "-"}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* FORROS */}
                <div className="border border-slate-300 rounded">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-slate-300">
                    <p className="text-[11px] font-semibold uppercase">
                      Forros
                    </p>
                    {showPrecios && (
                      <p className="text-[11px] text-slate-600">
                        Total forros: {formatCurrency(totalForros)}
                      </p>
                    )}
                  </div>

                  {forros.length === 0 ? (
                    <p className="text-[11px] text-slate-500 px-2 py-2">
                      Sin forros registrados.
                    </p>
                  ) : (
                    <div className="text-[11px]">
                      {forros.map((f, index) => (
                        <div
                          key={f.id ?? index}
                          className="border-b border-slate-200 last:border-b-0 px-2 py-1.5"
                        >
                          <div className="flex justify-between items-center mb-0.5">
                            <p className="font-semibold">
                              Forro {index + 1}: {f.proveedor || "-"}
                              {f.serie && ` · Serie ${f.serie}`}
                              {f.color && ` · Color ${f.color}`}
                            </p>
                            {showPrecios &&
                              f.consumoProduccion &&
                              f.precio && (
                                <p className="text-[11px]">
                                  Coste:{" "}
                                  <span className="font-semibold">
                                    {formatCurrency(
                                      Number(f.consumoProduccion) *
                                        Number(f.precio),
                                    )}
                                  </span>
                                </p>
                              )}
                          </div>

                          <div className="grid grid-cols-6 gap-1">
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Ancho real (cm)
                              </p>
                              <p>{f.anchoReal ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Ancho útil (cm)
                              </p>
                              <p>{f.anchoUtil ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px]">
                                Consumo prod. (m)
                              </p>
                              <p>{f.consumoProduccion ?? "-"}</p>
                            </div>
                            {showPrecios && (
                              <>
                                <div>
                                  <p className="text-slate-500 text-[10px]">
                                    Precio €/m
                                  </p>
                                  <p>
                                    {f.precio
                                      ? `${f.precio.toFixed(2)} €`
                                      : "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-500 text-[10px]">
                                    Coste
                                  </p>
                                  <p>
                                    {f.consumoProduccion && f.precio
                                      ? formatCurrency(
                                          Number(f.consumoProduccion) *
                                            Number(f.precio),
                                        )
                                      : "-"}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>


          {/* ACCESORIOS */}
          <section className="border border-slate-300 rounded mb-3">
            <div className="flex items-center justify-between px-3 py-1 border-b border-slate-300">
              <p className="text-[11px] font-semibold uppercase">
                Fornituras / Accesorios
              </p>
              {showPrecios && (
                <p className="text-[11px] text-slate-600">
                  Total accesorios: {formatCurrency(totalAccesorios)}
                </p>
              )}
            </div>

            {accesorios.length === 0 ? (
              <p className="text-[11px] text-slate-500 px-3 py-2">
                Sin accesorios registrados.
              </p>
            ) : (
              <div className="text-[11px]">
                <div className="grid grid-cols-8 gap-1 px-3 py-1 border-b border-slate-200">
                  <span className="col-span-2 font-semibold">Nombre</span>
                  <span className="font-semibold">Proveedor</span>
                  <span className="font-semibold">Referencia</span>
                  <span className="font-semibold">Color</span>
                  <span className="font-semibold">Medida</span>
                  <span className="font-semibold">Cantidad</span>
                  {showPrecios && (
                    <span className="font-semibold text-right">Coste</span>
                  )}
                </div>

                {accesorios.map((a, idx) => {
                  const subtotal =
                    a.cantidad && a.precioUnidad
                      ? Number(a.cantidad) * Number(a.precioUnidad)
                      : null;

                  return (
                    <div
                      key={a.id ?? idx}
                      className="grid grid-cols-8 gap-1 px-3 py-[3px] border-b border-slate-100 last:border-b-0"
                    >
                      <span className="col-span-2">{a.nombre || "-"}</span>
                      <span>{a.proveedor || "-"}</span>
                      <span>{a.referencia || "-"}</span>
                      <span>{a.color || "-"}</span>
                      <span>{a.medida || "-"}</span>
                      <span>
                        {a.cantidad || "-"}{" "}
                        <span className="text-slate-500 text-[10px]">
                          {a.unidad || ""}
                        </span>
                      </span>
                      {showPrecios && (
                        <span className="text-right">
                          {formatCurrency(subtotal)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

            {/* OTROS GASTOS + RESUMEN DE COSTES (dos columnas reales) */}
            <section className="mt-3 text-[11px]">
            <div className="grid grid-cols-2 gap-4">
                
                {/* TARJETA IZQUIERDA — OTROS GASTOS */}
                <div className="border border-slate-300 rounded p-3">
                <p className="font-semibold mb-1">Otros gastos</p>
                {gastos.length === 0 ? (
                    <p className="text-slate-500">Sin otros gastos.</p>
                ) : (
                    <div className="space-y-[2px]">
                    {gastos.map((g, idx) => (
                        <div
                        key={g.id ?? idx}
                        className="flex justify-between border-b border-slate-100 last:border-b-0 pb-[1px]"
                        >
                        <span>
                            {g.tipo || "OTRO"} –{" "}
                            <span className="text-slate-500">{g.descripcion || "-"}</span>
                        </span>
                        {showPrecios && <span>{formatCurrency(g.importe ?? null)}</span>}
                        </div>
                    ))}
                    </div>
                )}
                </div>

                {/* TARJETA DERECHA — RESUMEN DE COSTES */}
                {showPrecios && (
                <div className="border border-slate-300 rounded p-3">
                    <p className="font-semibold mb-1">Resumen de costes</p>

                    <div className="space-y-[2px]">
                    <div className="flex justify-between">
                        <span>Tejidos</span>
                        <span>{formatCurrency(totalTejidos)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Forros</span>
                        <span>{formatCurrency(totalForros)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Accesorios</span>
                        <span>{formatCurrency(totalAccesorios)}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                        <span>Otros gastos</span>
                        <span>{formatCurrency(totalGastos)}</span>
                    </div>
                    </div>

                    <div className="pt-2 text-right">
                    <p className="text-[10px] text-slate-500">Coste total prenda</p>
                    <p className="text-xl font-bold">{formatCurrency(totalMostrar)}</p>
                    </div>
                </div>
                )}

            </div>
            </section>


        {/* OBSERVACIONES AL PIE */}
        <footer className="mt-3 border border-slate-300 rounded px-3 py-2 text-[11px]">
        <span className="font-semibold mr-2">Observaciones:</span>
        <span>{escandallo.observaciones || "Sin observaciones."}</span>
        </footer>


        </div>
      </main>
    </>
  );
}
