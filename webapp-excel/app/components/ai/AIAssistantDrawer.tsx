// components/ai/AIAssistantDrawer.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AIAction, AIMessage } from "./useAIAssistant";

type AssistantAPI = {
  open: boolean;
  toggle: () => void;
  messages: AIMessage[];
  loading: boolean;
  sendMessage: (
    message: string,
    context: Record<string, any>,
    empresa: string,
  ) => Promise<void>;
  addLocalMessage: (msg: Omit<AIMessage, "id">) => void;
};

type Props = {
  empresa: string;
  assistant: AssistantAPI;
  rightShiftPx?: number;
};

function normalizeConfirmText(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // quita acentos (sí -> si)
}

type ConfirmCmd =
  | { type: "confirm" }
  | { type: "open"; target: string }
  | null;

/**
 * Interpreta confirmaciones y comandos de apertura:
 * - "sí / vale / ok / dale / ábrelo" => confirm (abre el primary)
 * - "abre pedido / abre almacén / abre calidad / abre observaciones" => open target
 */
function parseConfirmCommand(raw: string): ConfirmCmd {
  const s = normalizeConfirmText(raw);

  // Confirmación simple (sin especificar destino)
  if (
    s === "si" ||
    s === "vale" ||
    s === "ok" ||
    s === "dale" ||
    s === "abrelo" ||
    s === "abreme"
  ) {
    return { type: "confirm" };
  }

  // Variantes comunes explícitas
  if (s.includes("abrir ficha")) return { type: "open", target: "ficha" };

  // Comandos de abrir algo concreto
  if (s.startsWith("abre ")) {
    const target = s.replace(/^abre\s+/, "").trim(); // "pedido", "almacen", ...
    if (target) return { type: "open", target };
  }

  return null;
}

function pickPrimaryAction(actions: AIAction[]) {
  return (
    actions.find((a) => a.label.toLowerCase().includes("abrir ficha")) ??
    actions[0]
  );
}

function matchActionByTarget(actions: AIAction[], target: string): AIAction | undefined {
  const t = normalizeConfirmText(target);

  // Match flexible por label
  const byLabel = actions.find((a) => normalizeConfirmText(a.label).includes(t));
  if (byLabel) return byLabel;

  // Alias típicos por si el usuario escribe algo distinto al label exacto
  if (t === "calidad" || t === "control" || t === "control de calidad") {
    return (
      actions.find((a) => normalizeConfirmText(a.label).includes("calidad")) ??
      actions.find((a) => normalizeConfirmText(a.href).includes("/control"))
    );
  }

  if (t === "almacen" || t === "almacén") {
    return (
      actions.find((a) => normalizeConfirmText(a.label).includes("almacen")) ??
      actions.find((a) => normalizeConfirmText(a.href).includes("/almacen"))
    );
  }

  if (t === "pedido" || t === "pedidos") {
    return (
      actions.find((a) => normalizeConfirmText(a.label).includes("pedido")) ??
      actions.find((a) => normalizeConfirmText(a.href).includes("/pedido"))
    );
  }

  if (t === "observaciones" || t === "obs") {
    return (
      actions.find((a) => normalizeConfirmText(a.label).includes("observaciones")) ??
      actions.find((a) => normalizeConfirmText(a.href).includes("/observaciones"))
    );
  }

  if (t === "ficha") {
    return actions.find((a) => normalizeConfirmText(a.label).includes("abrir ficha"));
  }

  return undefined;
}

type TallaRow = {
  talla: string;
  pedido: string;
  corte: string;
  entrega: string;
  adelantos: string;
};

type TotalRow = { label: string; value: string };
type SimpleRow = { left: string; right: string | null };

function sanitizeDemoContent(input: string) {
  const isDemo = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true";
  if (!isDemo || !input) return input;

  return input
    .replace(/grupo\s*jbp/gi, "ACME Textiles")
    .replace(/\bjbp\b/gi, "ACME")
    .replace(/\b\d{4}[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001")
    .replace(/\b\d{2}[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001")
    .replace(/\b[A-Z]{2}\d{4}\b/g, "ACM-MDL-1001");
}

function parseTotalsBlock(lines: string[]) {
  const idx = lines.findIndex((l) => l.toLowerCase().startsWith("totales "));
  if (idx === -1) return null;

  const rows: TotalRow[] = [];
  let endIdx = idx + 1;
  const rowRe = /^•\s*([^:]+)\s*:\s*(.+)$/;

  for (let i = idx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith("•")) {
      endIdx = i;
      break;
    }
    const m = raw.match(rowRe);
    if (!m) {
      endIdx = i;
      break;
    }
    rows.push({ label: m[1].trim(), value: m[2].trim() });
    endIdx = i + 1;
  }

  if (!rows.length) return null;
  return { idx, endIdx, header: lines[idx], rows };
}

function parseSimpleListBlock(lines: string[], headerPrefix: string) {
  const idx = lines.findIndex((l) => l.toLowerCase().startsWith(headerPrefix));
  if (idx === -1) return null;

  const rows: SimpleRow[] = [];
  let endIdx = idx + 1;
  const rowRe = /^•\s*(.+)$/;

  for (let i = idx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith("•")) {
      endIdx = i;
      break;
    }
    const m = raw.match(rowRe);
    if (!m) {
      endIdx = i;
      break;
    }
    const txt = m[1].trim();
    const split = txt.split("—").map((x) => x.trim()).filter(Boolean);
    rows.push({ left: split[0] ?? txt, right: split[1] ?? null });
    endIdx = i + 1;
  }

  if (!rows.length) return null;
  return { idx, endIdx, header: lines[idx], rows };
}

function parseObservacionesBlock(lines: string[]) {
  const idx = lines.findIndex((l) => l.toLowerCase().startsWith("observaciones "));
  if (idx === -1) return null;

  const rows: SimpleRow[] = [];
  let endIdx = idx + 1;
  const rowRe = /^•\s*(.+)$/;

  for (let i = idx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith("•")) {
      endIdx = i;
      break;
    }
    const m = raw.match(rowRe);
    if (!m) {
      endIdx = i;
      break;
    }
    rows.push({ left: m[1].trim(), right: null });
    endIdx = i + 1;
  }

  if (!rows.length) return null;
  return { idx, endIdx, header: lines[idx], rows };
}

function renderMessageContent(content: string) {
  const safeContent = sanitizeDemoContent(content);
  const lines = safeContent.split("\n");
  const porIdx = lines.findIndex((l) => l.toLowerCase().startsWith("por talla"));
  if (porIdx !== -1) {
    const header = lines[porIdx];
    const rows: TallaRow[] = [];
    let endIdx = porIdx + 1;
    const rowRe =
      /^•\s*([^:]+)\s*:\s*P\s*([0-9.,]+)\s*\|\s*C\s*([0-9.,]+)\s*\|\s*E\s*([0-9.,]+)\s*\|\s*A\s*([0-9.,]+)\s*$/i;

    for (let i = porIdx + 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw.startsWith("•")) {
        endIdx = i;
        break;
      }
      const m = raw.match(rowRe);
      if (!m) {
        endIdx = i;
        break;
      }
      rows.push({
        talla: m[1].trim(),
        pedido: m[2],
        corte: m[3],
        entrega: m[4],
        adelantos: m[5],
      });
      endIdx = i + 1;
    }

    if (rows.length >= 2) {
      const beforeText = lines.slice(0, porIdx).join("\n").trim();
      const afterText = lines.slice(endIdx).join("\n").trim();

      return (
        <div className="space-y-2">
          {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}

          <div className="text-emerald-100 font-medium">{header}</div>
          <div className="overflow-hidden rounded-md border border-emerald-200/20">
            <div className="grid grid-cols-5 text-[11px] bg-emerald-900/40 text-emerald-100/90">
              <div className="px-2 py-1">Talla</div>
              <div className="px-2 py-1 text-right">Pedido</div>
              <div className="px-2 py-1 text-right">Corte</div>
              <div className="px-2 py-1 text-right">Entrega</div>
              <div className="px-2 py-1 text-right">Adelantos</div>
            </div>
            <div className="divide-y divide-emerald-200/10 text-[11px]">
              {rows.map((r) => (
                <div key={r.talla} className="grid grid-cols-5">
                  <div className="px-2 py-1">{r.talla}</div>
                  <div className="px-2 py-1 text-right">{r.pedido}</div>
                  <div className="px-2 py-1 text-right">{r.corte}</div>
                  <div className="px-2 py-1 text-right">{r.entrega}</div>
                  <div className="px-2 py-1 text-right">{r.adelantos}</div>
                </div>
              ))}
            </div>
          </div>

          {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
        </div>
      );
    }
  }

  const totals = parseTotalsBlock(lines);
  if (totals) {
    const beforeText = lines.slice(0, totals.idx).join("\n").trim();
    const afterText = lines.slice(totals.endIdx).join("\n").trim();

    return (
      <div className="space-y-2">
        {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}
        <div className="text-emerald-100 font-medium">{totals.header}</div>
        <div className="overflow-hidden rounded-md border border-emerald-200/20">
          <div className="divide-y divide-emerald-200/10 text-[11px]">
            {totals.rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-2 py-1">
                <div>{r.label}</div>
                <div className="text-right tabular-nums">{r.value}</div>
              </div>
            ))}
          </div>
        </div>
        {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
      </div>
    );
  }

  const tejidos = parseSimpleListBlock(lines, "tejidos ");
  if (tejidos) {
    const beforeText = lines.slice(0, tejidos.idx).join("\n").trim();
    const afterText = lines.slice(tejidos.endIdx).join("\n").trim();

    return (
      <div className="space-y-2">
        {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}
        <div className="text-emerald-100 font-medium">{tejidos.header}</div>
        <div className="grid gap-1 text-[11px]">
          {tejidos.rows.map((r, i) => (
            <div key={`${r.left}-${i}`} className="rounded-md border border-emerald-200/15 px-2 py-1">
              <div className="text-emerald-100/90">{r.left}</div>
              {r.right ? <div className="text-emerald-100/70">{r.right}</div> : null}
            </div>
          ))}
        </div>
        {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
      </div>
    );
  }

  const forros = parseSimpleListBlock(lines, "forros ");
  if (forros) {
    const beforeText = lines.slice(0, forros.idx).join("\n").trim();
    const afterText = lines.slice(forros.endIdx).join("\n").trim();

    return (
      <div className="space-y-2">
        {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}
        <div className="text-emerald-100 font-medium">{forros.header}</div>
        <div className="grid gap-1 text-[11px]">
          {forros.rows.map((r, i) => (
            <div key={`${r.left}-${i}`} className="rounded-md border border-emerald-200/15 px-2 py-1">
              <div className="text-emerald-100/90">{r.left}</div>
              {r.right ? <div className="text-emerald-100/70">{r.right}</div> : null}
            </div>
          ))}
        </div>
        {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
      </div>
    );
  }

  const acc = parseSimpleListBlock(lines, "accesorios ");
  if (acc) {
    const beforeText = lines.slice(0, acc.idx).join("\n").trim();
    const afterText = lines.slice(acc.endIdx).join("\n").trim();

    return (
      <div className="space-y-2">
        {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}
        <div className="text-emerald-100 font-medium">{acc.header}</div>
        <div className="grid gap-1 text-[11px]">
          {acc.rows.map((r, i) => (
            <div key={`${r.left}-${i}`} className="rounded-md border border-emerald-200/15 px-2 py-1">
              <div className="text-emerald-100/90">{r.left}</div>
              {r.right ? <div className="text-emerald-100/70">{r.right}</div> : null}
            </div>
          ))}
        </div>
        {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
      </div>
    );
  }

  const obs = parseObservacionesBlock(lines);
  if (obs) {
    const beforeText = lines.slice(0, obs.idx).join("\n").trim();
    const afterText = lines.slice(obs.endIdx).join("\n").trim();

    return (
      <div className="space-y-2">
        {beforeText ? <div className="whitespace-pre-line">{beforeText}</div> : null}
        <div className="text-emerald-100 font-medium">{obs.header}</div>
        <div className="grid gap-1 text-[11px]">
          {obs.rows.map((r, i) => (
            <div key={`${r.left}-${i}`} className="rounded-md border border-emerald-200/15 px-2 py-1">
              {r.left}
            </div>
          ))}
        </div>
        {afterText ? <div className="whitespace-pre-line">{afterText}</div> : null}
      </div>
    );
  }

  return <div className="whitespace-pre-line">{safeContent}</div>;
}

export default function AIAssistantDrawer({
  empresa,
  assistant,
  rightShiftPx = 0,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [input, setInput] = useState("");

  const { open, toggle, messages, loading, sendMessage, addLocalMessage } =
    assistant;

  const context = useMemo(() => ({ path: pathname }), [pathname]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const pendingRef = useRef<{
    messageId: string;
    actions: AIAction[];
    interactionId?: number;
    answer: string;
  } | null>(null);

  const confirmedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, messages.length, loading]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (messages.length > 0) return;
    const isDemo = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true";
    const sampleModel = isDemo ? "ACM-MDL-1001" : "ACM-MDL-1001";

    addLocalMessage({
      role: "assistant",
      content:
        `Hola! Soy el asistente de la plataforma demo 👋\n` +
        `Estoy en construcción y aún estoy aprendiendo, pero con tus preguntas puedo mejorar para ayudarte mejor.\n\n` +
        `Puedes probar:\n` +
        `• corte ${sampleModel}\n` +
        `• por talla ${sampleModel}\n` +
        `• control de calidad ${sampleModel}\n` +
        `• preparación almacén ${sampleModel}\n` +
        `• observaciones ${sampleModel}\n` +
        `• stats / top talleres / últimos comentarios\n\n` +
        `Dime qué necesitas y te lo saco 🙂`,
    });
  }, [open, messages.length, addLocalMessage]);

  const canSend = input.trim().length > 0 && !loading;

  async function logActionClick(
    interactionId: number | undefined,
    action: AIAction,
  ) {
    if (!interactionId) return;
    try {
      await fetch(`/${empresa}/api/ai/action-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId,
          actionClicked: action.label,
          actionHref: action.href,
          actionPath: pathname,
        }),
      });
    } catch {}
  }

  async function openAction(action: AIAction, interactionId?: number) {
    await logActionClick(interactionId, action);
    router.push(action.href);
  }

  async function confirmPendingOpen(cmd?: Exclude<ConfirmCmd, null>) {
    const pending = pendingRef.current;
    if (!pending?.actions?.length) return;

    let chosen: AIAction | undefined;

    if (cmd?.type === "open") {
      chosen = matchActionByTarget(pending.actions, cmd.target);
    }
    if (!chosen) chosen = pickPrimaryAction(pending.actions);

    confirmedIds.current.add(pending.messageId);
    pendingRef.current = null;

    await openAction(chosen, pending.interactionId);
  }

  async function doSend() {
    const text = input.trim();
    if (!text || loading) return;

    const cmd = pendingRef.current ? parseConfirmCommand(text) : null;
    if (pendingRef.current && cmd) {
      setInput("");
      await confirmPendingOpen(cmd);
      return;
    }

    setInput("");
    await sendMessage(text, context, empresa);
  }

  useEffect(() => {
    if (!open) return;
    const last = messages[messages.length - 1];
    if (!last) return;

    if (
      last.role === "assistant" &&
      last.actions?.length &&
      !confirmedIds.current.has(last.id)
    ) {
      pendingRef.current = {
        messageId: last.id,
        actions: last.actions,
        interactionId: last.interactionId,
        answer: last.content,
      };
    }
  }, [open, messages]);

  function renderActionsForMessage(m: AIMessage) {
    if (m.role !== "assistant") return null;
    if (!m.actions?.length) return null;

    const isConfirmed = confirmedIds.current.has(m.id);

    if (!isConfirmed) {
      const primary = pickPrimaryAction(m.actions);

      return (
        <div className="mt-2">
          <div className="text-[12px] text-emerald-100/90">
            ¿Quieres que te lo abra? (responde “sí” / “ábrelo”, o “abre
            pedido/almacén…”, o pulsa el botón)
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                confirmedIds.current.add(m.id);
                pendingRef.current = null;
                void openAction(primary, m.interactionId);
              }}
              className="px-2.5 py-1 text-[11px] rounded bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              title={primary.href}
            >
              {primary.label}
            </button>

            <button
              type="button"
              onClick={() => {
                confirmedIds.current.add(m.id);
                pendingRef.current = null;
              }}
              className="px-2.5 py-1 text-[11px] rounded bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Ver opciones
            </button>
          </div>
        </div>
      );
    }

    const primary = pickPrimaryAction(m.actions);

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {m.actions.map((a, idx) => {
          const isPrimary = a.href === primary.href && a.label === primary.label;

          return (
            <button
              key={`${a.href}-${idx}`}
              type="button"
              onClick={() => void openAction(a, m.interactionId)}
              className={
                isPrimary
                  ? "px-2.5 py-1 text-[11px] rounded bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                  : "px-2.5 py-1 text-[11px] rounded bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-800"
              }
              title={a.href}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (!open) return null;

  return (
    <div
      className="fixed top-[200px] bottom-6 w-[380px] z-[60]"
      style={{ right: 24 + rightShiftPx }}
    >
      <div className="h-full flex flex-col rounded-2xl bg-slate-900/80 backdrop-blur border border-slate-700/60 ring-1 ring-emerald-500/10 shadow-2xl overflow-hidden">
        <header className="px-4 py-2 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold">Asistente</h2>
          <button
            onClick={toggle}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Cerrar asistente"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`p-3 rounded-lg ${
                m.role === "user"
                  ? "bg-slate-800 text-slate-100"
                  : "bg-emerald-900/40 text-emerald-200"
              }`}
            >
              {renderMessageContent(m.content)}
              {renderActionsForMessage(m)}
            </div>
          ))}

          {loading ? (
            <div className="text-slate-500 text-xs">Pensando…</div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          className="p-3 border-t border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            void doSend();
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void doSend();
              }
            }}
            rows={2}
            placeholder="Pregúntame algo…"
            className="w-full resize-none rounded-md bg-slate-800 border border-slate-700 p-2 text-sm text-slate-100"
          />

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={!canSend}
              className="px-3 py-1.5 text-xs rounded bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
