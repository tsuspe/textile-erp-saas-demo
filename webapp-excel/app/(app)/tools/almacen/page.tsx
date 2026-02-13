// app/(app)/tools/almacen/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { getAlmacenToolsForUser } from "@/lib/tools/registry";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AlmacenToolsPage() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login");

  const tools = getAlmacenToolsForUser(user.groups);
  if (tools.length === 0) redirect("/?err=no_permisos");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-8 py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Tools</div>
            <h1 className="text-3xl font-bold">Herramientas · Almacén</h1>
            <p className="mt-2 text-slate-400 max-w-2xl">
              Módulos internos para automatizar tareas: parsing, stock, exportaciones, etc.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            ← Volver
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 hover:border-emerald-500/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{t.title}</div>
                  <div className="mt-2 text-sm text-slate-400">{t.description}</div>
                </div>
                <span className="text-[10px] rounded-full border border-slate-700 bg-slate-950/40 px-2 py-1 text-slate-300">
                  {t.status ?? "READY"}
                </span>
              </div>
              <div className="mt-4 text-xs font-semibold text-emerald-400">Abrir →</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
