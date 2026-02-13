// app/(app)/[empresa]/api/articulos/[id]/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

function pad2(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).padStart(2, "0");
}
function pad4(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).padStart(4, "0");
}

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

  try {
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

    const formData = await req.formData();

    const temporadaId = Number(formData.get("temporadaId"));
    const clienteId = Number(formData.get("clienteId"));
    const subfamiliaId = Number(formData.get("subfamiliaId"));
    const descripcion = String(formData.get("descripcion") ?? "").trim();

    const codigoFromForm = String(formData.get("codigo") ?? "").trim();
    const codigoModeloRaw = String(formData.get("codigoModelo") ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);

    const updatedAtRaw = String(formData.get("updatedAt") ?? "").trim();
    const prevUpdatedAt = updatedAtRaw ? new Date(updatedAtRaw) : null;

    if (
      !Number.isFinite(temporadaId) ||
      !Number.isFinite(clienteId) ||
      !Number.isFinite(subfamiliaId) ||
      !descripcion ||
      !prevUpdatedAt ||
      Number.isNaN(prevUpdatedAt.getTime())
    ) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/${articuloId}?err=campos`),
        303,
      );
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId: empresaRow.id },
      select: { id: true, codigo: true },
    });
    if (!cliente) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/${articuloId}?err=cliente_no_valido`),
        303,
      );
    }

    const [temporada, subfamilia] = await Promise.all([
      prisma.temporada.findUnique({
        where: { id: temporadaId },
        select: { codigo: true },
      }),
      prisma.subfamilia.findUnique({
        where: { id: subfamiliaId },
        select: { codigo: true },
      }),
    ]);

    if (!temporada || !subfamilia) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/${articuloId}?err=notfound`),
        303,
      );
    }

    let codigo = "";
    if (codigoModeloRaw) {
      codigo =
        pad2(temporada.codigo) +
        pad2(cliente.codigo) +
        subfamilia.codigo +
        pad4(codigoModeloRaw);
    } else {
      const okPattern = /^(\d{2})(\d{2})([A-Z]{2})(\d{4})$/.test(codigoFromForm);
      if (!okPattern) {
        return NextResponse.redirect(
          absUrl(req, `${base}/maestros/articulos/${articuloId}?err=campos`),
          303,
        );
      }
      codigo = codigoFromForm;
    }

    const r = await prisma.articulo.updateMany({
      where: {
        id: articuloId,
        empresaId: empresaRow.id,
        updatedAt: prevUpdatedAt, // optimistic locking
      },
      data: {
        codigo,
        descripcion,
        temporadaId,
        clienteId,
        subfamiliaId,
      },
    });

    if (r.count === 0) {
      const existsNow = await prisma.articulo.findFirst({
        where: { id: articuloId, empresaId: empresaRow.id },
        select: { id: true },
      });

      if (!existsNow) {
        return NextResponse.redirect(
          absUrl(req, `${base}/maestros/articulos?err=no_existe`),
          303,
        );
      }

      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/${articuloId}?err=concurrency`),
        303,
      );
    }

    revalidatePath(`${base}/maestros/articulos`);
    revalidatePath(`${base}/maestros/articulos/${articuloId}`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/articulos/${articuloId}?ok=updated`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, `${baseFallback}/maestros/articulos/${articuloId}?err=codigo_duplicado`),
        303,
      );
    }

    console.error("[POST /api/articulos/[id]] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/articulos/${articuloId}?err=server`),
      303,
    );
  }
}
