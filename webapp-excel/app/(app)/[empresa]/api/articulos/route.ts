// app/(app)/[empresa]/api/articulos/route.ts
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

type Ctx = { params: Promise<{ empresa: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { empresa: empresaSlug } = await params;

  // fallback por si el slug no existe (pero seguimos redirigiendo bien)
  const baseFallback = `/${empresaSlug}`;

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

    const codigoFromForm = String(formData.get("codigo") ?? "").trim();
    const codigoModeloRaw = String(formData.get("codigoModelo") ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);

    const descripcion = String(formData.get("descripcion") ?? "").trim();

    if (
      !Number.isFinite(temporadaId) ||
      !Number.isFinite(clienteId) ||
      !Number.isFinite(subfamiliaId) ||
      !descripcion
    ) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/nuevo?err=campos`),
        303,
      );
    }

    // cliente SIEMPRE es por empresa
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId: empresaRow.id },
      select: { id: true, codigo: true },
    });

    if (!cliente) {
      return NextResponse.redirect(
        absUrl(req, `${base}/maestros/articulos/nuevo?err=cliente_no_valido`),
        303,
      );
    }

    // maestros globales
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
        absUrl(req, `${base}/maestros/articulos/nuevo?err=notfound`),
        303,
      );
    }

    // Código: recomponer si hay modelo; si no, validar hidden
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
          absUrl(req, `${base}/maestros/articulos/nuevo?err=campos`),
          303,
        );
      }
      codigo = codigoFromForm;
    }

    await prisma.articulo.create({
      data: {
        empresaId: empresaRow.id,
        codigo,
        descripcion,
        temporadaId,
        clienteId,
        subfamiliaId,
      },
    });

    // 🔥 CLAVE en next start
    revalidatePath(`${base}/maestros/articulos`);
    revalidatePath(`${base}/maestros/articulos/nuevo`);

    return NextResponse.redirect(
      absUrl(req, `${base}/maestros/articulos?ok=created`),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.redirect(
        absUrl(req, `${baseFallback}/maestros/articulos/nuevo?err=codigo_duplicado`),
        303,
      );
    }

    console.error("[POST /api/articulos] Error:", err);
    return NextResponse.redirect(
      absUrl(req, `${baseFallback}/maestros/articulos/nuevo?err=server`),
      303,
    );
  }
}
