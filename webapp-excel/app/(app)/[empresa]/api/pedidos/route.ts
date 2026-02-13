// app/(app)/[empresa]/api/pedidos/route.ts
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { absUrl } from "@/lib/http";

export const runtime = "nodejs";

/** Acepta string/number/null y devuelve number|null (soporta coma decimal) */
function toNumberAny(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toDateAny(value: FormDataEntryValue | null): Date | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseJsonSafe<T>(raw: FormDataEntryValue | null, fallback: T): T {
  const str = String(raw ?? "").trim();
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function safeString(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ empresa: string }> },
) {
  try {
    const formData = await req.formData();
    const { empresa } = await context.params;

    const clienteId = Number(formData.get("clienteId"));
    const temporadaId = Number(formData.get("temporadaId"));
    const escandalloId = Number(formData.get("escandalloId"));

    const pedidoIdRaw = formData.get("pedidoId");
    const pedidoId = pedidoIdRaw ? Number(pedidoIdRaw) : null;

    if (
      !empresa ||
      ![clienteId, temporadaId, escandalloId].every(Number.isFinite) ||
      (pedidoIdRaw && !Number.isFinite(pedidoId as number))
    ) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // ✅ Resolver empresaId desde slug
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true, slug: true },
    });

    if (!empresaRow) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const empresaId = empresaRow.id;
    const empresaSlug = empresaRow.slug;

    // ✅ Validar escandallo pertenece a empresa + ids ruta
    const escandallo = await prisma.escandallo.findFirst({
      where: {
        id: escandalloId,
        empresaId,
        clienteId,
        temporadaId,
      },
      select: { id: true },
    });

    if (!escandallo) {
      return NextResponse.json(
        { error: "Escandallo no válido para esta empresa/ruta" },
        { status: 404 },
      );
    }

    // -----------------------------
    // Cabecera
    // -----------------------------
    const numeroPedido = safeString(formData.get("numeroPedido"));
    const fechaPedido = toDateAny(formData.get("fechaPedido"));
    const fechaEntrega = toDateAny(formData.get("fechaEntrega"));

    const modeloInterno = safeString(formData.get("modeloInterno"));
    const modeloCliente = safeString(formData.get("modeloCliente"));
    const patron = safeString(formData.get("patron"));
    const descripcionPedido = safeString(formData.get("descripcionPedido"));

    const costeEscandallo = toNumberAny(formData.get("costeEscandallo"));
    const precioVenta = toNumberAny(formData.get("precioVenta"));
    const pvp = toNumberAny(formData.get("pvp"));

    const observaciones = safeString(formData.get("observaciones"));

    // Imagen (reutilizar existente si no suben nueva)
    const file = formData.get("imagen") as File | null;
    const existingImagenUrl = safeString(formData.get("existingImagenUrl"));

    let imagenUrl: string | null = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const fs = await import("fs");
      const path = await import("path");

      // ✅ Sanitiza nombre (evita caracteres raros / traversal)
      const safeName = path.basename(file.name).replace(/[^\w.-]/g, "_");
      const filename = `${Date.now()}-${safeName}`;

      // ✅ Carpeta absoluta configurable (no depende de process.cwd())
      // Ejemplo: UPLOADS_DIR=C:\...\data\uploads
      const uploadsDir =
        process.env.UPLOADS_DIR ?? path.join(process.cwd(), "public", "uploads");

      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const uploadPath = path.join(uploadsDir, filename);
      fs.writeFileSync(uploadPath, buffer);

      // ✅ URL pública (la sirve /uploads/[filename]/route.ts)
      imagenUrl = `/uploads/${filename}`;
    } else if (existingImagenUrl) {
      imagenUrl = existingImagenUrl;
    }


    // -----------------------------
    // Arrays JSON (safe)
    // -----------------------------
    const tejidos = parseJsonSafe<any[]>(formData.get("tejidosJson"), []);
    const forros = parseJsonSafe<any[]>(formData.get("forrosJson"), []);
    const accesorios = parseJsonSafe<any[]>(formData.get("accesoriosJson"), []);
    const colores = parseJsonSafe<any[]>(formData.get("coloresJson"), []);

    const baseData = {
      empresaId,
      escandalloId,
      numeroPedido: numeroPedido || null,
      fechaPedido,
      fechaEntrega,
      modeloInterno: modeloInterno || null,
      modeloCliente: modeloCliente || null,
      patron: patron || null,
      descripcionPedido: descripcionPedido || null,
      costeEscandallo,
      precioVenta,
      pvp,
      imagenUrl,
      observaciones: observaciones || null,
    };

    // ✅ Paths canónicos (empresaSlug) y redirects seguros (absUrl)
    const successPath = `/${empresaSlug}/fichas/${clienteId}/temporadas/${temporadaId}/escandallos/${escandalloId}/pedido?ok=1`;
    const conflictPath = `/${empresaSlug}/fichas/${clienteId}/temporadas/${temporadaId}/escandallos/${escandalloId}/produccion?error=conflict`;

    if (!pedidoId) {
      // CREATE
      await prisma.pedido.create({
        data: {
          ...baseData,
          tejidos: {
            create: tejidos.map((t: any) => ({
              proveedor: t.proveedor || null,
              serie: t.serie || null,
              color: t.color || null,
              consumoProduccion: toNumberAny(t.consumoProduccion),
              composicion: t.composicion || null,
              metrosPedidos: toNumberAny(t.metrosPedidos),
              fechaPedido: t.fechaPedido ? new Date(t.fechaPedido) : null,
            })),
          },
          forros: {
            create: forros.map((f: any) => ({
              proveedor: f.proveedor || null,
              serie: f.serie || null,
              color: f.color || null,
              consumoProduccion: toNumberAny(f.consumoProduccion),
              composicion: f.composicion || null,
              metrosPedidos: toNumberAny(f.metrosPedidos),
              fechaPedido: f.fechaPedido ? new Date(f.fechaPedido) : null,
            })),
          },
          accesorios: {
            create: accesorios.map((a: any) => ({
              nombre: a.nombre || null,
              proveedor: a.proveedor || null,
              referencia: a.referencia || null,
              color: a.color || null,
              medida: a.medida || null,
              unidad: a.unidad || null,
              consumoEsc: toNumberAny(a.consumoEsc),
              cantidadPed: toNumberAny(a.cantidadPed),
              fechaPedido: a.fechaPedido ? new Date(a.fechaPedido) : null,
            })),
          },
          colores: {
            create: colores.map((c: any) => ({
              color: String(c.color ?? "").trim(),
              tipoTalla: c.tipoTalla || "PERSONALIZADO",
              distribucion: c.distribucion || {},
            })),
          },
        },
      });

      return NextResponse.redirect(absUrl(req, successPath), 303);
    }

    // UPDATE (con optimistic locking)
    const updatedAtStr = safeString(formData.get("updatedAt"));
    if (!updatedAtStr) {
      return NextResponse.json(
        { error: "Falta updatedAt para control de concurrencia" },
        { status: 400 },
      );
    }

    const updatedAt = new Date(updatedAtStr);
    if (Number.isNaN(updatedAt.getTime())) {
      return NextResponse.json({ error: "updatedAt inválido" }, { status: 400 });
    }

    // ✅ Seguridad extra + Concurrency gate
    const result = await prisma.$transaction(async (tx) => {
      const gate = await tx.pedido.updateMany({
        where: {
          id: pedidoId,
          empresaId,
          escandalloId,
          updatedAt, // 👈 optimistic locking
        },
        data: {
          ...baseData,
        },
      });

      if (gate.count === 0) {
        return { ok: false as const };
      }

      // Reset líneas
      await tx.pedidoTejido.deleteMany({ where: { pedidoId } });
      await tx.pedidoForro.deleteMany({ where: { pedidoId } });
      await tx.pedidoAccesorio.deleteMany({ where: { pedidoId } });
      await tx.pedidoColor.deleteMany({ where: { pedidoId } });

      // Recreate líneas
      if (tejidos.length) {
        await tx.pedidoTejido.createMany({
          data: tejidos.map((t: any) => ({
            pedidoId,
            proveedor: t.proveedor || null,
            serie: t.serie || null,
            color: t.color || null,
            consumoProduccion: toNumberAny(t.consumoProduccion),
            composicion: t.composicion || null,
            metrosPedidos: toNumberAny(t.metrosPedidos),
            fechaPedido: t.fechaPedido ? new Date(t.fechaPedido) : null,
          })),
        });
      }

      if (forros.length) {
        await tx.pedidoForro.createMany({
          data: forros.map((f: any) => ({
            pedidoId,
            proveedor: f.proveedor || null,
            serie: f.serie || null,
            color: f.color || null,
            consumoProduccion: toNumberAny(f.consumoProduccion),
            composicion: f.composicion || null,
            metrosPedidos: toNumberAny(f.metrosPedidos),
            fechaPedido: f.fechaPedido ? new Date(f.fechaPedido) : null,
          })),
        });
      }

      if (accesorios.length) {
        await tx.pedidoAccesorio.createMany({
          data: accesorios.map((a: any) => ({
            pedidoId,
            nombre: a.nombre || null,
            proveedor: a.proveedor || null,
            referencia: a.referencia || null,
            color: a.color || null,
            medida: a.medida || null,
            unidad: a.unidad || null,
            consumoEsc: toNumberAny(a.consumoEsc),
            cantidadPed: toNumberAny(a.cantidadPed),
            fechaPedido: a.fechaPedido ? new Date(a.fechaPedido) : null,
          })),
        });
      }

      if (colores.length) {
        await tx.pedidoColor.createMany({
          data: colores.map((c: any) => ({
            pedidoId,
            color: String(c.color ?? "").trim(),
            tipoTalla: c.tipoTalla || "PERSONALIZADO",
            distribucion: c.distribucion || {},
          })),
        });
      }

      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.redirect(absUrl(req, conflictPath), 303);
    }

    return NextResponse.redirect(absUrl(req, successPath), 303);
  } catch (err) {
    console.error("Error guardando pedido:", err);
    return NextResponse.json({ error: "Error guardando pedido" }, { status: 500 });
  }
}
