// app/(app)/[empresa]/api/clientes/[id]/delete/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string; id: string }> },
) {
  const { empresa: empresaSlug, id: idStr } = await context.params;
  const baseFallback = `/${empresaSlug}`;

  const clienteId = Number(idStr);
  if (!Number.isFinite(clienteId)) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/clientes?err=id_invalido`,),
      303,
    );
  }

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true },
  });

  if (!empresaRow) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/clientes?err=empresa_invalida`),
      303,
    );
  }

  const base = `/${empresaRow.slug}`;

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId: empresaRow.id },
    select: {
      id: true,
      _count: { select: { articulos: true, escandallos: true } },
    },
  });

  if (!cliente) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes?err=no_existe`),
      303,
    );
  }

  if (cliente._count.articulos > 0 || cliente._count.escandallos > 0) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${clienteId}?err=tiene_datos_asociados`),
      303,
    );
  }

  const del = await prisma.cliente.deleteMany({
    where: { id: clienteId, empresaId: empresaRow.id },
  });

  if (del.count === 0) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${clienteId}?err=no_existe`),
      303,
    );
  }

  // ✅ CLAVE para `npm run start`
  revalidatePath(`${base}/maestros/clientes`);

  return NextResponse.redirect(
    absUrl(req, `${base}/maestros/clientes?ok=deleted`),
    303,
  );
}
