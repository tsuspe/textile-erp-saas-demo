// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/observaciones/print/page.tsx
import { PrintButton } from "@/app/components/PrintButton";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
  searchParams?: Promise<{ modo?: string }>;
};

const formatDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
};

export default async function ObservacionesPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const sp = (await searchParams) ?? {};
  const modo = String(sp.modo ?? "completo").toLowerCase();
  const simple = modo === "simple";

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

  // ✅ 3) Temporada existe (si es global, con esto vale)
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
        include: { comentarios: true },
      },
    },
  });

  if (!escandallo) notFound();

  const cliente = escandallo.cliente!;
  const temporada = escandallo.temporada!;
  const pedido = escandallo.pedidos[0] ?? null;

  // ✅ today por request (no module scope)
  const today = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const comentarios =
    pedido?.comentarios
      ?.slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) ?? [];

  const tituloModelo =
    escandallo.modeloInterno || escandallo.modeloCliente || `#${escandallo.id}`;

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          *:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }
        }
      `}</style>

      <main className="min-h-screen print:min-h-0 flex justify-center py-6 print:py-0 bg-slate-100 print:bg-white">
        <div
          className="relative bg-white text-slate-900 shadow print:shadow-none mx-auto"
          style={{ width: "190mm", padding: "10mm" }}
        >
          {/* botón imprimir */}
          <div className="absolute right-40 top-4 no-print">
            <PrintButton />
          </div>

          {/* cabecera */}
          <header className="mb-3 flex items-start justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-[0.12em] uppercase">
                OBSERVACIONES / COMENTARIOS
              </h1>
              <p className="text-[10px] text-slate-500">
                Modelo: <span className="font-semibold">{tituloModelo}</span>
              </p>
              <p className="text-[9px] text-slate-500 mt-0.5">
                Cliente: <span className="font-semibold">{cliente.nombre}</span> · Temporada{" "}
                <span className="font-semibold">{temporada.codigo}</span>
              </p>
            </div>

            <div className="text-right text-[10px] space-y-0.5">
              <p className="text-slate-500">Generado el {today}</p>
              <p className="text-slate-500">
                Modo:{" "}
                <span className="font-semibold">
                  {simple ? "solo comentarios" : "completo"}
                </span>
              </p>
            </div>
          </header>

          {/* datos pedido (solo completo) */}
          {!simple && pedido && (
            <section className="border border-slate-300 rounded px-3 py-2 mb-3">
              <p className="font-semibold uppercase text-[9px] mb-1">Datos del pedido</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[9px]">
                <p>
                  <span className="font-semibold">Nº pedido:</span> {pedido.numeroPedido || "—"}
                </p>
                <p>
                  <span className="font-semibold">Fecha pedido:</span> {formatDate(pedido.fechaPedido)}
                </p>
                <p className="col-span-2">
                  <span className="font-semibold">Fecha entrega:</span> {formatDate(pedido.fechaEntrega)}
                </p>
              </div>
            </section>
          )}

          {/* comentarios */}
          <section className="border border-slate-300 rounded px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold uppercase text-[9px]">Histórico de comentarios</p>
              <p className="text-[9px] text-slate-500">
                Total: <span className="font-semibold text-slate-900">{comentarios.length}</span>
              </p>
            </div>

            {comentarios.length === 0 ? (
              <p className="text-[9px] text-slate-500">Todavía no hay comentarios registrados.</p>
            ) : (
              <div className="space-y-2">
                {comentarios.map((c) => (
                  <div key={c.id} className="border border-slate-300 rounded px-2 py-2">
                    <div className="flex items-center justify-between text-[9px]">
                      <div className="font-semibold">{c.autor}</div>
                      <div className="text-slate-500">{formatDate(c.createdAt)}</div>
                    </div>

                    <p className="text-[10px] whitespace-pre-line mt-1">{c.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
