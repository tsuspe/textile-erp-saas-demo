import cookie from "cookie";
import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

/**
 * Rooms (GLOBAL):
 * - user:<userId>      → notificaciones privadas, contadores, alerts
 * - thread:<threadId>  → mensajes de chat en tiempo real
 * - all                → broadcast a todos (@todos, avisos generales)
 * - group:<groupKey>   → broadcast a un grupo (opcional)
 */

const PORT = Number(process.env.REALTIME_PORT || 3001);
const HOST = process.env.REALTIME_HOST || "0.0.0.0";

const REALTIME_JWT_SECRET = process.env.REALTIME_JWT_SECRET;
if (!REALTIME_JWT_SECRET) {
  console.error("❌ Falta REALTIME_JWT_SECRET en realtime/.env");
  process.exit(1);
}

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: process.env.REALTIME_CORS_ORIGIN?.split(",") || true,
    credentials: true,
  },
  path: "/socket.io",
});

function getTokenFromHandshake(socket) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) return String(token);

  const headerCookie = socket.handshake.headers.cookie || "";
  const parsed = cookie.parse(headerCookie);
  if (parsed.realtime_token) return parsed.realtime_token;

  return null;
}

io.use((socket, next) => {
  try {
    const token = getTokenFromHandshake(socket);
    if (!token) return next(new Error("UNAUTHORIZED"));

    const payload = jwt.verify(token, REALTIME_JWT_SECRET);

    const userId = payload?.sub ? String(payload.sub) : null;
    if (!userId) return next(new Error("UNAUTHORIZED"));

    socket.data.userId = userId;
    socket.data.username = payload?.username ?? null;

    // opcional: groups si los metes en el token más adelante
    const groups = Array.isArray(payload?.groups) ? payload.groups : [];
    socket.data.groups = groups;

    return next();
  } catch {
    return next(new Error("UNAUTHORIZED"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  socket.join(`user:${userId}`);
  socket.join("all");

  const groups = socket.data.groups || [];
  for (const g of groups) {
    if (typeof g === "string" && g.trim()) socket.join(`group:${g}`);
  }

  socket.emit("hello", { ok: true, userId });

  socket.on("thread:join", ({ threadId }) => {
    if (!threadId) return;
    socket.join(`thread:${threadId}`);
  });

  socket.on("thread:leave", ({ threadId }) => {
    if (!threadId) return;
    socket.leave(`thread:${threadId}`);
  });

  socket.on("group:join", ({ groupKey }) => {
    if (!groupKey) return;
    socket.join(`group:${groupKey}`);
  });

  socket.on("group:leave", ({ groupKey }) => {
    if (!groupKey) return;
    socket.leave(`group:${groupKey}`);
  });
});

/**
 * POST /internal/push
 * Header: Authorization: Bearer REALTIME_INTERNAL_TOKEN
 *
 * Body:
 *  { userId, event, payload }
 *  { threadId, event, payload }
 *  { broadcast: true, event, payload }
 *  { groupKey, event, payload }
 */
server.on("request", async (req, res) => {
  if (req.method !== "POST" || req.url !== "/internal/push") return;

  const auth = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.REALTIME_INTERNAL_TOKEN || ""}`;
  if (!process.env.REALTIME_INTERNAL_TOKEN || auth !== expected) {
    res.writeHead(401);
    res.end("unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const data = JSON.parse(body || "{}");
      const { userId, threadId, broadcast, groupKey, event, payload } = data;

      if (!event || (!userId && !threadId && !broadcast && !groupKey)) {
        res.writeHead(400);
        res.end("missing event or target");
        return;
      }

      if (userId) io.to(`user:${userId}`).emit(event, payload ?? {});
      if (threadId) io.to(`thread:${threadId}`).emit(event, payload ?? {});
      if (groupKey) io.to(`group:${groupKey}`).emit(event, payload ?? {});
      if (broadcast) io.to("all").emit(event, payload ?? {});

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end("bad json");
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🟢 Realtime server listening on http://${HOST}:${PORT}`);
});
