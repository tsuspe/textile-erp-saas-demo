// app/(app)/[empresa]/api/escandallos/route.ts
import { absUrl } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { EstadoEscandallo } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ empresa: string }>;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const normalized = String(value).replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseJsonSafe<T>(
  raw: unknown,
  fallback: T,
): { ok: true; value: T } | { ok: false; error: string } {
  const str = typeof raw === "string" ? raw : String(raw ?? "");
  if (!str.trim()) return { ok: true, value: fallback };

  try {
    return { ok: true, value: JSON.parse(str) as T };
  } catch {
    return { ok: false, error: "JSON inválido en el formulario" };
  }
}

function safeString(v: unknown): string {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { empresa: empresaParam } = await context.params;

  // fallback temprano (antes de resolver empresaRow)
  const baseFallback = `/${empresaParam}`;
  const fichasBaseFallback = `${baseFallback}/fichas`;

  // ✅ variables para poder redirigir en el catch SIN re-leer req.formData()
  let empresaSlugForCatch: string = empresaParam;
  let clienteIdForCatch: number | null = null;
  let temporadaIdForCatch: number | null = null;
  let escandalloIdForCatch: number | null = null;

  try {
    const formData = await req.formData();

    // 1) Resolver empresaId desde slug (multi-empresa)
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresaParam },
      select: { id: true, slug: true },
    });

    if (!empresaRow) {
      return NextResponse.redirect(absUrl(req, `/?err=empresa_invalida`), 303);
    }

    const empresaId = empresaRow.id;
    const base = `/${empresaRow.slug}`;
    const fichasBase = `${base}/fichas`;

    // Guardamos slug canónico para catch
    empresaSlugForCatch = empresaRow.slug;

    // 2) IDs base
    const clienteId = Number(formData.get("clienteId"));
    const temporadaId = Number(formData.get("temporadaId"));

    // Guardamos para catch
    clienteIdForCatch = Number.isFinite(clienteId) ? clienteId : null;
    temporadaIdForCatch = Number.isFinite(temporadaId) ? temporadaId : null;

    if (!Number.isFinite(clienteId) || !Number.isFinite(temporadaId)) {
      return NextResponse.redirect(absUrl(req, `${fichasBase}?err=ruta_invalida`), 303);
    }

    // 3) articuloId (opcional)
    const articuloIdRaw = safeString(formData.get("articuloId"));
    const articuloId = articuloIdRaw ? Number(articuloIdRaw) : null;

    if (articuloId !== null && !Number.isFinite(articuloId)) {
      return NextResponse.redirect(
        absUrl(
          req,
          `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=articulo_invalido`,
        ),
        303,
      );
    }

    // 4) Validaciones multi-empresa: cliente pertenece a empresa
    const clienteOk = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId },
      select: { id: true },
    });

    if (!clienteOk) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}?err=cliente_no_pertenece`),
        303,
      );
    }

    // Temporada: compartida -> validamos existencia
    const temporadaOk = await prisma.temporada.findUnique({
      where: { id: temporadaId },
      select: { id: true },
    });

    if (!temporadaOk) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}?err=temporada_invalida`),
        303,
      );
    }

    // Artículo: si se manda, debe pertenecer a empresa (+ opcionalmente cliente/temporada)
    if (articuloId !== null) {
      const artOk = await prisma.articulo.findFirst({
        where: {
          id: articuloId,
          empresaId,
          // si quieres aún más estricto:
          // clienteId,
          // temporadaId,
        },
        select: { id: true },
      });

      if (!artOk) {
        return NextResponse.redirect(
          absUrl(
            req,
            `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=articulo_no_pertenece`,
          ),
          303,
        );
      }
    }

    // 5) escandalloId (editar vs crear)
    const escandalloIdRaw = safeString(formData.get("escandalloId"));
    const escandalloId = escandalloIdRaw !== "" ? Number(escandalloIdRaw) : null;

    escandalloIdForCatch =
      escandalloId !== null && Number.isFinite(escandalloId) ? escandalloId : null;

    if (escandalloId !== null && !Number.isFinite(escandalloId)) {
      return NextResponse.redirect(
        absUrl(
          req,
          `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=escandalloId_invalido`,
        ),
        303,
      );
    }

    // ✅ optimistic locking token (solo obligatorio en EDIT)
    const updatedAtRaw = safeString(formData.get("updatedAt"));
    const prevUpdatedAt = updatedAtRaw ? new Date(updatedAtRaw) : null;

    if (escandalloId !== null && (!prevUpdatedAt || Number.isNaN(prevUpdatedAt.getTime()))) {
      return NextResponse.redirect(
        absUrl(
          req,
          `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=updatedAt_invalido`,
        ),
        303,
      );
    }

    // 6) Campos cabecera
    const modeloInterno = safeString(formData.get("modeloInterno"));
    const modeloCliente = safeString(formData.get("modeloCliente"));
    const patron = safeString(formData.get("patron"));
    const talla = safeString(formData.get("talla"));
    const patronista = safeString(formData.get("patronista"));
    const fechaStr = safeString(formData.get("fecha"));
    const observaciones = safeString(formData.get("observaciones"));
    const totalCoste = toNumber(formData.get("totalCoste"));
    // % extra sobre el total (margen/overhead/merma). Si viene vacío -> 0
    const porcentajeExtra = toNumber(formData.get("porcentajeExtra")) ?? 0;


    // Estado (saneado)
    const estadoRaw = safeString(formData.get("estado") ?? "ESCANDALLO").toUpperCase();
    const estado: EstadoEscandallo =
      estadoRaw === "PRODUCCION" ? EstadoEscandallo.PRODUCCION : EstadoEscandallo.ESCANDALLO;

    // ✅ Auto-link Artículo si NO viene articuloId pero sí modeloInterno
    let articuloIdToSet: number | null = articuloId ?? null;

    if (!articuloIdToSet && modeloInterno) {
      const art = await prisma.articulo.findFirst({
        where: {
          empresaId,
          clienteId,
          temporadaId,
          codigo: modeloInterno,
        },
        select: { id: true },
      });

      if (art) articuloIdToSet = art.id;
    }

    // 7) JSON de líneas
    const tejidosRes = parseJsonSafe<any[]>(formData.get("tejidosJson"), []);
    if (!tejidosRes.ok) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=tejidosJson_invalido`),
        303,
      );
    }

    const forrosRes = parseJsonSafe<any[]>(formData.get("forrosJson"), []);
    if (!forrosRes.ok) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=forrosJson_invalido`),
        303,
      );
    }

    const accesoriosRes = parseJsonSafe<any[]>(formData.get("accesoriosJson"), []);
    if (!accesoriosRes.ok) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=accesoriosJson_invalido`),
        303,
      );
    }

    const gastosRes = parseJsonSafe<any[]>(formData.get("gastosJson"), []);
    if (!gastosRes.ok) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=gastosJson_invalido`),
        303,
      );
    }

    const tejidos = tejidosRes.value;
    const forros = forrosRes.value;
    const accesorios = accesoriosRes.value;
    const gastos = gastosRes.value;

    // 8) Fecha
    const fecha = fechaStr ? new Date(fechaStr) : null;
    if (fechaStr && Number.isNaN(fecha?.getTime())) {
      return NextResponse.redirect(
        absUrl(req, `${fichasBase}/${clienteId}/temporadas/${temporadaId}?err=fecha_invalida`),
        303,
      );
    }

    // 9) Imagen
    const file = formData.get("imagen") as File | null;
    let imagenUrl: string | null = null;
    const existingImagenUrl = safeString(formData.get("existingImagenUrl"));

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const fs = await import("fs");
      const path = await import("path");

      // ✅ Sanitiza nombre (evita rutas raras / traversal)
      const safeName = path.basename(file.name).replace(/[^\w.-]/g, "_");
      const filename = `${Date.now()}-${safeName}`;

      // ✅ Carpeta absoluta configurable (no depende de process.cwd())
      // Ejemplo en .env: UPLOADS_DIR=D:\JBP\data\uploads
      const uploadsDir =
        process.env.UPLOADS_DIR ?? path.join(process.cwd(), "public", "uploads");

      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const uploadPath = path.join(uploadsDir, filename);
      fs.writeFileSync(uploadPath, buffer);

      // ✅ URL pública (la serviremos con una route /uploads/:filename)
      imagenUrl = `/uploads/${filename}`;
    } else if (escandalloId !== null && existingImagenUrl) {
      imagenUrl = existingImagenUrl;
    }


    // 10) baseData (solo campos editables; SIN ids)
    const baseData = {
      modeloInterno: modeloInterno || null,
      modeloCliente: modeloCliente || null,
      patron: patron || null,
      talla: talla || null,
      patronista: patronista || null,
      fecha,
      observaciones: observaciones || null,
      totalCoste,
      porcentajeExtra,
      imagenUrl,
      estado,
      articuloId: articuloIdToSet,
    };




    const backToTemporada = `${fichasBase}/${clienteId}/temporadas/${temporadaId}`;

    if (escandalloId === null) {
      // --- CREAR NUEVO ---
      await prisma.escandallo.create({
        data: {
          empresaId,
          clienteId,
          temporadaId,
          ...baseData,
          tejidos: {
            create: tejidos.map((t: any) => ({
              proveedor: safeString(t?.proveedor) || null,
              serie: safeString(t?.serie) || null,
              color: safeString(t?.color) || null,
              anchoReal: toNumber(t?.anchoReal),
              anchoUtil: toNumber(t?.anchoUtil),
              consumoProduccion: toNumber(t?.consumoProduccion),
              precio: toNumber(t?.precio),
              consumoMuestra: JSON.stringify(t?.muestras ?? []),
            })),
          },
          forros: {
            create: forros.map((f: any) => ({
              proveedor: safeString(f?.proveedor) || null,
              serie: safeString(f?.serie) || null,
              color: safeString(f?.color) || null,
              anchoReal: toNumber(f?.anchoReal),
              anchoUtil: toNumber(f?.anchoUtil),
              consumoProduccion: toNumber(f?.consumoProduccion),
              precio: toNumber(f?.precio),
              consumoMuestra: JSON.stringify(f?.muestras ?? []),
            })),
          },
          accesorios: {
            create: accesorios.map((a: any) => ({
              nombre: safeString(a?.nombre) || null,
              medida: safeString(a?.medida) || null,
              unidad: safeString(a?.unidad) || "UNIDADES",
              proveedor: safeString(a?.proveedor) || null,
              referencia: safeString(a?.referencia) || null,
              color: safeString(a?.color) || null,
              cantidad: toNumber(a?.cantidad),
              precioUnidad: toNumber(a?.precioUnidad),
            })),
          },
          otrosGastos: {
            create: gastos.map((g: any) => ({
              tipo: safeString(g?.tipo) || null,
              descripcion: safeString(g?.descripcion) || null,
              importe: toNumber(g?.importe),
            })),
          },
        },
      });

      return NextResponse.redirect(absUrl(req, `${backToTemporada}?ok=created`), 303);
    }

    // --- EDITAR EXISTENTE (optimistic locking + atomic update) ---
    await prisma.$transaction(async (tx) => {
      const gate = await tx.escandallo.updateMany({
        where: {
          id: escandalloId,
          empresaId,
          clienteId,
          temporadaId,
          updatedAt: prevUpdatedAt!, // ✅ must match previous value
        },
        data: {
          ...baseData,
          articuloId: articuloIdToSet,
        },
      });

      if (gate.count === 0) {
        throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" as const });
      }

      await tx.escandalloTejido.deleteMany({ where: { escandalloId } });
      await tx.escandalloForro.deleteMany({ where: { escandalloId } });
      await tx.escandalloAccesorio.deleteMany({ where: { escandalloId } });
      await tx.escandalloGasto.deleteMany({ where: { escandalloId } });

      if (tejidos.length) {
        await tx.escandalloTejido.createMany({
          data: tejidos.map((t: any) => ({
            escandalloId,
            proveedor: safeString(t?.proveedor) || null,
            serie: safeString(t?.serie) || null,
            color: safeString(t?.color) || null,
            anchoReal: toNumber(t?.anchoReal),
            anchoUtil: toNumber(t?.anchoUtil),
            consumoProduccion: toNumber(t?.consumoProduccion),
            precio: toNumber(t?.precio),
            consumoMuestra: JSON.stringify(t?.muestras ?? []),
          })),
        });
      }

      if (forros.length) {
        await tx.escandalloForro.createMany({
          data: forros.map((f: any) => ({
            escandalloId,
            proveedor: safeString(f?.proveedor) || null,
            serie: safeString(f?.serie) || null,
            color: safeString(f?.color) || null,
            anchoReal: toNumber(f?.anchoReal),
            anchoUtil: toNumber(f?.anchoUtil),
            consumoProduccion: toNumber(f?.consumoProduccion),
            precio: toNumber(f?.precio),
            consumoMuestra: JSON.stringify(f?.muestras ?? []),
          })),
        });
      }

      if (accesorios.length) {
        await tx.escandalloAccesorio.createMany({
          data: accesorios.map((a: any) => ({
            escandalloId,
            nombre: safeString(a?.nombre) || null,
            medida: safeString(a?.medida) || null,
            unidad: safeString(a?.unidad) || "UNIDADES",
            proveedor: safeString(a?.proveedor) || null,
            referencia: safeString(a?.referencia) || null,
            color: safeString(a?.color) || null,
            cantidad: toNumber(a?.cantidad),
            precioUnidad: toNumber(a?.precioUnidad),
            coste:
              toNumber(a?.cantidad) != null && toNumber(a?.precioUnidad) != null
                ? toNumber(a?.cantidad)! * toNumber(a?.precioUnidad)!
                : null,
          })),
        });
      }

      if (gastos.length) {
        await tx.escandalloGasto.createMany({
          data: gastos.map((g: any) => ({
            escandalloId,
            tipo: safeString(g?.tipo) || null,
            descripcion: safeString(g?.descripcion) || null,
            importe: toNumber(g?.importe),
          })),
        });
      }
    });

    return NextResponse.redirect(absUrl(req, `${backToTemporada}?ok=updated`), 303);
  } catch (err: any) {
    if (err?.code === "CONFLICT") {
      const cId = clienteIdForCatch;
      const tId = temporadaIdForCatch;
      const eId = escandalloIdForCatch;

      if (!cId || !tId || !eId) {
        return NextResponse.redirect(absUrl(req, `${fichasBaseFallback}?err=conflict`), 303);
      }

      const editPath = `/${empresaSlugForCatch}/fichas/${cId}/temporadas/${tId}/escandallos/${eId}/editar?err=conflict`;
      return NextResponse.redirect(absUrl(req, editPath), 303);
    }

    console.error("[POST /api/escandallos] Error:", err);

    return NextResponse.redirect(
      absUrl(req, `/${empresaSlugForCatch}/fichas?err=server`),
      303,
    );
  }
}
