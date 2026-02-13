//app/components/comms/CommsBellButton.tsx
"use client";

import { getMyUnreadNotificationsCount } from "@/app/(app)/actions/chat";
import { useRealtime } from "@/app/components/realtime/useRealtime";
import { useEffect, useState } from "react";
import { useComms } from "./CommsProvider";

export function CommsBellButton() {
  const [count, setCount] = useState(0);
  const { socket } = useRealtime(true);
  const comms = useComms();

  async function refresh() {
    try {
      const r = await getMyUnreadNotificationsCount();
      if (r?.ok) setCount(r.count);
    } catch {}
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onCreated = () => refresh();
    socket.on("notification_created", onCreated);
    return () => {
      socket.off("notification_created", onCreated);
    };
  }, [socket]);

  return (
    <button
      type="button"
      onClick={() => comms.toggleDrawer("notifications")}
      className="relative inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-950/70"
      title="Notificaciones y Chat"
    >
      🔔
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
