// app/(app)/account/time/actions.ts
"use server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Helpers
function ymToRange(ym: string) {
  // ym = "2026-01"
  const [y, m] = ym.split("-").map((v) => Number(v));
  if (!y || !m || m < 1 || m > 12) throw new Error("YM inválido");
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { from, to, y, m };
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isWeekendUTC(d: Date) {
  const wd = d.getUTCDay(); // 0 dom, 6 sáb
  return wd === 0 || wd === 6;
}

async function getCalendarConstraints(empresaId: number, from: Date, to: Date) {
  const [holidays, companyVacations] = await Promise.all([
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: from, lt: to },
        OR: [{ empresaId }, { empresaId: null }],
      },
      select: { date: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId,
        from: { lt: to },
        to: { gte: from },
      },
      select: { from: true, to: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));

  function isInCompanyVacation(d: Date) {
    const t = d.getTime();
    return companyVacations.some(
      (v) => t >= v.from.getTime() && t <= v.to.getTime(), // "to" inclusivo
    );
  }

  function isHoliday(d: Date) {
    return holidaySet.has(dateISO(d));
  }

  return { holidaySet, companyVacations, isInCompanyVacation, isHoliday };
}

function assertDateInYm(date: Date, ym: string) {
  const { from, to } = ymToRange(ym);
  if (date < from || date >= to) {
    throw new Error("DATE_OUT_OF_MONTH");
  }
}

async function requireUser() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login");
  return user;
}

async function requireEmpresaForUser(userId: string, empresaSlug: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) redirect(`/account/time?err=empresa_not_found`);

  // ✅ validar pertenencia user -> empresa (multi-empresa real)
  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) redirect(`/account/time?err=no_empresa_access`);

  return empresa;
}

function cleanTime(v: string) {
  const s = v.trim();
  // aceptamos "" o HH:MM (00-23 / 00-59)
  if (!s) return null;
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [hh, mm] = s.split(":").map(Number);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * ✅ Regla de negocio para excepciones:
 * - Finde/Festivo: bloqueado siempre (a no ser que quieras habilitarlo explícitamente más adelante).
 * - Cierre de empresa: bloqueado salvo que RRHH haya creado/forzado un TimeDay con type=WORK (override).
 */
async function assertNotBlockedByCalendarOrOverride(params: {
  empresaId: number;
  userId: string;
  date: Date;
  from: Date;
  to: Date;
  empresaSlug: string;
  ym: string;
}) {
  const { empresaId, userId, date, from, to, empresaSlug, ym } = params;

  const { isInCompanyVacation, isHoliday } = await getCalendarConstraints(empresaId, from, to);

  // 1) Finde o festivo: no se permite (sin overrides de momento)
  if (isWeekendUTC(date) || isHoliday(date)) {
    redirect(`/account/time/${empresaSlug}/${ym}?err=blocked_calendar`);
  }

  // 2) Cierre de empresa: solo se permite si existe override RRHH (TimeDay.type=WORK)
  if (isInCompanyVacation(date)) {
    const existing = await prisma.timeDay.findUnique({
      where: { userId_empresaId_date: { userId, empresaId, date } },
      select: { type: true },
    });

    if (existing?.type !== "WORK") {
      // Importante: RRHH debe marcar ese día como WORK para habilitar fichaje/firma.
      redirect(`/account/time/${empresaSlug}/${ym}?err=blocked_calendar`);
    }
  }
}

export async function saveDayAction(formData: FormData) {
  const user = await requireUser();

  const empresaSlug = String(formData.get("empresaSlug") ?? "");
  const ym = String(formData.get("ym") ?? "");
  const dateStr = String(formData.get("date") ?? ""); // YYYY-MM-DD

  const empresa = await requireEmpresaForUser(user.id, empresaSlug);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    redirect(`/account/time/${empresaSlug}/${ym}?err=bad_date`);
  }

  const range = ymToRange(ym);

  // Guardamos el día como UTC 00:00
  const [yy, mm, dd] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0));

  // ✅ El date debe pertenecer a ese mes
  try {
    assertDateInYm(date, ym);
  } catch {
    redirect(`/account/time/${empresaSlug}/${ym}?err=bad_date`);
  }

  // ✅ Si está firmado/bloqueado, no se edita
  const existing = await prisma.timeDay.findUnique({
    where: { userId_empresaId_date: { userId: user.id, empresaId: empresa.id, date } },
    select: { id: true, lockedAt: true, type: true },
  });

  if (existing?.lockedAt) {
    redirect(`/account/time/${empresaSlug}/${ym}?err=locked`);
  }

  // ✅ Bloqueo calendario con excepción de cierre (solo si RRHH puso WORK)
  await assertNotBlockedByCalendarOrOverride({
    empresaId: empresa.id,
    userId: user.id,
    date,
    from: range.from,
    to: range.to,
    empresaSlug,
    ym,
  });

  const morningIn = cleanTime(String(formData.get("morningIn") ?? ""));
  const morningOut = cleanTime(String(formData.get("morningOut") ?? ""));
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  // WORK | VACATION | ABSENCE (en v1)
  const type = String(formData.get("type") ?? "WORK");

  // No dejar guardar basura
  if (!["WORK", "VACATION", "ABSENCE"].includes(type)) {
    redirect(`/account/time/${empresaSlug}/${ym}?err=bad_type`);
  }

  // Limpieza: si no es WORK, ignoramos horas
  const safeMorningIn = type === "WORK" ? morningIn : null;
  const safeMorningOut = type === "WORK" ? morningOut : null;

  await prisma.timeDay.upsert({
    where: { userId_empresaId_date: { userId: user.id, empresaId: empresa.id, date } },
    create: {
      userId: user.id,
      empresaId: empresa.id,
      date,
      morningIn: safeMorningIn,
      morningOut: safeMorningOut,
      type: type as any,
      note: note || null,
    },
    update: {
      morningIn: safeMorningIn,
      morningOut: safeMorningOut,
      type: type as any,
      note: note || null,
    },
  });

  revalidatePath(`/account/time/${empresaSlug}/${ym}`);
  redirect(`/account/time/${empresaSlug}/${ym}?ok=guardado`);
}

export async function fillMonthAction(formData: FormData) {
  const user = await requireUser();

  const empresaSlug = String(formData.get("empresaSlug") ?? "");
  const ym = String(formData.get("ym") ?? "");
  const empresa = await requireEmpresaForUser(user.id, empresaSlug);

  const { from, to } = ymToRange(ym);

  // ✅ Festivos + cierres de empresa en ese mes
  const { isInCompanyVacation, isHoliday } = await getCalendarConstraints(empresa.id, from, to);

  // Traemos los días existentes del mes para no pisar bloqueados
  const existing = await prisma.timeDay.findMany({
    where: {
      userId: user.id,
      empresaId: empresa.id,
      date: { gte: from, lt: to },
    },
    select: { date: true, lockedAt: true, type: true },
  });

  const lockedSet = new Set(existing.filter((d) => d.lockedAt).map((d) => dateISO(d.date)));
  const existingSet = new Set(existing.map((d) => dateISO(d.date)));

  const days: {
    userId: string;
    empresaId: number;
    date: Date;
    morningIn: string;
    morningOut: string;
    type: any;
  }[] = [];

  // Rellenamos SOLO laborables y no bloqueados por RRHH,
  // y solo si no existe (evita pisar vacaciones/ausencias a mano)
  for (let dt = new Date(from); dt < to; dt = new Date(dt.getTime() + 86400000)) {
    const iso = dateISO(dt);

    // bloqueos duros
    if (isWeekendUTC(dt) || isHoliday(dt)) continue;

    // cierre empresa: por defecto NO rellenamos (se considera cierre)
    // Si RRHH hizo override WORK, ese día ya existirá en existingSet y no lo tocamos.
    if (isInCompanyVacation(dt)) continue;

    if (lockedSet.has(iso)) continue;
    if (existingSet.has(iso)) continue;

    days.push({
      userId: user.id,
      empresaId: empresa.id,
      date: new Date(dt),
      morningIn: "08:00",
      morningOut: "16:00",
      type: "WORK",
    });
  }

  if (days.length) {
    await prisma.timeDay.createMany({ data: days });
  }

  revalidatePath(`/account/time/${empresaSlug}/${ym}`);
  redirect(`/account/time/${empresaSlug}/${ym}?ok=rellenado`);
}

export async function signDayAction(formData: FormData) {
  const user = await requireUser();

  const empresaSlug = String(formData.get("empresaSlug") ?? "");
  const ym = String(formData.get("ym") ?? "");
  const dateStr = String(formData.get("date") ?? "");
  const password = String(formData.get("password") ?? "");

  const empresa = await requireEmpresaForUser(user.id, empresaSlug);

  if (!password) redirect(`/account/time/${empresaSlug}/${ym}?err=bad_password`);

  // Validar password contra hash real
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });
  if (!dbUser) redirect(`/login`);

  const passOk = await bcrypt.compare(password, dbUser.password);
  if (!passOk) redirect(`/account/time/${empresaSlug}/${ym}?err=bad_password`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    redirect(`/account/time/${empresaSlug}/${ym}?err=bad_date`);
  }

  const range = ymToRange(ym);

  const [yy, mm, dd] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0));

  // ✅ El date debe pertenecer a ese mes
  try {
    assertDateInYm(date, ym);
  } catch {
    redirect(`/account/time/${empresaSlug}/${ym}?err=bad_date`);
  }

  // ✅ Bloqueo calendario con excepción de cierre (solo si RRHH puso WORK)
  await assertNotBlockedByCalendarOrOverride({
    empresaId: empresa.id,
    userId: user.id,
    date,
    from: range.from,
    to: range.to,
    empresaSlug,
    ym,
  });

  await prisma.timeDay.upsert({
    where: { userId_empresaId_date: { userId: user.id, empresaId: empresa.id, date } },
    create: {
      userId: user.id,
      empresaId: empresa.id,
      date,
      type: "WORK" as any,
      morningIn: "08:00",
      morningOut: "16:00",
      signedAt: new Date(),
      lockedAt: new Date(),
      signedById: user.id,
      signMethod: "PASSWORD" as any,
    },
    update: {
      lockedAt: new Date(),
      signedAt: new Date(),
      signedById: user.id,
      signMethod: "PASSWORD" as any,
    },
    select: { id: true },
  });

  revalidatePath(`/account/time/${empresaSlug}/${ym}`);
  redirect(`/account/time/${empresaSlug}/${ym}?ok=firmado`);
}
