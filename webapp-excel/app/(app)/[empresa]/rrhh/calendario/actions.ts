// app/(app)/[empresa]/rrhh/calendario/actions.ts
"use server";

import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { pushToUser } from "@/lib/realtime-push";
import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Normaliza YYYY-MM-DD a Date UTC (00:00)
function parseISODateUTC(iso: string) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

async function notifyEmpresaUsers(params: {
  empresaSlug: string;
  type?: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const { empresaSlug, type = NotificationType.SYSTEM, title, body = null, href = null } = params;

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) return { ok: true as const, count: 0 };

  const users = await prisma.userEmpresa.findMany({
    where: { empresaId: empresa.id, user: { isActive: true } },
    select: { userId: true },
  });

  const userIds = Array.from(new Set(users.map((u) => u.userId))).filter(Boolean);
  if (!userIds.length) return { ok: true as const, count: 0 };

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      empresaId: empresa.id,
      type,
      title,
      body,
      href,
    })),
  });

  // realtime best-effort
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
    console.error("notifyEmpresaUsers realtime push failed:", e);
  }

  return { ok: true as const, count: userIds.length };
}

export async function saveEmpresaPrintConfigAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug"));
  await requireRRHH(empresaSlug);

  const cif = str(formData.get("cif")) || null;
  const centroTrabajo = str(formData.get("centroTrabajo")) || null;
  const ccc = str(formData.get("ccc")) || null;
  const lugarFirma = str(formData.get("lugarFirma")) || null;
  const textoLegal = str(formData.get("textoLegal")) || null;

  await prisma.empresa.update({
    where: { slug: empresaSlug },
    data: { cif, centroTrabajo, ccc, lugarFirma, textoLegal },
  });

  // 🔔 Notificar a todos los usuarios de la empresa
  await notifyEmpresaUsers({
    empresaSlug,
    type: NotificationType.SYSTEM,
    title: "RRHH · Configuración de impresión actualizada",
    body: "Se han actualizado los datos/leyenda del documento de control horario.",
    href: `/${empresaSlug}/rrhh/calendario`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/calendario`);
  redirect(`/${empresaSlug}/rrhh/calendario?ok=empresa_actualizada`);
}

export async function addHolidayAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug"));
  const year = Number(str(formData.get("year")) || "0");
  await requireRRHH(empresaSlug);

  const dateISO = str(formData.get("date"));
  const name = str(formData.get("name")) || null;

  const date = parseISODateUTC(dateISO);
  if (!date) redirect(`/${empresaSlug}/rrhh/calendario?err=fecha_invalida`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/calendario?err=empresa_not_found`);

  await prisma.timeHoliday.upsert({
    where: { empresaId_date: { empresaId: empresa.id, date } },
    update: { name },
    create: { empresaId: empresa.id, date, name },
  });

  // 🔔 Notificar
  await notifyEmpresaUsers({
    empresaSlug,
    type: NotificationType.SYSTEM,
    title: "Calendario RRHH · Festivo actualizado",
    body: `${fmt(date)}${name ? ` · ${name}` : ""}`,
    href: `/${empresaSlug}/rrhh/calendario?year=${year}`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/calendario`);
  redirect(`/${empresaSlug}/rrhh/calendario?year=${year}&ok=festivo_guardado`);
}

export async function deleteHolidayAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug"));
  const year = Number(str(formData.get("year")) || "0");
  await requireRRHH(empresaSlug);

  const id = Number(str(formData.get("id")) || "0");
  if (!id) redirect(`/${empresaSlug}/rrhh/calendario?err=not_found`);

  // capturamos info antes de borrar (para el mensaje)
  const prev = await prisma.timeHoliday.findUnique({
    where: { id },
    select: { date: true, name: true, empresaId: true },
  });

  await prisma.timeHoliday.delete({ where: { id } });

  // 🔔 Notificar
  await notifyEmpresaUsers({
    empresaSlug,
    type: NotificationType.SYSTEM,
    title: "Calendario RRHH · Festivo eliminado",
    body: prev?.date ? `${fmt(prev.date)}${prev.name ? ` · ${prev.name}` : ""}` : null,
    href: `/${empresaSlug}/rrhh/calendario?year=${year}`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/calendario`);
  redirect(`/${empresaSlug}/rrhh/calendario?year=${year}&ok=festivo_borrado`);
}

export async function addCompanyVacationAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug"));
  const year = Number(str(formData.get("year")) || "0");
  await requireRRHH(empresaSlug);

  const fromISO = str(formData.get("from"));
  const toISO = str(formData.get("to"));
  const reason = str(formData.get("reason")) || null;

  const from = parseISODateUTC(fromISO);
  const to = parseISODateUTC(toISO);
  if (!from || !to) redirect(`/${empresaSlug}/rrhh/calendario?err=fecha_invalida`);
  if (to < from) redirect(`/${empresaSlug}/rrhh/calendario?err=rango_invalido`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/calendario?err=empresa_not_found`);

  await prisma.timeCompanyVacation.create({
    data: { empresaId: empresa.id, from, to, reason },
  });

  // 🔔 Notificar
  await notifyEmpresaUsers({
    empresaSlug,
    type: NotificationType.SYSTEM,
    title: "Calendario RRHH · Cierre de empresa creado",
    body:
      `Del ${fmt(from)} al ${fmt(to)}` +
      (reason ? ` · Motivo: ${reason}` : ""),
    href: `/${empresaSlug}/rrhh/calendario?year=${year}`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/calendario`);
  redirect(`/${empresaSlug}/rrhh/calendario?year=${year}&ok=vacaciones_empresa_creadas`);
}

export async function deleteCompanyVacationAction(formData: FormData) {
  const empresaSlug = str(formData.get("empresaSlug"));
  const year = Number(str(formData.get("year")) || "0");
  await requireRRHH(empresaSlug);

  const id = Number(str(formData.get("id")) || "0");
  if (!id) redirect(`/${empresaSlug}/rrhh/calendario?err=not_found`);

  const prev = await prisma.timeCompanyVacation.findUnique({
    where: { id },
    select: { from: true, to: true, reason: true },
  });

  await prisma.timeCompanyVacation.delete({ where: { id } });

  // 🔔 Notificar
  await notifyEmpresaUsers({
    empresaSlug,
    type: NotificationType.SYSTEM,
    title: "Calendario RRHH · Cierre de empresa eliminado",
    body: prev
      ? `Del ${fmt(prev.from)} al ${fmt(prev.to)}` + (prev.reason ? ` · Motivo: ${prev.reason}` : "")
      : null,
    href: `/${empresaSlug}/rrhh/calendario?year=${year}`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/calendario`);
  redirect(`/${empresaSlug}/rrhh/calendario?year=${year}&ok=vacaciones_empresa_borradas`);
}
