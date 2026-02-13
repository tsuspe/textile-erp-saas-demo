import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    empresa: string;
    clienteId: string;
    temporadaId: string;
    escandallosId: string;
  }>;
};

export default async function ProduccionPage({ params }: PageProps) {
  const { empresa, clienteId, temporadaId, escandallosId } = await params;

  const cId = Number(clienteId);
  const tId = Number(temporadaId);
  const eId = Number(escandallosId);

  if (![cId, tId, eId].every(Number.isFinite)) notFound();

  // 🔹 Resolver empresa desde slug (y usar slug canónico)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });
  if (!empresaRow) notFound();

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // 🔹 Validar que el escandallo pertenece a esta empresa
  const escandallo = await prisma.escandallo.findFirst({
    where: { id: eId, clienteId: cId, temporadaId: tId, empresaId },
    select: { id: true },
  });
  if (!escandallo) notFound();

  redirect(`${base}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/produccion/pedido`);
}
