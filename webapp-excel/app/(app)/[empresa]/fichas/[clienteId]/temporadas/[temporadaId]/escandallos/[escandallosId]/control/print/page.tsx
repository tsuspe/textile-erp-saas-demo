// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/control/print/page.tsx
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

export default async function ControlPrintPage({ params, searchParams }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;
  const sp = (await searchParams) ?? {};
  const modo = String(sp.modo ?? "completo").toLowerCase();
  const simple = modo === "simple";

  // ✅ calcular "today" por request (no en module scope)
  const today = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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

  // ✅ 2) Cliente debe pertenecer a empresa
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
      pedidos: { include: { colores: true } },
    },
  });

  if (!escandallo) notFound();

  const cliente = escandallo.cliente;
  const temporada = escandallo.temporada;
  const pedido = escandallo.pedidos[0] ?? null;

  if (!pedido) notFound();

  const control = (pedido.controlCalidad || null) as any;
  const fotoModeloUrl = pedido.imagenUrl || escandallo.imagenUrl || null;

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 6mm; }
        @media print { body { margin: 0; } }
      `}</style>

      <main className="min-h-screen print:min-h-0 flex justify-center py-6 print:py-0 bg-slate-100 print:bg-white">
        <div
          className="relative bg-white text-slate-900 shadow print:shadow-none mx-auto"
          style={{ width: "277mm", padding: "6mm 8mm" }}
        >
          {/* botón imprimir */}
          <div className="absolute right-40 top-3 print:hidden">
            <PrintButton />
          </div>

          {/* cabecera */}
          <header className="mb-3 flex items-start justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-[0.18em] uppercase">
                CONTROL DE CALIDAD
              </h1>
              <p className="text-[10px] text-slate-500">
                Modelo interno:{" "}
                <span className="font-semibold">
                  {escandallo.modeloInterno ||
                    pedido.modeloInterno ||
                    `#${escandallo.id}`}
                </span>
              </p>
              <p className="text-[9px] text-slate-500 mt-0.5">
                Cliente:{" "}
                <span className="font-semibold">{cliente?.nombre ?? "—"}</span>{" "}
                · Temporada{" "}
                <span className="font-semibold">{temporada?.codigo ?? "—"}</span>
              </p>
            </div>

            <div className="text-right text-[10px] space-y-0.5">
              <p>
                Nº pedido:{" "}
                <span className="font-semibold">{pedido.numeroPedido || "—"}</span>
              </p>
              <p>
                Fecha pedido:{" "}
                <span className="font-semibold">{formatDate(pedido.fechaPedido)}</span>
              </p>
              <p>
                Fecha entrega:{" "}
                <span className="font-semibold">{formatDate(pedido.fechaEntrega)}</span>
              </p>
              <p className="text-slate-500">Generado el {today}</p>
              <p className="text-slate-500">
                Modo:{" "}
                <span className="font-semibold">
                  {simple ? "solo medidas" : "completo"}
                </span>
              </p>
            </div>
          </header>

          {/* layout: foto (si completo) + medidas */}
          <section className={`grid gap-2 ${simple ? "grid-cols-1" : "grid-cols-3"}`}>
            {!simple && (
              <div
                className="border border-slate-300 rounded flex items-center justify-center overflow-hidden"
                style={{ height: "150mm" }}
              >
                {fotoModeloUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoModeloUrl}
                    alt="Foto modelo"
                    className="max-h-full w-auto object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-slate-400">FOTO MODELO</span>
                )}
              </div>
            )}

            <div className={`${simple ? "" : "col-span-2"} space-y-2`}>
              {/* DATOS DEL PEDIDO */}
              <div className="border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">
                  Datos del pedido
                </p>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[9px]">
                  <p>
                    <span className="font-semibold">Nº pedido:</span>{" "}
                    {pedido.numeroPedido || "—"}
                  </p>

                  <p>
                    <span className="font-semibold">Modelo interno:</span>{" "}
                    {pedido.modeloInterno ||
                      escandallo.modeloInterno ||
                      `#${escandallo.id}`}
                  </p>

                  <p>
                    <span className="font-semibold">Modelo / ref. cliente:</span>{" "}
                    {pedido.modeloCliente || escandallo.modeloCliente || "—"}
                  </p>

                  <p>
                    <span className="font-semibold">Patrón:</span>{" "}
                    {pedido.patron || escandallo.patron || "—"}
                  </p>

                  <p className="col-span-2">
                    <span className="font-semibold">Cliente / Temporada:</span>{" "}
                    {cliente?.nombre ?? "—"} · {temporada?.codigo ?? "—"}
                  </p>
                </div>
              </div>

              {/* medidas */}
              <div className="border border-slate-300 rounded px-3 py-2">
                <p className="font-semibold uppercase text-[9px] mb-1">
                  Medidas importantes
                </p>

                {!control || !Array.isArray(control.colores) || control.colores.length === 0 ? (
                  <p className="text-[9px] text-slate-500">
                    Sin control de calidad definido.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {control.colores.map((c: any, idx: number) => {
                      const key = c?.pedidoColorId ?? `${c?.color ?? "color"}-${idx}`;
                      const tallas: string[] = Array.isArray(c?.tallas) ? c.tallas : [];

                      return (
                        <div key={key} className="border border-slate-300 rounded">
                          <div className="px-2 py-1 flex items-center justify-between text-[8px] bg-slate-50">
                            <span>
                              <span className="font-semibold">Color:</span>{" "}
                              {c?.color ?? "—"}
                            </span>
                            <span>
                              <span className="font-semibold">Tipo talla:</span>{" "}
                              {c?.tipoTalla ?? "—"}
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-[8px] border-t border-slate-300">
                              <thead>
                                <tr>
                                  <th className="px-1 py-0.5 text-left">Medida</th>
                                  {tallas.map((t: string) => (
                                    <th
                                      key={t}
                                      className="px-1 py-0.5 text-center font-normal"
                                    >
                                      {t}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(c?.medidas || []).map((m: any, midx: number) => {
                                  const valores = Array.isArray(m?.valores) ? m.valores : [];
                                  const allEmpty = !valores.some(
                                    (v: any) => v != null && String(v).trim().length > 0,
                                  );

                                  if ((!m?.nombre || String(m.nombre).trim() === "") && allEmpty) {
                                    return null;
                                  }

                                  return (
                                    <tr key={midx} className="border-t border-slate-300">
                                      <td className="px-1 py-0.5">{m?.nombre || "—"}</td>
                                      {tallas.map((_: string, i: number) => (
                                        <td key={i} className="px-1 py-0.5 text-center">
                                          {valores[i] != null && String(valores[i]).trim() !== ""
                                            ? valores[i]
                                            : "—"}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* observaciones (solo completo) */}
              {!simple &&
                control?.observaciones &&
                String(control.observaciones).trim().length > 0 && (
                  <div className="border border-slate-300 rounded px-3 py-2">
                    <p className="font-semibold uppercase text-[9px] mb-1">
                      Observaciones
                    </p>
                    <p className="text-[9px] whitespace-pre-line">
                      {String(control.observaciones)}
                    </p>
                  </div>
                )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
