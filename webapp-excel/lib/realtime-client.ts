// lib/realtime-client.ts
"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

let tokenCache: { token: string; expiresAtMs: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now) return tokenCache.token;

  const r = await fetch("/api/realtime/token", { cache: "no-store" });
  if (!r.ok) throw new Error("NO_TOKEN");

  const data = await r.json();
  if (!data?.ok || !data?.token) throw new Error("NO_TOKEN");

  // el endpoint dura 2h → cacheamos 90 min para ir seguros
  tokenCache = { token: data.token, expiresAtMs: now + 90 * 60 * 1000 };
  return tokenCache.token;
}

function getRealtimeUrl(): string {
  const env = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (env) return env;

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export async function getRealtimeSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    const url = getRealtimeUrl();
    const token = await getToken();

    socket = io(url, {
      transports: ["websocket"],
      autoConnect: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 2000,
    });

    return socket;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}
