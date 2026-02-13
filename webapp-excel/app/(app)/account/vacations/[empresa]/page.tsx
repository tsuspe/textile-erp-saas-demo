// app/(app)/account/vacations/[empresa]/page.tsx
import YearPicker from "@/app/components/rrhh/YearPicker";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requestVacationAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pickYear(sp?: Record<string, string | string[] | undefined>) {
  const raw = sp?.year;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  const now = new Date();
  const y = Number.isFinite(n) && n >= 2020 && n <= 2100 ? n : now.getUTCFullYear();
  return y;
}

function fmtISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function monthLabelES(m0: number) {
  const names = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  return names[m0] ?? "";
}

function getMonthGridUTC(year: number, month0: number) {
  const first = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0, 0, 0, 0)).getUTCDate();
  const firstW = (first.getUTCDay() + 6) % 7; // 0..6 where 0=L

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstW; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(Date.UTC(year, month0, d, 0, 0, 0)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function businessDaysInRange(from: Date, to: Date, isBlocked: (d: Date) => boolean) {
  let count = 0;
  for (let dt = new Date(from); dt <= to; dt = new Date(dt.getTime() + 86400000)) {
    if (isWeekend(dt) || isBlocked(dt)) continue;
    count++;
  }
  return count;
}

export default async function AccountVacationsEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const year = pickYear(sp);

  const session = await getAppSession();
  const sessionUser = (session as any)?.user as SessionUser | undefined;
  if (!sessionUser) redirect(`/login?next=/account/vacations/${empresaSlug}`);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) notFound();

  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: sessionUser.id, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) redirect(`/account/vacations?err=no_empresa_access`);

  const fromY = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const toY = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

  const [holidays, closures, balance, vacationDays, workDays, requests] = await Promise.all([
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: fromY, lt: toY },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true },
    }),
    prisma.timeCompanyVacation.findMany({
      // ✅ overlap correcto
      where: { empresaId: empresa.id, from: { lt: toY }, to: { gte: fromY } },
      select: { from: true, to: true },
    }),
    prisma.timeVacationBalance.findUnique({
      where: {
        empresaId_userId_year: {
          empresaId: empresa.id,
          userId: sessionUser.id,
          year,
        },
      },
      select: { carryoverDays: true, entitledDays: true },
    }),
    prisma.timeDay.findMany({
      where: {
        empresaId: empresa.id,
        userId: sessionUser.id,
        date: { gte: fromY, lt: toY },
        type: "VACATION",
      },
      select: { date: true },
    }),
    // ✅ Necesario para overrides: si RRHH pone WORK en un día de cierre, ese día NO consume cierre
    prisma.timeDay.findMany({
      where: {
        empresaId: empresa.id,
        userId: sessionUser.id,
        date: { gte: fromY, lt: toY },
        type: "WORK",
      },
      select: { date: true },
    }),
    prisma.timeVacationRequest.findMany({
      where: {
        empresaId: empresa.id,
        userId: sessionUser.id,
        AND: [{ from: { lt: toY } }, { to: { gte: fromY } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, from: true, to: true, status: true, reason: true, decisionNote: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));
  const overrideWorkSet = new Set(workDays.map((d) => dateISO(d.date)));

  const inClosure = (d: Date) => closures.some((v) => d >= v.from && d <= v.to);

  /**
   * ✅ "Blocked" para cálculos de vacaciones:
   * - festivo sí bloquea
   * - cierre SOLO bloquea si NO hay override WORK (si trabajas ese día, NO está bloqueado)
   */
  const isBlocked = (d: Date) => {
    const iso = dateISO(d);
    if (holidaySet.has(iso)) return true;
    if (inClosure(d) && !overrideWorkSet.has(iso)) return true;
    return false;
  };

  // ✅ Cierre "reservado": laborables del cierre, excepto festivos/finde,
  // y EXCEPTO días trabajados por override (WORK).
  const closureReserved = closures.reduce((acc, v) => {
    // recorta el rango al año actual
    const from = v.from < fromY ? fromY : v.from;
    const to = v.to >= toY ? new Date(toY.getTime() - 86400000) : v.to; // último día dentro del año

    let count = 0;
    for (let dt = new Date(from); dt <= to; dt = new Date(dt.getTime() + 86400000)) {
      const iso = dateISO(dt);
      if (isWeekend(dt)) continue;
      if (holidaySet.has(iso)) continue;

      // ✅ si ese día se trabajó por override, NO consume cierre
      if (overrideWorkSet.has(iso)) continue;

      count++;
    }
    return acc + count;
  }, 0);

  const carry = balance?.carryoverDays ?? 0;
  const entitled = balance?.entitledDays ?? 0;
  const total = carry + entitled;

  // Disfrutados reales: contamos TimeDay VACATION y quitamos días no laborables/bloqueados
  // (con el nuevo isBlocked, un cierre trabajado ya NO está bloqueado, pero tampoco debería existir VACATION ahí si RRHH lo cambió bien)
  const usedReal = vacationDays.filter((vd) => !isWeekend(vd.date) && !isBlocked(vd.date)).length;
  const used = usedReal;

  const remaining = Math.max(0, total - used - closureReserved);

  const nowY = new Date().getUTCFullYear();
  const years = Array.from({ length: 7 }).map((_, i) => nowY - 2 + i);

  // En solicitudes: NO contamos festivos/cierre (salvo cierre trabajado, que en práctica no deberías solicitar)
  const requestCount = (r: { from: Date; to: Date }) => businessDaysInRange(r.from, r.to, isBlocked);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Cuenta / Vacaciones</div>
            <h1 className="text-xl font-semibold">
              {empresa.nombre} · {year}
            </h1>
            <p className="text-sm text-white/70">
              Festivos y cierre salen del calendario de empresa. Las vacaciones cuentan solo días laborables.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/account/vacations`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              Volver
            </Link>

            <YearPicker basePath={`/account/vacations/${empresaSlug}`} years={years} defaultYear={year} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/60">Acumulados</div>
          <div className="text-2xl font-semibold">{carry}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/60">Año en curso</div>
          <div className="text-2xl font-semibold">{entitled}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/60">Disfrutados</div>
          <div className="text-2xl font-semibold">{used}</div>
          <div className="text-xs text-white/50">(según aprobación)</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/60">Cierre empresa</div>
          <div className="text-2xl font-semibold">{closureReserved}</div>
          <div className="text-xs text-white/50">(laborables del año, sin cierres trabajados)</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/60">Quedan</div>
          <div className="text-2xl font-semibold">{remaining}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Nueva solicitud</div>

        <form action={requestVacationAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="empresaSlug" value={empresaSlug} />
          <input type="hidden" name="year" value={String(year)} />

          <label className="space-y-1">
            <div className="text-xs text-white/60">Desde</div>
            <input
              name="from"
              type="date"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-white/60">Hasta</div>
            <input
              name="to"
              type="date"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="space-y-1 min-w-[220px] flex-1">
            <div className="text-xs text-white/60">Motivo (opcional)</div>
            <input
              name="reason"
              placeholder="Ej: Viaje / médico / asuntos propios"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <button className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15">
            Solicitar
          </button>
        </form>

        <div className="text-xs text-white/50">
          Nota: el cálculo de días solicitados ignora fines de semana, festivos y cierre de empresa.
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/60">Calendario</div>
        <div className="text-lg font-semibold">Vista anual</div>
        <div className="text-sm text-white/70">
          Amarillo: festivo/finde · Naranja: cierre empresa · Verde: vacaciones disfrutadas · Azul: ausencia justificada · (Cierre trabajado no pinta naranja)
        </div>

        <YearGrid
          year={year}
          holidaySet={holidaySet}
          inClosure={inClosure}
          empresaId={empresa.id}
          userId={sessionUser.id}
          overrideWorkSet={overrideWorkSet}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Mis solicitudes</div>

        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {fmtISO(r.from)} → {fmtISO(r.to)}
                    <span className="text-white/50"> · {requestCount(r)} días</span>
                  </div>
                  <div className="text-sm text-white/70">{r.reason ?? "—"}</div>
                </div>

                <div className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {r.status}
                </div>
              </div>

              {r.decisionNote ? <div className="mt-2 text-sm text-white/60">Nota: {r.decisionNote}</div> : null}
            </div>
          ))}

          {requests.length === 0 ? (
            <div className="text-sm text-white/70">Aún no has pedido vacaciones este año.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function YearGrid(props: {
  empresaId: number;
  userId: string;
  year: number;
  holidaySet: Set<string>;
  inClosure: (d: Date) => boolean;
  overrideWorkSet: Set<string>;
}) {
  const { empresaId, userId, year, holidaySet, inClosure, overrideWorkSet } = props;
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

  const [vacationDays, absenceDays] = await Promise.all([
    prisma.timeDay.findMany({
      where: { empresaId, userId, date: { gte: from, lt: to }, type: "VACATION" },
      select: { date: true },
    }),
    prisma.timeDay.findMany({
      where: { empresaId, userId, date: { gte: from, lt: to }, type: "ABSENCE" },
      select: { date: true },
    }),
  ]);

  const vacSet = new Set(vacationDays.map((d) => dateISO(d.date)));
  const absSet = new Set(absenceDays.map((d) => dateISO(d.date)));


  const months = Array.from({ length: 12 }).map((_, m0) => m0);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      {months.map((m0) => {
        const cells = getMonthGridUTC(year, m0);
        return (
          <div key={m0} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="font-semibold">{monthLabelES(m0)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-white/60">
              {["L", "M", "X", "J", "V", "S", "D"].map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, idx) => {
                if (!d) return <div key={idx} className="h-6" />;

                const iso = dateISO(d);
                const isHol = holidaySet.has(iso) || isWeekend(d);
                const isCloseLaborable = inClosure(d) && !isHol;

                // ✅ Si trabajó el cierre, no lo pintamos naranja
                const isCloseWorkedOverride = isCloseLaborable && overrideWorkSet.has(iso);

                const isVac = vacSet.has(iso);
                const isAbs = absSet.has(iso);

                const bg = isVac
                  ? "bg-emerald-500/25 border-emerald-500/30"
                  : isAbs
                  ? "bg-sky-500/25 border-sky-500/30"
                  : isHol
                  ? "bg-amber-500/25 border-amber-500/30"
                  : isCloseLaborable && !isCloseWorkedOverride
                  ? "bg-orange-500/25 border-orange-500/30"
                  : "bg-white/0 border-white/10";


                return (
                  <div
                    key={idx}
                    className={`h-6 rounded border ${bg} flex items-center justify-center text-[11px]`}
                    title={iso}
                  >
                    {d.getUTCDate()}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
