// app/(app)/[empresa]/rrhh/vacaciones/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

import { pushToUser } from "@/lib/realtime-push";
import { NotificationType } from "@prisma/client";

function toInt(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function notifyUser(params: {
  userId: string;
  empresaId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const { userId, empresaId, type, title, body = null, href = null } = params;

  await prisma.notification.create({
    data: { userId, empresaId, type, title, body, href },
  });

  // realtime best-effort
  try {
    await pushToUser(userId, "notification_created", {
      type,
      title,
      body,
      href,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("notifyUser realtime push failed:", e);
  }
}

function eachDayUTC(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
    out.push(d);
  }
  return out;
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

export async function saveVacationBalanceAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const userId = String(formData.get("userId") ?? "").trim();
  const year = toInt(formData.get("year"));
  const carryoverDays = toInt(formData.get("carryoverDays")) ?? 0;
  const entitledDays = toInt(formData.get("entitledDays")) ?? 0;

  if (!userId || !year) redirect(`/${empresaSlug}/rrhh/vacaciones?err=missing_fields`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/vacaciones?err=empresa_not_found`);

  // Seguridad multiempresa: el usuario debe pertenecer a esa empresa
  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) redirect(`/${empresaSlug}/rrhh/vacaciones?err=user_not_in_empresa`);

  await prisma.timeVacationBalance.upsert({
    where: { empresaId_userId_year: { empresaId: empresa.id, userId, year } },
    create: { empresaId: empresa.id, userId, year, carryoverDays, entitledDays },
    update: { carryoverDays, entitledDays },
  });

  revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);
  redirect(`/${empresaSlug}/rrhh/vacaciones?year=${year}&userId=${userId}&ok=balance_saved`);
}

export async function decideVacationRequestAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const requestId = toInt(formData.get("requestId"));
  const decision = String(formData.get("decision") ?? "").trim();
  const decisionNote = String(formData.get("decisionNote") ?? "").trim() || null;

  if (!requestId || (decision !== "APPROVED" && decision !== "REJECTED")) {
    redirect(`/${empresaSlug}/rrhh/vacaciones?err=invalid_decision`);
  }

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/vacaciones?err=empresa_not_found`);

  const req = await prisma.timeVacationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, empresaId: true, userId: true, from: true, to: true, status: true },
  });
  if (!req || req.empresaId !== empresa.id) {
    redirect(`/${empresaSlug}/rrhh/vacaciones?err=request_not_found`);
  }

  // ✅ Idempotencia: no notifica, solo evita petar
  if (decision === "APPROVED" && req.status === "APPROVED") {
    await prisma.timeVacationRequest.update({
      where: { id: req.id },
      data: { decidedAt: new Date(), decisionNote },
    });

    revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);
    redirect(`/${empresaSlug}/rrhh/vacaciones?ok=already_approved`);
  }

  if (decision === "REJECTED" && req.status === "REJECTED") {
    await prisma.timeVacationRequest.update({
      where: { id: req.id },
      data: { decidedAt: new Date(), decisionNote },
    });

    revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);
    redirect(`/${empresaSlug}/rrhh/vacaciones?ok=already_rejected`);
  }

  if (decision === "APPROVED") {
    const year = req.from.getUTCFullYear();
    const fromYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const toYear = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    const holidays = await prisma.timeHoliday.findMany({
      where: {
        date: { gte: fromYear, lt: toYear },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));

    // ✅ Solape real de cierres: from <= req.to AND to >= req.from
    const closures = await prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        from: { lte: req.to },
        to: { gte: req.from },
      },
      select: { from: true, to: true },
    });
    const inClosure = (d: Date) => closures.some((c) => d >= c.from && d <= c.to);

    const existing = await prisma.timeDay.findMany({
      where: {
        empresaId: empresa.id,
        userId: req.userId,
        date: { gte: req.from, lte: req.to },
      },
      select: {
        date: true,
        type: true,
        morningIn: true,
        morningOut: true,
        afternoonIn: true,
        afternoonOut: true,
        signedAt: true,
        lockedAt: true,
      },
    });

    // ✅ Conflicto SOLO si hay fichajes, firmado/bloqueado,
    // o si el tipo es “no editable” (ni WORK ni VACATION).
    const conflicts = existing.filter((d) => {
      const hasTimes = !!d.morningIn || !!d.morningOut || !!d.afternoonIn || !!d.afternoonOut;
      const isSigned = !!d.signedAt || !!d.lockedAt;
      const isHardNonEditable = d.type !== "WORK" && d.type !== "VACATION";
      return hasTimes || isSigned || isHardNonEditable;
    });

    if (conflicts.length) {
      redirect(`/${empresaSlug}/rrhh/vacaciones?err=conflict_days&requestId=${req.id}`);
    }

    // ✅ Solo materializamos vacaciones en laborables que NO son festivo/finde y NO están dentro de cierre
    const targetDates = eachDayUTC(req.from, req.to).filter((d) => {
      if (isWeekend(d)) return false;
      if (holidaySet.has(dateISO(d))) return false;
      if (inClosure(d)) return false;
      return true;
    });

    // ✅ Transacción: aprobar + crear días + atar legacy
    await prisma.$transaction(async (tx) => {
      await tx.timeVacationRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          decidedAt: new Date(),
          decisionNote,
        },
      });

      if (targetDates.length) {
        await tx.timeDay.createMany({
          data: targetDates.map((d) => ({
            empresaId: empresa.id,
            userId: req.userId,
            date: d,
            type: "VACATION",
            note: "VACACIONES",
            vacationRequestId: req.id,
          })),
          skipDuplicates: true,
        });
      }

      // ✅ Si existían días VACATION de antes (skipDuplicates), los “atamos” a la solicitud
      await tx.timeDay.updateMany({
        where: {
          empresaId: empresa.id,
          userId: req.userId,
          date: { gte: req.from, lte: req.to },
          type: "VACATION",
          vacationRequestId: null,
          morningIn: null,
          morningOut: null,
          afternoonIn: null,
          afternoonOut: null,
          signedAt: null,
          lockedAt: null,
        },
        data: { vacationRequestId: req.id },
      });
    });

    // ✅ Notificación SOLO cuando ya está aprobado de verdad
    await notifyUser({
      userId: req.userId,
      empresaId: empresa.id,
      type: NotificationType.VACATION_APPROVED,
      title: "Vacaciones aprobadas ✅",
      body: `Del ${fmt(req.from)} al ${fmt(req.to)}` + (decisionNote ? ` · Nota: ${decisionNote}` : ""),
      href: `/account/vacations/${empresaSlug}`,
    });
  } else {
    // REJECTED (cambio real de estado)
    await prisma.timeVacationRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        decidedAt: new Date(),
        decisionNote,
      },
    });

    await notifyUser({
      userId: req.userId,
      empresaId: empresa.id,
      type: NotificationType.VACATION_REJECTED,
      title: "Vacaciones rechazadas ❌",
      body: `Del ${fmt(req.from)} al ${fmt(req.to)}` + (decisionNote ? ` · Nota: ${decisionNote}` : ""),
      href: `/account/vacations/${empresaSlug}`,
    });
  }

  revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);
  redirect(`/${empresaSlug}/rrhh/vacaciones?ok=decided`);
}

export async function deleteVacationRequestAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const requestId = toInt(formData.get("requestId"));
  const year = toInt(formData.get("year"));
  const userId = String(formData.get("userId") ?? "").trim();

  if (!requestId) redirect(`/${empresaSlug}/rrhh/vacaciones?err=request_not_found`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/vacaciones?err=empresa_not_found`);

  const req = await prisma.timeVacationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, empresaId: true, userId: true, from: true, to: true, status: true },
  });

  if (!req || req.empresaId !== empresa.id) {
    redirect(`/${empresaSlug}/rrhh/vacaciones?err=request_not_found`);
  }

  await prisma.$transaction(async (tx) => {
    // 1) Borra días creados por esta solicitud (si estaban ligados)
    await tx.timeDay.deleteMany({
      where: {
        empresaId: empresa.id,
        userId: req.userId,
        OR: [
          { vacationRequestId: req.id },
          {
            vacationRequestId: null,
            type: "VACATION",
            note: "VACACIONES",
            date: { gte: req.from, lte: req.to },
          },
        ],
      },
    });

    // 2) BORRADO “RESCATE”
    await tx.timeDay.deleteMany({
      where: {
        empresaId: empresa.id,
        userId: req.userId,
        date: { gte: req.from, lte: req.to },
        type: "VACATION",
        vacationRequestId: null,
        morningIn: null,
        morningOut: null,
        afternoonIn: null,
        afternoonOut: null,
        signedAt: null,
        lockedAt: null,
      },
    });

    // 3) Borra la solicitud
    await tx.timeVacationRequest.delete({ where: { id: req.id } });
  });

  revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);

  const qYear = year ? `year=${year}` : "";
  const qUser = userId ? `userId=${encodeURIComponent(userId)}` : "";
  const join = qYear && qUser ? "&" : "";
  const qs = qYear || qUser ? `?${qYear}${join}${qUser}&ok=request_deleted` : `?ok=request_deleted`;
  redirect(`/${empresaSlug}/rrhh/vacaciones${qs}`);
}

export async function reopenVacationRequestAction(formData: FormData) {
  const empresaSlug = String(formData.get("empresaSlug") ?? "").trim();
  await requireRRHH(empresaSlug);

  const requestId = toInt(formData.get("requestId"));
  const year = toInt(formData.get("year"));
  const userId = String(formData.get("userId") ?? "").trim();

  if (!requestId) redirect(`/${empresaSlug}/rrhh/vacaciones?err=request_not_found`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true },
  });
  if (!empresa) redirect(`/${empresaSlug}/rrhh/vacaciones?err=empresa_not_found`);

  const req = await prisma.timeVacationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, empresaId: true, userId: true, from: true, to: true },
  });
  if (!req || req.empresaId !== empresa.id) {
    redirect(`/${empresaSlug}/rrhh/vacaciones?err=request_not_found`);
  }

  await prisma.$transaction(async (tx) => {
    // Desmaterializa días creados por esta solicitud (si existían)
    await tx.timeDay.deleteMany({
      where: { empresaId: empresa.id, userId: req.userId, vacationRequestId: req.id },
    });

    await tx.timeVacationRequest.update({
      where: { id: req.id },
      data: { status: "PENDING", decidedAt: null, decisionNote: null },
    });
  });

  // ✅ Notifica al usuario: vuelve a PENDING
  await notifyUser({
    userId: req.userId,
    empresaId: empresa.id,
    type: NotificationType.VACATION_REQUESTED, // reutilizamos tipo RRHH para “estado pendiente”
    title: "Solicitud reabierta 🔁",
    body: `Tu solicitud de vacaciones vuelve a estado PENDIENTE · ${fmt(req.from)} → ${fmt(req.to)}`,
    href: `/account/vacations/${empresaSlug}`,
  });

  revalidatePath(`/${empresaSlug}/rrhh/vacaciones`);

  const qYear = year ? `year=${year}` : "";
  const qUser = userId ? `userId=${encodeURIComponent(userId)}` : "";
  const join = qYear && qUser ? "&" : "";
  const qs = qYear || qUser ? `?${qYear}${join}${qUser}&ok=request_reopened` : `?ok=request_reopened`;
  redirect(`/${empresaSlug}/rrhh/vacaciones${qs}`);
}
