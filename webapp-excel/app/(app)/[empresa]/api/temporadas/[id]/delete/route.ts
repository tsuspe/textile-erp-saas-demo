// app/(app)/[empresa]/api/temporadas/[id]/delete/route.ts
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

  const temporadaId = Number(idStr);
  if (!Number.isFinite(temporadaId)) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=id_invalido`),
      303,
    );
  }

  const temporada = await prisma.temporada.findUnique({
    where: { id: temporadaId },
    select: {
      id: true,
      codigo: true,
      descripcion: true,
      _count: { select: { articulos: true, escandallos: true } },
    },
  });

  if (!temporada) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=no_existe`),
      303,
    );
  }

  const art = temporada._count.articulos;
  const esc = temporada._count.escandallos;

  if (art > 0 || esc > 0) {
    return NextResponse.redirect(
      absUrl(req, 
        `${base}/maestros/temporadas/${temporadaId}?err=tiene_dependencias&art=${art}&esc=${esc}`
      ),
      303,
    );
  }

  try {
    const del = await prisma.temporada.deleteMany({ where: { id: temporadaId } });

    if (del.count === 0) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/temporadas?err=no_existe`),
        303,
      );
    }

    // ✅ clave en prod
    revalidatePath(`${base}/maestros/temporadas`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?ok=deleted`),
      303,
    );
  } catch (err) {
    console.error("[POST /api/temporadas/[id]/delete] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=server`),
      303,
    );
  }
}
