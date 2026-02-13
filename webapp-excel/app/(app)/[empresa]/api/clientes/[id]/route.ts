// app/(app)/[empresa]/api/clientes/[id]/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ empresa: string; id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const { empresa: empresaSlug, id: idStr } = await context.params;

  const baseFallback = `/${empresaSlug}`;

  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/clientes?err=id_invalido`),
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

  const formData = await req.formData();
  const codigoRaw = String(formData.get("codigo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const updatedAtRaw = String(formData.get("updatedAt") ?? "").trim();

  if (!codigoRaw || !nombre || !updatedAtRaw) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${id}?error=campos`),
      303,
    );
  }

  const codigo = /^\d+$/.test(codigoRaw) ? codigoRaw.padStart(2, "0") : codigoRaw;

  const prevUpdatedAt = new Date(updatedAtRaw);
  if (Number.isNaN(prevUpdatedAt.getTime())) {
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${id}?error=updatedAt_invalido`),
      303,
    );
  }

  try {
    // ✅ optimistic locking + multi-empresa guard en el WHERE
    const result = await prisma.cliente.updateMany({
      where: { id, empresaId: empresaRow.id, updatedAt: prevUpdatedAt },
      data: { codigo, nombre },
    });

    if (result.count === 0) {
      const exists = await prisma.cliente.findFirst({
        where: { id, empresaId: empresaRow.id },
        select: { id: true },
      });

      if (!exists) {
        return NextResponse.redirect(
          absUrl(req, `${base}/maestros/clientes?err=no_existe`),
          303,
        );
      }

      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/clientes/${id}?error=conflict`),
        303,
      );
    }

    // ✅ revalidar listado + página de edición
    revalidatePath(`${base}/maestros/clientes`);
    revalidatePath(`${base}/maestros/clientes/${id}`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${id}?ok=1`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req,
          `${base}/maestros/clientes/${id}?error=codigo_duplicado&codigo=${encodeURIComponent(
            codigo,
          )}`
        ),
        303,
      );
    }

    console.error("[POST /api/clientes/[id]] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/clientes/${id}?error=server`),
      303,
    );
  }
}
