// app/(app)/admin/page.tsx
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

function hasPrivilegedAccess(user: any) {
  const groups: string[] = []
    .concat(user?.grupos ?? [])
    .concat(user?.groups ?? [])
    .concat(user?.roles ?? []);

  const upper = groups.map((g) => String(g).toUpperCase());

  return (
    upper.includes("ADMIN") ||
    upper.includes("RRHH") ||
    user?.isAdmin === true ||
    user?.isRRHH === true
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHubPage() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login?next=/admin");

  if (!hasPrivilegedAccess(user)) {
    redirect("/?err=forbidden");
  }

  const empresas = await prisma.userEmpresa.findMany({
    where: { userId: user.id },
    select: { empresa: { select: { id: true, slug: true, nombre: true } } },
    orderBy: { empresaId: "asc" },
  });

  const list = empresas.map((e) => e.empresa);

  if (list.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-4">
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-slate-300">
            No tienes ninguna empresa asignada. Pide a un administrador que te añada.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            ← Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  // Si solo hay 1 empresa, no mareamos: directo a su admin
  if (list.length === 1) {
    redirect(`/${list[0].slug}/admin`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">Admin</div>
            <h1 className="text-2xl font-semibold">Selecciona empresa</h1>
            <p className="text-sm text-slate-400">
              Elige en qué empresa quieres entrar al panel.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            ← Volver
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((e) => (
            <Link
              key={e.slug}
              href={`/${e.slug}/admin`}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:bg-slate-900"
            >
              <div className="text-xs text-slate-500">Empresa</div>
              <div className="mt-1 text-lg font-semibold">{e.nombre}</div>
              <div className="mt-1 text-xs text-slate-500">/{e.slug}/admin</div>
              <div className="mt-3 text-xs font-semibold text-emerald-400">
                Entrar →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
