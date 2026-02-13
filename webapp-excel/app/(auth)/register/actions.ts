// webapp-excel/app/(auth)/register/actions.ts
"use server";

import { notifyGroups } from "@/app/(app)/actions/chat";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import bcrypt from "bcryptjs";

function cleanUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export async function registerUser(formData: FormData) {
  const username = cleanUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (username.length < 3) {
    return { ok: false, error: "El usuario debe tener al menos 3 caracteres." };
  }
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return { ok: false, error: "Ese usuario ya existe. Prueba otro." };
  }

  const hash = await bcrypt.hash(password, 12);

  const created = await prisma.user.create({
    data: {
      username,
      email: null,
      name: username,
      password: hash,
      isActive: false, // pendiente de Admin
      mustChangePassword: false,
    } as any,
    select: { id: true, username: true, name: true },
  });

  // 🔔 Notificación a ADMIN + RRHH (GLOBAL, sin empresa)
  try {
    await notifyGroups({
      empresaSlug: null,
      groupKeys: ["ADMIN", "RRHH"],
      type: NotificationType.SYSTEM,
      title: `Nuevo usuario @${created.username} creado`,
      body: `Usuario creado en autoregistro. Está pendiente de activación. Entra a Admin > Usuarios para activarlo y asignarle empresa y grupos.`,
      href: `/admin`, // atajo seguro (luego eliges empresa y vas a Usuarios)
    });
  } catch (e) {
    console.error("[registerUser] notifyGroups failed:", e);
  }

  return { ok: true };
}
