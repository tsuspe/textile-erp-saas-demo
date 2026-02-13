// app/components/AlmacenToolsHomeCard.tsx
import Link from "next/link";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { getAlmacenToolsForUser } from "@/lib/tools/registry";

export default async function AlmacenToolsHomeCard() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) return null;

  const tools = getAlmacenToolsForUser(user.groups);
  if (tools.length === 0) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-emerald-200/70 uppercase tracking-wider">
            Herramientas · Almacén
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-100">
            Accesos rápidos
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Utilidades internas para procesar documentos y automatizar curro repetitivo.
          </p>
        </div>

        <Link
          href="/tools/almacen"
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
        >
          Ver todo →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {tools.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-emerald-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">{t.title}</div>
                <div className="mt-1 text-xs text-slate-400">{t.description}</div>
              </div>
              <span className="text-[10px] rounded-full border border-slate-700 bg-slate-950/40 px-2 py-1 text-slate-300">
                {t.status ?? "READY"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
