// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/nuevo/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import NuevoEscandalloForm from "./NuevoEscandalloForm";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
  }>;
};

export default async function NuevoEscandalloPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);

  // 1) Validación básica de ruta
  if (!Number.isFinite(cId) || !Number.isFinite(tId)) redirect("/");

  // 2) Resolver empresaId desde slug (CLAVE multi-empresa)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresaRow) redirect("/");

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;
  const fichasBase = `${base}/fichas`;

  // 3) Cliente debe pertenecer a la empresa
  const cliente = await prisma.cliente.findFirst({
    where: { id: cId, empresaId },
    select: { id: true, nombre: true, codigo: true },
  });
  if (!cliente) redirect(fichasBase);

  // 4) Temporada existe (compartida)
  const temporada = await prisma.temporada.findUnique({
    where: { id: tId },
    select: { id: true, codigo: true, descripcion: true },
  });
  if (!temporada) redirect(fichasBase);

  // 5) Artículos filtrados SIEMPRE por empresaId + clienteId + temporadaId
  const articulos = await prisma.articulo.findMany({
    where: { empresaId, clienteId: cId, temporadaId: tId },
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descripcion: true,
    },
  });

  /**
   * Concurrencia:
   * - En "Nuevo" no hay registro existente => no hay optimistic locking.
   * - El aviso real de conflicto se aplica en EDITAR/UPDATE pasando `updatedAt`.
   */

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Nuevo escandallo</h1>
            <p className="text-sm text-slate-400 mt-1">
              Cliente: <span className="font-semibold">{cliente.nombre}</span> · Temporada:{" "}
              <span className="font-semibold">
                {temporada.codigo} – {temporada.descripcion}
              </span>
            </p>
          </div>

          <nav className="flex gap-3 text-sm underline text-slate-200">
            <Link href={`${base}/fichas/${cliente.id}`}>Volver</Link>
            <Link href={`${base}/fichas`}>Clientes</Link>
          </nav>
        </header>

        <NuevoEscandalloForm
          empresa={empresaRow.slug}
          clienteId={cliente.id}
          temporadaId={temporada.id}
          articulos={articulos}
        />
      </div>
    </main>
  );
}
