// lib/auth-server.ts
//
// Helpers server-side para NextAuth (v4) en App Router.
// - getAppSession(): devuelve la sesión o null
// - requireAdmin(): corta navegación si el usuario no es ADMIN
// - requireRRHH(): permite ADMIN o RRHH
// - requireEmpresaAccess(): valida que el user tiene esa empresa asignada

import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  groups?: string[];
  mustChangePassword?: boolean;
};

export async function getAppSession() {
  return await getServerSession(authOptions);
}

export async function requireEmpresaAccess(empresaSlug: string) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) redirect("/login");

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true },
  });
  if (!empresa) redirect(`/?err=empresa_not_found`);

  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: empresa.id } },
    select: { id: true },
  });

  if (!ok) redirect(`/account/time?err=no_empresa_access`);

  return { user, empresa };
}

export async function requireAdmin(empresaSlug: string) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) redirect("/login");

  const groups = user.groups ?? [];
  if (!groups.includes("ADMIN")) {
    redirect(`/${empresaSlug}?err=no_permisos`);
  }
}

export async function requireRRHH(empresaSlug: string) {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) redirect("/login");

  const groups = user.groups ?? [];
  const ok = groups.includes("ADMIN") || groups.includes("RRHH");
  if (!ok) redirect(`/${empresaSlug}?err=no_permisos`);
}
