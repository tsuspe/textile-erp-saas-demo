// app/(app)/[empresa]/api/temporadas/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string }> },
) {
  const { empresa } = await context.params;
  const base = `/${empresa}`;

  const formData = await req.formData();
  const codigoRaw = String(formData.get("codigo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  if (!codigoRaw || !descripcion) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=campos`),
      303,
    );
  }

  const codigo = /^\d+$/.test(codigoRaw) ? String(Number(codigoRaw)) : codigoRaw;

  try {
    await prisma.temporada.create({
      data: { codigo, descripcion },
    });

    // ✅ clave en prod
    revalidatePath(`${base}/maestros/temporadas`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?ok=created`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req,
          `${base}/maestros/temporadas?err=codigo_duplicado&codigo=${encodeURIComponent(
            codigo,
          )}`
        ),
        303,
      );
    }

    console.error("[POST /api/temporadas] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/temporadas?err=server`),
      303,
    );
  }
}
