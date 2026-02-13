// app/(app)/[empresa]/rrhh/control-horario/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import YearPicker from "@/app/components/rrhh/YearPicker";

import {
  rrhhClearDayAction,
  rrhhSetDayTypeAction,
  rrhhUnlockDayAction,
  rrhhUnlockMonthAction,
} from "./actions";

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthRangeUTC(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { from, to };
}

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function dayLabel(d: Date) {
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getUTCDay()];
}

function isInCompanyVacation(
  d: Date,
  vacs: { from: Date; to: Date; reason: string | null }[],
) {
  const t = d.getTime();
  return vacs.find((v) => t >= v.from.getTime() && t <= v.to.getTime()) ?? null; // to inclusivo
}

export default async function RRHHControlHorarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};

  await requireRRHH(empresaSlug);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, nombre: true, slug: true },
  });
  if (!empresa) notFound();

  const now = new Date();
  const year = toInt(spGet(sp, "year")) ?? now.getUTCFullYear();
  const month = toInt(spGet(sp, "month")) ?? now.getUTCMonth() + 1;

  // usuarios de la empresa
  const users = await prisma.userEmpresa.findMany({
    where: { empresaId: empresa.id },
    select: { user: { select: { id: true, name: true, username: true } } },
    orderBy: { userId: "asc" },
  });
  const userList = users.map((u) => u.user);

  // ✅ Importante: por defecto NO seleccionamos el primer trabajador.
  // Evita el "me pensaba que estaba viendo a otro" al refrescar.
  const selectedUserId = spGet(sp, "userId") || "";
  const activeUser = userList.find((u) => u.id === selectedUserId) ?? null;

  const { from, to } = monthRangeUTC(year, month);

  // 🔎 Para RRHH necesitamos ver también festivos y cierres de empresa aunque no exista TimeDay.
  const [days, holidays, companyVacations] = selectedUserId
    ? await Promise.all([
        prisma.timeDay.findMany({
          where: {
            empresaId: empresa.id,
            userId: selectedUserId,
            date: { gte: from, lt: to },
          },
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            type: true,
            morningIn: true,
            morningOut: true,
            afternoonIn: true,
            afternoonOut: true,
            note: true,
            signedAt: true,
            lockedAt: true,
          },
        }),
        prisma.timeHoliday.findMany({
          where: {
            date: { gte: from, lt: to },
            OR: [{ empresaId: empresa.id }, { empresaId: null }],
          },
          select: { date: true, name: true },
        }),
        prisma.timeCompanyVacation.findMany({
          where: {
            empresaId: empresa.id,
            from: { lt: to },
            to: { gte: from },
          },
          orderBy: [{ from: "asc" }, { to: "asc" }],
          select: { from: true, to: true, reason: true },
        }),
      ])
    : [[], [], []];

  const dayByISO = new Map(days.map((d) => [iso(d.date), d]));
  const holidayByISO = new Map(holidays.map((h) => [iso(h.date), h.name ?? "Festivo"]));

  const allDates: Date[] = [];
  for (let dt = new Date(from); dt < to; dt = new Date(dt.getTime() + 86400000)) {
    allDates.push(dt);
  }

  const nowY = new Date().getUTCFullYear();
  const years = Array.from({ length: 7 }).map((_, i) => nowY - 2 + i);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">RRHH / Control horario</div>
            <h1 className="text-xl font-semibold">
              {empresa.nombre} · {year}-{pad2(month)}
            </h1>
            <p className="text-sm text-white/70">
              Desbloqueo de firmas y rectificación (WORK / VACATION).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${empresaSlug}/rrhh`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              Volver
            </Link>

            <YearPicker basePath={`/${empresaSlug}/rrhh/control-horario`} years={years} defaultYear={year} />

            <form method="GET" action={`/${empresaSlug}/rrhh/control-horario`}>
              <input type="hidden" name="year" value={String(year)} />
              <input type="hidden" name="userId" value={selectedUserId} />
              <select
                name="month"
                defaultValue={String(month)}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {pad2(i + 1)}
                  </option>
                ))}
              </select>
              <button className="ml-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                Ir
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Trabajador</div>

        <div className="flex flex-wrap items-end gap-2">
          <form method="GET" action={`/${empresaSlug}/rrhh/control-horario`} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="year" value={String(year)} />
            <input type="hidden" name="month" value={String(month)} />
            <select
              name="userId"
              defaultValue={selectedUserId}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            >
              <option value="">— Selecciona trabajador —</option>
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
              Ver
            </button>
          </form>

          {activeUser ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link
                href={`/account/time/${empresaSlug}/${year}-${pad2(month)}/print?from=rrhh&userId=${encodeURIComponent(
                  selectedUserId,
                )}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Imprimir mes
              </Link>
              <form action={rrhhUnlockMonthAction}>
                <input type="hidden" name="empresaSlug" value={empresaSlug} />
                <input type="hidden" name="userId" value={selectedUserId} />
                <input type="hidden" name="year" value={String(year)} />
                <input type="hidden" name="month" value={String(month)} />
                <ConfirmSubmitButton
                  confirmMessage="¿Desbloquear TODO el mes? (quita signedAt/lockedAt)"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  Desbloquear mes
                </ConfirmSubmitButton>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/60 mb-3">Días del mes</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/60">
              <tr className="border-b border-white/10">
                <th className="py-2 text-left">Fecha</th>
                <th className="py-2 text-left">Tipo</th>
                <th className="py-2 text-left">Horas</th>
                <th className="py-2 text-left">Firma</th>
                <th className="py-2 text-right">Acciones RRHH</th>
              </tr>
            </thead>
            <tbody>
              {!activeUser ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-white/60">
                    Selecciona un trabajador para ver el mes.
                  </td>
                </tr>
              ) : (
                allDates.map((d) => {
                  const key = iso(d);
                  const row = dayByISO.get(key);

                  const signed = !!row?.signedAt || !!row?.lockedAt;
                  const hours = row
                    ? `${row.morningIn ?? "--"}-${row.morningOut ?? "--"} / ${row.afternoonIn ?? "--"}-${row.afternoonOut ?? "--"}`
                    : "—";

                  const holidayName = holidayByISO.get(key) ?? null;
                  const vac = isInCompanyVacation(d, companyVacations);

                  // ✅ si hay cierre y RRHH fuerza WORK, lo tratamos como excepción trabajada
                  const isWorkOverride = Boolean(vac) && row?.type === "WORK";

                  // Tipo "efectivo" que se ve en la tabla (aunque no exista TimeDay)
                  const effectiveType =
                    row?.type ?? (vac ? "VACATION" : holidayName || isWeekend(d) ? "HOLIDAY" : "WORK");

                  // Etiqueta humana
                  const typeLabel =
                    effectiveType === "VACATION"
                      ? vac && !isWorkOverride
                        ? `VACATION · CIERRE${vac.reason ? ` (${vac.reason})` : ""}`
                        : "VACATION"
                      : effectiveType === "HOLIDAY"
                      ? holidayName
                        ? `HOLIDAY · ${holidayName}`
                        : isWeekend(d)
                        ? "WEEKEND"
                        : "HOLIDAY"
                      : isWorkOverride
                      ? "WORK · Override cierre"
                      : "WORK";

                  // Color rápido
                  const typeClass =
                    effectiveType === "VACATION"
                      ? "text-amber-200"
                      : effectiveType === "HOLIDAY"
                      ? "text-yellow-200"
                      : isWorkOverride
                      ? "text-emerald-200"
                      : "text-white/80";

                  return (
                    <tr key={key} className="border-b border-white/5">
                      <td className="py-2">
                        {key} <span className="text-white/40">({dayLabel(d)})</span>
                      </td>
                      <td className={`py-2 ${typeClass}`}>{typeLabel}</td>
                      <td className="py-2 text-white/70">{hours}</td>
                      <td className="py-2 text-white/70">{signed ? "FIRMADO/BLOQUEADO" : "—"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {row ? (
                            <form action={rrhhUnlockDayAction}>
                              <input type="hidden" name="empresaSlug" value={empresaSlug} />
                              <input type="hidden" name="userId" value={selectedUserId} />
                              <input type="hidden" name="year" value={String(year)} />
                              <input type="hidden" name="date" value={key} />
                              <ConfirmSubmitButton
                                confirmMessage={`¿Desbloquear el día ${key}?`}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                              >
                                Desbloquear día
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}

                          <form action={rrhhSetDayTypeAction}>
                            <input type="hidden" name="empresaSlug" value={empresaSlug} />
                            <input type="hidden" name="userId" value={selectedUserId} />
                            <input type="hidden" name="year" value={String(year)} />
                            <input type="hidden" name="month" value={String(month)} />
                            <input type="hidden" name="date" value={key} />
                            <input type="hidden" name="type" value="WORK" />
                            <ConfirmSubmitButton
                              confirmMessage={`¿Marcar ${key} como WORK? (sirve para trabajar en día de cierre)`}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15"
                            >
                              Poner WORK
                            </ConfirmSubmitButton>
                          </form>

                          <form action={rrhhSetDayTypeAction}>
                            <input type="hidden" name="empresaSlug" value={empresaSlug} />
                            <input type="hidden" name="userId" value={selectedUserId} />
                            <input type="hidden" name="year" value={String(year)} />
                            <input type="hidden" name="month" value={String(month)} />
                            <input type="hidden" name="date" value={key} />
                            <input type="hidden" name="type" value="VACATION" />
                            <ConfirmSubmitButton
                              confirmMessage={`¿Marcar ${key} como VACATION?`}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/15"
                            >
                              Poner VACATION
                            </ConfirmSubmitButton>
                          </form>

                          {row ? (
                            <form action={rrhhClearDayAction}>
                              <input type="hidden" name="empresaSlug" value={empresaSlug} />
                              <input type="hidden" name="userId" value={selectedUserId} />
                              <input type="hidden" name="year" value={String(year)} />
                              <input type="hidden" name="month" value={String(month)} />
                              <input type="hidden" name="date" value={key} />
                              <ConfirmSubmitButton
                                confirmMessage={`¿Borrar fichajes y dejar el día limpio? (${key})`}
                                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15"
                              >
                                Limpiar día
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-white/50">
          Nota: “Poner WORK” es la excepción para trabajar en día de cierre (así no se pinta como cierre en vacaciones y no descuenta).
        </div>
      </div>
    </div>
  );
}
