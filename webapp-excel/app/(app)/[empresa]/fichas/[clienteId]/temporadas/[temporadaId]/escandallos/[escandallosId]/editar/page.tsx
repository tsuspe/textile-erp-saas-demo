// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/editar/page.tsx
import { prisma } from "@/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import NuevoEscandalloForm from "../../nuevo/NuevoEscandalloForm";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
  searchParams?: Promise<{
    ok?: string; // "created" | "updated" | etc.
    error?: string; // "conflict", etc.
  }>;
};

export default async function EditarEscandalloPage({ params, searchParams }: PageProps) {
  // ✅ Para edición + concurrencia: siempre datos frescos (evita updatedAt stale)
  noStore();

  const { empresa, clienteId, temporadaId, escandallosId } = await params;
  const sp = (await searchParams) ?? {};

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if (![cId, tId, eId].every(Number.isFinite)) {
    redirect(`/${empresa}/fichas`);
  }

  // 1) Resolver empresaId desde slug (CLAVE multi-empresa)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;
  const fichasBase = `${base}/fichas`;

  // 2) Cliente debe pertenecer a la empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true },
  });
  if (!cliente) notFound();

  // 3) Temporada existe (compartida)
  const temporada = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true, codigo: true, descripcion: true },
  });
  if (!temporada) notFound();

  // 4) Escandallo: SIEMPRE filtrado por empresaId + ids ruta
  const escandallo = await prisma.escandallo.findFirst({
    where: { id: eId, empresaId, clienteId: cId, temporadaId: tId },
    include: {
      tejidos: true,
      forros: true,
      accesorios: true,
      otrosGastos: true,
    },
  });
  if (!escandallo) notFound();

  // 5) Artículos: filtrados por empresaId + clienteId + temporadaId
  const articulos = await prisma.articulo.findMany({
    where: { empresaId, clienteId: cId, temporadaId: tId },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, descripcion: true },
  });

  const toStr = (v: any) => (v === null || v === undefined ? "" : String(v));
  const dateToInput = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  const parseMuestras = (raw: string | null) => {
    if (!raw) return [{ fecha: "", consumo: "" }];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ fecha: "", consumo: "" }];
    } catch {
      return [{ fecha: "", consumo: "" }];
    }
  };

  const initialValues = {
    id: escandallo.id,
    updatedAt: escandallo.updatedAt.toISOString(), // ✅ CLAVE CONCURRENCIA
    porcentajeExtra: toStr(escandallo.porcentajeExtra ?? 0),


    articuloId: escandallo.articuloId,
    modeloInterno: escandallo.modeloInterno ?? "",
    modeloCliente: escandallo.modeloCliente ?? "",
    patron: escandallo.patron ?? "",
    talla: escandallo.talla ?? "",
    patronista: escandallo.patronista ?? "",
    fecha: dateToInput(escandallo.fecha),
    observaciones: escandallo.observaciones ?? "",
    imagenUrl: escandallo.imagenUrl ?? null,
    estado: escandallo.estado === "PRODUCCION" ? "PRODUCCION" : "ESCANDALLO",

    tejidos: (escandallo.tejidos ?? []).map((t) => ({
      proveedor: t.proveedor ?? "",
      serie: t.serie ?? "",
      color: t.color ?? "",
      anchoReal: toStr(t.anchoReal),
      anchoUtil: toStr(t.anchoUtil),
      consumoProduccion: toStr(t.consumoProduccion),
      precio: toStr(t.precio),
      muestras: parseMuestras(t.consumoMuestra),
    })),
    forros: (escandallo.forros ?? []).map((f) => ({
      proveedor: f.proveedor ?? "",
      serie: f.serie ?? "",
      color: f.color ?? "",
      anchoReal: toStr(f.anchoReal),
      anchoUtil: toStr(f.anchoUtil),
      consumoProduccion: toStr(f.consumoProduccion),
      precio: toStr(f.precio),
      muestras: parseMuestras(f.consumoMuestra),
    })),
    accesorios: (escandallo.accesorios ?? []).map((a) => ({
      nombre: a.nombre ?? "",
      medida: a.medida ?? "",
      unidad: a.unidad ?? "UNIDADES",
      proveedor: a.proveedor ?? "",
      referencia: a.referencia ?? "",
      color: a.color ?? "",
      cantidad: toStr(a.cantidad),
      precioUnidad: toStr(a.precioUnidad),
    })),
    gastos: (escandallo.otrosGastos ?? []).map((g) => ({
      tipo: g.tipo ?? "",
      descripcion: g.descripcion ?? "",
      importe: toStr(g.importe),
    })),
  };

  // ✅ OK banner: tu API usa ok=created/updated
  const showOk = sp.ok === "created" || sp.ok === "updated" || sp.ok === "1";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={fichasBase} className="hover:text-emerald-400">
                Fichas
              </Link>{" "}
              /{" "}
              <Link href={`${fichasBase}/${cId}`} className="hover:text-emerald-400">
                {cliente.nombre}
              </Link>{" "}
              /{" "}
              <Link
                href={`${fichasBase}/${cId}/temporadas/${tId}`}
                className="hover:text-emerald-400"
              >
                Temporada {temporada.codigo}
              </Link>
            </p>

            <h1 className="text-2xl font-bold mt-1">
              Editar escandallo{" "}
              <span className="text-emerald-400">{escandallo.modeloInterno || "Sin código"}</span>
            </h1>

            {sp.error === "conflict" && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                ⚠️ Conflicto de edición: alguien guardó cambios mientras tú estabas editando.
                Recarga para traer la última versión y vuelve a guardar.
              </div>
            )}

            {showOk && (
              <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                ✅ Guardado.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Link
              href={`${fichasBase}/${cId}/temporadas/${tId}/escandallos/${eId}`}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Ver detalle
            </Link>

            <Link
              href={`${fichasBase}/${cId}/temporadas/${tId}`}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Volver a temporada
            </Link>
          </div>
        </header>

        <NuevoEscandalloForm
          mode="editar"
          empresa={empresaRow.slug}
          clienteId={cId}
          temporadaId={tId}
          articulos={articulos}
          initialValues={initialValues as any}
        />
      </div>
    </main>
  );
}
