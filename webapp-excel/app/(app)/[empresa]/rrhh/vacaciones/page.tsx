// app/(app)/[empresa]/rrhh/vacaciones/page.tsx
import YearPicker from "@/app/components/rrhh/YearPicker";
import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";

import {
  decideVacationRequestAction,
  deleteVacationRequestAction,
  reopenVacationRequestAction,
  saveVacationBalanceAction,
} from "./actions";

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

function pickUserId(sp?: Record<string, string | string[] | undefined>) {
  const raw = sp?.userId;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v ? String(v) : "";
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

function yearRange(year: number) {
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { from, to };
}

function monthLabelES(m0: number) {
  const names = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return names[m0] ?? "";
}

function getMonthGridUTC(year: number, month0: number) {
  const first = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const last = new Date(Date.UTC(year, month0 + 1, 0, 0, 0, 0));
  const daysInMonth = last.getUTCDate();
  const startWeekday = (first.getUTCDay() + 6) % 7; // lunes=0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month0, d, 0, 0, 0)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default async function RRHHVacacionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const year = pickYear(sp);
  const selectedUserId = pickUserId(sp);

  await requireRRHH(empresaSlug);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) notFound();

  const { from, to } = yearRange(year);

  // Usuarios de la empresa
  const users = await prisma.userEmpresa.findMany({
    where: { empresaId: empresa.id },
    select: { user: { select: { id: true, name: true, username: true } } },
    orderBy: { userId: "asc" },
  });
  const userList = users.map((u) => u.user);

  // ✅ Estado inicial "none"
  const activeUserId = selectedUserId;
  const activeUser = activeUserId ? userList.find((u) => u.id === activeUserId) ?? null : null;

  // Datos anuales (independientes del usuario)
  const [holidays, closures, requests] = await Promise.all([
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: from, lt: to },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true, name: true, empresaId: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        from: { lt: to },
        to: { gte: from },
      },
      select: { from: true, to: true, reason: true },
    }),
    prisma.timeVacationRequest.findMany({
      where: {
        empresaId: empresa.id,
        AND: [{ from: { lt: to } }, { to: { gte: from } }],
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        userId: true,
        from: true,
        to: true,
        reason: true,
        status: true,
        decidedAt: true,
        decisionNote: true,
        user: { select: { name: true, username: true } },
      },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));
  const inClosure = (d: Date) => closures.some((c) => d >= c.from && d <= c.to);

  // Datos dependientes de usuario (solo si hay selección)
  const [balance, enjoyedDays, userWorkDays] = activeUserId
    ? await Promise.all([
        prisma.timeVacationBalance.findUnique({
          where: { empresaId_userId_year: { empresaId: empresa.id, userId: activeUserId, year } },
        }),
        prisma.timeDay.count({
          where: {
            empresaId: empresa.id,
            userId: activeUserId,
            date: { gte: from, lt: to },
            type: "VACATION",
          },
        }),
        // ✅ Necesario para overrides: días WORK del usuario en el año
        prisma.timeDay.findMany({
          where: {
            empresaId: empresa.id,
            userId: activeUserId,
            date: { gte: from, lt: to },
            type: "WORK",
          },
          select: { date: true },
        }),
      ])
    : [null, 0, [] as { date: Date }[]];

  // ✅ Set de overrides WORK (para NO descontar cierre si se trabajó)
  const overrideWorkSet = new Set(userWorkDays.map((d) => dateISO(d.date)));

  // Días laborables “reservados” por cierre empresa (descuentan aunque estén en el futuro)
  // ✅ PERO si el usuario tiene override WORK ese día, NO debe descontar
  const closureReserved =
    activeUserId && closures.length
      ? closures.reduce((acc, c) => {
          const fromC = c.from < from ? from : c.from;
          const toC = c.to >= to ? new Date(to.getTime() - 86400000) : c.to; // último día dentro del año

          let count = 0;
          for (let dt = new Date(fromC); dt <= toC; dt = new Date(dt.getTime() + 86400000)) {
            const iso = dateISO(dt);
            if (isWeekend(dt)) continue;
            if (holidaySet.has(iso)) continue;

            // ✅ Si ese día se trabajó por override RRHH, NO consume vacaciones
            if (overrideWorkSet.has(iso)) continue;

            count++;
          }
          return acc + count;
        }, 0)
      : 0;

  const carry = balance?.carryoverDays ?? 0;
  const entitled = balance?.entitledDays ?? 0;
  const total = carry + entitled;
  const remaining = Math.max(0, total - enjoyedDays - closureReserved);

  const nowY = new Date().getUTCFullYear();
  const years = Array.from({ length: 7 }).map((_, i) => nowY - 2 + i);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">RRHH / Vacaciones</div>
            <h1 className="text-xl font-semibold">
              {empresa.nombre} · {year}
            </h1>
            <p className="text-sm text-white/70">
              Saldo anual (acumulable) + solicitudes. Las vacaciones cuentan solo días laborables.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${empresaSlug}/rrhh`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              Volver
            </Link>

            <YearPicker basePath={`/${empresaSlug}/rrhh/vacaciones`} years={years} defaultYear={year} />
          </div>
        </div>
      </div>

      {/* Selector usuario + balance */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Usuario / Saldo</div>

        <form method="GET" action={`/${empresaSlug}/rrhh/vacaciones`} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="year" value={String(year)} />

          <label className="space-y-1">
            <div className="text-xs text-white/60">Trabajador</div>
            <select
              name="userId"
              defaultValue={activeUserId || ""}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            >
              <option value="">— Selecciona trabajador —</option>
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </label>

          <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
            Ver
          </button>

          {activeUser ? (
            <Link
              href={`/${empresaSlug}/rrhh/vacaciones/print?year=${year}&userId=${encodeURIComponent(
                activeUserId,
              )}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Imprimir año
            </Link>
          ) : null}
        </form>

        {!activeUser ? (
          <div className="text-sm text-white/70">Selecciona un trabajador para ver saldo y calendario.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/50">Saldo</div>
              <div className="text-lg font-semibold">{remaining} días</div>
              <div className="text-xs text-white/60">
                Total {total} (acumulados {carry} + año {entitled}) · disfrutados {enjoyedDays} · cierre {closureReserved}
              </div>
            </div>

            <form
              action={saveVacationBalanceAction}
              className="md:col-span-2 rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
            >
              <input type="hidden" name="empresaSlug" value={empresaSlug} />
              <input type="hidden" name="userId" value={activeUserId} />
              <input type="hidden" name="year" value={String(year)} />

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-xs text-white/60">Días acumulados (carryover)</div>
                  <input
                    name="carryoverDays"
                    type="number"
                    min={0}
                    defaultValue={String(carry)}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-white/60">Días del año en curso</div>
                  <input
                    name="entitledDays"
                    type="number"
                    min={0}
                    defaultValue={String(entitled)}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15">
                  Guardar saldo
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Calendario anual (vista rápida) */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <div className="text-sm text-white/60">Calendario</div>
          <div className="text-lg font-semibold">Vista anual</div>
          <div className="text-sm text-white/70">
            Amarillo: festivo/finde · Naranja: cierre empresa · Verde: vacaciones · Azul: ausencia justificada · (Cierre trabajado no pinta naranja)
          </div>
        </div>

        {activeUser ? (
          <YearGrid
            empresaId={empresa.id}
            userId={activeUserId}
            year={year}
            holidaySet={holidaySet}
            inClosure={inClosure}
            overrideWorkSet={overrideWorkSet}
          />
        ) : (
          <div className="mt-4 text-sm text-white/60">(Selecciona un trabajador para ver el calendario.)</div>
        )}
      </div>

      {/* Solicitudes */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Solicitudes</div>

        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {r.user.name} <span className="text-white/50">(@{r.user.username})</span>
                  </div>
                  <div className="text-sm text-white/70">
                    {fmtISO(r.from)} → {fmtISO(r.to)}
                    {r.reason ? <span className="text-white/50"> · {r.reason}</span> : null}
                  </div>
                </div>

                <div className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1">{r.status}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 justify-end">
                {r.status !== "PENDING" ? (
                  <form action={reopenVacationRequestAction}>
                    <input type="hidden" name="empresaSlug" value={empresaSlug} />
                    <input type="hidden" name="requestId" value={String(r.id)} />
                    <input type="hidden" name="year" value={String(year)} />
                    <input type="hidden" name="userId" value={activeUserId} />

                    <ConfirmSubmitButton
                      confirmMessage="¿Reabrir esta solicitud? Si estaba APROBADA se borrarán los días de vacaciones creados."
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    >
                      Reabrir (PENDING)
                    </ConfirmSubmitButton>
                  </form>
                ) : null}

                <form action={deleteVacationRequestAction}>
                  <input type="hidden" name="empresaSlug" value={empresaSlug} />
                  <input type="hidden" name="requestId" value={String(r.id)} />
                  <input type="hidden" name="year" value={String(year)} />
                  <input type="hidden" name="userId" value={activeUserId} />

                  <ConfirmSubmitButton
                    confirmMessage="¿Eliminar la solicitud definitivamente? Si estaba APROBADA se borrarán también los días de vacaciones creados."
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15"
                  >
                    Eliminar
                  </ConfirmSubmitButton>
                </form>
              </div>

              {r.status === "PENDING" ? (
                <div className="mt-3 space-y-2">
                  <form action={decideVacationRequestAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="empresaSlug" value={empresaSlug} />
                    <input type="hidden" name="requestId" value={String(r.id)} />

                    <label className="space-y-1 flex-1 min-w-[220px]">
                      <div className="text-xs text-white/60">Nota (opcional)</div>
                      <input
                        name="decisionNote"
                        placeholder="Ej: OK, coordinado con producción"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      />
                    </label>

                    <button
                      name="decision"
                      value="APPROVED"
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15"
                    >
                      Aprobar
                    </button>
                    <button
                      name="decision"
                      value="REJECTED"
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/15"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              ) : r.decisionNote ? (
                <div className="mt-2 text-sm text-white/60">Nota: {r.decisionNote}</div>
              ) : null}
            </div>
          ))}

          {requests.length === 0 ? <div className="text-sm text-white/70">No hay solicitudes este año.</div> : null}
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

                // ✅ Si trabajó el cierre, NO lo pintamos como cierre (naranja)
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
