// app/(app)/account/chat/[threadId]/ui.tsx
"use client";

import { sendMessage } from "@/app/(app)/actions/chat";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { ChatMessageType } from "@prisma/client";
import { useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  threadId: string;
  authorId: string | null;
  body: string;
  type: ChatMessageType;
  createdAt: string | Date;
  author?: { name?: string | null; username?: string | null } | null;
};

export default function ChatThreadClient({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages ?? []);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    let alive = true;
    let off = () => {};

    (async () => {
      try {
        const socket = await getRealtimeSocket();

        const onConnect = () => {
          socket.emit("thread:join", { threadId });
          if (alive) setReady(true);
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

        off = () => {
          socket.off("connect", onConnect);
          socket.off("message_created", onNewMessage);
          try {
            socket.emit("thread:leave", { threadId });
          } catch {}
        };
      } catch {
        // sin realtime → chat sigue funcionando (solo sin live)
      }
    })();

    return () => {
      alive = false;
      off();
    };
  }, [threadId]);

  async function onSend() {
    const v = text.trim();
    if (!v) return;
    setText("");
    await sendMessage(threadId, v);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400 flex items-center justify-between">
        <span>{ready ? "En vivo" : "Conectando..."}</span>
        <span>{messages.length} mensajes</span>
      </div>

      <div className="p-4 space-y-3 max-h-[60vh] overflow-auto">
        {messages.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400 flex items-center justify-between gap-3">
              <span>
                {(m.author?.name ?? "—")} @{(m.author?.username ?? "—")}
              </span>
              <span className="text-[10px] text-slate-500">{m.type}</span>
            </div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-800 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe... (usa @todos o @username)"
          className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
        />
        <button
          onClick={onSend}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
