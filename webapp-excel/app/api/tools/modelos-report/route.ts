export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";
import { sumCorte, sumEntregas, sumPedido } from "@/lib/almacen/pedidoColorTotals";

const ALLOWED_GROUPS = ["ALMACEN", "PRODUCCION", "CONTABILIDAD", "ADMIN"] as const;

const HEADER_STYLE = {
  font: { bold: true } as ExcelJS.Font,
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8E55B" } } as ExcelJS.Fill,
  border: {
    top: { style: "thick", color: { argb: "FF000000" } },
    left: { style: "thick", color: { argb: "FF000000" } },
    bottom: { style: "thick", color: { argb: "FF000000" } },
    right: { style: "thick", color: { argb: "FF000000" } },
  } as ExcelJS.Borders,
};

const CELL_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
} as ExcelJS.Borders;

type Filters = {
  empresaId?: number;
  temporada?: string;
  cliente?: string;
  subfamilia?: string;
  articulo?: string;
  tallerCorte?: string;
  tallerConfeccion?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

type SuggestItem = { label: string; value: string; prefix: string };
type OptionItem = { value: string; label: string };

type PreviewRow = {
  pedidoId: number;
  pedidoColorId: number;
  color: string;
  temporada: { codigo: string; descripcion?: string } | null;
  cliente: { codigo: string; descripcion?: string; id?: number } | null;
  subfamilia: { codigo: string; descripcion?: string } | null;
  articulo: { codigo: string; descripcion?: string; id?: number } | null;
  escandalloId: number | null;
  temporadaId: number | null;
  clienteId: number | null;
  totalPedido: number | null;
  totalCorte: number | null;
  totalRecibidas: number | null;
  tallerCorte: string | null;
  fechaCorte: string | null;
  tallerConfeccion: string | null;
  fechaRecibidas: string | null;
  facturado: boolean;
  numeroFactura: string | null;
  fechaFactura: string | null;
  updatedAt: string;
};

function normalizeModelInput(input: string) {
  return String(input || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function parseModelo(input: string) {
  const s = normalizeModelInput(input);
  // Solo se extraen segmentos cuando hay suficientes caracteres.
  const temporada = s.length >= 2 ? s.slice(0, 2) : "";
  const cliente = s.length >= 4 ? s.slice(2, 4) : "";
  const subfamilia = s.length >= 6 ? s.slice(4, 6) : "";
  const resto = s.length > 6 ? s.slice(6) : "";
  return { raw: s, temporada, cliente, subfamilia, resto };
}

function asText(input: unknown) {
  return String(input ?? "").trim();
}

function nonEmpty(input?: string | null) {
  const v = asText(input);
  return v ? v : null;
}

function buildWhere(filters: Filters, modeloInput?: string) {
  const empresaId = Number(filters.empresaId || 0);
  if (!empresaId) return null;

  const pedidoWhere: Prisma.PedidoWhereInput = { empresaId };

  const escandalloAnd: Prisma.EscandalloWhereInput[] = [];
  const articuloAnd: Prisma.ArticuloWhereInput[] = [];

  const temporadaTerm = nonEmpty(filters.temporada);
  const clienteTerm = nonEmpty(filters.cliente);
  const subfamiliaTerm = nonEmpty(filters.subfamilia);
  const articuloTerm = nonEmpty(filters.articulo);
  const tallerCorteTerm = nonEmpty(filters.tallerCorte);
  const tallerConfeccionTerm = nonEmpty(filters.tallerConfeccion);

  if (tallerCorteTerm) {
    pedidoWhere.tallerCorte = { contains: tallerCorteTerm, mode: "insensitive" };
  }
  if (tallerConfeccionTerm) {
    pedidoWhere.tallerConfeccion = { contains: tallerConfeccionTerm, mode: "insensitive" };
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.lte = new Date(filters.dateTo);
    // TODO: confirmar si la fecha objetivo debe ser fechaPedido/fechaCorte/fechaConfeccion.
    pedidoWhere.fechaPedido = dateFilter;
  }

  if (temporadaTerm) {
    escandalloAnd.push({
      temporada: {
        OR: [
          { codigo: { contains: temporadaTerm, mode: "insensitive" } },
          { descripcion: { contains: temporadaTerm, mode: "insensitive" } },
        ],
      },
    });
  }

  if (clienteTerm) {
    escandalloAnd.push({
      cliente: {
        OR: [
          { codigo: { contains: clienteTerm, mode: "insensitive" } },
          { nombre: { contains: clienteTerm, mode: "insensitive" } },
        ],
      },
    });
  }

  if (subfamiliaTerm) {
    articuloAnd.push({
      subfamilia: {
        OR: [
          { codigo: { contains: subfamiliaTerm, mode: "insensitive" } },
          { descripcion: { contains: subfamiliaTerm, mode: "insensitive" } },
        ],
      },
    });
  }

  if (articuloTerm) {
    articuloAnd.push({
      OR: [
        { codigo: { contains: articuloTerm, mode: "insensitive" } },
        { descripcion: { contains: articuloTerm, mode: "insensitive" } },
      ],
    });
  }

  const parsed = parseModelo(modeloInput || "");
  if (parsed.temporada) {
    escandalloAnd.push({
      temporada: {
        codigo: { startsWith: parsed.temporada },
      },
    });
  }
  if (parsed.cliente) {
    escandalloAnd.push({
      cliente: { codigo: { startsWith: parsed.cliente } },
    });
  }
  if (parsed.subfamilia) {
    articuloAnd.push({
      subfamilia: { codigo: { startsWith: parsed.subfamilia } },
    });
  }
  if (parsed.raw.length >= 6) {
    articuloAnd.push({
      codigo: { startsWith: parsed.raw },
    });
  }

  if (articuloAnd.length > 0) {
    escandalloAnd.push({ articulo: { is: { AND: articuloAnd } } });
  }

  if (escandalloAnd.length > 0) {
    pedidoWhere.escandallo = { AND: escandalloAnd };
  }

  return { pedidoWhere };
}

async function handleSuggest(empresaId: number, modeloInput: string) {
  const raw = normalizeModelInput(modeloInput);
  const parsed = parseModelo(raw);
  const len = raw.length;

  const temporadaCode = len >= 2 ? raw.slice(0, 2) : "";
  const clienteFragment = len > 2 ? raw.slice(2, Math.min(4, len)) : "";
  const subfamiliaFragment = len > 4 ? raw.slice(4, Math.min(6, len)) : "";

  const parts: any = {};
  if (parsed.temporada.length === 2) {
    parts.temporada = await prisma.temporada.findFirst({
      where: {
        OR: [
          { codigo: parsed.temporada },
          { descripcion: { contains: parsed.temporada, mode: "insensitive" } },
        ],
        articulos: { some: { empresaId } },
      },
      select: { codigo: true, descripcion: true },
    });
  }
  if (parsed.cliente.length === 2) {
    parts.cliente = await prisma.cliente.findFirst({
      where: {
        empresaId,
        OR: [
          { codigo: parsed.cliente },
          { nombre: { contains: parsed.cliente, mode: "insensitive" } },
        ],
      },
      select: { codigo: true, nombre: true },
    });
    if (parts.cliente) {
      parts.cliente = { codigo: parts.cliente.codigo, descripcion: parts.cliente.nombre };
    }
  }
  if (parsed.subfamilia.length === 2) {
    parts.subfamilia = await prisma.subfamilia.findFirst({
      where: {
        OR: [
          { codigo: parsed.subfamilia },
          { descripcion: { contains: parsed.subfamilia, mode: "insensitive" } },
        ],
        articulos: { some: { empresaId } },
      },
      select: { codigo: true, descripcion: true },
    });
  }

  if (len <= 2) {
    const term = raw;
    const temporadas = await prisma.temporada.findMany({
      where: {
        AND: [
          {
            OR: [
              { codigo: { contains: term } },
              { descripcion: { contains: term, mode: "insensitive" } },
            ],
          },
          { articulos: { some: { empresaId } } },
        ],
      },
      select: { codigo: true, descripcion: true },
      orderBy: { codigo: "asc" },
      take: 10,
    });

    const suggestions: SuggestItem[] = temporadas.map((t) => ({
      label: `${t.codigo} · ${t.descripcion}`,
      value: t.codigo,
      prefix: t.codigo,
    }));

    return { ok: true, kind: "temporada", suggestions, parts } as const;
  }

  if (len <= 4) {
    const term = clienteFragment;
    const clientes = await prisma.cliente.findMany({
      where: {
        empresaId,
        OR: [
          { codigo: { startsWith: term } },
          { nombre: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { codigo: true, nombre: true },
      orderBy: { codigo: "asc" },
      take: 10,
    });

    const suggestions: SuggestItem[] = clientes.map((c) => ({
      label: `${c.codigo} · ${c.nombre}`,
      value: c.codigo,
      prefix: temporadaCode ? `${temporadaCode}${c.codigo}` : c.codigo,
    }));

    return { ok: true, kind: "cliente", suggestions, parts } as const;
  }

  if (len <= 6) {
    const term = subfamiliaFragment;
    const subfamilias = await prisma.subfamilia.findMany({
      where: {
        AND: [
          {
            OR: [
              { codigo: { startsWith: term } },
              { descripcion: { contains: term, mode: "insensitive" } },
            ],
          },
          { articulos: { some: { empresaId } } },
        ],
      },
      select: { codigo: true, descripcion: true },
      orderBy: { codigo: "asc" },
      take: 10,
    });

    const suggestions: SuggestItem[] = subfamilias.map((s) => ({
      label: `${s.codigo} · ${s.descripcion}`,
      value: s.codigo,
      prefix: temporadaCode && clienteFragment.length === 2 ? `${temporadaCode}${clienteFragment}${s.codigo}` : `${raw.slice(0, 4)}${s.codigo}`,
    }));

    return { ok: true, kind: "subfamilia", suggestions, parts } as const;
  }

  const articulos = await prisma.articulo.findMany({
    where: {
      empresaId,
      codigo: { startsWith: raw },
    },
    select: { codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 10,
  });

  const suggestions: SuggestItem[] = articulos.map((a) => ({
    label: `${a.codigo} · ${a.descripcion}`,
    value: a.codigo,
    prefix: a.codigo,
  }));

  return { ok: true, kind: "articulo", suggestions, parts } as const;
}

async function fetchPreviewRows(filters: Filters, modeloInput?: string, exportAll?: boolean) {
  const where = buildWhere(filters, modeloInput);
  if (!where) return { rows: [], totalApprox: 0 };

  const take = exportAll ? Math.min(5000, Math.max(1, Number(filters.limit || 5000))) : Math.min(200, Math.max(1, Number(filters.limit || 200)));
  const skip = Math.max(0, Number(filters.offset || 0));

  const [rows, totalApprox] = await Promise.all([
    prisma.pedidoColor.findMany({
      where: { pedido: where.pedidoWhere },
      include: {
        pedido: {
          select: {
            id: true,
            tallerCorte: true,
            fechaCorte: true,
            tallerConfeccion: true,
            fechaConfeccion: true,
            facturado: true,
            numeroFactura: true,
            fechaFactura: true,
            updatedAt: true,
            colores: { select: { distribucion: true } },
            escandallo: {
              select: {
                id: true,
                temporadaId: true,
                clienteId: true,
                temporada: { select: { codigo: true, descripcion: true } },
                cliente: { select: { id: true, codigo: true, nombre: true } },
                articulo: {
                  select: {
                    id: true,
                    codigo: true,
                    descripcion: true,
                    subfamilia: { select: { codigo: true, descripcion: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: "desc" },
      take,
      skip,
    }),
    prisma.pedidoColor.count({ where: { pedido: where.pedidoWhere } }),
  ]);

  const totalsByPedido = new Map<number, { pedido: number; corte: number; entregas: number }>();

  const mapped: PreviewRow[] = rows.map((row) => {
    const pedido = row.pedido;
    const esc = pedido.escandallo;
    const articulo = esc.articulo;
    const totals =
      totalsByPedido.get(pedido.id) ??
      (() => {
        const next = {
          pedido: sumPedido(pedido.colores),
          corte: sumCorte(pedido.colores),
          entregas: sumEntregas(pedido.colores),
        };
        totalsByPedido.set(pedido.id, next);
        return next;
      })();

    return {
      pedidoId: pedido.id,
      pedidoColorId: row.id,
      color: row.color,
      temporada: esc.temporada ? { codigo: esc.temporada.codigo, descripcion: esc.temporada.descripcion } : null,
      cliente: esc.cliente ? { codigo: esc.cliente.codigo, descripcion: esc.cliente.nombre, id: esc.cliente.id } : null,
      subfamilia: articulo?.subfamilia
        ? { codigo: articulo.subfamilia.codigo, descripcion: articulo.subfamilia.descripcion }
        : null,
      articulo: articulo
        ? { codigo: articulo.codigo, descripcion: articulo.descripcion, id: articulo.id }
        : null,
      escandalloId: esc.id,
      temporadaId: esc.temporadaId,
      clienteId: esc.clienteId,
      totalPedido: totals.pedido,
      totalCorte: totals.corte,
      // TOTAL_UNIDADES_RECIBIDAS se calcula desde distribucion.entregas.* (registro actual UI).
      totalRecibidas: totals.entregas,
      tallerCorte: pedido.tallerCorte,
      fechaCorte: pedido.fechaCorte ? pedido.fechaCorte.toISOString() : null,
      tallerConfeccion: pedido.tallerConfeccion,
      // FECHA_RECIBIDAS se toma de pedido.fechaConfeccion como proxy actual.
      fechaRecibidas: pedido.fechaConfeccion ? pedido.fechaConfeccion.toISOString() : null,
      facturado: pedido.facturado,
      numeroFactura: pedido.numeroFactura,
      fechaFactura: pedido.fechaFactura ? pedido.fechaFactura.toISOString() : null,
      updatedAt: pedido.updatedAt.toISOString(),
    };
  });

  return { rows: mapped, totalApprox };
}

function excelHeaders() {
  return [
    "TEMPORADA",
    "CLIENTE",
    "SUBFAMILIA",
    "ARTICULO",
    "DESCRIPCION ARTICULO",
    "COLOR",
    "TOTAL_UNIDADES_PEDIDO",
    "TOTAL_UNIDADES_CORTE",
    "TOTAL_UNIDADES_RECIBIDAS",
    "DIF_CORTE",
    "DIF_RECIBIDAS",
    "TALLER_CORTE",
    "FECHA_CORTE",
    "TALLER_CONFECCION",
    "FECHA_RECIBIDAS",
    "FACTURADO",
    "NUM_FACTURA",
    "FECHA_FACTURA",
  ];
}

function safeNumber(n: number | null) {
  return n == null || Number.isNaN(n) ? null : n;
}

function diffValue(base: number | null, target: number | null) {
  if (base == null || target == null) return null;
  return target - base;
}

async function handleOptions(filters: Filters, modeloInput?: string) {
  const where = buildWhere(filters, modeloInput);
  if (!where) {
    return {
      articulos: [],
      talleresCorte: [],
      talleresConfeccion: [],
    };
  }

  // Artículos disponibles dentro del conjunto filtrado (limitado)
  const pedidos = await prisma.pedido.findMany({
    where: where.pedidoWhere,
    select: {
      tallerCorte: true,
      tallerConfeccion: true,
      escandallo: {
        select: {
          articulo: { select: { codigo: true, descripcion: true } },
        },
      },
    },
    take: 500,
  });

  const articuloMap = new Map<string, OptionItem>();
  const tallerCorteSet = new Set<string>();
  const tallerConfeccionSet = new Set<string>();

  for (const pedido of pedidos) {
    if (pedido.tallerCorte) tallerCorteSet.add(pedido.tallerCorte);
    if (pedido.tallerConfeccion) tallerConfeccionSet.add(pedido.tallerConfeccion);

    const articulo = pedido.escandallo?.articulo;
    if (articulo?.codigo) {
      if (!articuloMap.has(articulo.codigo)) {
        articuloMap.set(articulo.codigo, {
          value: articulo.codigo,
          label: `${articulo.codigo} — ${articulo.descripcion ?? ""}`.trim(),
        });
      }
    }
  }

  const articulos = Array.from(articuloMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 100);

  const talleresCorte = Array.from(tallerCorteSet)
    .filter((x) => String(x).trim())
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 100)
    .map((x) => ({ value: x, label: x }));

  const talleresConfeccion = Array.from(tallerConfeccionSet)
    .filter((x) => String(x).trim())
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 100)
    .map((x) => ({ value: x, label: x }));

  return { articulos, talleresCorte, talleresConfeccion };
}

export async function POST(req: Request) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });
  if (!userHasAnyGroup(user.groups, [...ALLOWED_GROUPS])) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op || "preview");
  const filters = (body?.filters || {}) as Filters;
  const empresaId = Number(filters.empresaId || 0);

  if (!empresaId) {
    return NextResponse.json({ ok: false, error: "MISSING_EMPRESA" }, { status: 400 });
  }

  if (op === "suggest") {
    const modeloInput = String(body?.modeloInput || "");
    const data = await handleSuggest(empresaId, modeloInput);
    return NextResponse.json(data);
  }

  if (op === "options") {
    const modeloInput = String(body?.modeloInput || body?.filters?.modelo || "");
    const options = await handleOptions(filters, modeloInput);
    return NextResponse.json({ ok: true, options });
  }

  if (op === "export") {
    const modeloInput = String(body?.modeloInput || "");
    const { rows } = await fetchPreviewRows(filters, modeloInput, true);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Modelos");

    const headers = excelHeaders();
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.style = { ...HEADER_STYLE } as ExcelJS.Style;
    });

    rows.forEach((row) => {
      const totalPedido = safeNumber(row.totalPedido);
      const totalCorte = safeNumber(row.totalCorte);
      const totalRecibidas = safeNumber(row.totalRecibidas);
      const difCorte = diffValue(totalPedido, totalCorte);
      const difRec = diffValue(totalPedido, totalRecibidas);

      const dataRow = sheet.addRow([
        row.temporada?.codigo ?? "",
        row.cliente?.codigo ?? "",
        row.subfamilia?.codigo ?? "",
        row.articulo?.codigo ?? "",
        row.articulo?.descripcion ?? "",
        row.color ?? "",
        totalPedido ?? "",
        totalCorte ?? "",
        totalRecibidas ?? "",
        difCorte ?? "",
        difRec ?? "",
        row.tallerCorte ?? "",
        row.fechaCorte ? row.fechaCorte.slice(0, 10) : "",
        row.tallerConfeccion ?? "",
        row.fechaRecibidas ? row.fechaRecibidas.slice(0, 10) : "",
        row.facturado ? "SI" : "NO",
        row.numeroFactura ?? "",
        row.fechaFactura ? row.fechaFactura.slice(0, 10) : "",
      ]);

      dataRow.eachCell((cell) => {
        cell.border = CELL_BORDER;
      });
    });

    sheet.columns.forEach((col) => {
      col.width = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const out = Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(out, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelos-report.xlsx"',
      },
    });
  }

  if (op === "preview") {
    const modeloInput = String(body?.modeloInput || "");
    const { rows, totalApprox } = await fetchPreviewRows(filters, modeloInput, false);
    return NextResponse.json({ ok: true, rows, totalApprox });
  }

  return NextResponse.json({ ok: false, error: "UNKNOWN_OP" }, { status: 400 });
}
