// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/observaciones/page.tsx
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
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

// 🔹 Server Action para crear comentario (multi-empresa safe)
export async function crearComentario(formData: FormData) {
  "use server";

  const pedidoId = Number(formData.get("pedidoId"));
  const autor = String(formData.get("autor") ?? "").trim();
  const texto = String(formData.get("texto") ?? "").trim();
  const tipoRaw = String(formData.get("tipo") ?? "").trim();
  const tipo = tipoRaw.length ? tipoRaw : null;

  // para revalidar
  const redirectPath = String(formData.get("redirectPath") ?? "").trim();

  // ✅ fuente de verdad para multi-empresa
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();

  if (!Number.isFinite(pedidoId) || pedidoId <= 0) return;
  if (!empresaSlug) return;
  if (!autor || !texto) return;

  // ✅ Resolver empresaId por slug (canónico)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true },
  });
  if (!empresaRow) return;

  const empresaId = empresaRow.id;

  // ✅ Validar que ese pedido pertenece a la empresa (vía escandallo)
  const pedido = await prisma.pedido.findFirst({
    where: {
      id: pedidoId,
      escandallo: { empresaId },
    },
    select: { id: true },
  });

  if (!pedido) return;

  await prisma.pedidoComentario.create({
    data: { pedidoId, autor, texto, tipo },
  });

  // ✅ Revalidación
  if (redirectPath) revalidatePath(redirectPath);

  // (Opcional) también revalidar el “listado” si ahí pintas contadores
  // revalidatePath(`/${empresaRow.slug}/fichas`);
}

const formatDate = (d: Date | string | null) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
};

export default async function ObservacionesPage({ params }: PageProps) {
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

  // ✅ 2) Escandallo filtrado por empresaId + ids ruta
  const escandallo = await prisma.escandallo.findFirst({
    where: {
      id: eId,
      clienteId: cId,
      temporadaId: tId,
      empresaId, // ✅ CLAVE
    },
    include: {
      cliente: true,
      temporada: true,
      pedidos: {
        include: {
          colores: true,
          comentarios: {
            orderBy: { createdAt: "desc" }, // ✅ orden en DB
          },
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
  const observacionesViewHref = `${escandalloHref}/observaciones`;

  const tienePreparacionAlmacen = !!pedido?.preparacionAlmacen;
  const almacenHrefForTabs = tienePreparacionAlmacen
    ? almacenViewHref
    : almacenEditHref;

  const comentarios = pedido?.comentarios ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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
              / Observaciones{" "}
              {escandallo.modeloInterno ||
                escandallo.modeloCliente ||
                `#${escandallo.id}`}
            </p>

            <h1 className="text-2xl font-semibold">
              Observaciones / comentarios{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno ||
                  escandallo.modeloCliente ||
                  `#${escandallo.id}`}
              </span>
            </h1>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2 justify-end">
              {pedido && (
                <Link
                  href={pedidoViewHref}
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Ver pedido
                </Link>
              )}

              <Link
                href={escandalloHref}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Ver escandallo
              </Link>

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
            </div>

            <div className="flex flex-wrap gap-2 justify-end mt-1">
              <Link
                href={`${observacionesViewHref}/print?modo=completo`}
                target="_blank"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                PDF completo
              </Link>

              <Link
                href={`${observacionesViewHref}/print?modo=simple`}
                target="_blank"
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                PDF solo comentarios
              </Link>
            </div>
          </div>
        </header>

        {escandallo.estado === "PRODUCCION" && (
          <PedidosTabs
            baseHref={produccionBaseHref}
            escandalloHref={escandalloHref}
            active="observaciones"
            pedidoHref={pedidoViewHref}
            almacenHref={almacenHrefForTabs}
            controlHref={controlViewHref}
            observacionesHref={observacionesViewHref}
          />
        )}

        {!pedido && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
            <p className="text-sm">
              Este modelo está en producción pero aún no tiene pedido asociado.
              Crea primero el pedido para poder registrar observaciones.
            </p>
          </section>
        )}

        {pedido && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3 text-xs">
                <h2 className="text-lg font-semibold mb-1">Datos del pedido</h2>
                <p className="text-slate-400 mb-2">
                  Cliente{" "}
                  <span className="text-emerald-400">{cliente.nombre}</span> ·
                  Temporada{" "}
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
                    <p className="font-medium">
                      {pedido.modeloInterno || escandallo.modeloInterno || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Modelo / ref. cliente</p>
                    <p className="font-medium">
                      {pedido.modeloCliente || escandallo.modeloCliente || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Patrón</p>
                    <p className="font-medium">
                      {pedido.patron || escandallo.patron || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 text-xs">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">
                  Resumen observaciones
                </p>
                <p className="text-2xl font-semibold text-emerald-400">
                  {comentarios.length}
                </p>
                <p className="text-[11px] text-slate-400">
                  comentarios registrados en este pedido.
                </p>

                {comentarios[0] && (
                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <p className="text-[11px] text-slate-400 mb-1">
                      Última actualización
                    </p>
                    <p className="text-xs text-slate-100">
                      {formatDate(comentarios[0].createdAt)} ·{" "}
                      <span className="text-emerald-300">
                        {comentarios[0].autor}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
              <h2 className="text-lg font-semibold">Añadir comentario</h2>
              <p className="text-slate-400 text-xs">
                Usa esta sección para dejar trazabilidad interna: peticiones de
                etiquetas, muestras enviadas, incidencias, notas para otros
                departamentos, etc.
              </p>

              <form action={crearComentario} className="space-y-4">
                <input type="hidden" name="pedidoId" value={pedido.id} />
                <input type="hidden" name="empresaSlug" value={empresaRow.slug} />
                <input type="hidden" name="redirectPath" value={observacionesViewHref} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label
                      htmlFor="autor"
                      className="block text-[11px] uppercase tracking-wide text-slate-400"
                    >
                      Usuario / departamento
                    </label>
                    <input
                      id="autor"
                      name="autor"
                      required
                      placeholder="Almacén, Javier, Calidad..."
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="tipo"
                      className="block text-[11px] uppercase tracking-wide text-slate-400"
                    >
                      Tipo
                    </label>
                    <input
                      id="tipo"
                      name="tipo"
                      placeholder="ALMACEN, LABORATORIO, CLIENTE..."
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Guardar comentario
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="texto"
                    className="block text-[11px] uppercase tracking-wide text-slate-400"
                  >
                    Comentario
                  </label>
                  <textarea
                    id="texto"
                    name="texto"
                    required
                    rows={3}
                    placeholder={`Ej: "ETIQUETAS PEDIDAS A INDET"\nEj: "Muestra enviada a laboratorio para solidez del color"`}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </form>
            </section>

            <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
              <h2 className="text-lg font-semibold">Histórico de comentarios</h2>

              {comentarios.length === 0 ? (
                <p className="text-slate-400 text-xs">
                  Todavía no hay comentarios registrados para este pedido.
                </p>
              ) : (
                <div className="space-y-3">
                  {comentarios.map((c) => (
                    <article
                      key={c.id}
                      className="border border-slate-800 rounded-lg px-4 py-3 flex flex-col gap-1 bg-slate-950/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-[2px] text-[10px] font-semibold text-emerald-300">
                            {c.autor}
                          </span>
                          {c.tipo && (
                            <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800 px-2 py-[2px] text-[10px] font-semibold text-slate-200">
                              {c.tipo}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 whitespace-pre-line mt-1">
                        {c.texto}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
