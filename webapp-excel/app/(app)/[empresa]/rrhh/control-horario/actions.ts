// app/(app)/[empresa]/rrhh/control-horario/actions.ts
"use server";

import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function toInt(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toISODate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

async function getEmpresaId(empresaSlug: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  return empresa?.id ?? null;
}

export async function rrhhUnlockDayAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  const date = toISODate(String(formData.get("date") ?? ""));
  const year = toInt(formData.get("year"));

  if (!userId || !date) redirect(`/${empresaSlug}/rrhh/control-horario?err=missing_fields`);

  const empresaId = await getEmpresaId(empresaSlug);
  if (!empresaId) redirect(`/${empresaSlug}/rrhh/control-horario?err=empresa_not_found`);

  await prisma.timeDay.updateMany({
    where: { empresaId, userId, date },
    data: { signedAt: null, lockedAt: null },
  });

  revalidatePath(`/${empresaSlug}/rrhh/control-horario`);
  if (year) redirect(`/${empresaSlug}/rrhh/control-horario?year=${year}&userId=${encodeURIComponent(userId)}&ok=day_unlocked`);
  redirect(`/${empresaSlug}/rrhh/control-horario?ok=day_unlocked`);
}

export async function rrhhUnlockMonthAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  const year = toInt(formData.get("year"));
  const month = toInt(formData.get("month")); // 1..12

  if (!userId || !year || !month || month < 1 || month > 12) {
    redirect(`/${empresaSlug}/rrhh/control-horario?err=missing_fields`);
  }

  const empresaId = await getEmpresaId(empresaSlug);
  if (!empresaId) redirect(`/${empresaSlug}/rrhh/control-horario?err=empresa_not_found`);

  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // exclusive

  await prisma.timeDay.updateMany({
    where: { empresaId, userId, date: { gte: from, lt: to } },
    data: { signedAt: null, lockedAt: null },
  });

  revalidatePath(`/${empresaSlug}/rrhh/control-horario`);
  redirect(`/${empresaSlug}/rrhh/control-horario?year=${year}&month=${month}&userId=${encodeURIComponent(userId)}&ok=month_unlocked`);
}

export async function rrhhSetDayTypeAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  const date = toISODate(String(formData.get("date") ?? ""));
  const type = String(formData.get("type") ?? "").trim(); // WORK | VACATION
  const year = toInt(formData.get("year"));
  const month = toInt(formData.get("month"));

  if (!userId || !date || (type !== "WORK" && type !== "VACATION")) {
    redirect(`/${empresaSlug}/rrhh/control-horario?err=missing_fields`);
  }

  const empresaId = await getEmpresaId(empresaSlug);
  if (!empresaId) redirect(`/${empresaSlug}/rrhh/control-horario?err=empresa_not_found`);

  // upsert por (empresaId,userId,date)
  await prisma.timeDay.upsert({
    where: {
      userId_empresaId_date: { userId, empresaId, date },
    },
    create: {
      empresaId,
      userId,
      date,
      type,
      note: type === "VACATION" ? "VACACIONES (RRHH)" : "WORK (RRHH)",
    },
    update: {
      type,
      // IMPORTANT: si RRHH cambia el tipo, desbloquea para editar sin fricción
      signedAt: null,
      lockedAt: null,
      note: type === "VACATION" ? "VACACIONES (RRHH)" : "WORK (RRHH)",
      // Si pones VACATION manual, evita que queden horas
      ...(type === "VACATION"
        ? { morningIn: null, morningOut: null, afternoonIn: null, afternoonOut: null }
        : {}),
    },
  });

  revalidatePath(`/${empresaSlug}/rrhh/control-horario`);
  redirect(
    `/${empresaSlug}/rrhh/control-horario?year=${year ?? ""}&month=${month ?? ""}&userId=${encodeURIComponent(
      userId
    )}&ok=day_type_set`
  );
}

export async function rrhhClearDayAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  const date = toISODate(String(formData.get("date") ?? ""));
  const year = toInt(formData.get("year"));
  const month = toInt(formData.get("month"));

  if (!userId || !date) redirect(`/${empresaSlug}/rrhh/control-horario?err=missing_fields`);

  const empresaId = await getEmpresaId(empresaSlug);
  if (!empresaId) redirect(`/${empresaSlug}/rrhh/control-horario?err=empresa_not_found`);

  await prisma.timeDay.updateMany({
    where: { empresaId, userId, date },
    data: {
      morningIn: null,
      morningOut: null,
      afternoonIn: null,
      afternoonOut: null,
      signedAt: null,
      lockedAt: null,
      // no tocamos type; si quieres también “resetear a WORK” lo hacemos luego
    },
  });

  revalidatePath(`/${empresaSlug}/rrhh/control-horario`);
  redirect(
    `/${empresaSlug}/rrhh/control-horario?year=${year ?? ""}&month=${month ?? ""}&userId=${encodeURIComponent(
      userId
    )}&ok=day_cleared`
  );
}
