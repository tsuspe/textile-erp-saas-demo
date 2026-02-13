// app/(app)/[empresa]/rrhh/calendario/page.tsx
import YearPicker from "@/app/components/rrhh/YearPicker";
import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    addCompanyVacationAction,
    addHolidayAction,
    deleteCompanyVacationAction,
    deleteHolidayAction,
    saveEmpresaPrintConfigAction,
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

export default async function RRHHCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const year = pickYear(sp);

  await requireRRHH(empresaSlug);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: {
      id: true,
      slug: true,
      nombre: true,
      cif: true,
      centroTrabajo: true,
      ccc: true,
      lugarFirma: true,
      textoLegal: true,
    },
  });
  if (!empresa) notFound();

  const { from, to } = yearRange(year);

  const [holidays, vacations] = await Promise.all([
    prisma.timeHoliday.findMany({
      where: {
        empresaId: empresa.id,
        date: { gte: from, lt: to },
      },
      orderBy: { date: "asc" },
      select: { id: true, date: true, name: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        OR: [{ from: { lt: to }, to: { gte: from } }],
      },
      orderBy: [{ from: "asc" }, { to: "asc" }],
      select: { id: true, from: true, to: true, reason: true },
    }),
  ]);

  const nowY = new Date().getUTCFullYear();
  const years = Array.from({ length: 7 }).map((_, i) => nowY - 2 + i);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">RRHH / Calendario</div>
            <h1 className="text-xl font-semibold">
              {empresa.nombre} · {year}
            </h1>
            <p className="text-sm text-white/70">
              Festivos de empresa + vacaciones colectivas (cierre) + configuración de impresión.
            </p>
          </div>

          <div className="flex items-center gap-2">

            <Link
              href={`/${empresaSlug}/rrhh`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              Volver
            </Link>
            

            {/* ✅ Selector de año (Client Component) */}
            <YearPicker
              basePath={`/${empresaSlug}/rrhh/calendario`}
              years={years}
              defaultYear={year}
            />

            {/* Links rápidos opcionales */}
            <Link
              href={`/${empresaSlug}/rrhh/calendario?year=${year - 1}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              ← {year - 1}
            </Link>
            <Link
              href={`/${empresaSlug}/rrhh/calendario?year=${year + 1}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              {year + 1} →
            </Link>
          </div>
        </div>
      </div>

      {/* Preview anual (sin salir de la página) */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <details>
          <summary className="cursor-pointer select-none text-sm text-white/70 hover:text-white">
            Previsualización anual del calendario (festivos + cierres)
          </summary>

          <div className="mt-4">
            <div className="text-sm text-white/60">Vista anual</div>
            <div className="text-sm text-white/70">
              Amarillo: festivo/finde · Naranja: cierre empresa
            </div>

            <YearCalendarPreview
              year={year}
              holidaySet={new Set(holidays.map((h) => dateISO(h.date)))}
              closures={vacations.map((v) => ({ from: v.from, to: v.to }))}
            />
          </div>
        </details>
      </div>

      {/* Config impresión (empresa) */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm text-white/60">Documento / Datos empresa</div>

        <form action={saveEmpresaPrintConfigAction} className="space-y-3">
          <input type="hidden" name="empresaSlug" value={empresaSlug} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-sm text-white/70">CIF</div>
              <input
                name="cif"
                defaultValue={empresa.cif ?? ""}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm text-white/70">C.C.C.</div>
              <input
                name="ccc"
                defaultValue={empresa.ccc ?? ""}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-white/70">Centro de trabajo</div>
              <input
                name="centroTrabajo"
                defaultValue={empresa.centroTrabajo ?? ""}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm text-white/70">Lugar firma</div>
              <input
                name="lugarFirma"
                defaultValue={empresa.lugarFirma ?? ""}
                placeholder="Ej: MADRID"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-white/70">Texto legal (pie)</div>
              <textarea
                name="textoLegal"
                defaultValue={empresa.textoLegal ?? ""}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none"
              />
              <div className="text-xs text-white/50">
                Esto se imprime tal cual. Si cambia en el futuro, RRHH lo edita aquí sin tocar código.
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15">
              Guardar datos empresa
            </button>
          </div>
        </form>
      </div>

      {/* Festivos */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-white/60">Calendario</div>
            <div className="text-lg font-semibold">Festivos de empresa · {year}</div>
            <div className="text-sm text-white/70">Se pintan en amarillo y bloquean el relleno automático.</div>
          </div>
        </div>

        <form action={addHolidayAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="empresaSlug" value={empresaSlug} />
          <input type="hidden" name="year" value={String(year)} />

          <label className="space-y-1">
            <div className="text-xs text-white/60">Fecha</div>
            <input
              name="date"
              type="date"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-white/60">Nombre (opcional)</div>
            <input
              name="name"
              placeholder="Ej: Reyes"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <button className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/15">
            Añadir festivo
          </button>
        </form>

        <div className="space-y-2">
          {holidays.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <div>
                <div className="font-semibold">{fmtISO(h.date)}</div>
                <div className="text-sm text-white/70">{h.name ?? "—"}</div>
              </div>

              <form action={deleteHolidayAction}>
                <input type="hidden" name="empresaSlug" value={empresaSlug} />
                <input type="hidden" name="year" value={String(year)} />
                <input type="hidden" name="id" value={String(h.id)} />
                <button className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15">
                  Eliminar
                </button>
              </form>
            </div>
          ))}
          {holidays.length === 0 ? (
            <div className="text-sm text-white/70">No hay festivos cargados para este año.</div>
          ) : null}
        </div>
      </div>

      {/* Vacaciones colectivas */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div>
          <div className="text-sm text-white/60">Calendario</div>
          <div className="text-lg font-semibold">Vacaciones colectivas (cierre)</div>
          <div className="text-sm text-white/70">
            Periodos que aplican a toda la empresa. Se pintan en naranja y bloquean el relleno automático.
          </div>
        </div>

        <form action={addCompanyVacationAction} className="flex flex-wrap items-end gap-2">
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

          <label className="space-y-1">
            <div className="text-xs text-white/60">Motivo (opcional)</div>
            <input
              name="reason"
              placeholder="Ej: Cierre Agosto"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
            />
          </label>

          <button className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-200 hover:bg-orange-500/15">
            Añadir periodo
          </button>
        </form>

        <div className="space-y-2">
          {vacations.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <div>
                <div className="font-semibold">
                  {fmtISO(v.from)} → {fmtISO(v.to)}
                </div>
                <div className="text-sm text-white/70">{v.reason ?? "—"}</div>
              </div>

              <form action={deleteCompanyVacationAction}>
                <input type="hidden" name="empresaSlug" value={empresaSlug} />
                <input type="hidden" name="year" value={String(year)} />
                <input type="hidden" name="id" value={String(v.id)} />
                <button className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15">
                  Eliminar
                </button>
              </form>
            </div>
          ))}
          {vacations.length === 0 ? (
            <div className="text-sm text-white/70">No hay periodos de cierre cargados.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function YearCalendarPreview(props: {
  year: number;
  holidaySet: Set<string>;
  closures: { from: Date; to: Date }[];
}) {
  const { year, holidaySet, closures } = props;
  const months = Array.from({ length: 12 }).map((_, m0) => m0);
  const inClosure = (d: Date) => closures.some((c) => d >= c.from && d <= c.to);

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

                const bg = isHol
                  ? "bg-amber-500/25 border-amber-500/30"
                  : isCloseLaborable
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
