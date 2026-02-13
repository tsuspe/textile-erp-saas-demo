// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/produccion/control/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PedidosTabs from "../PedidosTabs";
import ControlForm from "./ControlForm";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

export default async function ControlEditPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if (![cId, tId, eId].every(Number.isFinite)) notFound();

  // ✅ 1) Resolver empresaId por slug (y usar slug canónico)
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

  // ✅ 4) Escandallo SIEMPRE filtrado por empresaId + ids ruta
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

  // Si estás en /produccion/control y no hay pedido, lo más limpio es 404.
  // (alternativa: redirect a /produccion/pedido?err=no_pedido)
  if (!pedido) notFound();

  // 🔹 URLs base (dentro del slug canónico)
  const escandalloHref = `${base}/fichas/${cliente.id}/temporadas/${temporada.id}/escandallos/${escandallo.id}`;
  const produccionBaseHref = `${escandalloHref}/produccion`;

  const pedidoViewHref = `${escandalloHref}/pedido`;
  const almacenViewHref = `${escandalloHref}/almacen`;
  const almacenEditHref = `${produccionBaseHref}/almacen`;

  const controlViewHref = `${escandalloHref}/control`;
  const observacionesViewHref = `${escandalloHref}/observaciones`;

  // 🔹 ¿Hay ficha de almacén ya guardada?
  const tienePreparacionAlmacen = !!pedido.preparacionAlmacen;

  // Pestaña "Almacén": vista si hay datos, edición si no.
  const almacenHrefForTabs = tienePreparacionAlmacen
    ? almacenViewHref
    : almacenEditHref;

  // 👇 importante: que el form vuelva a la VISTA
  const redirectUrl = controlViewHref;

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
              / Editar control calidad{" "}
              {escandallo.modeloInterno ||
                escandallo.modeloCliente ||
                `#${escandallo.id}`}
            </p>

            <h1 className="text-2xl font-semibold">
              Editar control de calidad{" "}
              <span className="text-emerald-400">
                {escandallo.modeloInterno ||
                  escandallo.modeloCliente ||
                  `#${escandallo.id}`}
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Link
              href={pedidoViewHref}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Ver pedido
            </Link>

            <Link
              href={escandalloHref}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Ver escandallo
            </Link>

            <Link
              href={controlViewHref}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Ver control calidad
            </Link>
          </div>
        </header>

        {/* PESTAÑAS PRODUCCIÓN */}
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

        {/* FORM CONTROL CALIDAD */}
        <ControlForm
          empresa={empresaRow.slug} // ✅ slug canónico
          cliente={{ id: cliente.id, nombre: cliente.nombre }}
          temporada={{ id: temporada.id, codigo: temporada.codigo }}
          escandallo={{
            id: escandallo.id,
            modeloInterno: escandallo.modeloInterno,
            modeloCliente: escandallo.modeloCliente,
          }}
          pedido={pedido as any}
          redirectUrl={redirectUrl}
        />
      </div>
    </main>
  );
}
