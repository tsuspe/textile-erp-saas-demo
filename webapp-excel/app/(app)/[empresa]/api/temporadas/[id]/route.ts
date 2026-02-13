import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string; id: string }> },
) {
  const { empresa, id: idStr } = await context.params;
  const base = `/${empresa}`;

  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=id_invalido`),
      303,
    );
  }

  const formData = await req.formData();
  const codigoRaw = String(formData.get("codigo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const updatedAtRaw = String(formData.get("updatedAt") ?? "").trim();

  if (!codigoRaw || !descripcion || !updatedAtRaw) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas/${id}?err=campos`),
      303,
    );
  }

  const codigo = /^\d+$/.test(codigoRaw) ? String(Number(codigoRaw)) : codigoRaw;

  const prevUpdatedAt = new Date(updatedAtRaw);
  if (Number.isNaN(prevUpdatedAt.getTime())) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas/${id}?err=updatedAt_invalido`),
      303,
    );
  }

  try {
    // ✅ 1) existe?
    const exists = await prisma.temporada.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/temporadas?err=no_existe`),
        303,
      );
    }

    // ✅ 2) optimistic locking
    const result = await prisma.temporada.updateMany({
      where: { id, updatedAt: prevUpdatedAt },
      data: { codigo, descripcion },
    });

    if (result.count === 0) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/temporadas/${id}?err=conflict`),
        303,
      );
    }

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas/${id}?ok=updated`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, 
          `${base}/maestros/temporadas/${id}?err=codigo_duplicado&codigo=${encodeURIComponent(
            codigo,
          )}`
        ),
        303,
      );
    }

    console.error("[POST /api/temporadas/[id]] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas/${id}?err=server`),
      303,
    );
  }
}
