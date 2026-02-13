// app/(app)/[empresa]/api/subfamilias/[id]/delete/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";


export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string; id: string }> },
) {
  const { empresa, id: idStr } = await context.params;
  const base = `/${empresa}`;

  const subfamiliaId = Number(idStr);
  if (!Number.isFinite(subfamiliaId)) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=id_invalido`),
      303,
    );
  }

  const subfamilia = await prisma.subfamilia.findUnique({
    where: { id: subfamiliaId },
    select: {
      id: true,
      _count: { select: { articulos: true } },
    },
  });

  if (!subfamilia) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=no_existe`),
      303,
    );
  }

  const art = subfamilia._count.articulos;
  if (art > 0) {
    return NextResponse.redirect(
      absUrl(req, 
        `${base}/maestros/subfamilias/${subfamiliaId}?err=tiene_articulos&art=${art}`,
      ),
      303,
    );
  }

  const del = await prisma.subfamilia.deleteMany({
    where: { id: subfamiliaId },
  });

  if (del.count === 0) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=no_existe`),
      303,
    );
  }

  // ✅ clave en prod
  revalidatePath(`${base}/maestros/subfamilias`);

  return NextResponse.redirect(
    absUrl(req, `${base}/maestros/subfamilias?ok=deleted`),
    303,
  );
}
