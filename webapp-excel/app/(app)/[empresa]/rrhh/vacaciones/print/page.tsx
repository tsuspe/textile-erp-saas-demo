// app/(app)/[empresa]/rrhh/vacaciones/print/page.tsx
import PrintTopBar from "@/app/components/time/PrintTopBar";
import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
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
  const last = new Date(Date.UTC(year, month0 + 1, 0, 0, 0, 0));
  const daysInMonth = last.getUTCDate();
  const startWeekday = (first.getUTCDay() + 6) % 7; // lunes=0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month0, d, 0, 0, 0)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default async function RRHHVacacionesPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const year = Number(spGet(sp, "year")) || new Date().getUTCFullYear();
  const userId = (spGet(sp, "userId") ?? "").trim();

  await requireRRHH(empresaSlug);

  if (!userId) {
    redirect(`/${empresaSlug}/rrhh/vacaciones?year=${year}&err=missing_user`);
  }

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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      nif: true,
      numeroSS: true,
    },
  });
  if (!user) notFound();

  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) notFound();

  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

  const [holidays, closures, vacationDays, absenceDays, workDays] = await Promise.all([
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: from, lt: to },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        from: { lt: to },
        to: { gte: from },
      },
      select: { from: true, to: true },
    }),
    prisma.timeDay.findMany({
      where: { empresaId: empresa.id, userId: user.id, date: { gte: from, lt: to }, type: "VACATION" },
      select: { date: true },
    }),
    prisma.timeDay.findMany({
      where: { empresaId: empresa.id, userId: user.id, date: { gte: from, lt: to }, type: "ABSENCE" },
      select: { date: true },
    }),
    prisma.timeDay.findMany({
      where: { empresaId: empresa.id, userId: user.id, date: { gte: from, lt: to }, type: "WORK" },
      select: { date: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));
  const inClosure = (d: Date) => closures.some((c) => d >= c.from && d <= c.to);
  const vacSet = new Set(vacationDays.map((d) => dateISO(d.date)));
  const absSet = new Set(absenceDays.map((d) => dateISO(d.date)));
  const overrideWorkSet = new Set(workDays.map((d) => dateISO(d.date)));

  const months = Array.from({ length: 12 }).map((_, m0) => m0);
  const lastDayOfYear = 31;

  return (
    <div className="bg-white text-slate-900 min-h-screen">
      <style>{`
        @page { size: A4; margin: 8mm; }

        .topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          background: #fff;
          border-bottom: 1px solid rgba(15,23,42,0.12);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 14px;
          border: 1px solid rgba(15,23,42,0.15);
          background: #fff;
          color: #0f172a;
          cursor: pointer;
          text-decoration: none;
        }
        .btn:hover { background: rgba(15,23,42,0.04); }

        .btn-primary {
          background: #0f172a;
          color: #fff;
          border-color: #0f172a;
        }
        .btn-primary:hover { background: #111c33; }

        .paper-wrap { padding: 24px; }
        .paper {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #ffffff;
          color: #0f172a;
          border-radius: 10px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.25);
          overflow: hidden;
        }
        .paper-inner { padding: 10mm; }

        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #111827; padding: 5px; font-size: 11px; }
        th { background: #f1f5f9; text-align: center; font-weight: 700; }
        .headcell { background: #f1f5f9; font-weight: 700; }
        .small { font-size: 10px; }

        .year-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 10px;
        }
        .month {
          border: 1px solid #111827;
          border-radius: 6px;
          padding: 6px;
        }
        .month-title {
          text-align: center;
          font-weight: 700;
          font-size: 10px;
          margin-bottom: 4px;
        }
        .weekday-row,
        .month-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }
        .weekday {
          text-align: center;
          font-size: 8px;
          font-weight: 700;
        }
        .day {
          height: 12px;
          border: 1px solid #111827;
          text-align: center;
          font-size: 8px;
          line-height: 11px;
        }
        .legend {
          margin-top: 8px;
          font-size: 10px;
        }

        @media print {
          html, body { background: #fff !important; }
          .noprint { display:none !important; }

          .paper-wrap { padding: 0 !important; background: #fff !important; }
          .paper-wrap, .paper-wrap * { box-shadow: none !important; }

          .paper {
            width: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            overflow: hidden !important;
          }
          .paper-inner { padding: 0 !important; overflow: hidden !important; }

          th, td { padding: 3px !important; font-size: 9px !important; }
          .small { font-size: 9px !important; }

          .month { padding: 4px !important; }
          .month-title { font-size: 9px !important; }
          .weekday { font-size: 7px !important; }
          .day { font-size: 7px !important; height: 11px !important; }

          .sigbox { height: 60px !important; }
          .legal { font-size: 8.5px !important; line-height: 1.15 !important; background: transparent !important; }

          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PrintTopBar
        backHref={`/${empresa.slug}/rrhh/vacaciones?year=${year}&userId=${encodeURIComponent(userId)}`}
      />

      <div className="paper-wrap">
        <div className="paper">
          <div className="paper-inner">
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>
              Hoja anual de vacaciones
            </div>

            <table className="mt-2">
              <tbody>
                <tr>
                  <td className="headcell" style={{ width: "18%" }}>Empresa:</td>
                  <td style={{ width: "32%" }}>{empresa.nombre}</td>
                  <td className="headcell" style={{ width: "18%" }}>Trabajador:</td>
                  <td style={{ width: "32%" }}>{user.name}</td>
                </tr>

                <tr>
                  <td className="headcell">C.I.F./N.I.F.:</td>
                  <td>{empresa.cif ?? ""}</td>
                  <td className="headcell">N.I.F.:</td>
                  <td>{user.nif ?? ""}</td>
                </tr>

                <tr>
                  <td className="headcell">Centro de Trabajo:</td>
                  <td>{empresa.centroTrabajo ?? empresa.nombre}</td>
                  <td className="headcell">Nº Afiliación:</td>
                  <td>{user.numeroSS ?? ""}</td>
                </tr>

                <tr>
                  <td className="headcell">C.C.C.:</td>
                  <td>{empresa.ccc ?? ""}</td>
                  <td className="headcell">Año:</td>
                  <td>{year}</td>
                </tr>
              </tbody>
            </table>

            <div className="legend">
              Amarillo: festivo/finde · Naranja: cierre empresa · Verde: vacaciones · Azul: ausencia justificada ·
              (Cierre trabajado no pinta naranja)
            </div>

            <div className="year-grid">
              {months.map((m0) => {
                const cells = getMonthGridUTC(year, m0);
                return (
                  <div key={m0} className="month">
                    <div className="month-title">{monthLabelES(m0)}</div>

                    <div className="weekday-row">
                      {["L", "M", "X", "J", "V", "S", "D"].map((w) => (
                        <div key={w} className="weekday">{w}</div>
                      ))}
                    </div>

                    <div className="month-grid">
                      {cells.map((d, idx) => {
                        if (!d) return <div key={idx} className="day" style={{ border: "none" }} />;

                        const iso = dateISO(d);
                        const isHol = holidaySet.has(iso) || isWeekend(d);
                        const isCloseLaborable = inClosure(d) && !isHol;
                        const isCloseWorkedOverride = isCloseLaborable && overrideWorkSet.has(iso);

                        const isVac = vacSet.has(iso);
                        const isAbs = absSet.has(iso);

                        const bg = isVac
                          ? "#22c55e"
                          : isAbs
                          ? "#38bdf8"
                          : isHol
                          ? "#fde047"
                          : isCloseLaborable && !isCloseWorkedOverride
                          ? "#f97316"
                          : "transparent";

                        const style = bg === "transparent" ? {} : { background: `${bg}88` };

                        return (
                          <div key={idx} className="day" style={style}>
                            {d.getUTCDate()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-10 text-sm">
              <div>
                <div style={{ marginBottom: 6 }}>Firma de la empresa:</div>
                <div
                  className="sigbox"
                  style={{
                    height: 90,
                    border: "1px solid #111827",
                    borderRadius: 6,
                    marginBottom: 10,
                  }}
                />
                <div style={{ borderTop: "1px solid #111827", paddingTop: 6 }}>(firma / sello)</div>
              </div>

              <div>
                <div style={{ marginBottom: 6 }}>Firma del trabajador:</div>
                <div
                  className="sigbox"
                  style={{
                    height: 90,
                    border: "1px solid transparent",
                    marginBottom: 10,
                  }}
                />
                <div style={{ borderTop: "1px solid #111827", paddingTop: 6 }}>(firma)</div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              En <b>{empresa.lugarFirma ?? ""}</b>, a <b>{pad2(lastDayOfYear)}</b> de <b>DICIEMBRE</b> de <b>{year}</b>
            </div>

            <div className="mt-3 legal text-[10px] leading-snug text-slate-700">
              {empresa.textoLegal ?? ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
