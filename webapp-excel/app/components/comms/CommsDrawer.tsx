// app/components/comms/CommsDrawer.tsx
"use client";

import { getOrCreateDmThreadByUsername } from "@/app/(app)/account/chat/actions";
import {
  ensureGlobalThread,
  getMyNotifications,
  getMyThreads,
  getThreadMessages,
  markAllNotificationsRead,
  sendMessage,
} from "@/app/(app)/actions/chat";
import { getRealtimeSocket } from "@/lib/realtime-client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useComms } from "./CommsProvider";

type Noti = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
};

type Thread = {
  id: string;
  type: string; // "GLOBAL" | "GROUP" | "DM"
  name: string | null;
  groupKey: string | null;
  updatedAt: string | Date;
  _count: { messages: number };
  dmAId?: string | null;
  dmBId?: string | null;
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

type UserHit = { id: string; username: string; name: string | null };

// Mentions "reservados" que NO deben convertirse en DM (se quedan como mention normal en canal)
const RESERVED_MENTIONS = new Set(["todos", "all", "here"]);

function parseDm(text: string) {
  const t = (text ?? "").trim();

  // DM rápido: "@user <mensaje>"
  // Nota: esto NO es "mención" estilo Slack dentro de una frase,
  // es un comando al inicio del mensaje para abrir/enviar DM.
  const m = t.match(/^@([a-zA-Z0-9_.-]{2,32})\s+(.*)$/);
  if (!m) return null;

  const username = (m[1] ?? "").trim();
  const body = (m[2] ?? "").trim();
  if (!username || !body) return null;

  // Si es un mention reservado tipo @todos, NO lo tratamos como DM
  if (RESERVED_MENTIONS.has(username.toLowerCase())) return null;

  return { username, body };
}

export function CommsDrawer() {
  const comms = useComms();

  // -------- Notifications state
  const [notis, setNotis] = useState<Noti[]>([]);
  const [loadingNotis, setLoadingNotis] = useState(false);

  async function loadNotis() {
    setLoadingNotis(true);
    try {
      const r = await getMyNotifications({ take: 25 });
      if (r?.ok) setNotis(r.items as any);
    } finally {
      setLoadingNotis(false);
    }
  }

  // -------- Chat state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // autocomplete @users
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [showHits, setShowHits] = useState(false);
  const [loadingHits, setLoadingHits] = useState(false);

  async function loadThreads() {
    setLoadingThreads(true);
    try {
      const r = await getMyThreads();
      if (r?.ok) setThreads(r.items as any);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    try {
      const r = await getThreadMessages(threadId, { take: 200 });
      if (r?.ok) setMessages(r.items as any);
    } finally {
      setLoadingMessages(false);
    }
  }

  // Cargar data cuando se abre
  useEffect(() => {
    if (!comms.open) return;
    if (comms.tab === "notifications") loadNotis();
    if (comms.tab === "chat") loadThreads();
  }, [comms.open, comms.tab]);

  // Scroll bottom cuando cambia el feed
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Realtime: unir thread seleccionado y recibir mensajes live
  useEffect(() => {
    if (!comms.open) return;
    if (comms.tab !== "chat") return;
    if (!comms.threadId) return;

    let alive = true;
    let cleanup = () => {};

    (async () => {
      try {
        const socket = await getRealtimeSocket();

        const onConnect = () => {
          socket.emit("thread:join", { threadId: comms.threadId });
        };

        const onNewMessage = (payload: any) => {
          if (!alive) return;
          const m = payload?.message as Msg | undefined;
          if (!m?.id) return;
          if (m.threadId !== comms.threadId) return;

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
            socket.emit("thread:leave", { threadId: comms.threadId });
          } catch {}
        };
      } catch {
        // sin realtime: funciona igual pero sin live
      }
    })();

    return () => {
      alive = false;
      cleanup();
    };
  }, [comms.open, comms.tab, comms.threadId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === comms.threadId) ?? null,
    [threads, comms.threadId],
  );

  const generalThread = useMemo(
    () => threads.find((t) => t.type === "GLOBAL") ?? null,
    [threads],
  );

  async function onSelectThread(id: string) {
    comms.setThreadId(id);
    await loadMessages(id);
  }

  // --- Autocomplete logic
  useEffect(() => {
    // solo cuando estás en tab chat y drawer abierto
    if (!comms.open || comms.tab !== "chat") return;

    const v = text;
    // buscamos "@algo" al final (o al inicio), sin espacios después
    const m = v.match(/(^|\s)@([a-zA-Z0-9_.-]{1,32})$/);
    if (!m) {
      setShowHits(false);
      setUserHits([]);
      return;
    }

    const q = m[2] ?? "";
    if (q.length < 1) {
      setShowHits(false);
      setUserHits([]);
      return;
    }

    let alive = true;
    const tmr = setTimeout(async () => {
      try {
        setLoadingHits(true);
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setUserHits((data?.users ?? []) as UserHit[]);
        setShowHits(true);
      } finally {
        if (alive) setLoadingHits(false);
      }
    }, 180);

    return () => {
      alive = false;
      clearTimeout(tmr);
    };
  }, [text, comms.open, comms.tab]);

  function applyUserHit(u: UserHit) {
    // sustituye el último "@algo" por "@username "
    const v = text;
    const next = v.replace(/(^|\s)@([a-zA-Z0-9_.-]{1,32})$/, `$1@${u.username} `);
    setText(next);
    setShowHits(false);
  }

  // --- helper: asegura join realtime (best-effort)
  async function joinThreadRealtime(threadId: string) {
    try {
      const socket = await getRealtimeSocket();
      socket.emit("thread:join", { threadId });
    } catch {}
  }

  // --- SEND logic
  async function onSend() {
    const raw = text.trim();
    if (!raw) return;

    // 0) Prioridad: si parece DM rápido "@user mensaje", SIEMPRE lo tratamos como DM
    // (da igual si estás en General o ya tienes un thread seleccionado).
    const dm = parseDm(raw);
    if (dm) {
      setText("");

      const { threadId } = await getOrCreateDmThreadByUsername(dm.username);

      // refresca threads (por si el DM no existía)
      await loadThreads();

      // selecciona y carga si no estabas ya en ese hilo
      if (comms.threadId !== threadId) {
        comms.setThreadId(threadId);
        await loadMessages(threadId);
        await joinThreadRealtime(threadId);
      } else {
        // ya estabas en ese DM/hilo
        await joinThreadRealtime(threadId);
      }

      await sendMessage(threadId, dm.body);

      try {
        await loadMessages(threadId);
      } catch {}
      return;
    }

    // 1) Si ya hay thread seleccionado -> envío normal ahí
    if (comms.threadId) {
      const threadId = comms.threadId;
      setText("");
      await sendMessage(threadId, raw);
      try {
        await loadMessages(threadId);
      } catch {}
      return;
    }

    // 2) Si NO hay thread seleccionado -> mandamos a General (y lo seleccionamos)
    setText("");

    let generalId = generalThread?.id;
    if (!generalId) {
      const ensured = await ensureGlobalThread();
      generalId = (ensured as any)?.threadId;
      await loadThreads();
    }

    if (generalId) {
      comms.setThreadId(generalId);
      await loadMessages(generalId);
      await joinThreadRealtime(generalId);

      await sendMessage(generalId, raw);
      try {
        await loadMessages(generalId);
      } catch {}
    }
  }

  const canSend = useMemo(() => {
    return text.trim().length > 0;
  }, [text]);

  // ---------- Drawer UI
  return (
    <div
      className={`fixed right-4 top-4 z-50 h-[calc(100vh-32px)] w-[420px] max-w-[calc(100vw-32px)]
      transition-all duration-200 ${comms.open ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"}`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <div className="text-xs text-slate-400">Comms</div>
            <div className="text-sm font-semibold text-slate-100">Notificaciones & Chat</div>
          </div>

          <button
            onClick={() => comms.closeDrawer()}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
          >
            Cerrar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800 p-3">
          <button
            onClick={() => comms.setTab("notifications")}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
              comms.tab === "notifications"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            Notificaciones
          </button>
          <button
            onClick={async () => {
              comms.setTab("chat");
              await loadThreads();
            }}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
              comms.tab === "chat"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            Chat
          </button>
        </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col">
        {comms.tab === "notifications" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-4 py-3 shrink-0 gap-2">
              <button
                onClick={async () => {
                  await markAllNotificationsRead();
                  await loadNotis();
                }}
                className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
              >
                Marcar todo leído
              </button>

              <div className="flex items-center gap-3">
                <Link
                  href="/account/notifications?new=1"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15"
                  onClick={() => comms.closeDrawer()}
                >
                  Nueva
                </Link>

                <Link
                  href="/account/notifications"
                  className="text-xs text-slate-300 underline underline-offset-4 hover:text-slate-100"
                  onClick={() => comms.closeDrawer()}
                >
                  Ver todas
                </Link>
              </div>
            </div>


            <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
              {loadingNotis ? (
                <div className="text-xs text-slate-400">Cargando…</div>
              ) : notis.length ? (
                <div className="space-y-2">
                  {notis.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href ?? "/account/notifications"}
                      className="block rounded-2xl border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-900/60"
                      onClick={() => comms.closeDrawer()}
                    >
                      <div className="text-xs text-slate-300">{n.title}</div>
                      {n.body ? (
                        <div className="mt-1 text-xs text-slate-400 line-clamp-2">{n.body}</div>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400">No hay notificaciones.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid flex-1 min-h-0 grid-cols-[160px_1fr] grid-rows-[1fr_auto] gap-0">
            {/* Thread list (fila 1, col 1) */}
            <div className="row-start-1 col-start-1 min-h-0 overflow-auto border-r border-slate-800 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Canales</div>

              {loadingThreads ? (
                <div className="text-xs text-slate-400">Cargando…</div>
              ) : (
                <div className="space-y-2">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelectThread(t.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                        comms.threadId === t.id
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="font-semibold">
                        {t.type === "GROUP"
                          ? `# ${t.name ?? t.groupKey ?? "Canal"}`
                          : t.type === "GLOBAL"
                          ? t.name ?? "General"
                          : t.type === "DM"
                          ? t.name ?? "Directo"
                          : t.name ?? "Hilo"}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {t.type}
                        {t.groupKey ? ` · ${t.groupKey}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <Link
                  href="/account/chat"
                  className="text-xs text-slate-300 underline underline-offset-4 hover:text-slate-100"
                >
                  Abrir chat completo
                </Link>
              </div>
            </div>

            {/* Thread panel (fila 1, col 2) */}
            <div className="row-start-1 col-start-2 flex min-h-0 flex-col">
              {/* Header del panel */}
              <div className="shrink-0 border-b border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-400">Chat</div>
                <div className="text-sm font-semibold text-slate-100">
                  {selectedThread?.name ?? "General / DM rápido"}
                </div>
                {!comms.threadId ? (
                  <div className="mt-1 text-xs text-slate-400">
                    Tip: escribe <b>@usuario mensaje</b> para DM, o escribe normal para enviar a <b>General</b>.
                  </div>
                ) : null}
              </div>

              {/* Body scrolleable */}
              <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
                {!comms.threadId ? (
                  <div className="text-xs text-slate-400">
                    No has seleccionado canal. Puedes enviar a General o abrir DM escribiendo <b>@username</b>.
                  </div>
                ) : loadingMessages ? (
                  <div className="text-xs text-slate-400">Cargando mensajes…</div>
                ) : (
                  <>
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
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
            </div>

            {/* Footer global (fila 2, ocupa 2 columnas) */}
            <div className="row-start-2 col-span-2 border-t border-slate-800 p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <div className="relative flex gap-2 min-w-0">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Escribe… (@todos o @username)"
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSend();
                    if (e.key === "Escape") setShowHits(false);
                  }}
                />
                <button
                  onClick={onSend}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
                  disabled={!canSend}
                >
                  Enviar
                </button>

                {showHits ? (
                  <div className="absolute bottom-[64px] left-0 w-[min(520px,calc(100%-92px))] rounded-2xl border border-slate-800 bg-slate-950/95 shadow-xl backdrop-blur">
                    <div className="border-b border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                      {loadingHits ? "Buscando usuarios…" : "Usuarios"}
                    </div>
                    <div className="max-h-56 overflow-auto p-2">
                      {userHits.length ? (
                        userHits.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => applyUserHit(u)}
                            className="w-full text-left rounded-xl px-3 py-2 hover:bg-slate-900/60"
                          >
                            <div className="text-xs text-slate-100 font-semibold">@{u.username}</div>
                            <div className="text-[11px] text-slate-400">{u.name ?? "—"}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-slate-400">Sin resultados.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        )}
      </div>

      </div>
      </div>
  );
}
