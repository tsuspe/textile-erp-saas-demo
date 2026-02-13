// app/(app)/account/time/page.tsx
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function ymNowUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function AccountTimeIndex() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login?next=/account/time");

  const empresas = await prisma.userEmpresa.findMany({
    where: { userId: user.id },
    select: { empresa: { select: { slug: true, nombre: true } } },
    orderBy: { empresaId: "asc" },
  });

  const ym = ymNowUTC();

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-slate-400">Mi cuenta / Control horario</div>
            <h1 className="text-2xl font-semibold tracking-tight">Control horario</h1>
            <div className="text-sm text-slate-300">
              Abre una empresa y entrarás directamente al mes en curso.
            </div>
          </div>

          <Link
            href="/account"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Volver
          </Link>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">Mes actual</div>
              <div className="text-lg font-semibold">{ym}</div>
              <div className="text-xs text-slate-400">
                Cambia de mes dentro de la vista mensual (prev/next o selector).
              </div>
            </div>

            <div className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              Entrada por defecto al mes actual
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {empresas.map((e) => (
            <Link
              key={e.empresa.slug}
              href={`/account/time/${e.empresa.slug}/${ym}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:bg-slate-900 hover:border-sky-400/60 transition"
            >
              <div className="text-sm text-slate-400">Empresa</div>
              <div className="text-lg font-semibold">{e.empresa.nombre}</div>
              <div className="text-xs text-slate-500">/{e.empresa.slug}</div>
              <div className="pt-2 text-xs font-semibold text-sky-300">
                Abrir mes actual →
              </div>
            </Link>
          ))}
        </div>

        {empresas.length === 0 ? (
          <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-200">
            No tienes empresas asignadas. Pide a Admin/RRHH que te asigne al menos una.
          </div>
        ) : null}
      </div>
    </div>
  );
}
