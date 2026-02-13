export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";

const ALLOWED_GROUPS = ["ALMACEN", "PRODUCCION", "CONTABILIDAD", "ADMIN"] as const;

export async function POST(req: Request) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });
  if (!userHasAnyGroup(user.groups, [...ALLOWED_GROUPS])) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const pedidoId = Number(body?.pedidoId || 0);
  const empresaId = Number(body?.empresaId || 0);
  const facturado = Boolean(body?.facturado);
  const numeroFactura = body?.numeroFactura ? String(body.numeroFactura) : null;
  const fechaFactura = body?.fechaFactura ? new Date(body.fechaFactura) : null;
  const updatedAt = body?.updatedAt ? new Date(body.updatedAt) : null;

  if (!pedidoId || !empresaId || !updatedAt) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }

  const result = await prisma.pedido.updateMany({
    where: { id: pedidoId, empresaId, updatedAt },
    // NOTE: el cliente Prisma puede no estar generado aún tras añadir campos.
    // Usa `npx prisma generate` para actualizar tipos. Cast temporal para build.
    data: { facturado, numeroFactura, fechaFactura } as any,
  });

  if (result.count === 0) {
    return NextResponse.json(
      { ok: false, error: "registro cambiado por otro usuario" },
      { status: 409 },
    );
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { updatedAt: true },
  });

  return NextResponse.json({ ok: true, updatedAt: pedido?.updatedAt.toISOString() ?? new Date().toISOString() });
}
