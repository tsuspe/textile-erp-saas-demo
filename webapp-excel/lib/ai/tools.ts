// lib/ai/tools.ts
import { prisma } from "@/lib/prisma";

/**
 * 🔒 Tools permitidas para la IA.
 * - Siempre filtrar por empresaId cuando aplique.
 * - Temporada/Subfamilia son maestros globales (sin empresaId).
 *
 * Opción B: "query por ficha" + tool global queryFichaGlobal()
 * para que la IA no tenga que prever mil preguntas.
 */

/* ======================================================
   Normalización / parsing
====================================================== */

function normalizeText(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-z0-9\s]/g, " ") // quita signos
    .replace(/\s+/g, " ")
    .trim();
}

function upper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const STOP = new Set([
  "que",
  "qué",
  "cual",
  "cuál",
  "cuantos",
  "cuántos",
  "cuantas",
  "cuántas",
  "dime",
  "quiero",
  "necesito",
  "modelo",
  "modelos",
  "articulo",
  "articulos",
  "artículo",
  "artículos",
  "pedido",
  "escandallo",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "para",
  "por",
  "en",
  "un",
  "una",
  "y",
  "hay",
  "tenemos",
  "tengo",
]);

function tokenize(q: string) {
  return normalizeText(q)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function detectModeloInterno(message: string) {
  // Ej: 1926VE0203 (2 temp + 2 cliente + 2 subfam + 4 modelo)
  const m = upper(message).match(/\b\d{4}[A-Z]{2}\d{4}\b/);
  return m?.[0] ?? null;
}

function detectPedidoNumero(message: string) {
  const m = message.match(/(?:n[ºo]\s*)?pedido\s*[:#-]?\s*([A-Za-z0-9\-_/]+)/i);
  return m?.[1] ?? null;
}

function detectEscandalloId(message: string) {
  const m = message.match(/escandallo\s*[:#-]?\s*(\d+)/i);
  return m?.[1] ? Number(m[1]) : null;
}

function detectPedidoId(message: string) {
  const m = message.match(/pedido\s*id\s*[:#-]?\s*(\d+)/i);
  return m?.[1] ? Number(m[1]) : null;
}

function detectAskingKind(message: string) {
  const s = normalizeText(message);

  const wantsAlmacen =
    s.includes("corte") ||
    s.includes("cortad") ||
    s.includes("cortaron") ||
    s.includes("entrega") ||
    s.includes("entregad") ||
    s.includes("entregaron") ||
    s.includes("adelanto") ||
    s.includes("unidades") ||
    s.includes("tallas") ||
    s.includes("por talla") ||
    s.includes("cantidad");

  const wantsEscandallo =
    s.includes("escandallo") ||
    s.includes("tejido") ||
    s.includes("forro") ||
    s.includes("accesorio") ||
    s.includes("coste") ||
    s.includes("costo") ||
    s.includes("consumo") ||
    s.includes("patron") ||
    s.includes("patronista");

  const wantsPedido =
    s.includes("taller") ||
    s.includes("albaran") ||
    s.includes("albarán") ||
    s.includes("pedido") ||
    s.includes("precio corte") ||
    s.includes("precio confeccion") ||
    s.includes("precio confección") ||
    s.includes("metros") ||
    s.includes("recibidos") ||
    s.includes("pedidos");

  if (wantsAlmacen) return "ALMACEN" as const;
  if (wantsEscandallo) return "ESCANDALLO" as const;
  if (wantsPedido) return "PEDIDO" as const;
  return "UNKNOWN" as const;
}

function toNumArray(v: any, n: number): number[] {
  const arr = Array.isArray(v) ? v : [];
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = Number(arr[i] ?? 0) || 0;
  return out;
}

function sum(arr: number[]) {
  return arr.reduce((acc, x) => acc + (Number(x) || 0), 0);
}

/* ======================================================
   Listados básicos
====================================================== */

export async function listArticulosEmpresa(args: { empresaId: number }) {
  const { empresaId } = args;
  return prisma.articulo.findMany({
    where: { empresaId },
    select: { codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 200,
  });
}

/* ======================================================
   RESOLVERS (por texto) — sin mode: insensitive
====================================================== */

export async function resolveClienteIdByText(args: { empresaId: number; query: string }) {
  const { empresaId } = args;
  const q = (args.query ?? "").trim();
  if (!q) return null;

  const qNorm = normalizeText(q);

  const pool = await prisma.cliente.findMany({
    where: { empresaId },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
    take: 500,
  });

  const exact = pool.find(
    (c) => normalizeText(c.codigo ?? "") === qNorm || normalizeText(c.nombre ?? "") === qNorm,
  );
  if (exact) return exact;

  const fuzzy = pool.find(
    (c) =>
      normalizeText(c.codigo ?? "").includes(qNorm) ||
      normalizeText(c.nombre ?? "").includes(qNorm),
  );

  return fuzzy ?? null;

}

export async function resolveTemporadaByText(args: { query: string }) {
  const raw = (args.query ?? "").trim();
  if (!raw) return null;

  const q = normalizeText(raw);

  const pool = await prisma.temporada.findMany({
    select: { id: true, codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });

  // extraer año corto (26) y largo (2026)
  const m = q.match(/\b(\d{2}|\d{4})\b/);
  const year = m ? m[1] : null;
  const year2 = year && year.length === 2 ? `20${year}` : null;

  const hasPV = q.includes("pv") || (q.includes("primavera") && q.includes("verano"));
  const hasOI = q.includes("oi") || (q.includes("otono") && q.includes("invierno"));

  // 1) match exacto por codigo/descripcion normalizados
  const exact = pool.find((t) => normalizeText(t.codigo) === q || normalizeText(t.descripcion) === q);
  if (exact) return exact;

  // 2) heurística PV/OI + año
  if (hasPV || hasOI) {
    const words = hasPV ? ["primavera", "verano"] : ["otono", "invierno"];

    const hit = pool.find((t) => {
      const cod = normalizeText(t.codigo);
      const desc = normalizeText(t.descripcion);

      const okSeason =
        words.every((w) => desc.includes(w)) ||
        (hasPV ? cod.includes("pv") : cod.includes("oi"));

      const okYear =
        !year
          ? true
          : cod.includes(year) ||
            desc.includes(year) ||
            (year2 ? cod.includes(year2) || desc.includes(year2) : false);

      return okSeason && okYear;
    });

    if (hit) return hit;
  }

  // 3) fallback tokens
  const tokens = tokenize(raw);
  const fuzzy = pool.find((t) => {
    const hay = normalizeText(`${t.codigo} ${t.descripcion}`);
    const score = tokens.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0);
    return score >= Math.min(2, tokens.length);
  });

  return fuzzy ?? null;
}

export async function resolveSubfamiliaByText(args: { query: string }) {
  const q = (args.query ?? "").trim();
  if (!q) return null;

  const qNorm = normalizeText(q);

  const pool = await prisma.subfamilia.findMany({
    select: { id: true, codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });

  const exact = pool.find(
    (s) => normalizeText(s.codigo ?? "") === qNorm || normalizeText(s.descripcion ?? "") === qNorm,
  );
  if (exact) return exact;

  const fuzzy = pool.find(
    (s) =>
      normalizeText(s.codigo ?? "").includes(qNorm) ||
      normalizeText(s.descripcion ?? "").includes(qNorm),
  );

  return fuzzy ?? null;

}

// ======================================================
// MAESTROS (Clientes / Temporadas / Subfamilias) + listados
// ======================================================

type MaestroType = "CLIENTE" | "TEMPORADA" | "SUBFAMILIA";

export type MaestroChoice =
  | { type: "CLIENTE"; id: number; codigo: string; nombre: string }
  | { type: "TEMPORADA"; id: number; codigo: string; descripcion: string }
  | { type: "SUBFAMILIA"; id: number; codigo: string; descripcion: string };

export type MaestroQueryResult = {
  ok: boolean;
  reason?: "NO_MAESTRO" | "NO_ENCONTRADO" | "AMBIGUO";
  maestroType?: MaestroType;
  maestro?: MaestroChoice;
  choices?: MaestroChoice[];

  // opcional: listado de artículos asociados
  rows?: {
    codigo: string;
    descripcion: string | null;
    cliente?: { codigo: string; nombre: string } | null;
    temporada?: { codigo: string; descripcion: string } | null;
    subfamilia?: { codigo: string; descripcion: string } | null;
  }[];
};

function looksLikeMaestroQuestion(message: string) {
  const s = normalizeText(message);

  const hasCliente = s.includes("cliente") || s.includes("clientes");
  const hasTemporada = s.includes("temporada") || s.includes("temporadas") || s.includes("pv") || s.includes("oi");
  const hasSubfam = s.includes("subfamilia") || s.includes("subfamilias") || s.includes("sub familia");

  // listados típicos
  const wantsList =
    s.includes("que modelos") ||
    s.includes("qué modelos") ||
    s.includes("que articulos") ||
    s.includes("qué artículos") ||
    s.includes("que articulos") ||
    s.includes("qué articulos") ||
    s.includes("modelos tengo") ||
    s.includes("articulos tengo") ||
    s.includes("articulos son") ||
    s.includes("son vestidos");

  // "codigo 20" / "número 20"
  const hasCodigoNumero =
    /\b(codigo|códig|numero|número)\s*\d+\b/i.test(message) || /\bcliente\s*\d+\b/i.test(message);

  return (hasCliente || hasTemporada || hasSubfam || hasCodigoNumero || wantsList) && !detectModeloInterno(message);
}

function extractNumeroAfterKeywords(message: string) {
  const m = message.match(/\b(?:codigo|c[oó]digo|numero|n[uú]mero|cliente|temporada)\s*[:#-]?\s*(\d+)\b/i);
  return m?.[1] ? Number(m[1]) : null;
}

function extractSeasonCodeLike(message: string) {
  // PV2026 / OI2026 / PV26 / OI26
  const m = upper(message).match(/\b(?:PV|OI)\s*\d{2,4}\b/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function stripMaestroNoise(message: string) {
  // quitamos palabras genéricas y dejamos "Fiesta ECI", "vestidos", etc.
  const s = normalizeText(message);
  const toks = s.split(" ").filter(Boolean);
  const drop = new Set([
    "que","qué","cual","cuál","dime","necesito","quiero",
    "codigo","código","numero","número","tiene","es","del","de","la","el","los","las",
    "cliente","clientes","temporada","temporadas","subfamilia","subfamilias",
    "modelos","modelo","articulos","artículo","artículos","articulo",
    "tengo","tenemos","para","por","son"
  ]);
  const keep = toks.filter(t => t.length >= 2 && !drop.has(t));
  return keep.join(" ").trim();
}

async function resolveTemporadaSmart(queryRaw: string) {
  const raw = (queryRaw ?? "").trim();
  if (!raw) return null;

  // 1) Código tipo PV2026 / OI2026 / PV26 / OI26
  const seasonCode = extractSeasonCodeLike(raw);
  if (seasonCode) {
    const m = seasonCode.match(/^(PV|OI)(\d{2})$/);
    const candidates = m ? [seasonCode, `${m[1]}20${m[2]}`] : [seasonCode];

    for (const cod of candidates) {
      const hit = await prisma.temporada.findUnique({
        where: { codigo: cod },
        select: { id: true, codigo: true, descripcion: true },
      });
      if (hit) return hit;
    }
  }

  // 2) Número tras keywords (puede ser id)
  const n = extractNumeroAfterKeywords(raw);
  if (n) {
    const byId = await prisma.temporada.findUnique({
      where: { id: n },
      select: { id: true, codigo: true, descripcion: true },
    });
    if (byId) return byId;
  }

  // 3) Fallback texto libre
  return resolveTemporadaByText({ query: raw });
}


async function resolveSubfamiliaSmart(queryRaw: string) {
  const q = (queryRaw ?? "").trim();
  if (!q) return null;

  const n = extractNumeroAfterKeywords(q);
  if (n) {
    const byId = await prisma.subfamilia.findUnique({
      where: { id: n },
      select: { id: true, codigo: true, descripcion: true },
    });
    if (byId) return byId;
  }

  // por código exacto o descripción (tu resolver ya hace esto)
  return resolveSubfamiliaByText({ query: q });
}

async function resolveClienteSmart(empresaId: number, queryRaw: string) {
  const q = (queryRaw ?? "").trim();
  if (!q) return null;

  // "cliente 20" o "codigo 20"
  const n = extractNumeroAfterKeywords(q);
  if (n != null && Number.isFinite(n)) {
    const cod = String(n);
    const hit = await prisma.cliente.findUnique({
      where: { empresaId_codigo: { empresaId, codigo: cod } },
      select: { id: true, codigo: true, nombre: true },
    });
    if (hit) return hit;
  }

  // texto libre: fiesta eci
  const pool = await prisma.cliente.findMany({
    where: { empresaId },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
    take: 500,
  });

  const qNorm = normalizeText(q);
  const tokens = tokenize(qNorm);

  // exact por codigo o nombre normalizado
  const exact = pool.find((c) => normalizeText(c.codigo) === qNorm || normalizeText(c.nombre) === qNorm);
  if (exact) return exact;

  // scoring
  const scored = pool
    .map((c) => {
      const hay = normalizeText(`${c.codigo} ${c.nombre}`);
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { ...c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0];

  // si hay varios, devolvemos ambigüedad arriba (tool)
  return scored.length ? scored : null;
}

export async function queryMaestroGlobal(args: { empresaId: number; message: string }): Promise<MaestroQueryResult> {
  const { empresaId, message } = args;

  // Si el mensaje contiene un modelo (full/mid/suf), esto NO es una pregunta de maestro.
  // Debe resolver por ficha (queryFichaGlobal / queryModeloPack).
  if (
    detectModeloFullFromText(message) ||
    detectModeloMidFromText(message) ||
    detectModeloSufFromText(message)
  ) {
    return { ok: false, reason: "NO_MAESTRO" };
  }


  if (!looksLikeMaestroQuestion(message)) {
    return { ok: false, reason: "NO_MAESTRO" };
  }

  const s = normalizeText(message);
  const wantsCliente = s.includes("cliente") || s.includes("clientes");
  const wantsTemporada = s.includes("temporada") || s.includes("temporadas") || s.includes("pv") || s.includes("oi");
  const wantsSubfam = s.includes("subfamilia") || s.includes("subfamilias") || s.includes("sub familia");

  const wantsList =
    s.includes("que modelos") ||
    s.includes("qué modelos") ||
    s.includes("que articulos") ||
    s.includes("qué articulos") ||
    s.includes("qué artículos") ||
    s.includes("modelos tengo") ||
    s.includes("articulos tengo") ||
    s.includes("articulos son") ||
    s.includes("son vestidos");

  const queryText = stripMaestroNoise(message);

  // 1) TEMPORADA
  if (wantsTemporada && !wantsCliente && !wantsSubfam) {
    const hit = await resolveTemporadaSmart(queryText || message);
    if (!hit) return { ok: false, reason: "NO_ENCONTRADO", maestroType: "TEMPORADA" };

    // Si solo preguntan por la temporada en sí, devolvemos el maestro
    if (!wantsList) {
      return {
        ok: true,
        maestroType: "TEMPORADA",
        maestro: { type: "TEMPORADA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      };
    }

    // Si quieren listado de artículos asociados
    const rows = await prisma.articulo.findMany({
      where: { empresaId, temporadaId: hit.id },
      select: {
        codigo: true,
        descripcion: true,
        cliente: { select: { codigo: true, nombre: true } },
        temporada: { select: { codigo: true, descripcion: true } },
        subfamilia: { select: { codigo: true, descripcion: true } },
      },
      orderBy: { codigo: "asc" },
      take: 200,
    });

    return {
      ok: true,
      maestroType: "TEMPORADA",
      maestro: { type: "TEMPORADA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      rows: rows.map((r) => ({
        codigo: r.codigo,
        descripcion: r.descripcion ?? null,
        cliente: r.cliente ? { codigo: r.cliente.codigo, nombre: r.cliente.nombre } : null,
        temporada: r.temporada ? { codigo: r.temporada.codigo, descripcion: r.temporada.descripcion } : null,
        subfamilia: r.subfamilia ? { codigo: r.subfamilia.codigo, descripcion: r.subfamilia.descripcion } : null,
      })),
    };
  }

  // 2) SUBFAMILIA
  if (wantsSubfam && !wantsCliente && !wantsTemporada) {
    const hit = await resolveSubfamiliaSmart(queryText || message);
    if (!hit) return { ok: false, reason: "NO_ENCONTRADO", maestroType: "SUBFAMILIA" };

    if (!wantsList) {
      return {
        ok: true,
        maestroType: "SUBFAMILIA",
        maestro: { type: "SUBFAMILIA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      };
    }

    const rows = await prisma.articulo.findMany({
      where: { empresaId, subfamiliaId: hit.id },
      select: {
        codigo: true,
        descripcion: true,
        cliente: { select: { codigo: true, nombre: true } },
        temporada: { select: { codigo: true, descripcion: true } },
        subfamilia: { select: { codigo: true, descripcion: true } },
      },
      orderBy: { codigo: "asc" },
      take: 200,
    });

    return {
      ok: true,
      maestroType: "SUBFAMILIA",
      maestro: { type: "SUBFAMILIA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      rows: rows.map((r) => ({
        codigo: r.codigo,
        descripcion: r.descripcion ?? null,
        cliente: r.cliente ? { codigo: r.cliente.codigo, nombre: r.cliente.nombre } : null,
        temporada: r.temporada ? { codigo: r.temporada.codigo, descripcion: r.temporada.descripcion } : null,
        subfamilia: r.subfamilia ? { codigo: r.subfamilia.codigo, descripcion: r.subfamilia.descripcion } : null,
      })),
    };
  }

  // 3) CLIENTE
  if (wantsCliente && !wantsTemporada && !wantsSubfam) {
    const hit = await resolveClienteSmart(empresaId, queryText || message);

    // resolveClienteSmart puede devolver:
    // - un cliente (objeto)
    // - un array scored si es ambiguo
    // - null si nada
    if (!hit) return { ok: false, reason: "NO_ENCONTRADO", maestroType: "CLIENTE" };

    if (Array.isArray(hit)) {
      return {
        ok: false,
        reason: "AMBIGUO",
        maestroType: "CLIENTE",
        choices: hit.slice(0, 8).map((c) => ({ type: "CLIENTE", id: c.id, codigo: c.codigo, nombre: c.nombre })),
      };
    }

    if (!wantsList) {
      return {
        ok: true,
        maestroType: "CLIENTE",
        maestro: { type: "CLIENTE", id: hit.id, codigo: hit.codigo, nombre: hit.nombre },
      };
    }

    const rows = await prisma.articulo.findMany({
      where: { empresaId, clienteId: hit.id },
      select: {
        codigo: true,
        descripcion: true,
        cliente: { select: { codigo: true, nombre: true } },
        temporada: { select: { codigo: true, descripcion: true } },
        subfamilia: { select: { codigo: true, descripcion: true } },
      },
      orderBy: { codigo: "asc" },
      take: 200,
    });

    return {
      ok: true,
      maestroType: "CLIENTE",
      maestro: { type: "CLIENTE", id: hit.id, codigo: hit.codigo, nombre: hit.nombre },
      rows: rows.map((r) => ({
        codigo: r.codigo,
        descripcion: r.descripcion ?? null,
        cliente: r.cliente ? { codigo: r.cliente.codigo, nombre: r.cliente.nombre } : null,
        temporada: r.temporada ? { codigo: r.temporada.codigo, descripcion: r.temporada.descripcion } : null,
        subfamilia: r.subfamilia ? { codigo: r.subfamilia.codigo, descripcion: r.subfamilia.descripcion } : null,
      })),
    };
  }

  // 4) Si no está claro el tipo, intentamos inferir
  // (prioridad: temporada por PV/OI, luego cliente por "cliente 20", luego subfamilia)
  if (wantsTemporada || extractSeasonCodeLike(message)) {
    const hit = await resolveTemporadaSmart(message);
    if (hit) {
      return {
        ok: true,
        maestroType: "TEMPORADA",
        maestro: { type: "TEMPORADA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      };
    }
  }

  if (wantsCliente || /\bcliente\s*\d+\b/i.test(message)) {
    const hit = await resolveClienteSmart(empresaId, message);
    if (hit && !Array.isArray(hit)) {
      return {
        ok: true,
        maestroType: "CLIENTE",
        maestro: { type: "CLIENTE", id: hit.id, codigo: hit.codigo, nombre: hit.nombre },
      };
    }
    if (Array.isArray(hit)) {
      return {
        ok: false,
        reason: "AMBIGUO",
        maestroType: "CLIENTE",
        choices: hit.slice(0, 8).map((c) => ({ type: "CLIENTE", id: c.id, codigo: c.codigo, nombre: c.nombre })),
      };
    }
  }

  if (wantsSubfam) {
    const hit = await resolveSubfamiliaSmart(message);
    if (hit) {
      return {
        ok: true,
        maestroType: "SUBFAMILIA",
        maestro: { type: "SUBFAMILIA", id: hit.id, codigo: hit.codigo, descripcion: hit.descripcion },
      };
    }
  }

  return { ok: false, reason: "NO_ENCONTRADO" };
}



/* ======================================================
   BUSCADORES (por texto) — modelos / pedidos
====================================================== */

export async function findModelosByText(args: { empresaId: number; query: string }) {
  const { empresaId, query } = args;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const pool = await prisma.articulo.findMany({
    where: { empresaId },
    select: { codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 1500,
  });

  const scored = pool
    .map((a) => {
      const hay = normalizeText(`${a.codigo ?? ""} ${a.descripcion ?? ""}`);
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score++;
      return { ...a, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const minScore = tokens.length >= 3 ? 2 : 1;

  return scored
    .filter((x) => x.score >= minScore)
    .slice(0, 20)
    .map(({ codigo, descripcion }) => ({ codigo, descripcion: descripcion ?? null }));
}

async function findArticulosBySuffix(args: { empresaId: number; suffix: string }) {
  const { empresaId, suffix } = args;
  const suf = upper(suffix);
  if (!suf) return [];

  // SQLite + Prisma: endsWith suele funcionar; si te falla en tu versión,
  // te dejo alternativa con raw más abajo.
  return prisma.articulo.findMany({
    where: { empresaId, codigo: { endsWith: suf } },
    select: {
      codigo: true,
      descripcion: true,
      cliente: { select: { codigo: true, nombre: true } },
      temporada: { select: { codigo: true, descripcion: true } },
      subfamilia: { select: { codigo: true, descripcion: true } },
    },
    orderBy: { codigo: "asc" },
    take: 40,
  });
}

async function findArticulosByMid(args: { empresaId: number; mid: string }) {
  // “mid” = 26VE0203 -> debe matchear el tramo central final
  // de 8 caracteres: cliente(2)+subfam(2)+modelo(4)
  const { empresaId, mid } = args;
  const m = upper(mid);
  if (!m) return [];

  return prisma.articulo.findMany({
    where: { empresaId, codigo: { endsWith: m } },
    select: {
      codigo: true,
      descripcion: true,
      cliente: { select: { codigo: true, nombre: true } },
      temporada: { select: { codigo: true, descripcion: true } },
      subfamilia: { select: { codigo: true, descripcion: true } },
    },
    orderBy: { codigo: "asc" },
    take: 40,
  });
}

type ResolveModeloResult =
  | {
      ok: true;
      modeloInterno: string; // full 12 chars
      articulo?: {
        codigo: string;
        descripcion: string | null;
        cliente?: { codigo: string; nombre: string } | null;
        temporada?: { codigo: string; descripcion: string } | null;
        subfamilia?: { codigo: string; descripcion: string } | null;
      } | null;
    }
  | {
      ok: false;
      reason: "NO_ENCONTRADO" | "AMBIGUO";
      choices?: {
        codigo: string;
        descripcion: string | null;
        cliente?: { codigo: string; nombre: string } | null;
        temporada?: { codigo: string; descripcion: string } | null;
        subfamilia?: { codigo: string; descripcion: string } | null;
      }[];
    };

function detectModeloFullFromText(message: string) {
  // 1926VE0203
  const m = upper(message).match(/\b\d{4}[A-Z]{2}\d{4}\b/);
  return m?.[0] ?? null;
}

function detectModeloMidFromText(message: string) {
  // 26VE0203
  const m = upper(message).match(/\b\d{2}[A-Z]{2}\d{4}\b/);
  return m?.[0] ?? null;
}

function detectModeloSufFromText(message: string) {
  // VE0203
  const m = upper(message).match(/\b[A-Z]{2}\d{4}\b/);
  return m?.[0] ?? null;
}

async function resolveModeloInternoSmart(args: {
  empresaId: number;
  input: string;
}): Promise<ResolveModeloResult> {
  const { empresaId, input } = args;
  const raw = upper(input);

  // 1) full exact
  const full = detectModeloFullFromText(raw);
  if (full) {
    const art = await prisma.articulo.findFirst({
      where: { empresaId, codigo: full },
      select: {
        codigo: true,
        descripcion: true,
        cliente: { select: { codigo: true, nombre: true } },
        temporada: { select: { codigo: true, descripcion: true } },
        subfamilia: { select: { codigo: true, descripcion: true } },
      },
    });
    // aunque no exista artículo, devolvemos el full para que luego pruebe escandallo/pedido
    return { ok: true, modeloInterno: full, articulo: art ?? null };
  }

  // 2) mid -> endsWith
  const mid = detectModeloMidFromText(raw);
  if (mid) {
    const hits = await findArticulosByMid({ empresaId, mid });

    if (hits.length === 1) {
      return { ok: true, modeloInterno: hits[0].codigo, articulo: hits[0] };
    }
    if (hits.length > 1) {
      return { ok: false, reason: "AMBIGUO", choices: hits };
    }
    // si no hay hits, seguimos a sufijo (por si el mid venía mal escrito)
  }

  // 3) suf -> endsWith
  const suf = detectModeloSufFromText(raw);
  if (suf) {
    const hits = await findArticulosBySuffix({ empresaId, suffix: suf });

    if (hits.length === 1) {
      return { ok: true, modeloInterno: hits[0].codigo, articulo: hits[0] };
    }
    if (hits.length > 1) {
      return { ok: false, reason: "AMBIGUO", choices: hits };
    }
  }

  return { ok: false, reason: "NO_ENCONTRADO" };
}



export async function findPedidoByNumero(args: { empresaId: number; numeroPedido: string }) {
  const { empresaId, numeroPedido } = args;
  const q = (numeroPedido ?? "").trim();
  if (!q) return null;

  return prisma.pedido.findFirst({
    where: { empresaId, numeroPedido: q },
    select: { id: true, numeroPedido: true, modeloInterno: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

/* ======================================================
   QUERIES por ficha
====================================================== */

export async function queryPedidoPack(args: { empresaId: number; pedidoId: number }) {
  const { empresaId, pedidoId } = args;

  return prisma.pedido.findFirst({
    where: { empresaId, id: pedidoId },
    include: {
      tejidos: true,
      forros: true,
      accesorios: true,
      colores: true,
      comentarios: { orderBy: { createdAt: "asc" } },
      escandallo: {
        include: {
          tejidos: true,
          forros: true,
          accesorios: true,
          otrosGastos: true,
          cliente: true,
          temporada: true,
          articulo: true,
        },
      },
      empresa: true,
    },
  });
}

export async function queryEscandalloPack(args: { empresaId: number; escandalloId: number }) {
  const { empresaId, escandalloId } = args;

  return prisma.escandallo.findFirst({
    where: { empresaId, id: escandalloId },
    include: {
      tejidos: true,
      forros: true,
      accesorios: true,
      otrosGastos: true,
      cliente: true,
      temporada: true,
      articulo: true,
      pedidos: {
        orderBy: { updatedAt: "desc" },
        include: {
          colores: true,
          comentarios: true,
        },
      },
      empresa: true,
    },
  });
}

export async function getTemporadaInfo(args: { temporadaText: string }) {
  const temporada = await resolveTemporadaByText({ query: args.temporadaText });
  return temporada ?? null;
}

export async function getMetrosPedidosPorModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, modeloInterno },
    select: { id: true, numeroPedido: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  if (pedidos.length === 0) {
    return { pedidos: [], tejidos: [], forros: [], totales: { metrosPedidos: 0, metrosRecibidos: 0 } };
  }

  const pedidoIds = pedidos.map((p) => p.id);

  const [tejidos, forros] = await Promise.all([
    prisma.pedidoTejido.findMany({
      where: { pedidoId: { in: pedidoIds } },
      select: { proveedor: true, serie: true, color: true, metrosPedidos: true, metrosRecibidos: true },
    }),
    prisma.pedidoForro.findMany({
      where: { pedidoId: { in: pedidoIds } },
      select: { proveedor: true, serie: true, color: true, metrosPedidos: true, metrosRecibidos: true },
    }),
  ]);

  const sumBy = (arr: any[], key: "metrosPedidos" | "metrosRecibidos") =>
    arr.reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);

  const totalPedidos = sumBy(tejidos, "metrosPedidos") + sumBy(forros, "metrosPedidos");
  const totalRecibidos = sumBy(tejidos, "metrosRecibidos") + sumBy(forros, "metrosRecibidos");

  return { pedidos, tejidos, forros, totales: { metrosPedidos: totalPedidos, metrosRecibidos: totalRecibidos } };
}

export async function getModelosPorClienteTemporadaText(args: {
  empresaId: number;
  clienteText: string;
  temporadaText?: string | null;
  subfamiliaText?: string | null;
}) {
  const { empresaId, clienteText, temporadaText, subfamiliaText } = args;

  const hit = await resolveClienteSmart(empresaId, clienteText);
  if (!hit) return { error: "CLIENTE_NO_ENCONTRADO", clienteText };
  if (Array.isArray(hit)) {
    return {
      error: "CLIENTE_AMBIGUO",
      clienteText,
      choices: hit.slice(0, 8).map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
    };
  }
  const cliente = hit;


  let temporada: { id: number; codigo: string; descripcion: string } | null = null;
  if (temporadaText && temporadaText.trim()) {
    temporada = await resolveTemporadaByText({ query: temporadaText });
    if (!temporada) return { error: "TEMPORADA_NO_ENCONTRADA", temporadaText };
  }

  let subfamilia: { id: number; codigo: string; descripcion: string } | null = null;
  if (subfamiliaText && subfamiliaText.trim()) {
    subfamilia = await resolveSubfamiliaByText({ query: subfamiliaText });
    if (!subfamilia) return { error: "SUBFAMILIA_NO_ENCONTRADA", subfamiliaText };
  }

  const where: any = { empresaId, clienteId: cliente.id };
  if (temporada) where.temporadaId = temporada.id;
  if (subfamilia) where.subfamiliaId = subfamilia.id;

  const rows = await prisma.articulo.findMany({
    where,
    select: {
      codigo: true,
      descripcion: true,
      temporada: { select: { codigo: true, descripcion: true } },
      subfamilia: { select: { codigo: true, descripcion: true } },
    },
    orderBy: { codigo: "asc" },
    take: 200,
  });

  return { cliente, temporada, subfamilia, rows };
}

export async function getModelosPorClienteTemporada(args: {
  empresaId: number;
  clienteId?: number | null;
  temporadaId?: number | null;
}) {
  const { empresaId, clienteId, temporadaId } = args;

  const where: any = { empresaId };
  if (clienteId != null) where.clienteId = clienteId;
  if (temporadaId != null) where.temporadaId = temporadaId;

  return prisma.articulo.findMany({
    where,
    select: { id: true, codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 200,
  });
}

export async function getClienteDeModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  // 0) resolver modelo si viene parcial
  const resolved = await resolveModeloInternoSmart({ empresaId, input: modeloInterno });

  if (!resolved.ok) {
    if (resolved.reason === "AMBIGUO") {
      return {
        source: "ambiguous" as const,
        modeloInterno,
        choices: (resolved.choices ?? []).slice(0, 8).map((h) => ({
          codigo: h.codigo,
          descripcion:
            `${h.descripcion ?? ""}` +
            ` | ${h.temporada?.codigo ?? "?"}` +
            ` | ${h.cliente?.codigo ?? "?"} ${h.cliente?.nombre ?? ""}` +
            ` | ${h.subfamilia?.codigo ?? "?"}`,
        })),
      };
    }
    return null;
  }

  const full = resolved.modeloInterno;

  // 1) Artículo exacto por codigo completo
  const art = await prisma.articulo.findFirst({
    where: { empresaId, codigo: full },
    select: {
      codigo: true,
      cliente: { select: { id: true, nombre: true, codigo: true } },
      temporada: { select: { id: true, codigo: true, descripcion: true } },
    },
  });
  if (art) return { source: "articulo" as const, ...art };

  // 2) Escandallo por modeloInterno
  const esc = await prisma.escandallo.findFirst({
    where: { empresaId, modeloInterno: full },
    select: {
      modeloInterno: true,
      cliente: { select: { id: true, nombre: true, codigo: true } },
      temporada: { select: { id: true, codigo: true, descripcion: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!esc) return null;

  return {
    source: "escandallo" as const,
    codigo: esc.modeloInterno ?? full,
    cliente: esc.cliente,
    temporada: esc.temporada,
  };
}




export async function getCosteEscandalloPorModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;
  const esc = await prisma.escandallo.findFirst({
    where: { empresaId, modeloInterno },
    select: { id: true, totalCoste: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return esc ?? null;
}

export async function getConsumoForroPorModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const rows = await prisma.escandalloForro.findMany({
    where: { escandallo: { empresaId, modeloInterno } },
    select: { consumoProduccion: true },
  });

  const total = rows.reduce((acc, r) => acc + (r.consumoProduccion ?? 0), 0);
  return { total };
}

export async function getPrecioCortePorModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const p = await prisma.pedido.findFirst({
    where: { empresaId, modeloInterno },
    select: { id: true, precioCorte: true, updatedAt: true, numeroPedido: true },
    orderBy: { updatedAt: "desc" },
  });

  return p ?? null;
}

export async function getResumenModelo(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const [clienteInfo, costeEsc, forro, corte] = await Promise.all([
    getClienteDeModelo({ empresaId, modeloInterno }),
    getCosteEscandalloPorModelo({ empresaId, modeloInterno }),
    getConsumoForroPorModelo({ empresaId, modeloInterno }),
    getPrecioCortePorModelo({ empresaId, modeloInterno }),
  ]);

  return { modeloInterno, clienteInfo, costeEsc, forro, corte };
}

export async function getModeloPorTexto(args: { empresaId: number; query: string }) {
  const rows = await findModelosByText({ empresaId: args.empresaId, query: args.query });
  return { rows };
}

/* ======================================================
   Packs por ficha "ALMACÉN / CC / OBS"
====================================================== */

/**
 * Parser robusto para PedidoColor.distribucion
 * Soporta:
 * 1) rows:[{talla,pedido,corte,entrega,adelantos}]
 * 2) tu formato actual: {tallas, unidades, total, corte:{unidades,total}, adelantos:{...}, entregas:{...}}
 * 3) legacy plano: {tallas, pedido/corte/entrega/adelantos: []}
 */
type PorTallaRow = {
  talla: string;
  pedido: number;
  corte: number;
  entrega: number;
  adelantos: number;
};

type TotalesDistribucion = {
  pedido: number;
  corte: number;
  entrega: number;
  adelantos: number;
};

function parseDistribucionFlexible(distribucion: any) {
  const d = distribucion ?? {};

  // 1) rows
  if (Array.isArray(d.rows)) {
    const porTalla: PorTallaRow[] = d.rows.map((r: any) => ({
      talla: String(r.talla ?? "?"),
      pedido: num(r.pedido),
      corte: num(r.corte),
      entrega: num(r.entrega),
      adelantos: num(r.adelantos),
    }));

    const totales = porTalla.reduce<TotalesDistribucion>(
      (acc, r) => {
        acc.pedido += r.pedido;
        acc.corte += r.corte;
        acc.entrega += r.entrega;
        acc.adelantos += r.adelantos;
        return acc;
      },
      { pedido: 0, corte: 0, entrega: 0, adelantos: 0 },
    );



    return { porTalla, totales };
  }

  // 2) tallas (tu caso + legacy)
  if (Array.isArray(d.tallas)) {
    const tallas = d.tallas.map((t: any) => String(t));
    const n = tallas.length;

    // pedido puede venir como unidades o pedido
    const pedidoArr = toNumArray(Array.isArray(d.pedido) ? d.pedido : d.unidades, n);

    // corte/adelantos/entregas pueden venir como arrays o como {unidades,total}
    const corteArr = toNumArray(Array.isArray(d.corte) ? d.corte : d.corte?.unidades, n);
    const adelArr = toNumArray(Array.isArray(d.adelantos) ? d.adelantos : d.adelantos?.unidades, n);

    // entregas: tu caso es entregas.unidades, legacy a veces "entrega"
    const entregaArr = toNumArray(
      Array.isArray(d.entrega) ? d.entrega
      : Array.isArray(d.entregas) ? d.entregas
      : d.entregas?.unidades ?? d.entrega?.unidades ?? d.entrega ?? d.entregas,
      n,
    );


    const porTalla = tallas.map((talla: string, i: number) => ({
      talla,
      pedido: pedidoArr[i] || 0,
      corte: corteArr[i] || 0,
      entrega: entregaArr[i] || 0,
      adelantos: adelArr[i] || 0,
    }));

    const totales = {
      pedido: Number(d.total ?? d.totalPedido ?? sum(pedidoArr)) || sum(pedidoArr),
      corte: Number(d.corte?.total ?? d.totalCorte ?? sum(corteArr)) || sum(corteArr),
      entrega: Number(d.entregas?.total ?? d.entrega?.total ?? d.totalEntrega ?? sum(entregaArr)) || sum(entregaArr),
      adelantos: Number(d.adelantos?.total ?? d.totalAdelantos ?? sum(adelArr)) || sum(adelArr),
    };

    return { porTalla, totales };
  }

  return { porTalla: [], totales: { pedido: 0, corte: 0, entrega: 0, adelantos: 0 } };
}

export async function queryAlmacenPack(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, modeloInterno },
    select: { id: true, numeroPedido: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  if (pedidos.length === 0) {
    return {
      pedidos: [],
      coloresCount: 0,
      resumen: { totales: { pedido: 0, corte: 0, entrega: 0, adelantos: 0 }, porTalla: [] },
    };
  }

  const pedidoIds = pedidos.map((p) => p.id);

  const colores = await prisma.pedidoColor.findMany({
    where: { pedidoId: { in: pedidoIds } },
    select: { color: true, tipoTalla: true, distribucion: true },
  });

  const agg: Record<string, { talla: string; pedido: number; corte: number; entrega: number; adelantos: number }> = {};
  const totales = { pedido: 0, corte: 0, entrega: 0, adelantos: 0 };

  for (const c of colores) {
    const parsed = parseDistribucionFlexible(c.distribucion);

    for (const r of parsed.porTalla) {
      const key = String(r.talla ?? "?");
      if (!agg[key]) agg[key] = { talla: key, pedido: 0, corte: 0, entrega: 0, adelantos: 0 };
      agg[key].pedido += num(r.pedido);
      agg[key].corte += num(r.corte);
      agg[key].entrega += num(r.entrega);
      agg[key].adelantos += num(r.adelantos);
    }

    totales.pedido += num(parsed.totales.pedido);
    totales.corte += num(parsed.totales.corte);
    totales.entrega += num(parsed.totales.entrega);
    totales.adelantos += num(parsed.totales.adelantos);
  }

  const tallaOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XS", "2XS", "2XL", "3XL"];
  const rank = (t: string) => {
    const i = tallaOrder.indexOf((t || "").toUpperCase());
    return i === -1 ? 999 : i;
  };

  const porTalla = Object.values(agg).sort(
    (a, b) => rank(a.talla) - rank(b.talla) || a.talla.localeCompare(b.talla),
  );

  return {
    pedidos,
    coloresCount: colores.length,
    resumen: {
      totales,
      porTalla,
    },
  };
}

export async function queryControlCalidadPack(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, modeloInterno },
    select: { id: true, numeroPedido: true, controlCalidad: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return { pedidos };
}

export async function queryPreparacionAlmacenPack(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, modeloInterno },
    select: { id: true, numeroPedido: true, preparacionAlmacen: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return { pedidos };
}

export async function queryObservacionesPack(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, modeloInterno },
    select: {
      id: true,
      numeroPedido: true,
      observaciones: true,
      updatedAt: true,
      comentarios: {
        select: { autor: true, texto: true, tipo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const esc = await prisma.escandallo.findFirst({
    where: { empresaId, modeloInterno },
    select: { id: true, observaciones: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  return { escandallo: esc, pedidos };
}

export async function queryModeloPack(args: { empresaId: number; modeloInterno: string }) {
  const { empresaId, modeloInterno } = args;

  const articulo = await prisma.articulo.findFirst({
    where: { empresaId, codigo: modeloInterno },
    include: { cliente: true, temporada: true, subfamilia: true },
  });

  const escandallo = await prisma.escandallo.findFirst({
    where: { empresaId, modeloInterno },
    orderBy: { updatedAt: "desc" },
    include: {
      cliente: true,
      temporada: true,
      articulo: true,
      tejidos: true,
      forros: true,
      accesorios: true,
      otrosGastos: true,
    },
  });

  const pedido = await prisma.pedido.findFirst({
    where: { empresaId, modeloInterno },
    orderBy: { updatedAt: "desc" },
    include: {
      tejidos: true,
      forros: true,
      accesorios: true,
      colores: true,
      comentarios: true,
    },
  });

  const [almacenPack, controlCalidadPack, preparacionAlmacenPack, observacionesPack] = await Promise.all([
    queryAlmacenPack({ empresaId, modeloInterno }),
    queryControlCalidadPack({ empresaId, modeloInterno }),
    queryPreparacionAlmacenPack({ empresaId, modeloInterno }),
    queryObservacionesPack({ empresaId, modeloInterno }),
  ]);

  return {
    modeloInterno,
    articulo,
    escandallo,
    pedido,
    almacenPack,
    controlCalidadPack,
    preparacionAlmacenPack,
    observacionesPack,
  };
}

/* ======================================================
   QUERY GLOBAL (Tool única)
====================================================== */

export type GlobalChoice =
  | { type: "MODELO"; codigo: string; descripcion: string | null }
  | { type: "PEDIDO"; id: number; numeroPedido: string | null; modeloInterno: string | null }
  | { type: "ESCANDALLO"; id: number; modeloInterno: string | null };

export type QueryGlobalResult = {
  ok: boolean;
  reason?: string;
  kind: "ALMACEN" | "PEDIDO" | "ESCANDALLO" | "UNKNOWN";
  target?: { modeloInterno?: string | null; pedidoId?: number | null; escandalloId?: number | null };
  pack?: any;
  choices?: GlobalChoice[];
};

export async function queryFichaGlobal(args: { empresaId: number; message: string }): Promise<QueryGlobalResult> {
  const { empresaId, message } = args;
  const kind = detectAskingKind(message);

  // 1) IDs explícitos
  const pedidoId = detectPedidoId(message);
  if (pedidoId) {
    const pack = await queryPedidoPack({ empresaId, pedidoId });
    if (!pack) return { ok: false, kind, reason: "PEDIDO_NO_ENCONTRADO", target: { pedidoId } };
    return { ok: true, kind, target: { pedidoId }, pack };
  }

  const escandalloId = detectEscandalloId(message);
  if (escandalloId) {
    const pack = await queryEscandalloPack({ empresaId, escandalloId });
    if (!pack) return { ok: false, kind, reason: "ESCANDALLO_NO_ENCONTRADO", target: { escandalloId } };
    return { ok: true, kind, target: { escandalloId }, pack };
  }

  // 2) Nº pedido humano
  const numeroPedido = detectPedidoNumero(message);
  if (numeroPedido) {
    const p = await findPedidoByNumero({ empresaId, numeroPedido });
    if (!p) return { ok: false, kind, reason: "NUMERO_PEDIDO_NO_ENCONTRADO", target: { pedidoId: null } };

    const pack = await queryPedidoPack({ empresaId, pedidoId: p.id });
    return { ok: true, kind, target: { pedidoId: p.id, modeloInterno: p.modeloInterno ?? null }, pack };
  }

  // 3) modelo interno directo
  const modeloInterno = detectModeloInterno(message);
    if (modeloInterno) {
      const pack = await queryModeloPack({ empresaId, modeloInterno });
      return { ok: true, kind, target: { modeloInterno }, pack };
    }

  const r = await resolveModeloInternoSmart({ empresaId, input: message });

  if (r.ok) {
    const pack = await queryModeloPack({ empresaId, modeloInterno: r.modeloInterno });
    return { ok: true, kind, target: { modeloInterno: r.modeloInterno }, pack };
  }

  if (!r.ok && r.reason === "AMBIGUO") {
    return {
      ok: false,
      kind,
      reason: "AMBIGUO",
      choices: (r.choices ?? []).map((h) => ({
        type: "MODELO",
        codigo: h.codigo,
        descripcion:
          `${h.descripcion ?? ""}` +
          ` | ${h.temporada?.codigo ?? "?"}` +
          ` | ${h.cliente?.codigo ?? "?"} ${h.cliente?.nombre ?? ""}` +
          ` | ${h.subfamilia?.codigo ?? "?"}`,
      })),
    };
  }


  // 4) buscar por texto
  const modelos = await findModelosByText({ empresaId, query: message });

  if (modelos.length === 0) {
    return { ok: false, kind, reason: "SIN_COINCIDENCIAS", choices: [] };
  }

  if (modelos.length === 1) {
    const only = modelos[0];
    const pack = await queryModeloPack({ empresaId, modeloInterno: only.codigo });
    return { ok: true, kind, target: { modeloInterno: only.codigo }, pack };
  }

  return {
    ok: false,
    kind,
    reason: "AMBIGUO",
    choices: modelos.map((m) => ({ type: "MODELO", codigo: m.codigo, descripcion: m.descripcion })),
  };
}

// ======================================================
// BÚSQUEDA GLOBAL (fallback cuando no hay modelo/pedido)
// ======================================================

export type SearchEmpresaResult = {
  ok: boolean;
  hits: {
    modelos: { codigo: string; descripcion: string | null }[];
    pedidos: { id: number; numeroPedido: string | null; modeloInterno: string | null }[];
    escandallos: { id: number; modeloInterno: string | null }[];
    comentarios: { autor: string; texto: string; modeloInterno: string | null }[];
  };
};

function takeClean<T>(arr: T[], n = 10) {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

export async function searchEmpresaGlobal(args: {
  empresaId: number;
  query: string;
}): Promise<SearchEmpresaResult> {
  const { empresaId, query } = args;
  const q = (query ?? "").trim();
  if (!q) {
    return { ok: false, hits: { modelos: [], pedidos: [], escandallos: [], comentarios: [] } };
  }

  const qNorm = normalizeText(q);
  const tokens = tokenize(qNorm);

  // si es muy corto tipo "hola", no queremos spamear resultados
  const isTooGeneric = tokens.length === 0 || qNorm.length < 3;
  if (isTooGeneric) {
    return { ok: false, hits: { modelos: [], pedidos: [], escandallos: [], comentarios: [] } };
  }

  // 1) Modelos / Artículos (maestro)
  const modelosRaw = await prisma.articulo.findMany({
    where: { empresaId },
    select: { codigo: true, descripcion: true },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });

  const modelos = modelosRaw
    .map((m) => {
      const hay = normalizeText(`${m.codigo} ${m.descripcion ?? ""}`);
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { ...m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ codigo, descripcion }) => ({ codigo, descripcion: descripcion ?? null }));

  // 2) Pedidos (número/modelo/observaciones)
  const pedidosRaw = await prisma.pedido.findMany({
    where: { empresaId },
    select: { id: true, numeroPedido: true, modeloInterno: true, observaciones: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const pedidos = pedidosRaw
    .map((p) => {
      const hay = normalizeText(`${p.numeroPedido ?? ""} ${p.modeloInterno ?? ""} ${p.observaciones ?? ""}`);
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { id: p.id, numeroPedido: p.numeroPedido ?? null, modeloInterno: p.modeloInterno ?? null, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ id, numeroPedido, modeloInterno }) => ({ id, numeroPedido, modeloInterno }));

  // 3) Escandallos (modelo/observaciones)
  const escRaw = await prisma.escandallo.findMany({
    where: { empresaId },
    select: { id: true, modeloInterno: true, observaciones: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const escandallos = escRaw
    .map((e) => {
      const hay = normalizeText(`${e.modeloInterno ?? ""} ${e.observaciones ?? ""}`);
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { id: e.id, modeloInterno: e.modeloInterno ?? null, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ id, modeloInterno }) => ({ id, modeloInterno }));

  // 4) Comentarios (texto/autor) y arrastramos modeloInterno del pedido
  const commRaw = await prisma.pedidoComentario.findMany({
    where: {
      pedido: { empresaId },
    },
    select: {
      autor: true,
      texto: true,
      pedido: { select: { modeloInterno: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const comentarios = commRaw
    .map((c) => {
      const hay = normalizeText(`${c.autor ?? ""} ${c.texto ?? ""} ${c.pedido?.modeloInterno ?? ""}`);
      const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return {
        autor: String(c.autor ?? "?"),
        texto: String(c.texto ?? ""),
        modeloInterno: c.pedido?.modeloInterno ?? null,
        score,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ autor, texto, modeloInterno }) => ({ autor, texto, modeloInterno }));

  return {
    ok: true,
    hits: {
      modelos: takeClean(modelos, 10),
      pedidos: takeClean(pedidos, 10),
      escandallos: takeClean(escandallos, 10),
      comentarios: takeClean(comentarios, 8),
    },
  };
}
// ======================================================
// STATS GLOBALES POR EMPRESA
// ======================================================

export type EmpresaStatsResult = {
  ok: true;
  empresaId: number;
  counts: {
    articulos: number;
    pedidos: number;
    escandallos: number;
    comentarios: number;
  };
  escandallosByEstado: { estado: string; count: number }[];
  topTallerConfeccion: { taller: string; count: number }[];
  topTallerCorte: { taller: string; count: number }[];
  pedidosRecientes: { id: number; numeroPedido: string | null; modeloInterno: string | null; updatedAt: string }[];
  comentariosRecientes: { autor: string; texto: string; modeloInterno: string | null; createdAt: string }[];
};

function safeStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function getEmpresaStats(args: {
  empresaId: number;
}): Promise<EmpresaStatsResult> {
  const { empresaId } = args;

  const [
    articulos,
    pedidos,
    escandallos,
    comentarios,
    escByEstadoRaw,
    pedidosRecientesRaw,
    comentariosRecientesRaw,
    talleresConfeccionRaw,
    talleresCorteRaw,
  ] = await Promise.all([
    prisma.articulo.count({ where: { empresaId } }),
    prisma.pedido.count({ where: { empresaId } }),
    prisma.escandallo.count({ where: { empresaId } }),
    prisma.pedidoComentario.count({ where: { pedido: { empresaId } } }),

    prisma.escandallo.groupBy({
      by: ["estado"],
      where: { empresaId },
      _count: { estado: true },
    }),

    prisma.pedido.findMany({
      where: { empresaId },
      select: { id: true, numeroPedido: true, modeloInterno: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),

    prisma.pedidoComentario.findMany({
      where: { pedido: { empresaId } },
      select: {
        autor: true,
        texto: true,
        createdAt: true,
        pedido: { select: { modeloInterno: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),

    // Top talleres confección
    prisma.pedido.groupBy({
      by: ["tallerConfeccion"],
      where: { empresaId, tallerConfeccion: { not: null } },
      _count: { tallerConfeccion: true },
      orderBy: { _count: { tallerConfeccion: "desc" } },
      take: 8,
    }),

    // Top talleres corte
    prisma.pedido.groupBy({
      by: ["tallerCorte"],
      where: { empresaId, tallerCorte: { not: null } },
      _count: { tallerCorte: true },
      orderBy: { _count: { tallerCorte: "desc" } },
      take: 8,
    }),
  ]);

  const escandallosByEstado = escByEstadoRaw.map((r: any) => ({
    estado: String(r.estado ?? "DESCONOCIDO"),
    count: Number(r._count?.estado ?? 0),
  }));

  const pedidosRecientes = pedidosRecientesRaw.map((p: any) => ({
    id: p.id,
    numeroPedido: safeStr(p.numeroPedido),
    modeloInterno: safeStr(p.modeloInterno),
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
  }));

  const comentariosRecientes = comentariosRecientesRaw.map((c: any) => ({
    autor: String(c.autor ?? "?"),
    texto: String(c.texto ?? ""),
    modeloInterno: safeStr(c.pedido?.modeloInterno),
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  }));

  const topTallerConfeccion = talleresConfeccionRaw
    .map((r: any) => ({
      taller: String(r.tallerConfeccion ?? "").trim(),
      count: Number(r._count?.tallerConfeccion ?? 0),
    }))
    .filter((x: any) => x.taller.length);

  const topTallerCorte = talleresCorteRaw
    .map((r: any) => ({
      taller: String(r.tallerCorte ?? "").trim(),
      count: Number(r._count?.tallerCorte ?? 0),
    }))
    .filter((x: any) => x.taller.length);

  return {
    ok: true,
    empresaId,
    counts: { articulos, pedidos, escandallos, comentarios },
    escandallosByEstado,
    topTallerConfeccion,
    topTallerCorte,
    pedidosRecientes,
    comentariosRecientes,
  };
}
