// app/(app)/[empresa]/admin/users/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

import { notifyGroups } from "@/app/(app)/actions/chat";
import { authOptions } from "@/auth";
import { NotificationType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth/next";


function toBool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

function toIntArray(vals: FormDataEntryValue[]): number[] {
  return vals
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.trunc(n));
}

function cleanUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export async function updateUserAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireAdmin(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect(`/${empresaSlug}/admin/users?err=not_found`);

  const name = String(formData.get("name") ?? "").trim();
  const username = cleanUsername(String(formData.get("username") ?? ""));

  // RRHH: datos para impresión
  const nif = String(formData.get("nif") ?? "").trim() || null;
  const numeroSS = String(formData.get("numeroSS") ?? "").trim() || null;

  const isActive = toBool(formData.get("isActive"));
  const mustChangePassword = toBool(formData.get("mustChangePassword"));



  const empresaIds = toIntArray(
    formData.getAll("empresas") as FormDataEntryValue[]
  );

  if (!name || !username) {
    redirect(`/${empresaSlug}/admin/users/${userId}?err=missing_fields`);
  }

    // Groups llegan del form como string
  const groupKeys = (formData.getAll("groups") as FormDataEntryValue[])
    .map((v) => String(v).trim())
    .filter(Boolean);

  // Resolver ids de grupos por key
  const groups = await prisma.group.findMany({
    select: { id: true, key: true },
  });

  // g.key es enum GroupKey, FormData devuelve string → usamos Map<string, string>
  const keyToId = new Map<string, string>(
    groups.map((g) => [String(g.key), g.id])
  );

  const groupIds = groupKeys
    .map((k) => keyToId.get(k))
    .filter((x): x is string => Boolean(x));



  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name, username, isActive, mustChangePassword, nif, numeroSS },
    });

    await tx.userGroup.deleteMany({ where: { userId } });
    if (groupIds.length) {
      await tx.userGroup.createMany({
        data: groupIds.map((groupId) => ({ userId, groupId })),
      });
    }

    await tx.userEmpresa.deleteMany({ where: { userId } });
    if (empresaIds.length) {
      await tx.userEmpresa.createMany({
        data: empresaIds.map((empresaId) => ({ userId, empresaId })),
      });
    }
  });

  revalidatePath(`/${empresaSlug}/admin/users`);
  revalidatePath(`/${empresaSlug}/admin/users/${userId}`);

  redirect(`/${empresaSlug}/admin/users/${userId}?ok=actualizado`);
}

export async function createUserAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireAdmin(empresaSlug);

  const name = String(formData.get("name") ?? "").trim();
  const username = cleanUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");

  const isActive = toBool(formData.get("isActive"));
  const mustChangePassword = toBool(formData.get("mustChangePassword"));

  if (!name || username.length < 3) {
    redirect(`/${empresaSlug}/admin/users?err=invalid_username`);
  }
  if (password.length < 6) {
    redirect(`/${empresaSlug}/admin/users?err=weak_password`);
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    redirect(`/${empresaSlug}/admin/users?err=user_exists`);
  }

  const hash = await bcrypt.hash(password, 12);

  const created = await prisma.user.create({
    data: {
      name,
      username,
      email: null,
      password: hash,
      isActive,
      mustChangePassword,
    } as any,
    select: { id: true },
  });

  // 🔔 Notificación a ADMIN + RRHH
  let notiCount = 0;

  try {
    const res = await notifyGroups({
      // GLOBAL a propósito: el nuevo usuario aún no tiene empresas asignadas
      empresaSlug: null,
      groupKeys: ["ADMIN", "RRHH"],
      type: NotificationType.SYSTEM,
      title: `Nuevo usuario @${username} creado`,
      body: `Se ha creado el usuario ${name} (@${username}). Está ${
        isActive ? "activo" : "pendiente de activación"
      }. Entra al panel de Usuarios para ${
        isActive ? "revisarlo" : "activarlo"
      } y asignarle empresa y grupos.`,
      href: `/${empresaSlug}/admin/users/${created.id}`,
    });

    notiCount = (res as any)?.count ?? 0;
    console.log("[createUserAction] notifyGroups count:", notiCount);
  } catch (e) {
    console.error("[createUserAction] notifyGroups failed:", e);
    notiCount = -1;
  }

  revalidatePath(`/${empresaSlug}/admin/users`);
  redirect(`/${empresaSlug}/admin/users/${created.id}?ok=creado&noti=${notiCount}`);
}



export async function deleteUserAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireAdmin(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect(`/${empresaSlug}/admin/users?err=not_found`);

  // Protección: no te dejes borrar a ti mismo por accidente
  const session = await getServerSession(authOptions);
  const currentUserId = (session as any)?.user?.id as string | undefined;
  if (currentUserId && currentUserId === userId) {
    redirect(`/${empresaSlug}/admin/users?err=cannot_delete_self`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.userGroup.deleteMany({ where: { userId } });
    await tx.userEmpresa.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  revalidatePath(`/${empresaSlug}/admin/users`);
  redirect(`/${empresaSlug}/admin/users?ok=deleted`);
}
