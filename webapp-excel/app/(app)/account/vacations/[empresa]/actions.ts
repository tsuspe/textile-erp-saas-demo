// app/(app)/account/vacations/[empresa]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

import { notifyGroups } from "@/app/(app)/actions/chat";
import { NotificationType } from "@prisma/client";

function fmt(d: Date) {
  // YYYY-MM-DD (estable y sin líos de timezone)
  return d.toISOString().slice(0, 10);
}

function ymKey(year: number) {
  return String(year);
}

function toDateUTC(raw: string): Date | null {
  // esperamos YYYY-MM-DD
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = raw.split("-").map((v) => Number(v));
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
}

export async function requestVacationAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  const year = Number(formData.get("year") ?? "");

  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect(`/login?next=/account/vacations/${empresaSlug}`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/account/vacations?err=empresa_not_found`);

  // acceso
  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) redirect(`/account/vacations?err=no_empresa_access`);

  const fromRaw = String(formData.get("from") ?? "");
  const toRaw = String(formData.get("to") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const from = toDateUTC(fromRaw);
  const to = toDateUTC(toRaw);
  if (!from || !to || from > to) {
    redirect(`/account/vacations/${empresaSlug}?year=${ymKey(year)}&err=invalid_dates`);
  }

  // Solo permitimos pedir dentro del año seleccionado (simplifica)
  const y0 = from.getUTCFullYear();
  const y1 = to.getUTCFullYear();
  if (y0 !== year || y1 !== year) {
    redirect(`/account/vacations/${empresaSlug}?year=${ymKey(year)}&err=out_of_year`);
  }

  await prisma.timeVacationRequest.create({
    data: {
      empresaId: empresa.id,
      userId: user.id,
      from,
      to,
      reason: reason || null,
      status: "PENDING",
    },
  });

  // 🔔 Notificar a RRHH + ADMIN (al crear solicitud)
  const title = `Nueva solicitud de vacaciones · @${(user as any)?.username ?? "usuario"}`;
  const bodyTxt =
    `Del ${fmt(from)} al ${fmt(to)}` + (reason ? ` · Motivo: ${reason}` : "");

  // RRHH de ESA empresa
  await notifyGroups({
    empresaSlug,
    groupKeys: ["RRHH"],
    type: NotificationType.VACATION_REQUESTED,
    title,
    body: bodyTxt,
    href: `/${empresaSlug}/rrhh/vacaciones`,
  });

  // ADMIN global (por si tienes admins sin empresa asignada)
  await notifyGroups({
    empresaSlug: null,
    groupKeys: ["ADMIN"],
    type: NotificationType.VACATION_REQUESTED,
    title,
    body: bodyTxt,
    href: `/${empresaSlug}/rrhh/vacaciones`,
  });

  revalidatePath(`/account/vacations/${empresaSlug}`);
  redirect(`/account/vacations/${empresaSlug}?year=${ymKey(year)}&ok=requested`);
}
