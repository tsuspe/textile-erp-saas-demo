import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PedidoForm from "../../pedido/PedidoForm";
import PedidosTabs from "../PedidosTabs";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

export default async function ProduccionPedidoPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if ([cId, tId, eId].some((n) => Number.isNaN(n))) {
    notFound();
  }


  // 🔹 Resolver empresaId desde slug
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });

  if (!empresaRow) notFound();
  const empresaId = empresaRow.id;

  const base = `/${empresaRow.slug}`;


  // 🔹 Escandallo: SIEMPRE filtrado por empresaId + ids de ruta
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
      tejidos: true,
      forros: true,
      accesorios: true,
      articulo: true,
      pedidos: {
        include: {
          tejidos: true,
          forros: true,
          accesorios: true,
          colores: true,
          comentarios: true,
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

  // 🔹 Descripción del artículo asociada al escandallo
  let descripcionArticulo: string | null = escandallo.articulo?.descripcion ?? null;

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

  const cliente = escandallo.cliente;
  const temporada = escandallo.temporada;
  const pedidoExistente = escandallo.pedidos?.[0] ?? null;

  const descripcionEscandalloBase = descripcionArticulo ?? "";
  const observacionesBase =
    pedidoExistente?.observaciones ?? escandallo.observaciones ?? "";

  const initialValues = pedidoExistente
    ? {
        id: pedidoExistente.id,
        updatedAt: pedidoExistente.updatedAt.toISOString(),
        numeroPedido: pedidoExistente.numeroPedido ?? "",
        fechaPedido: pedidoExistente.fechaPedido
          ? pedidoExistente.fechaPedido.toISOString().slice(0, 10)
          : "",
        fechaEntrega: pedidoExistente.fechaEntrega
          ? pedidoExistente.fechaEntrega.toISOString().slice(0, 10)
          : "",
        modeloInterno:
          pedidoExistente.modeloInterno ?? escandallo.modeloInterno ?? "",
        modeloCliente:
          pedidoExistente.modeloCliente ?? escandallo.modeloCliente ?? "",
        patron: pedidoExistente.patron ?? escandallo.patron ?? "",
        descripcionEscandallo: descripcionEscandalloBase,
        descripcionPedido: pedidoExistente.descripcionPedido ?? "",
        costeEscandallo:
          pedidoExistente.costeEscandallo ?? escandallo.totalCoste ?? null,
        precioVenta:
          pedidoExistente.precioVenta != null
            ? pedidoExistente.precioVenta.toString()
            : "",
        pvp: pedidoExistente.pvp != null ? pedidoExistente.pvp.toString() : "",
        observaciones: observacionesBase,
        imagenUrl: pedidoExistente.imagenUrl ?? escandallo.imagenUrl ?? null,

        tejidos: pedidoExistente.tejidos.map((t) => ({
          proveedor: t.proveedor ?? "",
          serie: t.serie ?? "",
          color: t.color ?? "",
          consumoProduccion:
            t.consumoProduccion != null ? t.consumoProduccion.toString() : "",
          composicion: t.composicion ?? "",
          metrosPedidos: t.metrosPedidos != null ? t.metrosPedidos.toString() : "",
          fechaPedido: t.fechaPedido ? t.fechaPedido.toISOString().slice(0, 10) : "",
        })),

        forros: pedidoExistente.forros.map((f) => ({
          proveedor: f.proveedor ?? "",
          serie: f.serie ?? "",
          color: f.color ?? "",
          consumoProduccion:
            f.consumoProduccion != null ? f.consumoProduccion.toString() : "",
          composicion: f.composicion ?? "",
          metrosPedidos: f.metrosPedidos != null ? f.metrosPedidos.toString() : "",
          fechaPedido: f.fechaPedido ? f.fechaPedido.toISOString().slice(0, 10) : "",
        })),

        accesorios: pedidoExistente.accesorios.map((a) => ({
          nombre: a.nombre ?? "",
          proveedor: a.proveedor ?? "",
          referencia: a.referencia ?? "",
          color: a.color ?? "",
          medida: a.medida ?? "",
          unidad: a.unidad ?? "UNIDADES",
          consumoEsc: a.consumoEsc != null ? a.consumoEsc.toString() : "",
          cantidadPed: a.cantidadPed != null ? a.cantidadPed.toString() : "",
          fechaPedido: a.fechaPedido ? a.fechaPedido.toISOString().slice(0, 10) : "",
        })),

        colores: pedidoExistente.colores.map((c) => {
          const dist = (c.distribucion as any) || {};
          const tallas: string[] = dist.tallas ?? [];
          const unidades: number[] = dist.unidades ?? [];
          return {
            color: c.color,
            tipoTalla: c.tipoTalla as "LETRAS" | "NUMEROS" | "PERSONALIZADO",
            tallas: tallas.join(","),
            unidades: unidades.map((u) => String(u ?? 0)).join(","),
          };
        }),
      }
    : {
        id: undefined,
        numeroPedido: "",
        fechaPedido: "",
        fechaEntrega: "",
        modeloInterno: escandallo.modeloInterno ?? "",
        modeloCliente: escandallo.modeloCliente ?? "",
        patron: escandallo.patron ?? "",
        descripcionEscandallo: descripcionEscandalloBase,
        descripcionPedido: "",
        costeEscandallo: escandallo.totalCoste ?? null,
        precioVenta: "",
        pvp: "",
        observaciones: observacionesBase,
        imagenUrl: escandallo.imagenUrl ?? null,

        tejidos: escandallo.tejidos.map((t) => ({
          proveedor: t.proveedor ?? "",
          serie: t.serie ?? "",
          color: t.color ?? "",
          consumoProduccion:
            t.consumoProduccion != null ? t.consumoProduccion.toString() : "",
          composicion: "",
          metrosPedidos: "",
          fechaPedido: "",
        })),

        forros: escandallo.forros.map((f) => ({
          proveedor: f.proveedor ?? "",
          serie: f.serie ?? "",
          color: f.color ?? "",
          consumoProduccion:
            f.consumoProduccion != null ? f.consumoProduccion.toString() : "",
          composicion: "",
          metrosPedidos: "",
          fechaPedido: "",
        })),

        accesorios: escandallo.accesorios.map((a) => {
          const consumoBase =
            (a as any).consumoEsc ?? (a as any).cantidad ?? null;

          return {
            nombre: a.nombre ?? "",
            proveedor: a.proveedor ?? "",
            referencia: a.referencia ?? "",
            color: a.color ?? "",
            medida: a.medida ?? "",
            unidad: a.unidad ?? "UNIDADES",
            consumoEsc: consumoBase != null ? String(consumoBase) : "",
            cantidadPed: "",
            fechaPedido: "",
          };
        }),

        colores: [],
      };

  const escandalloHref = `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${escandallo.id}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;
  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const almacenEditHref = `${produccionBaseHref}/almacen`;
  const controlViewHref = `${escandalloHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;

  const tienePreparacionAlmacen = !!pedidoExistente?.preparacionAlmacen;
  const almacenHrefForTabs = tienePreparacionAlmacen ? almacenViewHref : almacenEditHref;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              <Link href={`${base}/fichas`} className="hover:text-emerald-400 transition-colors">
                Fichas
              </Link>{" "}
              /{" "}
              <Link href={`${base}/fichas/${cliente.id}`} className="hover:text-emerald-400 transition-colors">
                {cliente.nombre}
              </Link>{" "}
              /{" "}
              <Link href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`} className="hover:text-emerald-400 transition-colors">
                Temporada {temporada.codigo}
              </Link>{" "}
              / Producción
            </p>

            <h1 className="text-2xl font-semibold">
              Producción · Pedido{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno || escandallo.modeloCliente || `#${escandallo.id}`}
              </span>
            </h1>

            <p className="text-xs text-slate-400">
              Cliente: {cliente.nombre} · Temporada {temporada.codigo}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {pedidoExistente && (
              <Link
                href={pedidoViewHref}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Ver pedido
              </Link>
            )}
            <Link
              href={escandalloHref}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Ver escandallo
            </Link>
            <Link
              href={`${base}/fichas/${cliente.id}/temporadas/${temporada.id}`}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Volver a temporada
            </Link>
          </div>
        </header>

        {escandallo.estado === "PRODUCCION" && (
          <PedidosTabs
            baseHref={produccionBaseHref}
            escandalloHref={escandalloHref}
            active="pedido"
            pedidoHref={pedidoViewHref}
            almacenHref={almacenHrefForTabs}
            controlHref={controlViewHref}
            observacionesHref={observacionesViewHref}
          />
        )}

        <div className="mt-4">
          <PedidoForm
            empresa={empresaRow.slug}
            clienteId={cId}
            temporadaId={tId}
            escandalloId={eId}
            escandalloCodigo={
              escandallo.modeloInterno || escandallo.modeloCliente || `#${escandallo.id}`
            }
            initialValues={initialValues as any}
          />
        </div>

        {pedidoExistente && (
          <section className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-red-300">Zona peligrosa</h2>

            <p className="text-xs text-slate-300">
              Esto eliminará el pedido y todos sus datos asociados (tejidos, forros, accesorios, colores, comentarios…).
              El escandallo volverá a estado <span className="font-mono">ESCANDALLO</span>.
            </p>

            <form
              action={`${base}/api/pedidos/${pedidoExistente.id}/delete`}
              method="POST"
              className="inline"
            >
              <DeleteButton
                label="Eliminar pedido"
                confirmText={`Eliminar el pedido del escandallo "${escandallo.modeloInterno || `#${escandallo.id}`}". Se perderán todos los datos del pedido. ¿Continuar?`}
              />
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
