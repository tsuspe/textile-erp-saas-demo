// app/components/realtime/useRealtime.ts
"use client";

import { getRealtimeSocket } from "@/lib/realtime-client";
import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export function useRealtime(enabled = true) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let s: Socket | null = null;
    let mounted = true;

    (async () => {
      try {
        s = await getRealtimeSocket();
        if (!mounted) return;

        setSocket(s);
        setConnected(s.connected);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);

        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);

        // cleanup handlers (NO desconectes el socket global)
        return () => {
          s?.off("connect", onConnect);
          s?.off("disconnect", onDisconnect);
        };
      } catch {
        // si falla, simplemente no hay realtime
        if (!mounted) return;
        setSocket(null);
        setConnected(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return { socket, connected };
}
