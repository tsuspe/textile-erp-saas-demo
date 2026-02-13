// app/(app)/account/page.tsx
import { authOptions } from "@/auth";
import { getServerSession } from "next-auth/next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountHomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?next=/account");

  const user = (session as any).user ?? {};
  const name = user?.name ?? "—";
  const username = user?.username ?? "—";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm text-slate-400">Mi cuenta</div>
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <div className="text-sm text-slate-300">@{username}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/account/notifications"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Notificaciones
              </Link>
              <Link
                href="/account/chat"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Chat
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Volver a empresas
              </Link>
            </div>
          </div>
        </div>

        {/* Hub cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/account/time"
            className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-sky-400/60 hover:bg-slate-900"
          >
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Registro horario</div>
              <div className="text-lg font-semibold group-hover:text-sky-300">
                Control horario
              </div>
              <p className="text-sm text-slate-400">
                Fichar entrada/salida, ver historial y estado del día.
              </p>
              <div className="pt-1 text-xs font-semibold text-sky-300">Entrar →</div>
            </div>
          </Link>

          <Link
            href="/account/vacations"
            className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-violet-400/60 hover:bg-slate-900"
          >
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Ausencias</div>
              <div className="text-lg font-semibold group-hover:text-violet-300">
                Vacaciones
              </div>
              <p className="text-sm text-slate-400">
                Solicitar vacaciones/ausencias, ver saldo y estado de solicitudes.
              </p>
              <div className="pt-1 text-xs font-semibold text-violet-300">Entrar →</div>
            </div>
          </Link>

          {/* NUEVO: Notificaciones */}
          <Link
            href="/account/notifications"
            className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-amber-400/60 hover:bg-slate-900"
          >
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Comunicaciones</div>
              <div className="text-lg font-semibold group-hover:text-amber-300">
                Notificaciones
              </div>
              <p className="text-sm text-slate-400">
                Avisos del sistema: RRHH, admin, cambios importantes y alertas.
              </p>
              <div className="pt-1 text-xs font-semibold text-amber-300">Entrar →</div>
            </div>
          </Link>

          {/* NUEVO: Chat */}
          <Link
            href="/account/chat"
            className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-emerald-400/60 hover:bg-slate-900"
          >
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Mensajería</div>
              <div className="text-lg font-semibold group-hover:text-emerald-300">
                Chat
              </div>
              <p className="text-sm text-slate-400">
                Canales por grupo + DMs. Ideal para coordinar sin WhatsApp.
              </p>
              <div className="pt-1 text-xs font-semibold text-emerald-300">Entrar →</div>
            </div>
          </Link>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Nota: esto es el “hub”. En el siguiente paso metemos el modelo de datos y la
          primera versión funcional (fichaje simple + solicitudes).
        </div>
      </div>
    </div>
  );
}
