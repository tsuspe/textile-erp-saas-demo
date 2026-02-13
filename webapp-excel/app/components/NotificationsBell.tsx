// app/components/NotificationsBell.tsx
"use client";

import { getMyUnreadNotificationsCount } from "@/app/(app)/actions/chat";
import { useRealtime } from "@/app/components/realtime/useRealtime";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationsBell() {
  const [count, setCount] = useState<number>(0);

  // Puedes poner false si quieres apagar realtime por env
  const { socket } = useRealtime(true);

  async function refresh() {
    try {
      const r = await getMyUnreadNotificationsCount();
      if (r?.ok) setCount(r.count);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    // carga inicial
    refresh();
  }, []);

  useEffect(() => {
    if (!socket) return;

    // cuando llega una notificación, refrescamos contador (barato y robusto)
    const onCreated = () => refresh();

    socket.on("notification_created", onCreated);

    return () => {
      socket.off("notification_created", onCreated);
    };
  }, [socket]);

  return (
    <Link
      href="/account/notifications"
      className="relative inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-950/70"
      title="Notificaciones"
    >
      🔔
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
