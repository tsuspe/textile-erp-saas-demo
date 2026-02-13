// app/(app)/[empresa]/api/clientes/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";


export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ empresa: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const { empresa: empresaSlug } = await context.params;

  const formData = await req.formData();
  const codigoRaw = String(formData.get("codigo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();

  // ⚠️ todavía no sabemos si el slug existe; usamos el slug recibido como fallback
  const baseFallback = `/${empresaSlug}`;

  if (!codigoRaw || !nombre) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/clientes?err=campos`),
      303,
    );
  }

  const codigo = /^\d+$/.test(codigoRaw) ? codigoRaw.padStart(2, "0") : codigoRaw;

  try {
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

    await prisma.cliente.create({
      data: { empresaId: empresaRow.id, codigo, nombre },
    });

    // ✅ CLAVE para `npm run start`: revalidar listado
    revalidatePath(`${base}/maestros/clientes`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes?ok=created`),
      303,
    );
  } catch (err: any) {
    // P2002 = unique constraint
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, 
          `${baseFallback}/maestros/clientes?err=codigo_duplicado&codigo=${encodeURIComponent(
            codigo,
          )}`
        ),
        303,
      );
    }

    console.error("[POST /api/clientes] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/clientes?err=server`),
      303,
    );
  }
}
