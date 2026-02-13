import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

type RouteContext = {
  params: Promise<{ empresa: string; id: string }>;
};

/**
 * Devuelve una URL segura donde volver:
 * - Si hay Referer y es del mismo origin -> lo usamos
 * - Si no -> fallback a /[empresa]/fichas
 */
function getSafeReturnUrl(req: NextRequest, basePath: string): URL {
  const fallback = absUrl(req, `${basePath}/fichas`);

  const ref = req.headers.get("referer");
  if (!ref) return fallback;

  try {
    const u = new URL(ref);
    if (u.origin !== fallback.origin) return fallback;
    return u;
  } catch {
    return fallback;
  }
}

/**
 * Añade/actualiza query params sin romper querystrings existentes.
 */
function withParams(url: URL, params: Record<string, string>) {
  const u = new URL(url.toString());
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { empresa, id: idStr } = await context.params;
  const base = `/${empresa}`;

  const returnTo = getSafeReturnUrl(req, base);

  const escandalloId = Number(idStr);
  if (!Number.isFinite(escandalloId)) {
    return NextResponse.redirect(withParams(returnTo, { err: "id_invalido" }), 303);
  }

  try {
    // 0) Resolver empresaId por slug
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true },
    });

    if (!empresaRow) {
      return NextResponse.redirect(
        absUrl(req, `/?err=empresa_no_existe`),
        303,
      );
    }

    const empresaId = empresaRow.id;

    // 1) Comprobar existencia + pertenencia + dependencias
    const escandallo = await prisma.escandallo.findFirst({
      where: { id: escandalloId, empresaId },
      select: { id: true, _count: { select: { pedidos: true } } },
    });

    if (!escandallo) {
      return NextResponse.redirect(withParams(returnTo, { err: "no_existe" }), 303);
    }

    const pedidos = escandallo._count.pedidos ?? 0;
    if (pedidos > 0) {
      return NextResponse.redirect(
        withParams(returnTo, {
          err: "tiene_pedidos",
          pedidos: String(pedidos),
        }),
        303,
      );
    }

    // 2) Borrado seguro
    const del = await prisma.escandallo.deleteMany({
      where: { id: escandalloId, empresaId },
    });

    if (del.count === 0) {
      return NextResponse.redirect(withParams(returnTo, { err: "no_existe" }), 303);
    }

    return NextResponse.redirect(
      withParams(returnTo, { ok: "deleted" }),
      303,
    );
  } catch (err: any) {
    if (err?.code === "P2003") {
      return NextResponse.redirect(
        withParams(returnTo, { err: "tiene_datos_asociados" }),
        303,
      );
    }

    console.error("[POST escandallos/:id/delete] Error:", err);
    return NextResponse.redirect(
      withParams(returnTo, { err: "server" }),
      303,
    );
  }
}
