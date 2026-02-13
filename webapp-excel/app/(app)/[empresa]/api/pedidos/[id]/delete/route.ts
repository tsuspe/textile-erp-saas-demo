import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ empresa: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { empresa, id } = await params;
  const pedidoId = Number(id);

  if (!empresa) {
    return NextResponse.json({ error: "Empresa no válida" }, { status: 400 });
  }

  if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
    return NextResponse.json({ error: "ID de pedido no válido" }, { status: 400 });
  }

  // Resolver empresa
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true },
  });

  if (!empresaRow) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const empresaId = empresaRow.id;
  const base = `/${empresaRow.slug}`;

  // Buscar pedido
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId },
    select: {
      id: true,
      escandalloId: true,
      escandallo: {
        select: {
          id: true,
          clienteId: true,
          temporadaId: true,
          empresaId: true,
        },
      },
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const cId = pedido.escandallo.clienteId;
  const tId = pedido.escandallo.temporadaId;
  const eId = pedido.escandallo.id;

  // Borrado transaccional
  await prisma.$transaction(async (tx) => {
    await tx.pedidoTejido.deleteMany({ where: { pedidoId } });
    await tx.pedidoForro.deleteMany({ where: { pedidoId } });
    await tx.pedidoAccesorio.deleteMany({ where: { pedidoId } });
    await tx.pedidoColor.deleteMany({ where: { pedidoId } });
    await tx.pedidoComentario.deleteMany({ where: { pedidoId } });

    await tx.pedido.delete({ where: { id: pedidoId } });

    await tx.escandallo.updateMany({
      where: { id: pedido.escandalloId, empresaId },
      data: { estado: "ESCANDALLO", fechaAprobacion: null },
    });
  });

  // Revalidaciones
  revalidatePath(`${base}/fichas`);
  revalidatePath(`${base}/fichas/${cId}`);
  revalidatePath(`${base}/fichas/${cId}/temporadas/${tId}`);
  revalidatePath(`${base}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}`);

  // Redirect FINAL seguro
  return NextResponse.redirect(
    absUrl(req, `${base}/fichas/${cId}/temporadas/${tId}?ok=pedido_eliminado`),
    303,
  );
}
