// lib/ai/toolRunner.ts
import {
  getEmpresaStats,
  queryFichaGlobal,
  queryMaestroGlobal,
  searchEmpresaGlobal,
  type EmpresaStatsResult,
  type MaestroQueryResult,
  type QueryGlobalResult,
  type SearchEmpresaResult,
} from "./tools";

import { searchLegacyFiles, type LegacySearchResult } from "./legacySearch";

type ToolContext = { empresaId: number; empresaSlug?: string };


export type ToolCall =
  | { tool: "queryMaestroGlobal"; args: { message: string } }
  | { tool: "queryFichaGlobal"; args: { message: string } }
  | { tool: "searchEmpresaGlobal"; args: { query: string } }
  | { tool: "getEmpresaStats"; args: {} }
  | { tool: "searchLegacyFiles"; args: { query: string } };



export type ToolResult = {
  tool: ToolCall["tool"] | null;
  call: ToolCall | null;
  data: any;
  answer: string | null;
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function upper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function normalize(s: string) {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // quita tildes
}
function includesAny(s: string, parts: string[]) {
  return parts.some((p) => s.includes(p));
}

function hasModeloHint(message: string) {
  const s = message.toUpperCase();
  return (
    /\b\d{4}[A-Z]{2}\d{4}\b/.test(s) || // 1926VE0203
    /\b\d{2}[A-Z]{2}\d{4}\b/.test(s) || // 26VE0203
    /\b[A-Z]{2}\d{4}\b/.test(s)         // VE0203
  );
}


function isSmallTalk(message: string) {
  const s = normalize(message);

  const greetings = [
    "hola",
    "buenas",
    "hey",
    "que tal",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
  ];
  const thanks = ["gracias", "thanks", "perfecto", "ok", "vale", "genial", "brutal"];

  if (greetings.some((g) => s === g || s.startsWith(g + " "))) return { kind: "GREET" as const };
  if (thanks.some((t) => s === t || s.startsWith(t + " "))) return { kind: "THANKS" as const };

  if (includesAny(s, ["cómo estás", "como estas", "estás ahí", "estas ahi"])) return { kind: "STATUS" as const };

  if (includesAny(s, ["ayuda", "qué puedes hacer", "que puedes hacer", "cómo funciona", "como funciona"])) {
    return { kind: "HELP" as const };
  }

  return null;
}

function looksLikeLegacySearch(message: string) {
  const s = normalize(message);

  const hasSearchVerb = includesAny(s, [
    "busca",
    "buscar",
    "encuentra",
    "encuentrame",
    "donde",
  ]);

  const hasFileHint = includesAny(s, [
    "archivo",
    "fichero",
    "excel",
    "xlsx",
    "xls",
    "csv",
    "pdf",
    "legacy",
  ]);

  const hasExt = /\.(xlsx|xls|csv|pdf)\b/i.test(message);

  return (hasSearchVerb && hasFileHint) || hasExt || s.startsWith("legacy ");
}

function answerFromLegacySearch(res: LegacySearchResult): string | null {
  if (!res) return null;

  // ✅ Si falla, damos un mensaje útil (para no “caer” a otras tools sin contexto)
  if (!res.ok) {
    return `No puedo buscar en legacy ahora mismo: ${res.error}.`;
  }

  if (!res.hits.length) return `No encuentro archivos en legacy que se parezcan a "${res.query}".`;

  const lines: string[] = [];
  const top = res.hits.slice(0, 8);
  for (const h of top) {
    lines.push(`• ${h.name}${h.relPath && h.relPath !== h.name ? ` — ${h.relPath}` : ""}`);
  }

  const tail = res.truncated
    ? "\n\n(He recortado la búsqueda para no colgar el servidor. Si no está, dime una carpeta o un nombre más exacto.)"
    : "";

  return `He encontrado estos archivos en legacy:\n${lines.join("\n")}${tail}`;
}

function smallTalkAnswer(kind: "GREET" | "THANKS" | "STATUS" | "HELP") {
  if (kind === "GREET") {
    return `¡Buenas! Dime qué necesitas: modelo (ej: ACM-MDL-1001), nº de pedido o “observaciones/comentarios” y te lo saco.`;
  }
  if (kind === "THANKS") {
    return `De lujo 🙂 ¿Seguimos con otro modelo/pedido o miramos control de calidad / almacén?`;
  }
  if (kind === "STATUS") {
    return `Aquí estoy, al pie del cañón 😄. Dispara: modelo, pedido, escandallo, almacén, calidad, observaciones…`;
  }
  return `Puedo ayudarte con:
• Almacén: corte/entrega/adelantos/por talla
• Escandallo: coste, tejidos/forros/accesorios
• Pedido: talleres, precios, comentarios, observaciones
• Control de calidad / preparación almacén
• Stats: “stats”, “resumen global”, “top talleres”, “últimos comentarios”

Ejemplos:
“corte ACM-MDL-1001”
“por talla ACM-MDL-1001”
“control de calidad ACM-MDL-1001”
“observaciones ACM-MDL-1001”
“stats”`;
}

function pickModelo(global: QueryGlobalResult): string {
  const pack: any = global.pack;
  return upper(pack?.modeloInterno ?? pack?.pedido?.modeloInterno ?? global.target?.modeloInterno ?? "");
}

function getModeloPack(global: QueryGlobalResult) {
  const pack: any = global.pack ?? null;
  const pedido = pack?.pedido ?? null;
  const escandallo = pack?.escandallo ?? null;

  const almacenPack = pack?.almacenPack ?? null;
  const controlCalidadPack = pack?.controlCalidadPack ?? null;
  const preparacionAlmacenPack = pack?.preparacionAlmacenPack ?? null;
  const obsPack = pack?.observacionesPack ?? null;
  const articulo = pack?.articulo ?? null;

  const pedidoDirecto = pack?.id && pack?.colores ? pack : null;
  const escandalloFromPedido = pedidoDirecto?.escandallo ?? null;

  return {
    pack,
    articulo,
    pedido: pedido ?? pedidoDirecto,
    escandallo: escandallo ?? escandalloFromPedido,
    almacenPack,
    controlCalidadPack,
    preparacionAlmacenPack,
    obsPack,
  };
}

function formatMoneyEUR(v: any) {
  const x = n(v);
  return `${x.toFixed(2)} €`;
}

function formatDate(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.valueOf())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function sumBy(arr: any[], key: string) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, r) => acc + n(r?.[key]), 0);
}

function safeJsonPreview(v: any, max = 700) {
  if (v == null) return null;
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s) return null;
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(v);
  }
}

function findTejidoMatch(tejidos: any[], query: string) {
  const q = normalize(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tejidos.find((t) => {
    const hay = normalize(`${t.proveedor ?? ""} ${t.serie ?? ""} ${t.color ?? ""}`);
    const hits = tokens.reduce((acc, tok) => acc + (tok.length >= 3 && hay.includes(tok) ? 1 : 0), 0);
    return hits >= 1;
  });
}

function buildTejidoLabel(t: any) {
  const prov = t.proveedor ?? "?";
  const serie = t.serie ?? "?";
  const color = t.color ?? "?";
  return `${prov} — ${serie} — ${color}`;
}

function buildAccesorioLabel(a: any) {
  const nombre = a.nombre ?? "?";
  const ref = a.referencia ? ` (${a.referencia})` : "";
  return `${nombre}${ref}`;
}

const ACCESSORY_HINTS = [
  "accesor",
  "fornitura",
  "fornituras",
  "boton",
  "botón",
  "cremallera",
  "cierre",
  "corchete",
  "cinta",
  "cordon",
  "cordón",
  "goma",
  "etiqueta",
  "entretela",
  "hebilla",
  "broche",
  "velcro",
];

const ACCESSORY_STOPWORDS = new Set(
  [
    "modelo",
    "pedido",
    "escandallo",
    "corte",
    "entrega",
    "pendiente",
    "por",
    "talla",
    "tallas",
    "control",
    "calidad",
    "preparacion",
    "preparación",
    "observacion",
    "observaciones",
    "comentario",
    "comentarios",
    "almacen",
    "almacén",
    "fecha",
    "fechas",
    "precio",
    "coste",
    "costo",
    "pvp",
    "taller",
    "cliente",
    "temporada",
    "estado",
    "factura",
    "facturado",
    "albaran",
    "albarán",
    "tejido",
    "tejidos",
    "forro",
    "forros",
    "accesorio",
    "accesorios",
    "fornitura",
    "fornituras",
    "consumo",
    "metros",
    "metraje",
  ].map((v) => normalize(v)),
);

function extractAccessoryTokens(message: string) {
  const tokens = normalize(message).split(/\s+/).filter(Boolean);
  return tokens.filter((tok) => {
    if (tok.length < 3) return false;
    if (ACCESSORY_STOPWORDS.has(tok)) return false;
    if (/\d/.test(tok)) return false;
    return true;
  });
}

function findAccessoryMatches(accesorios: any[], query: string) {
  const tokens = extractAccessoryTokens(query);
  if (!tokens.length) return [];
  const tokenVariants = (tok: string) => {
    if (tok.endsWith("s") && tok.length > 3) return [tok, tok.slice(0, -1)];
    return [tok];
  };
  return accesorios.filter((a) => {
    const hay = normalize(
      `${a.nombre ?? ""} ${a.proveedor ?? ""} ${a.referencia ?? ""} ${a.color ?? ""} ${a.medida ?? ""}`,
    );
    const hits = tokens.reduce(
      (acc, tok) => acc + (tokenVariants(tok).some((v) => hay.includes(v)) ? 1 : 0),
      0,
    );
    return hits >= 1;
  });
}

function answerFromSearch(search: SearchEmpresaResult): string | null {
  if (!search.ok) return null;

  const lines: string[] = [];

  if (search.hits.modelos.length) {
    lines.push("Modelos:");
    for (const m of search.hits.modelos.slice(0, 6)) {
      lines.push(`• ${m.codigo}${m.descripcion ? ` — ${m.descripcion}` : ""}`);
    }
  }

  if (search.hits.pedidos.length) {
    lines.push("Pedidos:");
    for (const p of search.hits.pedidos.slice(0, 6)) {
      lines.push(`• Pedido ${p.numeroPedido ?? p.id} — modelo ${p.modeloInterno ?? "?"}`);
    }
  }

  if (search.hits.escandallos.length) {
    lines.push("Escandallos:");
    for (const e of search.hits.escandallos.slice(0, 6)) {
      lines.push(`• Escandallo ${e.id} — modelo ${e.modeloInterno ?? "?"}`);
    }
  }

  if (search.hits.comentarios.length) {
    lines.push("Comentarios (últimos):");
    for (const c of search.hits.comentarios.slice(0, 4)) {
      lines.push(`• ${c.modeloInterno ?? "?"} — ${c.autor}: ${c.texto}`);
    }
  }

  if (!lines.length) return null;

  return `He encontrado cosas relacionadas:
${lines.join("\n")}

Dime con cuál quieres que entre (ej: “corte ACM-MDL-1001” o “pedido ${search.hits.pedidos[0]?.numeroPedido ?? ""}”).`;
}

function answerFromMaestro(message: string, m: MaestroQueryResult): string | null {
  if (!m) return null;

  if (!m.ok) {
    if (m.reason === "NO_MAESTRO") return null;

    if (m.reason === "AMBIGUO" && m.choices?.length) {
      const lines = m.choices.slice(0, 10).map((c: any) => {
        if (c.type === "CLIENTE") return `• Cliente ${c.codigo} — ${c.nombre}`;
        if (c.type === "TEMPORADA") return `• Temporada ${c.codigo} — ${c.descripcion}`;
        if (c.type === "SUBFAMILIA") return `• Subfamilia ${c.codigo} — ${c.descripcion}`;
        return `• ${JSON.stringify(c)}`;
      });
      return `Me salen varias opciones. Dime cuál:\n${lines.join("\n")}\n\nEj: "elige cliente 20" o "elige ${m.choices[0]?.type === "CLIENTE" ? "cliente 20" : "PV2026"}"`;
    }

    if (m.reason === "NO_ENCONTRADO") {
      return `No encuentro ese ${m.maestroType?.toLowerCase() ?? "maestro"}.`;
    }

    return null;
  }

  const maestro: any = m.maestro;

  if (maestro?.type === "CLIENTE") {
    const head = `Cliente ${maestro.codigo}: ${maestro.nombre}`;
    if (m.rows?.length) {
      const lines = m.rows.slice(0, 12).map((r) => `• ${r.codigo}${r.descripcion ? ` — ${r.descripcion}` : ""}`);
      const extra = m.rows.length > 12 ? `\n…y ${m.rows.length - 12} más.` : "";
      return `${head}\n\nModelos/artículos (muestra):\n${lines.join("\n")}${extra}`;
    }
    return head;
  }

  if (maestro?.type === "TEMPORADA") {
    const head = `Temporada ${maestro.codigo}: ${maestro.descripcion}`;
    if (m.rows?.length) {
      const lines = m.rows.slice(0, 12).map((r) => `• ${r.codigo}${r.descripcion ? ` — ${r.descripcion}` : ""}`);
      const extra = m.rows.length > 12 ? `\n…y ${m.rows.length - 12} más.` : "";
      return `${head}\n\nArtículos (muestra):\n${lines.join("\n")}${extra}`;
    }
    return head;
  }

  if (maestro?.type === "SUBFAMILIA") {
    const head = `Subfamilia ${maestro.codigo}: ${maestro.descripcion}`;
    if (m.rows?.length) {
      const lines = m.rows.slice(0, 12).map((r) => `• ${r.codigo}${r.descripcion ? ` — ${r.descripcion}` : ""}`);
      const extra = m.rows.length > 12 ? `\n…y ${m.rows.length - 12} más.` : "";
      return `${head}\n\nArtículos (muestra):\n${lines.join("\n")}${extra}`;
    }
    return head;
  }

  return null;
}


function formatEmpresaStats(message: string, stats: EmpresaStatsResult) {
  const s = normalize(message);

  if (includesAny(s, ["cuantos", "cuántos", "numero", "número"]) && s.includes("pedido")) {
    return `Pedidos totales: ${stats.counts.pedidos}.`;
  }

  if (includesAny(s, ["cuantos", "cuántos"]) && s.includes("escand")) {
    const prod = stats.escandallosByEstado.find((x) => x.estado.toUpperCase().includes("PRODU"))?.count ?? 0;
    return `Escandallos: ${stats.counts.escandallos}. En producción: ${prod}.`;
  }

  if (s.includes("coment")) {
    const lines = stats.comentariosRecientes.slice(0, 6).map((c) => {
      const mod = c.modeloInterno ? `(${c.modeloInterno}) ` : "";
      return `• ${mod}${c.autor}: ${c.texto}`;
    });
    return lines.length ? `Últimos comentarios:\n${lines.join("\n")}` : `No hay comentarios recientes.`;
  }

  if (includesAny(s, ["top", "taller"])) {
    const conf = stats.topTallerConfeccion.slice(0, 5).map((t) => `• ${t.taller}: ${t.count}`);
    const corte = stats.topTallerCorte.slice(0, 5).map((t) => `• ${t.taller}: ${t.count}`);
    return `Top talleres (por nº de pedidos):

Confección:
${conf.join("\n") || "—"}

Corte:
${corte.join("\n") || "—"}`;
  }

  const prod = stats.escandallosByEstado.find((x) => x.estado.toUpperCase().includes("PRODU"))?.count ?? 0;
  const estudio = stats.escandallosByEstado.find((x) => x.estado.toUpperCase().includes("ESTUD"))?.count ?? 0;

  const pedidosRec = stats.pedidosRecientes
    .slice(0, 5)
    .map((p) => `• ${p.numeroPedido ?? p.id} — ${p.modeloInterno ?? "?"}`)
    .join("\n");

  return (
    `Vale, foto rápida de la empresa:\n` +
    `• Artículos: ${stats.counts.articulos}\n` +
    `• Pedidos: ${stats.counts.pedidos}\n` +
    `• Escandallos: ${stats.counts.escandallos} (Producción: ${prod}, Estudio: ${estudio})\n` +
    `• Comentarios: ${stats.counts.comentarios}\n\n` +
    `Actividad reciente (pedidos):\n${pedidosRec || "—"}\n\n` +
    `Si quieres algo más fino, dime: “top talleres”, “últimos comentarios”, “escandallos en producción”…`
  );
}

/**
 * Respuestas deterministas usando el PACK global
 */
function answerFromGlobal(message: string, global: QueryGlobalResult): string | null {
  const s = normalize(message);

  if (!global.ok) {
    if (global.reason === "AMBIGUO" && global.choices?.length) {
      const lines = global.choices.slice(0, 10).map((c: any) => {
        if (c.type === "MODELO") return `• ${c.codigo}${c.descripcion ? ` — ${c.descripcion}` : ""}`;
        if (c.type === "PEDIDO") return `• Pedido ${c.numeroPedido ?? c.id} — modelo ${c.modeloInterno ?? "?"}`;
        if (c.type === "ESCANDALLO") return `• Escandallo ${c.id} — modelo ${c.modeloInterno ?? "?"}`;
        return `• ${JSON.stringify(c)}`;
      });
      const extra = global.choices.length > 10 ? `\n…y ${global.choices.length - 10} más.` : "";
      return `He encontrado varios resultados. Dime cuál:\n${lines.join("\n")}${extra}\n\nEj: "elige ACM-MDL-1001"`;
    }

    if (global.reason === "SIN_COINCIDENCIAS") return null;
    if (global.reason === "PEDIDO_NO_ENCONTRADO") return `No encuentro ese pedido.`;
    if (global.reason === "ESCANDALLO_NO_ENCONTRADO") return `No encuentro ese escandallo.`;
    if (global.reason === "NUMERO_PEDIDO_NO_ENCONTRADO") return `No encuentro ese número de pedido.`;

    return `No puedo resolver la consulta. Dime el modelo (ej: ACM-MDL-1001) o el nº de pedido.`;
  }

  const modelo = pickModelo(global);
  const { pedido, escandallo, almacenPack, controlCalidadPack, preparacionAlmacenPack, obsPack, articulo } =
    getModeloPack(global);

  if (s.includes("cliente")) {
    const cli = articulo?.cliente ?? escandallo?.cliente ?? null;
    if (!cli) return `No tengo cliente asociado para ${modelo}.`;
    return `Cliente ${modelo}: ${cli.nombre ?? cli.codigo ?? "?"}`;
  }

  if (s.includes("temporada")) {
    const t = articulo?.temporada ?? escandallo?.temporada ?? null;
    if (!t) return `No tengo temporada asociada para ${modelo}.`;
    return `Temporada ${modelo}: ${t.codigo} — ${t.descripcion}`;
  }

  if (includesAny(s, ["estado", "en produccion", "en producción"])) {
    const st = escandallo?.estado ?? null;
    if (!st) return `No tengo estado de escandallo para ${modelo}.`;
    return `Estado ${modelo}: ${st === "PRODUCCION" ? "En producción" : "En escandallo"}`;
  }

  if (s.includes("fecha") || s.includes("fechas")) {
    const fp = formatDate(pedido?.fechaPedido);
    const fe = formatDate(pedido?.fechaEntrega);
    const fc = formatDate(pedido?.fechaCorte);
    const fconf = formatDate(pedido?.fechaConfeccion);
    const ff = formatDate(pedido?.fechaFactura);
    const fes = formatDate(escandallo?.fecha);
    const fap = formatDate(escandallo?.fechaAprobacion);

    if (includesAny(s, ["fecha entrega", "entrega"])) {
      return fe ? `Fecha de entrega ${modelo}: ${fe}.` : `No tengo fecha de entrega para ${modelo}.`;
    }
    if (includesAny(s, ["fecha corte", "corte"])) {
      return fc ? `Fecha de corte ${modelo}: ${fc}.` : `No tengo fecha de corte para ${modelo}.`;
    }
    if (includesAny(s, ["fecha confeccion", "fecha confección", "confeccion", "confección"])) {
      return fconf ? `Fecha de confección ${modelo}: ${fconf}.` : `No tengo fecha de confección para ${modelo}.`;
    }
    if (includesAny(s, ["factura", "facturado", "facturación"])) {
      return ff ? `Fecha de factura ${modelo}: ${ff}.` : `No tengo fecha de factura para ${modelo}.`;
    }
    if (includesAny(s, ["fecha pedido", "pedido"])) {
      return fp ? `Fecha de pedido ${modelo}: ${fp}.` : `No tengo fecha de pedido para ${modelo}.`;
    }
    if (includesAny(s, ["aprobacion", "aprobación"])) {
      return fap ? `Aprobación escandallo ${modelo}: ${fap}.` : `No tengo fecha de aprobación para ${modelo}.`;
    }
    if (includesAny(s, ["escandallo"])) {
      return fes ? `Fecha escandallo ${modelo}: ${fes}.` : `No tengo fecha de escandallo para ${modelo}.`;
    }

    const parts: string[] = [];
    if (fp) parts.push(`• Pedido: ${fp}`);
    if (fe) parts.push(`• Entrega: ${fe}`);
    if (fc) parts.push(`• Corte: ${fc}`);
    if (fconf) parts.push(`• Confección: ${fconf}`);
    if (fap) parts.push(`• Aprobación escandallo: ${fap}`);
    if (fes) parts.push(`• Escandallo: ${fes}`);
    if (ff) parts.push(`• Factura: ${ff}`);

    if (parts.length) return `Fechas ${modelo}:\n${parts.join("\n")}`;
    return `No tengo fechas registradas para ${modelo}.`;
  }

  if (s.includes("albaran") || s.includes("albarán")) {
    const ac = pedido?.albaranCorte ?? null;
    const aconf = pedido?.albaranConfeccion ?? null;
    if (!ac && !aconf) return `No tengo albaranes registrados para ${modelo}.`;
    const lines: string[] = [];
    if (ac) lines.push(`• Corte: ${ac}`);
    if (aconf) lines.push(`• Confección: ${aconf}`);
    return `Albaranes ${modelo}:\n${lines.join("\n")}`;
  }

  if (s.includes("factura") || s.includes("facturado") || s.includes("facturación")) {
    const fact = pedido?.facturado ?? null;
    const num = pedido?.numeroFactura ?? null;
    const ff = formatDate(pedido?.fechaFactura);
    if (fact == null && !num && !ff) return `No tengo datos de facturación para ${modelo}.`;
    const parts: string[] = [];
    if (fact != null) parts.push(`• Facturado: ${fact ? "Sí" : "No"}`);
    if (num) parts.push(`• Nº factura: ${num}`);
    if (ff) parts.push(`• Fecha factura: ${ff}`);
    return `Facturación ${modelo}:\n${parts.join("\n")}`;
  }

  if (s.includes("precio venta") || s.includes("precio de venta")) {
    const pv = pedido?.precioVenta ?? null;
    if (pv == null) return `No tengo precio de venta registrado para ${modelo}.`;
    return `Precio de venta ${modelo}: ${formatMoneyEUR(pv)}`;
  }

  if (s.includes("pvp")) {
    const pvp = pedido?.pvp ?? null;
    if (pvp == null) return `No tengo PVP registrado para ${modelo}.`;
    return `PVP ${modelo}: ${formatMoneyEUR(pvp)}`;
  }

  if (includesAny(s, ["precio corte", "precio de corte"])) {
    const pc = pedido?.precioCorte ?? null;
    if (pc == null) return `No tengo precio de corte registrado para ${modelo}.`;
    return `Precio de corte ${modelo}: ${formatMoneyEUR(pc)}`;
  }

  if (includesAny(s, ["precio confeccion", "precio confección"])) {
    const pcf = pedido?.precioConfeccion ?? null;
    if (pcf == null) return `No tengo precio de confección registrado para ${modelo}.`;
    return `Precio de confección ${modelo}: ${formatMoneyEUR(pcf)}`;
  }

  const tot = almacenPack?.resumen?.totales ?? null;
  if (tot) {
    const pedidoTot = n(tot.pedido);
    const corteTot = n(tot.corte);
    const entregaTot = n(tot.entrega);
    const adelantosTot = n(tot.adelantos);
    const pendienteEntrega = Math.max(0, pedidoTot - entregaTot);

    if (includesAny(s, ["pendiente", "faltan", "restan"])) {
      return `Pendiente de entrega ${modelo}: ${pendienteEntrega} uds. (pedido ${pedidoTot} / entrega ${entregaTot}).`;
    }

    if (includesAny(s, ["corte", "cortad", "cortaron"])) return `Corte ${modelo}: ${corteTot} uds.`;
    if (includesAny(s, ["entrega", "entregad", "entregaron"])) return `Entrega ${modelo}: ${entregaTot} uds.`;
    if (s.includes("adelanto")) return `Adelantos ${modelo}: ${adelantosTot} uds.`;

    if (includesAny(s, ["unidades", "totales", "total"])) {
      return `Totales ${modelo}:
• Pedido: ${pedidoTot}
• Corte: ${corteTot}
• Entrega: ${entregaTot}
• Adelantos: ${adelantosTot}
• Pendiente entrega: ${pendienteEntrega}`;
    }

    if (includesAny(s, ["por talla", "tallas"])) {
      const rows = (almacenPack?.resumen?.porTalla ?? []).slice(0, 60);
      if (!rows.length) return `No tengo desglose por talla para ${modelo}.`;

      const lines = rows.map(
        (r: any) => `• ${r.talla}: P ${n(r.pedido)} | C ${n(r.corte)} | E ${n(r.entrega)} | A ${n(r.adelantos)}`,
      );
      return `Por talla ${modelo}:\n${lines.join("\n")}`;
    }
  }

  if (s.includes("taller") && includesAny(s, ["corte", "cortar"])) {
    const t = pedido?.tallerCorte ?? null;
    return t ? `Taller de corte ${modelo}: ${t}` : `No tengo taller de corte registrado para ${modelo}.`;
  }

  if (s.includes("taller") && includesAny(s, ["confeccion", "confección"])) {
    const t = pedido?.tallerConfeccion ?? null;
    return t ? `Taller de confección ${modelo}: ${t}` : `No tengo taller de confección registrado para ${modelo}.`;
  }

  if (s.includes("modelo cliente") || s.includes("referencia cliente") || s.includes("ref cliente")) {
    const mc = pedido?.modeloCliente ?? escandallo?.modeloCliente ?? null;
    if (!mc) return `No tengo modelo cliente para ${modelo}.`;
    return `Modelo cliente ${modelo}: ${mc}`;
  }

  if (s.includes("descripcion") || s.includes("descripción")) {
    const desc = pedido?.descripcionPedido ?? null;
    if (!desc) return `No tengo descripción de pedido para ${modelo}.`;
    return `Descripción pedido ${modelo}: ${desc}`;
  }

  if (s.includes("patronista")) {
    const p = escandallo?.patronista ?? null;
    if (!p) return `No tengo patronista para ${modelo}.`;
    return `Patronista ${modelo}: ${p}`;
  }

  if (s.includes("patron") || s.includes("patrón")) {
    const p = escandallo?.patron ?? null;
    if (!p) return `No tengo patrón para ${modelo}.`;
    return `Patrón ${modelo}: ${p}`;
  }

  if (s.includes("talla")) {
    const t = escandallo?.talla ?? null;
    if (!t) return `No tengo talla registrada para ${modelo}.`;
    return `Talla ${modelo}: ${t}`;
  }

  if (
    includesAny(s, [
      "coste escandallo",
      "costo escandallo",
      "precio escandall",
      "precio del escandallo",
      "total coste",
      "total costo",
    ])
  ) {
    const totalCoste = escandallo?.totalCoste ?? null;
    if (totalCoste == null) return `No tengo el total de coste del escandallo para ${modelo}.`;
    return `Coste escandallo ${modelo}: ${formatMoneyEUR(totalCoste)}`;
  }

  if (s.includes("consumo") && includesAny(s, ["total", "escandallo", "tejido", "forro"])) {
    const t = escandallo?.tejidos ?? [];
    const f = escandallo?.forros ?? [];
    const consT = sumBy(t, "consumoProduccion");
    const consF = sumBy(f, "consumoProduccion");
    if (!t.length && !f.length) return `No tengo consumos de escandallo para ${modelo}.`;
    return `Consumo ${modelo} (escandallo):
• Tejidos: ${consT.toFixed(2)} m
• Forros: ${consF.toFixed(2)} m`;
  }

  if (includesAny(s, ["metros", "metraje"]) && includesAny(s, ["pedido", "recibidos", "recibidas"])) {
    const tejidos = pedido?.tejidos ?? [];
    const forros = pedido?.forros ?? [];
    if (!tejidos.length && !forros.length) return `No tengo metraje de pedido para ${modelo}.`;

    const totPedidos = sumBy(tejidos, "metrosPedidos") + sumBy(forros, "metrosPedidos");
    const totRecibidos = sumBy(tejidos, "metrosRecibidos") + sumBy(forros, "metrosRecibidos");

    const lines: string[] = [];
    if (totPedidos) lines.push(`• Metros pedidos: ${totPedidos.toFixed(2)} m`);
    if (totRecibidos) lines.push(`• Metros recibidos: ${totRecibidos.toFixed(2)} m`);

    const pick = (arr: any[]) =>
      arr.slice(0, 10).map(
        (r) =>
          `• ${r.proveedor ?? "?"} ${r.serie ?? ""} ${r.color ?? ""}: ${n(r.metrosPedidos)} m ped., ${n(r.metrosRecibidos)} m rec.`,
      );

    if (s.includes("detalle") || s.includes("por tejido") || s.includes("desglose")) {
      const tlines = pick(tejidos);
      const flines = pick(forros);
      return `Metraje ${modelo} (pedido):
${lines.join("\n")}${lines.length ? "\n" : ""}${
        tlines.length ? `Tejidos:\n${tlines.join("\n")}\n` : ""
      }${flines.length ? `Forros:\n${flines.join("\n")}` : ""}`.trim();
    }

    return `Metraje ${modelo} (pedido):\n${lines.join("\n")}`;
  }

  if (includesAny(s, ["precio tejido", "precio de tejido", "precio tejidos", "precio de tejidos"])) {
    const tejidos = escandallo?.tejidos ?? [];
    if (!tejidos.length) return `No tengo tejidos en el escandallo del ${modelo}.`;
    const lines = tejidos.slice(0, 40).map(
      (t: any) => `• ${t.proveedor ?? "?"} — ${t.serie ?? "?"} — ${t.color ?? "?"}: ${n(t.precio)} €/m`,
    );
    return `Precio tejidos ${modelo}:\n${lines.join("\n")}`;
  }

  if (includesAny(s, ["precio forro", "precio de forro", "precio forros", "precio de forros"])) {
    const forros = escandallo?.forros ?? [];
    if (!forros.length) return `No tengo forros en el escandallo del ${modelo}.`;
    const lines = forros.slice(0, 40).map(
      (f: any) => `• ${f.proveedor ?? "?"} — ${f.serie ?? "?"} — ${f.color ?? "?"}: ${n(f.precio)} €/m`,
    );
    return `Precio forros ${modelo}:\n${lines.join("\n")}`;
  }

  if (s.includes("tejido")) {
    const tejidos = escandallo?.tejidos ?? [];
    if (!tejidos.length) return `No tengo tejidos en el escandallo del ${modelo}.`;
    const lines = tejidos.slice(0, 40).map(
      (t: any) =>
        `• ${t.proveedor ?? "?"} — ${t.serie ?? "?"} — ${t.color ?? "?"} (${n(t.consumoProduccion)} m, ${n(t.precio)} €/m)`,
    );
    return `Tejidos ${modelo}:\n${lines.join("\n")}`;
  }

  if (s.includes("forro")) {
    const forros = escandallo?.forros ?? [];
    if (!forros.length) return `No tengo forros en el escandallo del ${modelo}.`;
    const lines = forros.slice(0, 40).map(
      (f: any) =>
        `• ${f.proveedor ?? "?"} — ${f.serie ?? "?"} — ${f.color ?? "?"} (${n(f.consumoProduccion)} m, ${n(f.precio)} €/m)`,
    );
    return `Forros ${modelo}:\n${lines.join("\n")}`;
  }

  if (s.includes("consumo") && (s.includes("tejid") || s.includes("forro"))) {
    const tejidos = escandallo?.tejidos ?? [];
    const forros = escandallo?.forros ?? [];
    if (!tejidos.length && !forros.length) return `No tengo consumos de tejidos/forros para ${modelo}.`;

    if (s.includes("tejid")) {
      if (!tejidos.length) return `No tengo tejidos en el escandallo del ${modelo}.`;
      const hit = findTejidoMatch(tejidos, message);
      if (!hit) {
        const all = tejidos
          .slice(0, 10)
          .map((t: any) => `• ${buildTejidoLabel(t)} (${n(t.consumoProduccion)} m)`);
        return `Tengo varios tejidos en ${modelo}. Dime proveedor/serie o elige:\n${all.join("\n")}`;
      }
      return `Consumo tejido ${modelo}: ${buildTejidoLabel(hit)} — ${n(hit.consumoProduccion)} m`;
    }

    if (s.includes("forro")) {
      if (!forros.length) return `No tengo forros en el escandallo del ${modelo}.`;
      const hit = findTejidoMatch(forros, message);
      if (!hit) {
        const all = forros
          .slice(0, 10)
          .map((f: any) => `• ${buildTejidoLabel(f)} (${n(f.consumoProduccion)} m)`);
        return `Tengo varios forros en ${modelo}. Dime proveedor/serie o elige:\n${all.join("\n")}`;
      }
      return `Consumo forro ${modelo}: ${buildTejidoLabel(hit)} — ${n(hit.consumoProduccion)} m`;
    }
  }

  if (s.includes("accesor")) {
    const acc = escandallo?.accesorios ?? [];
    if (!acc.length) return `No tengo accesorios en el escandallo del ${modelo}.`;

    const tokens = extractAccessoryTokens(message);
    if (tokens.length) {
      const matches = findAccessoryMatches(acc, message);
      if (!matches.length) {
        return `No encuentro accesorios que coincidan con "${tokens.join(" ")}" en ${modelo}. ¿Quieres la lista completa?`;
      }
      const wantsCount =
        includesAny(s, ["cuantas", "cuántas", "cuantos", "cuántos", "unidades", "cantidad", "cuenta"]) ||
        s.includes("uds") ||
        s.includes("ud");
      const wantsMedida =
        includesAny(s, ["longitud", "medida", "tamaño", "tamano", "ancho", "largo", "alto", "diametro", "diámetro"]);
      const wantsPrice = includesAny(s, ["precio", "coste", "costo", "€", "eur"]);
      const lines = matches.slice(0, 60).map((a: any) => {
        const qty = a.cantidad != null ? `${n(a.cantidad)} ${a.unidad ?? ""}`.trim() : "?";
        const medida = a.medida ? `, medida ${a.medida}` : "";
        const prov = a.proveedor ?? "?";
        const color = a.color ?? "?";
        const pu = a.precioUnidad != null ? formatMoneyEUR(a.precioUnidad) : null;
        const total = a.coste != null ? formatMoneyEUR(a.coste) : null;
        if (wantsCount && !wantsMedida) return `• ${buildAccesorioLabel(a)}: ${qty}`;
        if (wantsMedida) return `• ${buildAccesorioLabel(a)}${medida} (${qty})`;
        if (wantsPrice) {
          const parts = [pu ? `precio ${pu}` : null, total ? `coste ${total}` : null].filter(Boolean);
          return `• ${buildAccesorioLabel(a)}${medida} (${qty})${parts.length ? ` — ${parts.join(", ")}` : ""}`;
        }
        return `• ${buildAccesorioLabel(a)} — ${prov} — ${color}${medida} (${qty})`;
      });
      return `Accesorios ${modelo} (${tokens.join(" ")}):\n${lines.join("\n")}`;
    }

    const lines = acc.slice(0, 60).map(
      (a: any) =>
        `• ${buildAccesorioLabel(a)} — ${a.proveedor ?? "?"} — ${a.color ?? "?"} (${n(a.cantidad)} ${a.unidad ?? ""})`,
    );
    return `Accesorios ${modelo}:\n${lines.join("\n")}`;
  }

  if (includesAny(s, ACCESSORY_HINTS)) {
    const acc = escandallo?.accesorios ?? [];
    if (!acc.length) return `No tengo accesorios en el escandallo del ${modelo}.`;

    const tokens = extractAccessoryTokens(message);
    const matches = findAccessoryMatches(acc, message);
    if (!matches.length) {
      const q = tokens.length ? tokens.join(" ") : "ese término";
      return `No encuentro accesorios que coincidan con "${q}" en ${modelo}. ¿Quieres la lista completa?`;
    }

    const wantsCount =
      includesAny(s, ["cuantas", "cuántas", "cuantos", "cuántos", "unidades", "cantidad", "cuenta"]) ||
      s.includes("uds") ||
      s.includes("ud");
    const wantsMedida =
      includesAny(s, ["longitud", "medida", "tamaño", "tamano", "ancho", "largo", "alto", "diametro", "diámetro"]);
    const wantsPrice = includesAny(s, ["precio", "coste", "costo", "€", "eur"]);
    const lines = matches.slice(0, 60).map((a: any) => {
      const qty = a.cantidad != null ? `${n(a.cantidad)} ${a.unidad ?? ""}`.trim() : "?";
      const medida = a.medida ? `, medida ${a.medida}` : "";
      const prov = a.proveedor ?? "?";
      const color = a.color ?? "?";
      const pu = a.precioUnidad != null ? formatMoneyEUR(a.precioUnidad) : null;
      const total = a.coste != null ? formatMoneyEUR(a.coste) : null;
      if (wantsCount && !wantsMedida) return `• ${buildAccesorioLabel(a)}: ${qty}`;
      if (wantsMedida) return `• ${buildAccesorioLabel(a)}${medida} (${qty})`;
      if (wantsPrice) {
        const parts = [pu ? `precio ${pu}` : null, total ? `coste ${total}` : null].filter(Boolean);
        return `• ${buildAccesorioLabel(a)}${medida} (${qty})${parts.length ? ` — ${parts.join(", ")}` : ""}`;
      }
      return `• ${buildAccesorioLabel(a)} — ${prov} — ${color}${medida} (${qty})`;
    });
    const q = tokens.length ? ` (${tokens.join(" ")})` : "";
    return `Accesorios ${modelo}${q}:\n${lines.join("\n")}`;
  }

  if (includesAny(s, ["metros", "m "]) && s.includes("tejid")) {
    const tejidos = escandallo?.tejidos ?? [];
    if (!tejidos.length) return `No tengo tejidos en el escandallo del ${modelo}.`;

    const hit = findTejidoMatch(tejidos, message);
    if (!hit) return `Tengo tejidos en ${modelo}, pero no identifico cuál. Dime proveedor/serie.\nEj: "metros del tejido PAWAN"`;

    const metros = n(hit.consumoProduccion);
    return `Metros necesarios (${modelo}) — ${hit.proveedor ?? "?"} ${hit.serie ?? ""} ${hit.color ?? ""}: ${metros} m`;
  }

  if (includesAny(s, ["control de calidad", "calidad", "qc", "medidas"])) {
    const last = controlCalidadPack?.pedidos?.[0] ?? null;
    const payload = safeJsonPreview(last?.controlCalidad);
    if (!payload) return `No tengo control de calidad registrado para ${modelo}.`;
    return `Control de calidad ${modelo}${last?.numeroPedido ? ` (pedido ${last.numeroPedido})` : ""}: ${payload}`;
  }

  if (includesAny(s, ["preparacion", "preparación", "perchas", "bolsas", "etiquetas"])) {
    const last = preparacionAlmacenPack?.pedidos?.[0] ?? null;
    const payload = safeJsonPreview(last?.preparacionAlmacen);
    if (!payload) return `No tengo preparación de almacén registrada para ${modelo}.`;
    return `Preparación almacén ${modelo}${last?.numeroPedido ? ` (pedido ${last.numeroPedido})` : ""}: ${payload}`;
  }

  if (s.includes("observ") || s.includes("coment")) {
    const obsPedido = pedido?.observaciones ?? null;
    const obsEsc = escandallo?.observaciones ?? null;

    const parts: string[] = [];
    if (obsEsc) parts.push(`• Escandallo: ${String(obsEsc)}`);
    if (obsPedido) parts.push(`• Pedido: ${String(obsPedido)}`);

    const comentarios = obsPack?.pedidos?.[0]?.comentarios ?? pedido?.comentarios ?? [];
    if (Array.isArray(comentarios) && comentarios.length) {
      const last = comentarios.slice(-3);
      parts.push(`• Comentarios (últimos):`);
      for (const c of last) parts.push(`  - ${c.autor ?? "?"}: ${c.texto ?? ""}`);
    }

    if (parts.length) return `Observaciones ${modelo}:\n${parts.join("\n")}`;
    return `No tengo observaciones/comentarios registrados para ${modelo}.`;
  }

  return `Tengo el pack del ${modelo}. Prueba con:
• "corte ${modelo}"
• "entrega ${modelo}"
• "pendiente ${modelo}"
• "por talla ${modelo}"
• "tejidos ${modelo}"
• "coste escandallo ${modelo}"
• "control de calidad ${modelo}"
• "preparación almacén ${modelo}"
• "observaciones ${modelo}"`;
}

export async function runTool(ctx: ToolContext, call: ToolCall) {
  if (call.tool === "queryMaestroGlobal") {
    return queryMaestroGlobal({ empresaId: ctx.empresaId, message: call.args.message });
  }
  if (call.tool === "queryFichaGlobal") {
    return queryFichaGlobal({ empresaId: ctx.empresaId, message: call.args.message });
  }
  if (call.tool === "searchEmpresaGlobal") {
    return searchEmpresaGlobal({ empresaId: ctx.empresaId, query: call.args.query });
  }
  if (call.tool === "getEmpresaStats") {
    return getEmpresaStats({ empresaId: ctx.empresaId });
  }
  if (call.tool === "searchLegacyFiles") {
    // ✅ Solo se permite en la empresa "legacy"
    if (ctx.empresaSlug !== "legacy") {
      return { ok: false, error: "Legacy solo disponible en empresa legacy" } satisfies LegacySearchResult;
    }
    return searchLegacyFiles({ query: call.args.query });
  }

  return null;
  
}


export async function runToolIfNeeded(message: string, ctx: ToolContext): Promise<ToolResult> {
  // 0) Conversación rápida (no DB)
  const st = isSmallTalk(message);
  if (st) {
    const answer = smallTalkAnswer(st.kind);
    return { tool: null, call: null, data: null, answer };
  }

  // 0.5) Stats globales (ANTES de intentar resolver por modelo/pedido)
  const s = normalize(message);
  const wantsStats =
    includesAny(s, ["stats", "estad", "resumen global", "global", "actividad", "top talleres", "talleres"]) ||
    (includesAny(s, ["cuantos", "cuántos"]) &&
      (s.includes("pedidos") || s.includes("escandallos") || s.includes("articulos") || s.includes("comentarios")));

  if (wantsStats) {
    const callS: ToolCall = { tool: "getEmpresaStats", args: {} };
    const dataS = (await runTool(ctx, callS)) as EmpresaStatsResult;
    return { tool: callS.tool, call: callS, data: dataS, answer: formatEmpresaStats(message, dataS) };
  }

  // 0.7) LEGACY: búsqueda de archivos por nombre
if (ctx.empresaSlug === "legacy" && looksLikeLegacySearch(message)) {
    const s2 = normalize(message);
    const query = s2.startsWith("legacy ")
      ? message.trim().slice(6).trim() // quita "legacy "
      : message;

    const callL: ToolCall = { tool: "searchLegacyFiles", args: { query } };

    const dataL = (await runTool(ctx, callL)) as LegacySearchResult;
    const ansL = answerFromLegacySearch(dataL);
    if (ansL) return { tool: callL.tool, call: callL, data: dataL, answer: ansL };
  }


  // 0.8) MAESTROS (clientes/temporadas/subfamilias)
  // ⚠️ SOLO si NO parece una pregunta sobre MODELO
  if (!hasModeloHint(message)) {
    const callM: ToolCall = { tool: "queryMaestroGlobal", args: { message } };
    const dataM = (await runTool(ctx, callM)) as MaestroQueryResult;
    const ansM = answerFromMaestro(message, dataM);
    if (ansM) return { tool: callM.tool, call: callM, data: dataM, answer: ansM };
  }


  // 1) Intentamos “ficha global” (modelo/pedido/escandallo)
  const call1: ToolCall = { tool: "queryFichaGlobal", args: { message } };
  const data1 = (await runTool(ctx, call1)) as QueryGlobalResult;
  const answer1 = answerFromGlobal(message, data1);

  if (answer1) return { tool: call1.tool, call: call1, data: data1, answer: answer1 };

  // 2) Si no hay match, hacemos búsqueda global por empresa
  const call2: ToolCall = { tool: "searchEmpresaGlobal", args: { query: message } };
  const data2 = (await runTool(ctx, call2)) as SearchEmpresaResult;
  const answer2 = answerFromSearch(data2);

  if (answer2) return { tool: call2.tool, call: call2, data: data2, answer: answer2 };

  // 3) Último fallback
  return {
    tool: null,
    call: null,
    data: null,
    answer: `No encuentro nada con eso. Pásame un modelo (ej: ACM-MDL-1001) o nº de pedido, o dime qué texto buscas (proveedor, taller, observación…).`,
  };
}
