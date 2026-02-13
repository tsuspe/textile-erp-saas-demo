// app/(app)/[empresa]/api/ai/action-click/route.ts
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ empresa: string }> },
) {
  try {
    const { empresa } = await params;
    const body = await req.json();

    const interactionId = Number(body.interactionId);
    const actionClicked = String(body.actionClicked ?? "").trim();
    const actionHref = String(body.actionHref ?? "").trim();
    const actionPath = String(body.actionPath ?? "").trim();

    if (!Number.isFinite(interactionId) || !actionClicked) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true },
    });
    if (!empresaRow) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    // ✅ Seguridad multi-empresa: solo actualiza si coincide empresaId
    const updated = await prisma.aIInteraction.updateMany({
      where: { id: interactionId, empresaId: empresaRow.id },
      data: {
        actionClicked,
        actionHref: actionHref || null,
        actionPath: actionPath || null,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Interacción no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("action-click error:", err);
    return NextResponse.json({ error: "Error guardando telemetría" }, { status: 500 });
  }
}
