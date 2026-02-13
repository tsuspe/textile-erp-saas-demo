// app/(app)/account/time/[empresa]/[ym]/page.tsx
import SignDayButton from "@/app/components/time/SignDayButton";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fillMonthAction, saveDayAction, signDayAction } from "../../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isYm(s: string) {
  return /^\d{4}-\d{2}$/.test(s);
}

function ymAdd(ym: string, deltaMonths: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1, 0, 0, 0));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function ymToRange(ym: string) {
  const [y, m] = ym.split("-").map((v) => Number(v));
  if (!y || !m || m < 1 || m > 12) return null;
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { from, to, y, m };
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date) {
  const wd = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getUTCDay()];
  return wd;
}

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function isInCompanyVacation(
  d: Date,
  vacs: { from: Date; to: Date; reason: string | null }[],
) {
  const t = d.getTime();
  return vacs.find((v) => t >= v.from.getTime() && t <= v.to.getTime()) ?? null; // "to" inclusivo
}

export default async function TimeMonthPage({
  params,
}: {
  params: Promise<{ empresa: string; ym: string }>;
}) {
  const { empresa: empresaSlug, ym } = await params;

  if (!isYm(ym)) notFound();

  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect(`/login?next=/account/time/${empresaSlug}/${ym}`);

  const range = ymToRange(ym);
  if (!range) notFound();

  const ymPrev = ymAdd(ym, -1);
  const ymNext = ymAdd(ym, +1);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) notFound();

  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) redirect(`/account/time?err=no_empresa_access`);

  const [days, holidays, companyVacations] = await Promise.all([
    prisma.timeDay.findMany({
      where: {
        userId: user.id,
        empresaId: empresa.id,
        date: { gte: range.from, lt: range.to },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        morningIn: true,
        morningOut: true,
        type: true,
        note: true,
        lockedAt: true,
        signedAt: true,
      },
    }),
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: range.from, lt: range.to },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true, name: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        from: { lt: range.to },
        to: { gte: range.from },
      },
      orderBy: [{ from: "asc" }, { to: "asc" }],
      select: { from: true, to: true, reason: true },
    }),
  ]);

  const dayByISO = new Map(days.map((d) => [dateISO(d.date), d]));
  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));

  const allDates: Date[] = [];
  for (
    let dt = new Date(range.from);
    dt < range.to;
    dt = new Date(dt.getTime() + 86400000)
  ) {
    allDates.push(dt);
  }

  function bgFor(d: Date, type: string | null | undefined) {
    if (type === "VACATION") return "bg-orange-500/15 border-orange-500/25";
    if (type === "ABSENCE") return "bg-sky-500/15 border-sky-500/25";
    if (holidaySet.has(dateISO(d))) return "bg-yellow-500/10 border-yellow-500/25";
    if (isWeekend(d)) return "bg-yellow-500/10 border-yellow-500/25";
    return "bg-black/20 border-white/10";
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        {/* Header */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm text-slate-400">
                Mi cuenta / Control horario / {empresa.nombre}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {ym} · Registro mensual
              </h1>
              <div className="text-sm text-slate-300">
                Colores: amarillo finde/festivo · naranja vacaciones · azul ausencia.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/account/time`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                title="Volver"
              >
                Volver
              </Link>

              <Link
                href={`/account/time/${empresaSlug}/${ymPrev}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                title="Mes anterior"
              >
                ← {ymPrev}
              </Link>

              <Link
                href={`/account/time/${empresaSlug}/${ymNext}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                title="Mes siguiente"
              >
                {ymNext} →
              </Link>

              <Link
                href={`/account/time/${empresaSlug}/${ym}/print`}
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/15"
              >
                Imprimir mes
              </Link>

              <form action={fillMonthAction}>
                <input type="hidden" name="empresaSlug" value={empresaSlug} />
                <input type="hidden" name="ym" value={ym} />
                <button className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15">
                  Rellenar 08:00–16:00
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-slate-400 mb-3">Días del mes</div>

          <div className="space-y-2">
            {allDates.map((d) => {
              const iso = dateISO(d);
              const row = dayByISO.get(iso);
              const locked = Boolean(row?.lockedAt);

              const vac = isInCompanyVacation(d, companyVacations);

              // ✅ Override SOLO si hay cierre y el día está forzado a WORK
              const isWorkOverride = Boolean(vac) && row?.type === "WORK";

              const blockedByCalendar =
                (!isWorkOverride && Boolean(vac)) || holidaySet.has(iso) || isWeekend(d);

              const effectiveType = row?.type ?? (vac ? "VACATION" : "WORK");
              const note = row?.note ?? "";


              return (
                <div
                  key={iso}
                  className={`rounded-lg border p-3 ${bgFor(
                    d,
                    effectiveType,
                  )} flex flex-col gap-2 md:flex-row md:items-center md:justify-between`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      Día {d.getUTCDate()}{" "}
                      <span className="text-slate-400 font-normal">
                        ({dayLabel(d)})
                      </span>
                      {locked ? (
                        <span className="ml-2 text-xs text-emerald-200/80">· Firmado</span>
                      ) : null}
                    </div>

                    <div className="text-xs text-slate-400">
                      {holidaySet.has(iso)
                        ? "Festivo"
                        : isWeekend(d)
                        ? "Fin de semana"
                        : "Laborable"}
                      {vac && !isWorkOverride
                        ? ` · Vacaciones colectivas${vac.reason ? ` (${vac.reason})` : ""}`
                        : ""}
                      {vac && isWorkOverride ? " · Excepción cierre (trabajado)" : ""}
                      {effectiveType === "VACATION" && !vac ? " · Vacaciones" : ""}

                      {effectiveType === "ABSENCE" ? " · Ausencia" : ""}
                    </div>
                  </div>

                  <div className="w-full md:w-auto">
                    <form action={saveDayAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="empresaSlug" value={empresaSlug} />
                      <input type="hidden" name="ym" value={ym} />
                      <input type="hidden" name="date" value={iso} />

                      <select
                        name="type"
                        defaultValue={effectiveType}
                        disabled={locked || blockedByCalendar}
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none disabled:opacity-60"
                        title="Tipo de día"
                      >
                        <option value="WORK">Trabajo</option>
                        <option value="VACATION">Vacaciones</option>
                        <option value="ABSENCE">Ausencia</option>
                      </select>

                      <input
                        name="morningIn"
                        defaultValue={row?.morningIn ?? ""}
                        placeholder="08:00"
                        disabled={locked || blockedByCalendar || effectiveType !== "WORK"}
                        className="w-[70px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none disabled:opacity-60"
                        title="Entrada (mañana)"
                      />
                      <input
                        name="morningOut"
                        defaultValue={row?.morningOut ?? ""}
                        placeholder="16:00"
                        disabled={locked || blockedByCalendar || effectiveType !== "WORK"}
                        className="w-[70px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none disabled:opacity-60"
                        title="Salida (mañana)"
                      />

                      <input
                        name="note"
                        defaultValue={note}
                        placeholder="nota (opcional)"
                        disabled={locked || blockedByCalendar}
                        className="w-[180px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none disabled:opacity-60"
                        title="Nota"
                      />

                      <button
                        type="submit"
                        disabled={locked || blockedByCalendar}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-60"
                      >
                        Guardar
                      </button>
                    </form>
                  </div>

                  <div className="flex items-center gap-2">
                    <SignDayButton
                      empresaSlug={empresaSlug}
                      ym={ym}
                      dateISO={iso}
                      action={signDayAction}
                      disabled={locked || blockedByCalendar}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
