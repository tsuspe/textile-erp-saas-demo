//app/(app)/account/notifications/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { pushToUser } from "@/lib/realtime-push";
import { NotificationType } from "@prisma/client";

function str(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function splitCsv(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function notifyUsers(params: {
  empresaId: number | null;
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const { empresaId, userIds, type, title, body = null, href = null } = params;
  const uniq = Array.from(new Set(userIds)).filter(Boolean);
  if (!uniq.length) return { ok: true as const, count: 0 };

  // DB
  await prisma.notification.createMany({
    data: uniq.map((userId) => ({
      userId,
      empresaId,
      type,
      title,
      body,
      href,
    })),
  });

  // realtime best-effort
  try {
    await Promise.all(
      uniq.map((uid) =>
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
    console.error("notifyUsers realtime push failed:", e);
  }

  return { ok: true as const, count: uniq.length };
}

/**
 * Enviar notificación custom:
 * - Remitente: "USER" o "GROUP"
 * - Destino: usuarios concretos y/o grupos
 * - Scope: empresa concreta (empresaSlug) o global (empresaSlug vacío)
 *
 * Reglas:
 * - Siempre debes estar logueado.
 * - Si envías como GROUP, debes pertenecer a ese grupo.
 * - Si hay empresaSlug, los destinatarios deben pertenecer a esa empresa.
 */
export async function createCustomNotificationAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug")); // puede venir "" si es global
  const senderMode = str(formData.get("senderMode")); // "USER" | "GROUP"
  const senderGroupKey = str(formData.get("senderGroupKey")) || null;

  const title = str(formData.get("title"));
  const body = str(formData.get("body")) || null;
  const href = str(formData.get("href")) || null;

  const rawTargetUserIds = str(formData.get("targetUserIds")); // csv de userId
  const rawTargetGroupKeys = str(formData.get("targetGroupKeys")); // csv de keys

  if (!title) redirect(`/account/notifications?err=missing_title`);

  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect(`/login?next=/account/notifications`);

  // empresaId opcional
  const empresa = empresaSlug
    ? await prisma.empresa.findUnique({ where: { slug: empresaSlug }, select: { id: true } })
    : null;

  if (empresaSlug && !empresa) redirect(`/account/notifications?err=empresa_not_found`);

  const empresaId = empresa?.id ?? null;

  // acceso empresa si empresaSlug viene
  if (empresaId) {
    const ok = await prisma.userEmpresa.findUnique({
      where: { userId_empresaId: { userId: user.id, empresaId } },
      select: { id: true },
    });
    if (!ok) redirect(`/account/notifications?err=no_empresa_access`);
  }

  // --- Validación remitente ---
  let senderLabel = `@${(user as any)?.username ?? "usuario"}`;

  if (senderMode === "GROUP") {
    if (!senderGroupKey) redirect(`/account/notifications?err=missing_sender_group`);

    // ✅ Modelo real:
    // - UserGroup guarda (userId, groupId)
    // - Group guarda la key (enum GroupKey)
    const membership = await prisma.userGroup.findFirst({
      where: {
        userId: user.id,
        group: { key: senderGroupKey as any },
      },
      select: { id: true },
    });

    if (!membership) redirect(`/account/notifications?err=not_in_sender_group`);

    senderLabel = `Grupo ${senderGroupKey}`;
  }

  // --- Resolver destinatarios ---
  const targetUserIds = splitCsv(rawTargetUserIds);
  const targetGroupKeys = splitCsv(rawTargetGroupKeys);

  // Si vienen users, validar pertenencia a empresa (si aplica)
  let validatedUserIds = targetUserIds;

  if (empresaId && targetUserIds.length) {
    const rows = await prisma.userEmpresa.findMany({
      where: { empresaId, userId: { in: targetUserIds } },
      select: { userId: true },
    });
    const allowed = new Set(rows.map((r) => r.userId));
    validatedUserIds = targetUserIds.filter((id) => allowed.has(id));
  }

  // Si vienen grupos, resolvemos usuarios del grupo
  let groupUserIds: string[] = [];
  if (targetGroupKeys.length) {
    const rows = await prisma.userGroup.findMany({
      where: {
        group: { key: { in: targetGroupKeys as any } },
        user: { isActive: true },
      },
      select: { userId: true },
    });
    groupUserIds = rows.map((r) => r.userId);

    // Si la notificación está acotada a empresa, nos quedamos solo con users de esa empresa.
    if (empresaId && groupUserIds.length) {
      const allowedRows = await prisma.userEmpresa.findMany({
        where: { empresaId, userId: { in: groupUserIds } },
        select: { userId: true },
      });
      const allowed = new Set(allowedRows.map((r) => r.userId));
      groupUserIds = groupUserIds.filter((id) => allowed.has(id));
    }
  }

  const recipients = Array.from(new Set([...validatedUserIds, ...groupUserIds])).filter(Boolean);

  if (!recipients.length) redirect(`/account/notifications?err=no_recipients`);

  // --- Construimos payload final ---
  const finalTitle = `${title}`;
  const finalBody =
    (body ? body : "") +
    (body ? "\n" : "") +
    `— Enviado por: ${senderLabel}`;

    // Decide la “familia” de la notificación para que los tabs filtren bien.
    let type: NotificationType = NotificationType.CUSTOM_SYSTEM;

    if (senderMode === "GROUP") {
    if (senderGroupKey === "RRHH") type = NotificationType.CUSTOM_RRHH;
    else if (senderGroupKey === "ADMIN") type = NotificationType.CUSTOM_ADMIN;
    else type = NotificationType.CUSTOM_SYSTEM;
    }

    await notifyUsers({
    empresaId,
    userIds: recipients,
    type,
    title: finalTitle,
    body: finalBody,
    href,
    });


  revalidatePath(`/account/notifications`);
  redirect(`/account/notifications?ok=sent`);
}

export async function getNotificationComposerOptionsAction(empresaSlugRaw?: string) {
  const empresaSlug = (empresaSlugRaw ?? "").trim();

  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect(`/login?next=/account/notifications`);

  // empresaId opcional
  const empresa = empresaSlug
    ? await prisma.empresa.findUnique({
        where: { slug: empresaSlug },
        select: { id: true },
      })
    : null;

  if (empresaSlug && !empresa) {
    return { ok: false as const, err: "empresa_not_found" as const };
  }

  const empresaId = empresa?.id ?? null;

  // Si es por empresa, validar acceso
  if (empresaId) {
    const ok = await prisma.userEmpresa.findUnique({
      where: { userId_empresaId: { userId: user.id, empresaId } },
      select: { id: true },
    });
    if (!ok) return { ok: false as const, err: "no_empresa_access" as const };
  }

  // 1) grupos del remitente (los que tú tienes)
  const myGroupsRows = await prisma.userGroup.findMany({
    where: { userId: user.id },
    select: { group: { select: { key: true } } },
  });
  const myGroupKeys = Array.from(new Set(myGroupsRows.map((r) => r.group.key))).sort();

  // 2) todos los grupos del sistema
  const allGroupsRows = await prisma.group.findMany({
    select: { key: true },
    orderBy: { key: "asc" },
  });
  const allGroupKeys = allGroupsRows.map((g) => g.key);

  // 3) usuarios destino (si hay empresaId, solo usuarios con acceso a esa empresa)
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(empresaId ? { empresas: { some: { empresaId } } } : {}),
    },
    select: { id: true, username: true, name: true },
    orderBy: [{ username: "asc" }],
    take: 500,
  });

  return {
    ok: true as const,
    empresaId,
    myGroupKeys,
    allGroupKeys,
    // Compat con el cliente: puede leer "users" o "allUsers".
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
    })),
    allUsers: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
    })),
  };
}
