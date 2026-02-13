// app/(app)/actions/chat.ts
"use server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  pushBroadcast,
  pushToGroup,
  pushToThread,
  pushToUser,
} from "@/lib/realtime-push";
import { ChatMessageType, ChatThreadType, GroupKey, NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";


function requireUser(user?: SessionUser) {
  if (!user?.id) throw new Error("UNAUTHENTICATED");
  return user;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function preview(text: string, max = 140) {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 3)) + "...";
}

/**
 * Extrae mentions simples desde el body.
 * - @todos => mention ALL
 * - @username => mention user (por username)
 *
 * Nota: deliberadamente simple. Si luego quieres robustez (puntuación, emails, etc.) lo mejoramos.
 */
function parseMentions(text: string) {
  const all = /(^|\s)@todos(\s|$)/i.test(text);
  const usernames = new Set<string>();

  const re = /(^|\s)@([a-zA-Z0-9_\.]{2,32})(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const u = (m[2] ?? "").trim();
    if (!u) continue;
    if (u.toLowerCase() === "todos") continue;
    usernames.add(u);
  }

  return {
    all,
    usernames: Array.from(usernames),
  };
}

async function getUserIdsByUsernames(usernames: string[]) {
  const list = uniq(usernames).filter(Boolean);
  if (!list.length) return [];

  const users = await prisma.user.findMany({
    where: { username: { in: list } },
    select: { id: true, username: true, isActive: true },
  });

  // solo activos
  return users.filter((u) => u.isActive).map((u) => u.id);
}

/**
 * NOTIFICATIONS
 */
export async function getMyUnreadNotificationsCount() {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  const n = await prisma.notification.count({
    where: { userId: user.id, readAt: null, archivedAt: null },
  });

  return { ok: true as const, count: n };
}


export async function getMyNotifications(opts?: { take?: number }) {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  const take = Math.min(Math.max(opts?.take ?? 30, 1), 100);

  const rows = await prisma.notification.findMany({
    where: { userId: user.id,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      readAt: true,
      createdAt: true,
    },
  });

  return { ok: true as const, items: rows };
}

export async function markNotificationRead(id: string) {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });

  // 🔁 si tienes UI server-side (página) también se refresca
  revalidatePath("/account/notifications");

  return { ok: true as const };
}


export async function markAllNotificationsRead() {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });

  // 🔁 refresca página de notificaciones
  revalidatePath("/account/notifications");

  return { ok: true as const };
}

// ✅ Notificar a usuarios pertenecientes a ciertos grupos (opcionalmente filtrando por empresa)
export async function notifyGroups(params: {
  empresaSlug?: string | null;
  groupKeys: (GroupKey | string)[];
  type?: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const {
    empresaSlug = null,
    groupKeys,
    type = NotificationType.SYSTEM,
    title,
    body = null,
    href = null,
  } = params;

  const keys = Array.from(
    new Set(groupKeys.map((k) => String(k).trim()).filter(Boolean)),
  );

  if (!keys.length) return { ok: true as const, count: 0 };

  // Resolver empresaId si viene slug
  const empresa =
    empresaSlug
      ? await prisma.empresa.findUnique({
          where: { slug: empresaSlug },
          select: { id: true },
        })
      : null;

  const empresaId = empresa?.id ?? null;

  // 1) Sacar userIds por grupos usando la tabla puente (cero magia)
  const rows = await prisma.userGroup.findMany({
    where: {
      group: { key: { in: keys as any } },
      user: { isActive: true },
      ...(empresaSlug
        ? {
            // si filtras por empresa, el usuario tiene que estar asignado a esa empresa
            user: {
              isActive: true,
              empresas: { some: { empresaId: empresaId! } },
            },
          }
        : {}),
    },
    select: { userId: true },
  });

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));

  if (!userIds.length) {
    console.log("[notifyGroups] no recipients", { empresaSlug, keys });
    return { ok: true as const, count: 0 };
  }

  // 2) Crear notificaciones
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      empresaId,
      type,
      title,
      body,
      href,
    })),
  });

  // 3) Realtime best-effort
  try {
    await Promise.all(
      userIds.map((uid) =>
        pushToUser(uid, "notification_created", {
          type,
          title,
          body,
          href,
          createdAt: new Date().toISOString(),
        }),
      ),
    );
  } catch (e) {
    console.error("[notifyGroups] realtime push failed:", e);
  }

  return { ok: true as const, count: userIds.length };
}



/**
 * THREADS LIST
 * Devuelve hilos relevantes para el usuario:
 * - GLOBAL: siempre (si existe)
 * - GROUP: si pertenece a ese grupo
 * - DM: si eres dmA/dmB o member
 */
export async function getMyThreads() {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  const myGroupKeys = await prisma.userGroup.findMany({
    where: { userId: user.id },
    select: { group: { select: { key: true } } },
  });
  const groupKeys = myGroupKeys.map((g) => g.group.key);

  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [
        { type: ChatThreadType.GLOBAL },
        { type: ChatThreadType.GROUP, groupKey: { in: groupKeys } },
        { type: ChatThreadType.DM, OR: [{ dmAId: user.id }, { dmBId: user.id }] },
        { members: { some: { userId: user.id } } }, // fallback por si usas members para algo
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
      name: true,
      groupKey: true,
      updatedAt: true,
      dmAId: true,
      dmBId: true,
      _count: { select: { messages: true } },
    },
  });

  // --- Rellenar name para DMs con "el otro usuario" (sin depender de relaciones Prisma)
  const dmOtherIds = threads
    .filter((t) => t.type === ChatThreadType.DM)
    .map((t) => (t.dmAId === user.id ? t.dmBId : t.dmAId))
    .filter((id): id is string => !!id);

  const dmUsers = dmOtherIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uniq(dmOtherIds) } },
        select: { id: true, username: true, name: true, isActive: true },
      })
    : [];

  const dmUserById = new Map(dmUsers.map((u) => [u.id, u]));

  const items = threads.map((t) => {
    if (t.type !== ChatThreadType.DM) return t;

    const otherId = t.dmAId === user.id ? t.dmBId : t.dmAId;
    const other = otherId ? dmUserById.get(otherId) : null;

    // Si el usuario está inactivo o no existe, lo pintamos “Directo” igualmente
    const label =
      other && other.isActive
        ? (other.name && other.name.trim() ? other.name.trim() : `@${other.username}`)
        : "Directo";

    return {
      ...t,
      name: t.name ?? label,
    };
  });

  return { ok: true as const, items };
}


export async function getThreadMessages(threadId: string, opts?: { take?: number }) {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  // permiso: GLOBAL => ok, GROUP => in group, DM => dmA/dmB
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { id: true, type: true, groupKey: true, dmAId: true, dmBId: true },
  });
  if (!thread) throw new Error("NOT_FOUND");

  if (thread.type === ChatThreadType.GROUP) {
    if (!thread.groupKey) throw new Error("FORBIDDEN");
    const inGroup = await prisma.userGroup.findFirst({
      where: { userId: user.id, group: { key: thread.groupKey } },
      select: { id: true },
    });
    if (!inGroup) throw new Error("FORBIDDEN");
  }

  if (thread.type === ChatThreadType.DM) {
    if (thread.dmAId !== user.id && thread.dmBId !== user.id) throw new Error("FORBIDDEN");
  }

  const take = Math.min(Math.max(opts?.take ?? 50, 1), 200);

  const msgs = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      threadId: true,
      authorId: true,
      body: true,
      type: true,
      createdAt: true,
      author: { select: { name: true, username: true } },
    },
  });

  return { ok: true as const, items: msgs };
}

/**
 * Enviar mensaje (unificado):
 * - guarda ChatMessage
 * - emite realtime al room del thread
 * - genera notificaciones:
 *    - DM: al otro usuario
 *    - GROUP: si @todos => a todos del grupo (menos autor), si @user => solo a ese(s) si están en grupo
 *    - GLOBAL: si @todos => a todos (menos autor), si @user => solo a ese(s)
 */
export async function sendMessage(threadId: string, body: string) {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  const text = (body ?? "").trim();
  if (!text) return { ok: false as const, error: "empty" };

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      type: true,
      name: true,
      groupKey: true,
      dmAId: true,
      dmBId: true,
    },
  });
  if (!thread) throw new Error("NOT_FOUND");

  // permisos mínimos
  if (thread.type === ChatThreadType.GROUP) {
    if (!thread.groupKey) throw new Error("FORBIDDEN");
    const inGroup = await prisma.userGroup.findFirst({
      where: { userId: user.id, group: { key: thread.groupKey } },
      select: { id: true },
    });
    if (!inGroup) throw new Error("FORBIDDEN");
  }

  if (thread.type === ChatThreadType.DM) {
    if (thread.dmAId !== user.id && thread.dmBId !== user.id) throw new Error("FORBIDDEN");
  }

  const mentionsParsed = parseMentions(text);
  const mentionedUserIds = await getUserIdsByUsernames(mentionsParsed.usernames);

  const mentionsJson =
    mentionsParsed.all || mentionedUserIds.length
      ? {
          kind: mentionsParsed.all ? "ALL" : "USER",
          users: mentionedUserIds,
        }
      : null;

  const created = await prisma.chatMessage.create({
    data: {
      threadId,
      authorId: user.id,
      body: text,
      type: ChatMessageType.USER,
      mentions: mentionsJson ?? undefined,
    },
    select: { id: true, createdAt: true },
  });

  // bump updatedAt
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  // realtime a la conversación
  await pushToThread(threadId, "message_created", {
    threadId,
    message: {
      id: created.id,
      threadId,
      authorId: user.id,
      body: text,
      type: ChatMessageType.USER,
      createdAt: created.createdAt,
      author: {
        name: (user as any)?.name ?? null,
        username: (user as any)?.username ?? null,
      },
    },
  });

  // =========================
  // NOTIFICATIONS TARGETING
  // =========================
  const href = `/account/chat/${threadId}`;
  const msgPreview = preview(text, 140);

  // helper para crear notis + push
  async function notifyUsers(userIds: string[], ntype: NotificationType, title: string, body?: string) {
    const targets = uniq(userIds).filter((id) => id && id !== user.id);
    if (!targets.length) return;

    await prisma.notification.createMany({
      data: targets.map((uid) => ({
        userId: uid,
        type: ntype,
        title,
        body,
        href,
      })),
      skipDuplicates: false,
    });

    // push individual (campana refresca por evento)
    await Promise.all(
      targets.map((uid) =>
        pushToUser(uid, "notification_created", {
          type: ntype,
          title,
          body,
          href,
        }),
      ),
    );
  }

  // DM: notifica solo al otro
  if (thread.type === ChatThreadType.DM) {
    const otherId = thread.dmAId === user.id ? thread.dmBId : thread.dmAId;
    if (otherId) {
      await notifyUsers([otherId], NotificationType.CHAT_MENTION, "Nuevo mensaje", msgPreview);
    }
  }

  // GROUP:
  if (thread.type === ChatThreadType.GROUP && thread.groupKey) {
    // @todos => todos del grupo
    if (mentionsParsed.all) {
      const groupUsers = await prisma.userGroup.findMany({
        where: { group: { key: thread.groupKey as GroupKey } },
        select: { userId: true, user: { select: { isActive: true } } },
      });

      const targets = groupUsers.filter((x) => x.user.isActive).map((x) => x.userId);

      await notifyUsers(
        targets,
        NotificationType.CHAT_BROADCAST,
        `@todos · ${thread.name ?? "Canal"}`,
        msgPreview,
      );

      // opcional: push broadcast a sockets del grupo para refrescos globales (si tienes UI de listados)
      await pushToGroup(thread.groupKey, "broadcast", {
        threadId,
        from: user.id,
      });
    }

    // @username => solo si pertenecen al grupo
    if (mentionedUserIds.length) {
      const inGroup = await prisma.userGroup.findMany({
        where: { userId: { in: mentionedUserIds }, group: { key: thread.groupKey as GroupKey } },
        select: { userId: true, user: { select: { isActive: true } } },
      });
      const targets = inGroup.filter((x) => x.user.isActive).map((x) => x.userId);

      await notifyUsers(
        targets,
        NotificationType.CHAT_MENTION,
        `Te han mencionado · ${thread.name ?? "Canal"}`,
        msgPreview,
      );
    }
  }

  // GLOBAL:
  if (thread.type === ChatThreadType.GLOBAL) {
    if (mentionsParsed.all) {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const targets = users.map((u) => u.id);

      await notifyUsers(
        targets,
        NotificationType.CHAT_BROADCAST,
        "@todos · General",
        msgPreview,
      );

      // push realtime broadcast (si quieres que UIs que estén escuchando se enteren sin ir user a user)
      await pushBroadcast("broadcast", { threadId, from: user.id });
    }

    if (mentionedUserIds.length) {
      await notifyUsers(
        mentionedUserIds,
        NotificationType.CHAT_MENTION,
        "Te han mencionado",
        msgPreview,
      );
    }
  }

  revalidatePath("/account/notifications");
  revalidatePath("/account/chat");

  return { ok: true as const, messageId: created.id };
}

/**
 * Bootstrap helpers (opcionales pero recomendables):
 * - ensureGlobalThread: crea el “General” si no existe
 * - ensureGroupThread: crea el canal de grupo si no existe
 */
export async function ensureGlobalThread() {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  // solo Admin si quieres; por ahora cualquiera logueado puede “asegurar” que exista
  const t = await prisma.chatThread.findFirst({
    where: { type: ChatThreadType.GLOBAL },
    select: { id: true },
  });

  if (t) return { ok: true as const, threadId: t.id };

  const created = await prisma.chatThread.create({
    data: { type: ChatThreadType.GLOBAL, name: "General" },
    select: { id: true },
  });

  return { ok: true as const, threadId: created.id };
}

export async function ensureGroupThread(groupKey: GroupKey) {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  // Permiso mínimo: pertenecer al grupo
  const inGroup = await prisma.userGroup.findFirst({
    where: { userId: user.id, group: { key: groupKey } },
    select: { id: true },
  });
  if (!inGroup) throw new Error("FORBIDDEN");

  const existing = await prisma.chatThread.findFirst({
    where: { type: ChatThreadType.GROUP, groupKey },
    select: { id: true },
  });
  if (existing) return { ok: true as const, threadId: existing.id };

  const created = await prisma.chatThread.create({
    data: {
      type: ChatThreadType.GROUP,
      groupKey,
      name: `#${groupKey.toLowerCase()}`,
    },
    select: { id: true },
  });

  return { ok: true as const, threadId: created.id };
}

export async function archiveNotification(id: string) {
  const session = await getAppSession();
  const user = requireUser(session?.user);

  await prisma.notification.updateMany({
    where: { id, userId: user.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  // 🔁 fuerza refresco de la página de notificaciones
  revalidatePath("/account/notifications");

  return { ok: true as const };
}


export async function archiveReadNotifications() {
  const session = await getAppSession();
  const user = requireUser(session?.user);

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: { not: null },
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  // 🔁 refresca lista
  revalidatePath("/account/notifications");

  return { ok: true as const };
}

