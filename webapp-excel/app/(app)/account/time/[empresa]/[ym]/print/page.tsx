// app/(app)/account/time/[empresa]/[ym]/print/page.tsx
import PrintTopBar from "@/app/components/time/PrintTopBar";
import { getAppSession, requireRRHH, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function isWeekend(d: Date) {
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function monthNameES(m: number) {
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
  return names[m - 1] ?? "";
}

function parseHHMM(v?: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function calcMinutes(inStr?: string | null, outStr?: string | null): number {
  const i = parseHHMM(inStr);
  const o = parseHHMM(outStr);
  if (i == null || o == null) return 0;
  const diff = o - i;
  return diff > 0 ? diff : 0;
}

function minutesToHHMM(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export default async function TimePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string; ym: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug, ym } = await params;
  const sp = (await searchParams) ?? {};
  const from = spGet(sp, "from") ?? "";
  const userIdParam = (spGet(sp, "userId") ?? "").trim();

  const session = await getAppSession();
  const sessionUser = (session as any)?.user as SessionUser | undefined;
  if (!sessionUser) redirect(`/login?next=/account/time/${empresaSlug}/${ym}/print`);

  const range = ymToRange(ym);
  if (!range) notFound();

  const targetUserId = userIdParam || sessionUser.id;
  const isImpersonating = targetUserId !== sessionUser.id;
  if (isImpersonating) {
    await requireRRHH(empresaSlug);
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
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      username: true,
      nif: true,
      numeroSS: true,
    },
  });
  if (!user) redirect(`/login?next=/account/time/${empresaSlug}/${ym}/print`);

  const ok = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: empresa.id } },
    select: { id: true },
  });
  if (!ok) {
    if (isImpersonating) notFound();
    redirect(`/account/time?err=no_empresa_access`);
  }

  const [days, holidays, closures] = await Promise.all([
    prisma.timeDay.findMany({
      where: { userId: user.id, empresaId: empresa.id, date: { gte: range.from, lt: range.to } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        morningIn: true,
        morningOut: true,
        afternoonIn: true,
        afternoonOut: true,
        type: true,
        note: true,
        signedAt: true,
      },
    }),
    prisma.timeHoliday.findMany({
      where: {
        date: { gte: range.from, lt: range.to },
        OR: [{ empresaId: empresa.id }, { empresaId: null }],
      },
      select: { date: true },
    }),
    prisma.timeCompanyVacation.findMany({
      where: {
        empresaId: empresa.id,
        from: { lte: new Date(range.to.getTime() - 86400000) },
        to: { gte: range.from },
      },
      select: { from: true, to: true, reason: true },
    }),
  ]);

  const dayByISO = new Map(days.map((d) => [dateISO(d.date), d]));
  const holidaySet = new Set(holidays.map((h) => dateISO(h.date)));
  const inClosure = (d: Date) => closures.some((c) => d >= c.from && d <= c.to);

  const allDates: Date[] = [];
  for (let dt = new Date(range.from); dt < range.to; dt = new Date(dt.getTime() + 86400000)) {
    allDates.push(dt);
  }

  function isHolidayOrWeekend(d: Date) {
    return holidaySet.has(dateISO(d)) || isWeekend(d);
  }

  function rowBg(d: Date, row?: { type?: string | null; note?: string | null } | null) {
    const type = row?.type ?? null;
    const note = row?.note ?? "";

    const isOverrideWork = type === "WORK" && note.toUpperCase().includes("RRHH");
    if (isOverrideWork) {
      if (isHolidayOrWeekend(d)) return "#fde047";
      return "transparent";
    }

    if (type === "VACATION") return "#f97316";
    if (type === "ABSENCE") return "#38bdf8";
    if (isHolidayOrWeekend(d)) return "#fde047";
    if (inClosure(d)) return "#f97316";
    return "transparent";
  }

  function obsLabel(d: Date, row?: { type?: string | null; note?: string | null } | null) {
    const type = row?.type ?? null;
    const note = row?.note ?? "";
    const isOverrideWork = type === "WORK" && note.toUpperCase().includes("RRHH");

    if (isOverrideWork) return note || "WORK (RRHH)";
    if (type === "VACATION") return row?.note ?? "VACACIONES";
    if (type === "ABSENCE") return row?.note ?? "AUSENCIA";
    if (isHolidayOrWeekend(d)) return row?.note ?? "FESTIVO";
    if (inClosure(d)) return row?.note ?? "VACACIONES COLECTIVAS";
    return row?.note ?? "";
  }

  const totalMinutes = allDates.reduce((acc, d) => {
    const row = dayByISO.get(dateISO(d));
    if (!row) return acc;
    const mins =
      calcMinutes(row.morningIn, row.morningOut) + calcMinutes(row.afternoonIn, row.afternoonOut);
    return acc + mins;
  }, 0);

  const lastDayOfMonth = new Date(Date.UTC(range.y, range.m, 0, 0, 0, 0)).getUTCDate();

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

          .sigbox { height: 60px !important; }
          .legal { font-size: 8.5px !important; line-height: 1.15 !important; background: transparent !important; }

          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PrintTopBar
        backHref={
          from === "rrhh"
            ? `/${empresaSlug}/rrhh/control-horario?year=${range.y}&month=${range.m}&userId=${encodeURIComponent(
                targetUserId,
              )}`
            : `/account/time/${empresaSlug}/${ym}`
        }
      />

      <div className="paper-wrap">
        <div className="paper">
          <div className="paper-inner">
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>
              Listado Resumen mensual del registro de jornada (detalle horario)
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
                  <td className="headcell">Mes y Año:</td>
                  <td>{pad2(range.m)}/{range.y}</td>
                </tr>
              </tbody>
            </table>

            <table className="mt-3">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: 40 }}>DIA</th>
                  <th colSpan={2}>JORNADA</th>
                  <th rowSpan={2}>OBSERVACIÓN</th>
                  <th rowSpan={2} style={{ width: 150 }}>FIRMA DEL TRABAJADOR/A</th>
                </tr>
                <tr>
                  <th style={{ width: 90 }}>ENTRADA</th>
                  <th style={{ width: 90 }}>SALIDA</th>
                </tr>
              </thead>

              <tbody>
                {allDates.map((d) => {
                  const iso = dateISO(d);
                  const row = dayByISO.get(iso) ?? null;

                  const bg = rowBg(d, row);
                  const obs = obsLabel(d, row);
                  const isColored = bg !== "transparent";

                  return (
                    <tr key={iso} style={{ background: isColored ? `${bg}55` : undefined }}>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{d.getUTCDate()}</td>
                      <td>{row?.morningIn ?? ""}</td>
                      <td>{row?.morningOut ?? ""}</td>
                      <td style={{ fontWeight: obs ? 700 : 400 }}>{obs}</td>
                      <td>{row?.signedAt ? <span className="small">Firmado</span> : ""}</td>
                    </tr>
                  );
                })}

                <tr>
                  <td className="headcell" colSpan={4} style={{ textAlign: "right" }}>
                    TOTAL HRAS.
                  </td>
                  <td style={{ fontWeight: 700 }}>{minutesToHHMM(totalMinutes)}</td>
                </tr>
              </tbody>
            </table>

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
              En <b>{empresa.lugarFirma ?? ""}</b>, a <b>{lastDayOfMonth}</b> de{" "}
              <b>{monthNameES(range.m)}</b> de <b>{range.y}</b>
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
