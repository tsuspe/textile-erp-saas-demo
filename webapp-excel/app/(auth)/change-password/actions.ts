// webapp-excel/app/(auth)/change-password/actions.ts
"use server";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth/next";

export async function changePassword(formData: FormData) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;

  if (!userId) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");

  if (password.length < 6) return { ok: false, error: "Mínimo 6 caracteres." };
  if (password !== password2) return { ok: false, error: "Las contraseñas no coinciden." };

  const hash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hash, mustChangePassword: false },
  });

  // NO redirect aquí: lo controlamos en el cliente para que no se quede pillado
  return { ok: true };
}
