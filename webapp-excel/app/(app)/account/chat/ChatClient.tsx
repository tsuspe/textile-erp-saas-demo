// app/(app)/account/chat/ChatClient.tsx
"use client";

import {
    getMyThreads,
    getThreadMessages,
    sendMessage,
} from "@/app/(app)/actions/chat";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Thread = {
  id: string;
  type: string;
  name: string | null;
  groupKey: string | null;
  updatedAt: string | Date;
  _count: { messages: number };
};

type Msg = {
  id: string;
  threadId: string;
  authorId: string | null;
  body: string;
  type: string;
  createdAt: string | Date;
  author?: { name?: string | null; username?: string | null } | null;
};

export default function ChatClient({ initialThreadId }: { initialThreadId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedThread = useMemo(
    () => (threadId ? threads.find((t) => t.id === threadId) ?? null : null),
    [threads, threadId],
  );

  async function loadThreads() {
    setLoadingThreads(true);
    try {
      const r = await getMyThreads();
      if (r?.ok) setThreads(r.items as any);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadMessages(id: string) {
    setLoadingMessages(true);
    try {
      const r = await getThreadMessages(id, { take: 200 });
      if (r?.ok) setMessages(r.items as any);
    } finally {
      setLoadingMessages(false);
    }
  }

  // 1) al montar: carga threads y, si hay threadId, carga mensajes
  useEffect(() => {
    (async () => {
      await loadThreads();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) si viene thread en query (?thread=...), sincroniza
  useEffect(() => {
    const q = searchParams.get("thread");
    if (!q) return;
    if (q === threadId) return;

    setThreadId(q);
    loadMessages(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 3) cuando seleccionas hilo en UI
  async function onSelectThread(id: string) {
    setThreadId(id);
    setMessages([]);
    await loadMessages(id);
    router.replace(`/account/chat?thread=${encodeURIComponent(id)}`);
  }

  // 4) scroll bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 5) realtime: join/leave del hilo seleccionado + append mensajes live
  useEffect(() => {
    if (!threadId) return;

    let alive = true;
    let cleanup = () => {};

    (async () => {
      try {
        const socket = await getRealtimeSocket();

        const onConnect = () => {
          socket.emit("thread:join", { threadId });
        };

        const onNewMessage = (payload: any) => {
          if (!alive) return;
          const m = payload?.message as Msg | undefined;
          if (!m?.id) return;
          if (m.threadId !== threadId) return;

          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        };

        socket.on("connect", onConnect);
        socket.on("message_created", onNewMessage);

        if (socket.connected) onConnect();

        cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("message_created", onNewMessage);
          try {
            socket.emit("thread:leave", { threadId });
          } catch {}
        };
      } catch {
        // sin realtime: no pasa nada, funciona igual
      }
    })();

    return () => {
      alive = false;
      cleanup();
    };
  }, [threadId]);

  async function onSend() {
    const v = text.trim();
    if (!v || !threadId) return;

    setText("");
    await sendMessage(threadId, v);

    // fallback por si realtime falla
    try {
      await loadMessages(threadId);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <div className="text-xs text-slate-400">Chat</div>
        <div className="text-xl font-semibold text-slate-100">Canales y mensajes</div>
        <div className="mt-1 text-sm text-slate-400">
          Canales por grupo + directos (DM). Usa <b>@todos</b> y <b>@username</b> dentro de un canal.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* LISTA */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-100">Canales</div>

          {loadingThreads ? (
            <div className="text-sm text-slate-400">Cargando…</div>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelectThread(t.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    threadId === t.id
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/30 hover:bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-100">
                      {t.type === "GROUP" ? `# ${t.name ?? t.groupKey ?? "Grupo"}` : t.name ?? "Directo"}
                    </div>
                    <div className="text-xs text-slate-500">{t._count?.messages ?? 0} msgs</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.type}
                    {t.groupKey ? ` · ${t.groupKey}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PANEL */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
          <div className="border-b border-slate-800 px-5 py-4">
            <div className="text-xs text-slate-400">Conversación</div>
            <div className="text-lg font-semibold text-slate-100">
              {selectedThread?.name ?? (threadId ? "Hilo" : "Selecciona un canal")}
            </div>
          </div>

          <div className="h-[60vh] overflow-auto px-5 py-4 space-y-3">
            {!threadId ? (
              <div className="text-sm text-slate-400">Elige un canal a la izquierda.</div>
            ) : loadingMessages ? (
              <div className="text-sm text-slate-400">Cargando mensajes…</div>
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3">
                    <div className="text-xs text-slate-400">
                      {(m.author?.name ?? "—")} @{(m.author?.username ?? "—")}
                    </div>
                    <div className="mt-1 text-sm whitespace-pre-wrap text-slate-100">{m.body}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          <div className="border-t border-slate-800 p-4 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe… (@todos o @username)"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSend();
              }}
              disabled={!threadId}
            />
            <button
              onClick={onSend}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
              disabled={!threadId}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
