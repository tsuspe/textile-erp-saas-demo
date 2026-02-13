// app/(app)/[empresa]/api/subfamilias/route.ts
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

  const codigoRaw = String(formData.get("codigo") ?? "")
    .trim()
    .toUpperCase();

  const descripcion = String(formData.get("descripcion") ?? "").trim();

  if (!codigoRaw || !descripcion) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=campos`),
      303,
    );
  }

  try {
    await prisma.subfamilia.create({
      data: { codigo: codigoRaw, descripcion },
    });

    // ✅ clave en prod
    revalidatePath(`${base}/maestros/subfamilias`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?ok=created`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, 
          `${base}/maestros/subfamilias?err=codigo_duplicado&codigo=${encodeURIComponent(
            codigoRaw,
          )}`
        ),
        303,
      );
    }

    console.error("[POST /api/subfamilias] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/subfamilias?err=server`),
      303,
    );
  }
}
