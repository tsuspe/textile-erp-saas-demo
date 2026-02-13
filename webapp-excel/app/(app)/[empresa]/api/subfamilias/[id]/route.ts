// app/(app)/[empresa]/api/subfamilias/[id]/route.ts
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

  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=id_invalido`),
      303,
    );
  }

  const formData = await req.formData();
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const updatedAtRaw = String(formData.get("updatedAt") ?? "").trim();

  if (!codigo || !descripcion || !updatedAtRaw) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias/${id}?error=campos`),
      303,
    );
  }

  const prevUpdatedAt = new Date(updatedAtRaw);
  if (Number.isNaN(prevUpdatedAt.getTime())) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias/${id}?error=updatedAt_invalido`),
      303,
    );
  }

  try {
    const result = await prisma.subfamilia.updateMany({
      where: { id, updatedAt: prevUpdatedAt },
      data: { codigo, descripcion },
    });

    if (result.count === 0) {
      const exists = await prisma.subfamilia.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!exists) {
        return NextResponse.redirect(
          absUrl(req, `${base}/maestros/subfamilias?err=no_existe`),
          303,
        );
      }

      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/subfamilias/${id}?error=conflict`),
        303,
      );
    }

    // ✅ clave en prod
    revalidatePath(`${base}/maestros/subfamilias`);
    revalidatePath(`${base}/maestros/subfamilias/${id}`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias/${id}?ok=1`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, 
          `${base}/maestros/subfamilias/${id}?error=codigo_duplicado&codigo=${encodeURIComponent(
            codigo,
          )}`        ),
        303,
      );
    }

    console.error("[POST /api/subfamilias/[id]] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias/${id}?error=server`),
      303,
    );
  }
}
