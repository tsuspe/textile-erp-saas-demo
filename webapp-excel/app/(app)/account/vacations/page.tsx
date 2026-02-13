// app/(app)/account/vacations/page.tsx
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountVacationsIndex() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login?next=/account/vacations");

  const empresas = await prisma.userEmpresa.findMany({
    where: { userId: user.id },
    select: { empresa: { select: { id: true, slug: true, nombre: true } } },
    orderBy: { empresaId: "asc" },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Cuenta / Vacaciones</div>
            <h1 className="text-xl font-semibold">Vacaciones</h1>
            <p className="text-sm text-white/70">
              Elige empresa para ver calendario anual, saldo y solicitar días.
            </p>
          </div>

          <Link
            href="/account"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Volver
          </Link>
        </div>
      </div>

      {/* Empresas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {empresas.map((e) => (
          <Link
            key={e.empresa.id}
            href={`/account/vacations/${e.empresa.slug}`}
            className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
          >
            <div className="text-sm text-white/60">Empresa</div>
            <div className="text-lg font-semibold">{e.empresa.nombre}</div>
            <div className="text-xs text-white/50">/{e.empresa.slug}</div>
          </Link>
        ))}

        {empresas.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            No tienes empresas asignadas. Pide a Admin que te añada.
          </div>
        ) : null}
      </div>
    </div>
  );
}
