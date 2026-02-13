// app/(app)/[empresa]/api/control/route.ts
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const pedidoId = Number(body?.pedidoId);
    const controlCalidad = body?.controlCalidad;
    const ifUnmodifiedSince = body?.ifUnmodifiedSince as string | undefined;

    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ ok: false, error: "pedidoId inválido" }, { status: 400 });
    }
    if (!controlCalidad || typeof controlCalidad !== "object") {
      return NextResponse.json({ ok: false, error: "controlCalidad inválido" }, { status: 400 });
    }
    if (!ifUnmodifiedSince || typeof ifUnmodifiedSince !== "string") {
      return NextResponse.json(
        { ok: false, error: "Falta ifUnmodifiedSince" },
        { status: 400 },
      );
    }

    const expectedUpdatedAt = new Date(ifUnmodifiedSince);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      return NextResponse.json(
        { ok: false, error: "ifUnmodifiedSince inválido" },
        { status: 400 },
      );
    }

    // ✅ empresa = primer segmento real del pathname: "/{empresa}/api/control"
    const empresaSlug = req.nextUrl.pathname.split("/")[1] || "";
    if (!empresaSlug) {
      return NextResponse.json({ ok: false, error: "empresa inválida" }, { status: 400 });
    }

    // ✅ 1) Resolver empresaId por slug (y usar slug canónico)
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresaSlug },
      select: { id: true, slug: true },
    });
    if (!empresaRow) {
      return NextResponse.json({ ok: false, error: "empresa no encontrada" }, { status: 404 });
    }

    const empresaId = empresaRow.id;
    const canonicalSlug = empresaRow.slug;

    // ✅ 2) Verificar que el pedido pertenece a esta empresa (vía escandallo)
    const pedidoExistente = await prisma.pedido.findFirst({
      where: {
        id: pedidoId,
        escandallo: { empresaId },
      },
      select: {
        id: true,
        updatedAt: true, // 👈 importante para debug / respuestas
        escandalloId: true,
        escandallo: { select: { clienteId: true, temporadaId: true } },
      },
    });

    if (!pedidoExistente) {
      return NextResponse.json(
        { ok: false, error: "pedido no encontrado para esta empresa" },
        { status: 404 },
      );
    }

    // ✅ 3) Guardar controlCalidad SOLO si updatedAt no ha cambiado
    const updated = await prisma.pedido.updateMany({
      where: {
        id: pedidoExistente.id,
        updatedAt: expectedUpdatedAt,
        escandallo: { empresaId },
      },
      data: { controlCalidad },
    });

    if (updated.count === 0) {
      const current = await prisma.pedido.findFirst({
        where: { id: pedidoExistente.id, escandallo: { empresaId } },
        select: { updatedAt: true },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "conflict",
          message:
            "Otro usuario ha guardado cambios antes que tú. Recarga la página para evitar pisar datos.",
          currentUpdatedAt: current?.updatedAt?.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    // ✅ 4) Re-leer updatedAt nuevo + ids para revalidate
    const fresh = await prisma.pedido.findUnique({
      where: { id: pedidoExistente.id },
      select: {
        id: true,
        updatedAt: true,
        escandalloId: true,
        escandallo: { select: { clienteId: true, temporadaId: true } },
      },
    });

    const cId = fresh!.escandallo.clienteId;
    const tId = fresh!.escandallo.temporadaId;
    const eId = fresh!.escandalloId;

    // ✅ 5) Revalidar paths con slug canónico
    revalidatePath(`/${canonicalSlug}/fichas`);
    revalidatePath(`/${canonicalSlug}/fichas/${cId}`);
    revalidatePath(`/${canonicalSlug}/fichas/${cId}/temporadas/${tId}`);
    revalidatePath(
      `/${canonicalSlug}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/control`,
    );
    revalidatePath(
      `/${canonicalSlug}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/produccion/control`,
    );

    return NextResponse.json({
      ok: true,
      pedidoId: fresh!.id,
      updatedAt: fresh!.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[POST /api/control] Error:", err);
    return NextResponse.json({ ok: false, error: "Error guardando control de calidad" }, { status: 500 });
  }
}
