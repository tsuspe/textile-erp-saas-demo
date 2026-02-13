// app/(app)/[empresa]/api/ai/chat/route.ts
import { runToolIfNeeded } from "@/lib/ai/toolRunner";
import { isDemoMode } from "@/lib/demo-mode";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AIAction = { label: string; href: string };

function sanitizeDemoText(input: string): string {
  if (!input) return input;
  let out = input;

  // Empresa real -> demo
  out = out.replace(/grupo\s*jbp/gi, "ACME Textiles");
  out = out.replace(/\bjbp\b/gi, "ACME");

  // Códigos de modelo (p. ej. 1926VE0203, 26VE0203, VE0203) -> modelo demo
  out = out.replace(/\b\d{4}[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001");
  out = out.replace(/\b\d{2}[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001");
  out = out.replace(/\b[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001");

  // Correos/telefonos en texto libre -> placeholders demo
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "demo@example.com");
  out = out.replace(/\+?\d[\d\s().-]{7,}\d/g, "600 000 000");

  return out;
}

function buildActionsFromTool(empresa: string, toolRes: any): AIAction[] {
  // 1) Fichas (escandallo/pedido/almacén...)
  if (toolRes?.tool !== "queryFichaGlobal") return [];

  const global = toolRes?.data;
  if (!global?.ok) return [];

  const pack = global?.pack;
  if (!pack) return [];

  const esc = pack?.escandallo;
  if (esc?.id && esc?.clienteId && esc?.temporadaId) {
    const base = `/${empresa}/fichas/${esc.clienteId}/temporadas/${esc.temporadaId}/escandallos/${esc.id}`;

    return [
      { label: "Abrir ficha", href: base },
      { label: "Pedido", href: `${base}/pedido` },
      { label: "Almacén", href: `${base}/almacen` },
      { label: "Calidad", href: `${base}/control` },
      { label: "Observaciones", href: `${base}/observaciones` },
    ];
  }

  const art = pack?.articulo;
  if (art?.id) {
    return [{ label: "Abrir artículo", href: `/${empresa}/maestros/articulos/${art.id}` }];
  }

  return [];
}

function buildActionsFromMaestro(empresa: string, toolRes: any): AIAction[] {
  if (toolRes?.tool !== "queryMaestroGlobal") return [];
  const data = toolRes?.data;
  if (!data?.ok) return [];
  const m = data.maestro;
  if (!m?.id || !m?.type) return [];

  if (m.type === "CLIENTE") {
    return [{ label: "Abrir cliente", href: `/${empresa}/maestros/clientes/${m.id}` }];
  }
  if (m.type === "TEMPORADA") {
    return [{ label: "Abrir temporada", href: `/${empresa}/maestros/temporadas/${m.id}` }];
  }
  if (m.type === "SUBFAMILIA") {
    return [{ label: "Abrir subfamilia", href: `/${empresa}/maestros/subfamilias/${m.id}` }];
  }
  return [];
}

function buildActionsFromLegacySearch(empresa: string, toolRes: any): AIAction[] {
  if (toolRes?.tool !== "searchLegacyFiles") return [];
  const data = toolRes?.data;
  if (!data?.ok || !Array.isArray(data.hits) || !data.hits.length) return [];

  // legacy/page.tsx entiende:
  // - p: carpeta actual
  // - file: ruta relativa del archivo
  // Nota: "empresa" aquí suele ser "legacy"
  return data.hits.slice(0, 8).map((h: any, idx: number) => {
    const relPath: string = String(h.relPath ?? "").replace(/\\/g, "/");
    const dir = relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "";
    const qs = new URLSearchParams();
    if (dir) qs.set("p", dir);
    qs.set("file", relPath);
    qs.set("t", String(Date.now()));

    return {
      label: isDemoMode() ? `Abrir archivo demo ${idx + 1}` : `Abrir ${h.name ?? "archivo"}`,
      href: `/${empresa}/legacy?${qs.toString()}`,
    };
  });
}

const SYSTEM_PROMPT = `
Eres el asistente interno de una aplicación de gestión en una empresa fabricante de ropa.
Eres como el compañero de la mesa de al lado: claro, directo, práctico y simpático.
Tono: cercano y con un toque de humor ligero, sin perder eficiencia.

REGLAS IMPORTANTES:
- Nunca inventes datos.
- No hables de bases de datos ni de implementación técnica.
- Responde SIEMPRE en español.
- Responde corto y claro.
- Si falta información, pregunta 1 cosa concreta.
`.trim();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ empresa: string }> },
) {
  try {
    const { empresa } = await params;
    const body = await req.json();

    const message: string = (body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true },
    });
    if (!empresaRow) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    const empresaId = empresaRow.id;
    const context = body.context ?? {};

    // 1) Tools deterministas
    const toolRes = await runToolIfNeeded(message, { empresaId, empresaSlug: empresa });

    if (toolRes?.answer) {
      const answer = isDemoMode() ? sanitizeDemoText(String(toolRes.answer)) : toolRes.answer;
      const created = await prisma.aIInteraction.create({
        data: {
          empresaId,
          question: message,
          answer,
          toolUsed: toolRes.tool,
          success: true,
          pathname: context.path ?? null,
        },
        select: { id: true },
      });

      const actions = buildActionsFromTool(empresa, toolRes)
        .concat(buildActionsFromMaestro(empresa, toolRes))
        .concat(buildActionsFromLegacySearch(empresa, toolRes));

      return NextResponse.json({
        answer,
        actions,
        interactionId: created.id,
      });
    }

    // 2) Fallback LLM (solo para pedir aclaración)
    const finalPrompt = `
${SYSTEM_PROMPT}

Usuario: "${message}"

No has podido resolver con herramientas.
Haz UNA pregunta concreta para poder buscar el dato.
Responde en una sola frase.
`.trim();

    let answer = "";
    if (isDemoMode()) {
      answer =
        "Estoy en DEMO_MODE. Puedo ayudarte mejor si me indicas un codigo demo como ACM-MDL-1001 o NWD-MDL-3003.";
    } else {
      const aiRes = await fetch(`${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "phi3:mini",
          prompt: finalPrompt,
          stream: false,
          options: { temperature: 0.2 },
        }),
      });

      const aiRaw = await aiRes.json();
      answer =
        (aiRaw.response ?? "").trim() ||
        "Dime el código exacto (modelo/pedido/escandallo) y te lo saco.";
    }

    answer = isDemoMode() ? sanitizeDemoText(answer) : answer;

    const created = await prisma.aIInteraction.create({
      data: {
        empresaId,
        question: message,
        answer,
        toolUsed: null,
        success: false,
        pathname: context.path ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({ answer, interactionId: created.id });
  } catch (err) {
    console.error("AI chat error:", err);
    return NextResponse.json({ error: "Error en el chat IA" }, { status: 500 });
  }
}
