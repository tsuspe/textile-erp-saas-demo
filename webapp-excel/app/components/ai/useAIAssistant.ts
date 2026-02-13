// components/ai/useAIAssistant.ts
"use client";

import { useState } from "react";

export type AIAction = {
  label: string;
  href: string;
};

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  interactionId?: number;
};

/**
 * Next/Turbopack a veces no expone crypto.randomUUID() en el runtime del cliente.
 * Usamos fallback seguro para IDs de UI (no son IDs de DB).
 */
function makeId(): string {
  const c = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  // Fallback: suficientemente único para UI
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useAIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = () => setOpen((o) => !o);

  const addLocalMessage = (msg: Omit<AIMessage, "id">) => {
    setMessages((m) => [...m, { ...msg, id: makeId() }]);
  };

  const sendMessage = async (
    message: string,
    context: Record<string, any>,
    empresa: string,
  ) => {
    if (!message.trim()) return;

    const userMsg: AIMessage = { id: makeId(), role: "user", content: message };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`/${empresa}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }),
      });

      const data = await res.json();

      const aiMsg: AIMessage = {
        id: makeId(),
        role: "assistant",
        content: data.answer ?? "No he podido responder a eso.",
        actions: Array.isArray(data.actions) ? data.actions : undefined,
        interactionId: Number.isFinite(Number(data.interactionId))
          ? Number(data.interactionId)
          : undefined,
      };

      setMessages((m) => [...m, aiMsg]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: makeId(), role: "assistant", content: "Error hablando conmigo 😅" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return {
    open,
    toggle,
    messages,
    loading,
    sendMessage,
    addLocalMessage,
  };
}
