// app/(app)/[empresa]/api/almacen/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

function toNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: FormDataEntryValue | null): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeRedirectPath(base: string, raw: unknown, fallback: string) {
  const v = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!v) return fallback;

  // Solo rutas relativas
  if (!v.startsWith("/")) return fallback;

  // Debe quedarse dentro de la empresa: /{empresa}/...
  if (!v.startsWith(base + "/") && v !== base) return fallback;

  return v;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string }> },
) {
  try {
    const formData = await req.formData();
    const { empresa } = await context.params;

    if (!empresa) {
      return new NextResponse("Empresa no válida", { status: 400 });
    }

    // ✅ 1) Multi-empresa: resolver empresaId desde slug (y usar slug canónico)
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true, slug: true },
    });

    if (!empresaRow) {
      return new NextResponse("Empresa no encontrada", { status: 404 });
    }

    const empresaId = empresaRow.id;
    const base = `/${empresaRow.slug}`;

    const pedidoIdRaw = toNumber(formData.get("pedidoId"));
    const pedidoId = pedidoIdRaw == null ? null : Math.trunc(pedidoIdRaw);

    if (!pedidoId || pedidoId <= 0) {
      return new NextResponse("pedidoId requerido", { status: 400 });
    }

    // ✅ 2) Cargar pedido asegurando empresa (y sacamos ids para revalidar/fallback redirect)
    const pedido = await prisma.pedido.findFirst({
      where: {
        id: pedidoId,
        escandallo: { empresaId },
      },
      include: {
        escandallo: { select: { id: true, clienteId: true, temporadaId: true } },
        colores: true,
        tejidos: true,
        forros: true,
        accesorios: true,
      },
    });

    if (!pedido) {
      return new NextResponse("Pedido no encontrado", { status: 404 });
    }

    const cId = pedido.escandallo.clienteId;
    const tId = pedido.escandallo.temporadaId;
    const eId = pedido.escandallo.id;

    const fallbackView = `${base}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/almacen`;

    // ✅ 3) Optimistic locking: updatedAt del pedido
    // En el form: <input type="hidden" name="pedidoUpdatedAt" value={pedido.updatedAt.toISOString()} />
    const pedidoUpdatedAtStr = formData.get("pedidoUpdatedAt");
    const pedidoUpdatedAt = pedidoUpdatedAtStr
      ? new Date(String(pedidoUpdatedAtStr))
      : null;

    // Si viene pero es inválido -> 400
    if (pedidoUpdatedAtStr && (!pedidoUpdatedAt || Number.isNaN(pedidoUpdatedAt.getTime()))) {
      return new NextResponse("updatedAt inválido", { status: 400 });
    }

    // 0) Cabecera pedido
    const numeroPedido = formData.get("numeroPedido") as string | null;
    const fechaPedidoStr = formData.get("fechaPedido");
    const fechaEntregaStr = formData.get("fechaEntrega");

    const modeloInterno = formData.get("modeloInterno") as string | null;
    const modeloCliente = formData.get("modeloCliente") as string | null;
    const patron = formData.get("patron") as string | null;
    const descripcionPedido = formData.get("descripcionPedido") as string | null;

    const costeEscandalloStr = formData.get("costeEscandallo");
    const precioVentaStr = formData.get("precioVenta");
    const pvpStr = formData.get("pvp");

    // 1) Cabecera almacén
    const tallerCorte = formData.get("tallerCorte") as string | null;
    const fechaCorte = formData.get("fechaCorte");
    const albaranCorte = formData.get("albaranCorte") as string | null;
    const precioCorte = formData.get("precioCorte");

    const tallerConfeccion = formData.get("tallerConfeccion") as string | null;
    const fechaConfeccion = formData.get("fechaConfeccion");
    const albaranConfeccion = formData.get("albaranConfeccion") as string | null;
    const precioConfeccion = formData.get("precioConfeccion");

    const observaciones = formData.get("observaciones") as string | null;

    // 2) Preparación almacén
    const perchasModelo = formData.get("perchasModelo") as string | null;
    const perchasUnidades = formData.get("perchasUnidades");
    const perchasFecha = formData.get("perchasFecha");

    const bolsasModelo = formData.get("bolsasModelo") as string | null;
    const bolsasUnidades = formData.get("bolsasUnidades");
    const bolsasFecha = formData.get("bolsasFecha");

    const etiquetasMarca = formData.get("etiquetasMarca") === "on";
    const etiquetasTalla = formData.get("etiquetasTalla") === "on";
    const compos = formData.get("compos") === "on";
    const alarmas = formData.get("alarmas") === "on";
    const etiquetasCarton = formData.get("etiquetasCarton") === "on";
    const marchamos = formData.get("marchamos") === "on";
    const etiquetasPrecio = formData.get("etiquetasPrecio") === "on";
    const pegatinas = formData.get("pegatinas") === "on";
    const talladores = formData.get("talladores") === "on";

    const etiquetasMarcaComentario = formData.get("etiquetasMarcaComentario") as string | null;
    const etiquetasTallaComentario = formData.get("etiquetasTallaComentario") as string | null;
    const composComentario = formData.get("composComentario") as string | null;
    const alarmasComentario = formData.get("alarmasComentario") as string | null;
    const etiquetasCartonComentario = formData.get("etiquetasCartonComentario") as string | null;
    const marchamosComentario = formData.get("marchamosComentario") as string | null;
    const etiquetasPrecioComentario = formData.get("etiquetasPrecioComentario") as string | null;
    const pegatinasComentario = formData.get("pegatinasComentario") as string | null;
    const talladoresComentario = formData.get("talladoresComentario") as string | null;

    const preparacionAlmacen = {
      perchas: {
        modelo: perchasModelo || null,
        unidades: toNumber(perchasUnidades),
        fecha: toDate(perchasFecha),
      },
      bolsas: {
        modelo: bolsasModelo || null,
        unidades: toNumber(bolsasUnidades),
        fecha: toDate(bolsasFecha),
      },
      checks: {
        etiquetasMarca,
        etiquetasMarcaComentario: etiquetasMarcaComentario || null,
        etiquetasTalla,
        etiquetasTallaComentario: etiquetasTallaComentario || null,
        compos,
        composComentario: composComentario || null,
        alarmas,
        alarmasComentario: alarmasComentario || null,
        etiquetasCarton,
        etiquetasCartonComentario: etiquetasCartonComentario || null,
        marchamos,
        marchamosComentario: marchamosComentario || null,
        etiquetasPrecio,
        etiquetasPrecioComentario: etiquetasPrecioComentario || null,
        pegatinas,
        pegatinasComentario: pegatinasComentario || null,
        talladores,
        talladoresComentario: talladoresComentario || null,
      },
    };

    const hasPrep =
      Boolean(preparacionAlmacen.perchas.modelo) ||
      preparacionAlmacen.perchas.unidades != null ||
      preparacionAlmacen.perchas.fecha != null ||
      Boolean(preparacionAlmacen.bolsas.modelo) ||
      preparacionAlmacen.bolsas.unidades != null ||
      preparacionAlmacen.bolsas.fecha != null ||
      Object.values(preparacionAlmacen.checks).some((v) => Boolean(v));

    const preparacionAlmacenFinal = hasPrep ? preparacionAlmacen : null;

    // 3) Colores
    const coloresUpdates: { id: number; distribucion: any }[] = [];

    for (const color of pedido.colores) {
      const dist: any = color.distribucion || {};
      const tallas: string[] = dist.tallas ?? [];
      const unidadesPedido: number[] = dist.unidades ?? [];
      const corteUnidades: number[] = [];
      const adelantosUnidades: number[] = [];
      const entregasUnidades: number[] = [];

      tallas.forEach((_, idx) => {
        const c = formData.get(`color_${color.id}_corte_${idx}`);
        const a = formData.get(`color_${color.id}_adelantos_${idx}`);
        const e = formData.get(`color_${color.id}_entregas_${idx}`);

        corteUnidades.push(toNumber(c) ?? 0);
        adelantosUnidades.push(toNumber(a) ?? 0);
        entregasUnidades.push(toNumber(e) ?? 0);
      });

      const totalPedido = unidadesPedido.reduce((acc, n) => acc + (Number(n) || 0), 0);
      const totalCorte = corteUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);
      const totalAdelantos = adelantosUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);
      const totalEntregas = entregasUnidades.reduce((acc, n) => acc + (Number(n) || 0), 0);

      coloresUpdates.push({
        id: color.id,
        distribucion: {
          tallas,
          unidades: unidadesPedido,
          total: totalPedido,
          corte: { unidades: corteUnidades, total: totalCorte },
          adelantos: { unidades: adelantosUnidades, total: totalAdelantos },
          entregas: { unidades: entregasUnidades, total: totalEntregas },
        },
      });
    }

    // 4) Tejidos
    const tejidosUpdates = pedido.tejidos.map((t) => {
      return {
        id: t.id,
        proveedor: (formData.get(`tejido_${t.id}_proveedor`) as string | null) ?? null,
        serie: (formData.get(`tejido_${t.id}_serie`) as string | null) ?? null,
        color: (formData.get(`tejido_${t.id}_color`) as string | null) ?? null,
        composicion: (formData.get(`tejido_${t.id}_composicion`) as string | null) ?? null,
        consumoProduccion: toNumber(formData.get(`tejido_${t.id}_consumoProduccion`)),
        metrosPedidos: toNumber(formData.get(`tejido_${t.id}_metrosPedidos`)),
        fechaPedido: toDate(formData.get(`tejido_${t.id}_fechaPedido`)),
        metrosRecibidos: toNumber(formData.get(`tejido_${t.id}_metrosRecibidos`)),
        fechaMetrosRecibidos: toDate(formData.get(`tejido_${t.id}_fechaMetrosRecibidos`)),
        consumoCorte: toNumber(formData.get(`tejido_${t.id}_consumoCorte`)),
      };
    });

    // 5) Forros
    const forrosUpdates = pedido.forros.map((f) => {
      return {
        id: f.id,
        proveedor: (formData.get(`forro_${f.id}_proveedor`) as string | null) ?? null,
        serie: (formData.get(`forro_${f.id}_serie`) as string | null) ?? null,
        color: (formData.get(`forro_${f.id}_color`) as string | null) ?? null,
        composicion: (formData.get(`forro_${f.id}_composicion`) as string | null) ?? null,
        consumoProduccion: toNumber(formData.get(`forro_${f.id}_consumoProduccion`)),
        metrosPedidos: toNumber(formData.get(`forro_${f.id}_metrosPedidos`)),
        fechaPedido: toDate(formData.get(`forro_${f.id}_fechaPedido`)),
        metrosRecibidos: toNumber(formData.get(`forro_${f.id}_metrosRecibidos`)),
        fechaMetrosRecibidos: toDate(formData.get(`forro_${f.id}_fechaMetrosRecibidos`)),
        consumoCorte: toNumber(formData.get(`forro_${f.id}_consumoCorte`)),
      };
    });

    // 6) Accesorios
    const accesoriosUpdates = pedido.accesorios.map((a) => {
      return {
        id: a.id,
        nombre: (formData.get(`accesorio_${a.id}_nombre`) as string | null) ?? null,
        proveedor: (formData.get(`accesorio_${a.id}_proveedor`) as string | null) ?? null,
        referencia: (formData.get(`accesorio_${a.id}_referencia`) as string | null) ?? null,
        color: (formData.get(`accesorio_${a.id}_color`) as string | null) ?? null,
        medida: (formData.get(`accesorio_${a.id}_medida`) as string | null) ?? null,
        unidad: (formData.get(`accesorio_${a.id}_unidad`) as string | null) ?? null,
        consumoEsc: toNumber(formData.get(`accesorio_${a.id}_consumoEsc`)),
        cantidadPed: toNumber(formData.get(`accesorio_${a.id}_cantidadPed`)),
        fechaPedido: toDate(formData.get(`accesorio_${a.id}_fechaPedido`)),
        unidadesRecibidas: toNumber(formData.get(`accesorio_${a.id}_unidadesRecibidas`)),
        fechaRecibidas: toDate(formData.get(`accesorio_${a.id}_fechaRecibidas`)),
        albaranAccesorio: (formData.get(`accesorio_${a.id}_albaranAccesorio`) as string | null) || null,
      };
    });

    // ✅ 7) Ejecutar updates (con lock en pedido)
    // Update "blindado": updateMany para poder meter updatedAt en el where.
    const pedidoUpdateWhere: Prisma.PedidoWhereInput = {
      id: pedidoId,
      escandallo: { empresaId },
    };
    if (pedidoUpdatedAt) {
      (pedidoUpdateWhere as any).updatedAt = pedidoUpdatedAt;
    }

    const tx = await prisma.$transaction(async (tx) => {
      const upd = await tx.pedido.updateMany({
        where: pedidoUpdateWhere as any,
        data: {
          numeroPedido: numeroPedido ?? null,
          fechaPedido: toDate(fechaPedidoStr),
          fechaEntrega: toDate(fechaEntregaStr),
          modeloInterno: modeloInterno ?? null,
          modeloCliente: modeloCliente ?? null,
          patron: patron ?? null,
          descripcionPedido: descripcionPedido ?? null,
          costeEscandallo: toNumber(costeEscandalloStr),
          precioVenta: toNumber(precioVentaStr),
          pvp: toNumber(pvpStr),

          tallerCorte,
          fechaCorte: toDate(fechaCorte),
          albaranCorte,
          precioCorte: toNumber(precioCorte),
          tallerConfeccion,
          fechaConfeccion: toDate(fechaConfeccion),
          albaranConfeccion,
          precioConfeccion: toNumber(precioConfeccion),
          observaciones,
          preparacionAlmacen: preparacionAlmacenFinal ?? Prisma.DbNull,
        },
      });

      if (upd.count !== 1) {
        // Conflicto o pedido ya no pertenece a esta empresa
        return { ok: false as const };
      }

      await Promise.all([
        ...coloresUpdates.map((c) =>
          tx.pedidoColor.update({ where: { id: c.id }, data: { distribucion: c.distribucion } }),
        ),
        ...tejidosUpdates.map((t) =>
          tx.pedidoTejido.update({
            where: { id: t.id },
            data: {
              proveedor: t.proveedor,
              serie: t.serie,
              color: t.color,
              composicion: t.composicion,
              consumoProduccion: t.consumoProduccion,
              metrosPedidos: t.metrosPedidos,
              fechaPedido: t.fechaPedido,
              metrosRecibidos: t.metrosRecibidos,
              fechaMetrosRecibidos: t.fechaMetrosRecibidos,
              consumoCorte: t.consumoCorte,
            },
          }),
        ),
        ...forrosUpdates.map((f) =>
          tx.pedidoForro.update({
            where: { id: f.id },
            data: {
              proveedor: f.proveedor,
              serie: f.serie,
              color: f.color,
              composicion: f.composicion,
              consumoProduccion: f.consumoProduccion,
              metrosPedidos: f.metrosPedidos,
              fechaPedido: f.fechaPedido,
              metrosRecibidos: f.metrosRecibidos,
              fechaMetrosRecibidos: f.fechaMetrosRecibidos,
              consumoCorte: f.consumoCorte,
            },
          }),
        ),
        ...accesoriosUpdates.map((a) =>
          tx.pedidoAccesorio.update({
            where: { id: a.id },
            data: {
              nombre: a.nombre,
              proveedor: a.proveedor,
              referencia: a.referencia,
              color: a.color,
              medida: a.medida,
              unidad: a.unidad,
              consumoEsc: a.consumoEsc,
              cantidadPed: a.cantidadPed,
              fechaPedido: a.fechaPedido,
              unidadesRecibidas: a.unidadesRecibidas,
              fechaRecibidas: a.fechaRecibidas,
              albaranAccesorio: a.albaranAccesorio,
            },
          }),
        ),
      ]);

      return { ok: true as const };
    });

    // ✅ Conflicto de concurrencia
    if (!tx.ok) {
      const redirectRaw = formData.get("redirectUrl");
      const safe = safeRedirectPath(base, redirectRaw, fallbackView);
      return NextResponse.redirect(new URL(`${safe}?err=conflicto`, req.url), 303);
    }

    // 🔁 Revalidaciones clave
    revalidatePath(`${base}/fichas`);
    revalidatePath(`${base}/fichas/${cId}`);
    revalidatePath(`${base}/fichas/${cId}/temporadas/${tId}`);
    revalidatePath(`${base}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}`);
    revalidatePath(`${base}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/almacen`);

    // 🔁 Redirección segura
    const redirectRaw = formData.get("redirectUrl");
    const safe = safeRedirectPath(base, redirectRaw, fallbackView);

    return NextResponse.redirect(new URL(safe, req.url), 303);
  } catch (err) {
    console.error("Error guardando almacén:", err);
    return new NextResponse("Error guardando almacén", { status: 500 });
  }
}
