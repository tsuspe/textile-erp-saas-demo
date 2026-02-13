// app/(app)/[empresa]/api/articulos/[id]/delete/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ empresa: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { empresa: empresaSlug, id: idStr } = await params;

  const baseFallback = `/${empresaSlug}`;

  const articuloId = Number(idStr);
  if (!Number.isFinite(articuloId)) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/articulos?err=id_invalido`),
      303,
    );
  }

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true },
  });

  if (!empresaRow) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/articulos?err=empresa_invalida`),
      303,
    );
  }

  const base = `/${empresaRow.slug}`;

  const articulo = await prisma.articulo.findFirst({
    where: { id: articuloId, empresaId: empresaRow.id },
    select: { id: true, _count: { select: { escandallos: true } } },
  });

  if (!articulo) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/articulos?err=no_existe`),
      303,
    );
  }

  const esc = articulo._count.escandallos;
  if (esc > 0) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/articulos/${articuloId}?err=tiene_dependencias&esc=${esc}`),
      303,
    );
  }

  const del = await prisma.articulo.deleteMany({
    where: { id: articuloId, empresaId: empresaRow.id },
  });

  if (del.count === 0) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/articulos?err=no_existe`),
      303,
    );
  }

  revalidatePath(`${base}/maestros/articulos`);

  return NextResponse.redirect(
    absUrl(req, `${base}/maestros/articulos?ok=deleted`),
    303,
  );
}
