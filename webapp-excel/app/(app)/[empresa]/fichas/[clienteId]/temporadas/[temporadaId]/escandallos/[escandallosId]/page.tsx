// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PedidosTabs from "./produccion/PedidosTabs";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

type Muestra = {
  fecha?: string;
  consumo?: string;
};

function parseMuestras(value: string | null): Muestra[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => m && typeof m === "object");
  } catch {
    return [];
  }
}

const formatCurrency = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return "-";
  return `${n.toFixed(2)} €`;
};

function parseNum(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const formatDate = (d: Date | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("es-ES");
};

export default async function EscandalloDetallePage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if ([cId, tId, eId].some((n) => !Number.isFinite(n))) notFound();


  // 1) Resolver empresaId por slug (esto es CLAVE)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;
  const fichasBase = `${base}/fichas`;

  // 2) Validar que el cliente pertenece a esa empresa
  const clienteOk = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true },
  });
  if (!clienteOk) notFound();

  // 3) Temporada (si es compartida, no hace falta empresaId, pero validamos existencia)
  const temporadaOk = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true },
  });
  if (!temporadaOk) notFound();

  // 4) Cargar escandallo FILTRADO por empresaId + ids de la ruta
  const escandallo: any = await prisma.escandallo.findFirst({
    where: { id: eId, empresaId, clienteId: cId, temporadaId: tId },
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

  if (!escandallo) notFound();


  // 🔹 Descripción del artículo asociada al escandallo
  let descripcionArticulo: string | null =
    escandallo.articulo?.descripcion ?? null;

  if (!descripcionArticulo && escandallo.modeloInterno) {
    const articuloVinculado = await prisma.articulo.findFirst({
      where: {
        empresaId,
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

  const totalTejidos = tejidos.reduce((acc: number, t: any) => {
    const consumo = parseNum(t.consumoProduccion);
    const precio = parseNum(t.precio);
    return consumo != null && precio != null ? acc + consumo * precio : acc;
  }, 0);

  const totalForros = forros.reduce((acc: number, f: any) => {
    const consumo = parseNum(f.consumoProduccion);
    const precio = parseNum(f.precio);
    return consumo != null && precio != null ? acc + consumo * precio : acc;
  }, 0);

  const totalAccesorios = accesorios.reduce((acc: number, a: any) => {
    const cantidad = parseNum(a.cantidad);
    const precio = parseNum(a.precioUnidad);
    return cantidad != null && precio != null ? acc + cantidad * precio : acc;
  }, 0);

  const totalGastos = gastos.reduce((acc: number, g: any) => {
    const imp = parseNum(g.importe);
    return imp != null ? acc + imp : acc;
  }, 0);


  const totalCalculado =
    totalTejidos + totalForros + totalAccesorios + totalGastos;

  const totalMostrar =
    escandallo.totalCoste != null && Number.isFinite(escandallo.totalCoste)
      ? escandallo.totalCoste
      : totalCalculado;
  const pct = parseNum(escandallo.porcentajeExtra) ?? 0; // 0..100
  const extraImporte = totalMostrar * (pct / 100);
  const totalFinal = totalMostrar + extraImporte;
    


  const pedido = escandallo.pedidos?.[0] ?? null; // por si lo necesitas luego

  // 🔹 URLs base
  const escandalloHref = `${fichasBase}/${cId}/temporadas/${tId}/escandallos/${eId}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;

  // 🔹 Rutas de VISUALIZACIÓN para las pestañas
  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const controlViewHref = `${escandalloHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb + acciones */}
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              <Link
                href={fichasBase}
                className="hover:text-emerald-400 transition-colors"
              >
                Fichas
              </Link>{" "}
              /{" "}
              <Link
                href={`${fichasBase}/${cId}`}
                className="hover:text-emerald-400 transition-colors"
              >
                {escandallo.cliente?.nombre ?? `Cliente ${cId}`}
              </Link>{" "}
              /{" "}
              <Link
                href={`${fichasBase}/${cId}/temporadas/${tId}`}
                className="hover:text-emerald-400 transition-colors"
              >
                Temporada {escandallo.temporada?.codigo ?? tId}
              </Link>
            </p>
            <h1 className="text-2xl font-semibold">
              Escandallo{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno || "#s/modelo"}
              </span>
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* fila 1: navegación estándar */}
            <div className="flex flex-wrap gap-2 justify-end">
              <Link
                href={`${fichasBase}/${cId}`}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Volver a cliente
              </Link>
              <Link
                href={`${fichasBase}/${cId}/temporadas/${tId}`}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Volver a temporada
              </Link>
              <Link
                href={`${escandalloHref}/editar`}
                className="inline-flex items-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
              >
                Editar escandallo
              </Link>
            </div>

            {/* fila 2: PDFs */}
            <div className="flex flex-wrap gap-2 justify-end">
              <Link
                href={`${escandalloHref}/print?modo=completo`}
                target="_blank"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                PDF completo
              </Link>
              <Link
                href={`${escandalloHref}/print?modo=simple`}
                target="_blank"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                PDF sin precios
              </Link>
            </div>
          </div>
        </header>

        {/* 🔹 PESTAÑAS PRODUCCIÓN (solo cuando está en PRODUCCION) */}
        {escandallo.estado === "PRODUCCION" && (
          <PedidosTabs
            baseHref={produccionBaseHref}
            escandalloHref={escandalloHref}
            active="escandallo"
            pedidoHref={pedidoViewHref}
            almacenHref={almacenViewHref}
            controlHref={controlViewHref}
            observacionesHref={observacionesViewHref}
          />
        )}

        {/* CABECERA MODELO + FOTO + DATOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 grid gap-8 md:grid-cols-2">
          {/* IZQUIERDA: Artículo + foto */}
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Datos generales
              </h2>
              <p className="text-3xl font-bold text-emerald-400 mt-1">
                {escandallo.modeloInterno || "-"}
              </p>
            </div>

            <div className="w-full max-w-sm aspect-[3/4] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-center">
              {escandallo.imagenUrl ? (
                <img
                  src={escandallo.imagenUrl}
                  alt={escandallo.modeloInterno ?? "Modelo"}
                  className="max-h-full w-auto object-contain"
                />
              ) : (
                <span className="text-sm text-slate-500">
                  Sin imagen de modelo
                </span>
              )}
            </div>
          </div>

          {/* DERECHA: Cliente + temporada + datos */}
          <div className="flex flex-col items-end gap-6 text-right">
            <div>
              <p className="text-xl font-semibold text-slate-100">
                {escandallo.cliente?.nombre ?? `Cliente ${cId}`}
              </p>
              <p className="text-sm text-slate-400">
                Temporada {escandallo.temporada?.codigo ?? tId} ·{" "}
                {escandallo.temporada?.descripcion ?? "-"}
              </p>
            </div>

            <dl className="space-y-3">
              <div>
                <dt className="text-slate-400 text-sm">Ref. cliente</dt>
                <dd className="text-slate-100 text-base">
                  {escandallo.modeloCliente || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-400 text-sm">Descripción artículo</dt>
                <dd className="text-slate-100 text-base">
                  {descripcionArticulo || "—"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-400 text-sm">Patrón</dt>
                <dd className="text-slate-100 text-base">
                  {escandallo.patron || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-400 text-sm">Talla base</dt>
                <dd className="text-slate-100 text-base">
                  {escandallo.talla || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-400 text-sm">Patronista</dt>
                <dd className="text-slate-100 text-base">
                  {escandallo.patronista || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-400 text-sm">Fecha</dt>
                <dd className="text-slate-100 text-base">
                  {formatDate(escandallo.fecha)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* TEJIDOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tejidos</h2>
            <p className="text-xs text-slate-400">
              Total tejidos:{" "}
              <span className="font-semibold text-emerald-400">
                {formatCurrency(totalTejidos)}
              </span>
            </p>
          </div>

          {tejidos.length === 0 ? (
            <p className="text-xs text-slate-500">Sin tejidos registrados.</p>
          ) : (
            <div className="space-y-3">
              {tejidos.map((t: any, index: number) => {
                const muestras = parseMuestras(t.consumoMuestra);
                const consumo = parseNum(t.consumoProduccion);
                const precio = parseNum(t.precio);
                const subtotalTejido =
                  consumo != null && precio != null ? consumo * precio : null;


                return (
                  <div
                    key={t.id ?? index}
                    className="border border-slate-800 rounded-lg p-4 space-y-4"
                  >
                    {/* Cabecera del tejido – nombre grande */}
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-[11px] text-slate-400">
                        Tejido {index + 1}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-slate-100">
                      {t.proveedor || "-"}
                      {t.serie && (
                        <span className="text-slate-300">{` · Serie ${t.serie}`}</span>
                      )}
                      {t.color && (
                        <span className="text-slate-300">{` · Color ${t.color}`}</span>
                      )}
                    </p>

                    {/* Datos técnicos */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-[11px]">
                      <div>
                        <p className="text-slate-400">Ancho real (cm)</p>
                        <p className="text-slate-100">{t.anchoReal ?? "-"}</p>
                      </div>

                      <div>
                        <p className="text-slate-400">Ancho útil (cm)</p>
                        <p className="text-slate-100">{t.anchoUtil ?? "-"}</p>
                      </div>

                      <div>
                        <p className="text-slate-400">Consumo producción (m)</p>
                        <p className="text-slate-100">{t.consumoProduccion ?? "-"}</p>
                      </div>

                      <div>
                        <p className="text-slate-400">Precio €/m</p>
                        <p className="text-slate-100">{t.precio ? `${t.precio} €` : "-"}</p>
                      </div>

                      {/* 👇 NUEVO: coste por prenda */}
                      <div className="text-right">
                        <p className="text-slate-400">Coste</p>
                        <p className="text-emerald-300 font-semibold">
                          {formatCurrency(subtotalTejido)}
                        </p>
                      </div>
                    </div>


                    {/* Historial de consumos */}
                    {muestras.length > 0 && (
                      <div className="border-t border-slate-800 pt-3 space-y-1">
                        <p className="text-[11px] font-medium text-slate-300">
                          Historial de consumos de muestra
                        </p>
                        <div className="space-y-1">
                          {muestras.map((m, idx) => (
                            <p
                              key={idx}
                              className="text-[11px] text-slate-400 flex justify-between"
                            >
                              <span>{m.fecha || "-"}</span>
                              <span>{m.consumo || "-"} m</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FORROS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Forros</h2>
            <p className="text-xs text-slate-400">
              Total forros:{" "}
              <span className="font-semibold text-emerald-400">
                {formatCurrency(totalForros)}
              </span>
            </p>
          </div>

          {forros.length === 0 ? (
            <p className="text-xs text-slate-500">Sin forros registrados.</p>
          ) : (
            <div className="space-y-3">
              {forros.map((f: any, index: number) => {
                const muestras = parseMuestras(f.consumoMuestra);
                const consumo = parseNum(f.consumoProduccion);
                const precio = parseNum(f.precio);
                const subtotalForro =
                  consumo != null && precio != null ? consumo * precio : null;


                return (
                  <div
                    key={f.id ?? index}
                    className="border border-slate-800 rounded-lg p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-[11px] text-slate-400">
                        Forro {index + 1}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-slate-100">
                      {f.proveedor || "-"}
                      {f.serie && (
                        <span className="text-slate-300">{` · Serie ${f.serie}`}</span>
                      )}
                      {f.color && (
                        <span className="text-slate-300">{` · Color ${f.color}`}</span>
                      )}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-[11px]">
                      <div>
                        <p className="text-slate-400">Ancho real (cm)</p>
                        <p className="text-slate-100">{f.anchoReal ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Ancho útil (cm)</p>
                        <p className="text-slate-100">{f.anchoUtil ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">
                          Consumo producción (m)
                        </p>
                        <p className="text-slate-100">
                          {f.consumoProduccion ?? "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Precio €/m</p>
                        <p className="text-slate-100">
                          {f.precio ? `${f.precio} €` : "-"}
                        </p>
                      </div>
                        <div className="text-right">
                          <p className="text-slate-400">Coste</p>
                          <p className="text-emerald-300 font-semibold">
                            {formatCurrency(subtotalForro)}
                          </p>
                        </div>
                    </div>

                    {muestras.length > 0 && (
                      <div className="border-t border-slate-800 pt-3 space-y-1">
                        <p className="text-[11px] font-medium text-slate-300">
                          Historial de consumos de muestra
                        </p>
                        <div className="space-y-1">
                          {muestras.map((m, idx) => (
                            <p
                              key={idx}
                              className="text-[11px] text-slate-400 flex justify-between"
                            >
                              <span>{m.fecha || "-"}</span>
                              <span>{m.consumo || "-"} m</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ACCESORIOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fornituras / Accesorios</h2>
            <p className="text-xs text-slate-400">
              Total accesorios:{" "}
              <span className="font-semibold text-emerald-400">
                {formatCurrency(totalAccesorios)}
              </span>
            </p>
          </div>

          {accesorios.length === 0 ? (
            <p className="text-xs text-slate-500">Sin accesorios registrados.</p>
          ) : (
            <div className="space-y-2 text-[11px]">
              {/* Cabecera */}
              <div className="grid grid-cols-8 gap-2 text-slate-400 border-b border-slate-800 pb-2">
                <span className="col-span-2">Nombre</span>
                <span>Proveedor</span>
                <span>Referencia</span>
                <span>Color</span>
                <span>Medida</span>
                <span>Cantidad</span>
                <span className="text-right">Coste</span>
              </div>

              {accesorios.map((a: any, idx: number) => {
                const subtotal =
                  a.cantidad && a.precioUnidad
                    ? Number(a.cantidad) * Number(a.precioUnidad)
                    : null;

                return (
                  <div
                    key={a.id ?? idx}
                    className="grid grid-cols-8 gap-2 py-1 border-b border-slate-900/60"
                  >
                    <div className="col-span-2 flex items-center">
                      <p className="text-slate-100">{a.nombre || "-"}</p>
                    </div>
                    <div className="flex items-center">
                      <p>{a.proveedor || "-"}</p>
                    </div>
                    <div className="flex items-center">
                      <p>{a.referencia ? `Ref. ${a.referencia}` : "-"}</p>
                    </div>
                    <div className="flex items-center">
                      <p>{a.color || "-"}</p>
                    </div>
                    <div className="flex items-center">
                      <p>{a.medida || "-"}</p>
                    </div>
                    <div className="flex items-center">
                      <p>
                        {a.cantidad || "-"}{" "}
                        <span className="text-slate-500 text-[10px]">
                          {a.unidad || ""}
                        </span>
                      </p>
                    </div>
                      <div className="flex items-center justify-end">
                        <div className="text-right">

                          <p className="text-emerald-300 font-semibold">
                            {formatCurrency(subtotal)}
                          </p>
                        </div>
                      </div>

                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* OTROS GASTOS + OBSERVACIONES + TOTAL */}
        <section className="grid gap-4 md:grid-cols-[2fr,1.3fr]">
          <div className="space-y-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="text-sm font-semibold">Otros gastos</h2>
              {gastos.length === 0 ? (
                <p className="text-xs text-slate-500">Sin otros gastos.</p>
              ) : (
                <div className="space-y-2 text-[11px]">
                  {gastos.map((g: any, idx: number) => (
                    <div
                      key={g.id ?? idx}
                      className="flex items-center justify-between border-b border-slate-900/60 pb-1"
                    >
                      <p className="text-slate-200">
                        {g.tipo || "OTRO"} –{" "}
                        <span className="text-slate-400">
                          {g.descripcion || "-"}
                        </span>
                      </p>
                      <div className="text-right">
                        <p className="text-emerald-300 font-semibold">
                          {formatCurrency(g.importe ?? null)}
                        </p>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-2">
              <h2 className="text-sm font-semibold">Observaciones</h2>
              <p className="text-xs text-slate-300 min-h-[60px]">
                {escandallo.observaciones || "Sin observaciones."}
              </p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-emerald-600/60 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold">Resumen de costes</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Tejidos</span>
                <span className="text-slate-100">
                  {formatCurrency(totalTejidos)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Forros</span>
                <span className="text-slate-100">
                  {formatCurrency(totalForros)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Accesorios</span>
                <span className="text-slate-100">
                  {formatCurrency(totalAccesorios)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Otros gastos</span>
                <span className="text-slate-100">
                  {formatCurrency(totalGastos)}
                </span>
              </div>

                            {/* 🔸 Extra (%) */}
              <div className="flex justify-between">
                <span className="text-slate-400">Extra ({pct.toFixed(2)}%)</span>
                <span className="text-slate-100">{formatCurrency(extraImporte)}</span>
              </div>

            </div>

            <div className="pt-2">
              <p className="text-[11px] text-slate-400">Coste base</p>
              <p className="text-3xl font-bold text-emerald-400">
                {formatCurrency(totalMostrar)}
              </p>

              <p className="text-[11px] text-slate-400 mt-3">Total con extra</p>
              <p className="text-3xl font-bold text-emerald-300">
                {formatCurrency(totalFinal)}
              </p>

              {escandallo.totalCoste && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Guardado en BD: {formatCurrency(escandallo.totalCoste)} (se
                  recalcula a partir de las líneas).
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
