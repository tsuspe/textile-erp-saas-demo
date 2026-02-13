import NotificationsBell from "@/app/components/NotificationsBell";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import Link from "next/link";

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

export default async function UserHomeCard() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) return null;

  const canSeeAdmin = hasPrivilegedAccess(user);

  return (
    <div
      className="
        w-[360px]
        rounded-2xl
        border border-violet-500/20
        bg-violet-950/20
        p-4
        shadow-[0_0_0_1px_rgba(139,92,246,0.12)]
      "
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-violet-200/70">Usuario activo</div>

          <div className="mt-0.5 text-sm font-semibold text-slate-100 truncate">
            {(user as any)?.name ?? "—"}
          </div>

          <div className="text-xs text-slate-300 truncate">
            @{(user as any)?.username ?? "—"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationsBell />

          {canSeeAdmin ? (
            <Link
              href="/admin"
              className="
                shrink-0
                rounded-xl
                border border-violet-400/40
                bg-violet-500/10
                px-3 py-2
                text-xs font-semibold text-violet-200
                hover:bg-violet-500/20
              "
              title="Panel Admin (seleccionar empresa)"
            >
              Admin
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/account"
          className="
            inline-flex items-center
            rounded-xl
            border border-white/10
            bg-white/5
            px-3 py-2
            text-xs text-slate-100
            hover:bg-white/10
          "
        >
          Mi cuenta
        </Link>

        <Link
          href="/logout"
          className="
            inline-flex items-center
            rounded-xl
            border border-white/10
            bg-white/5
            px-3 py-2
            text-xs text-slate-100
            hover:bg-white/10
          "
          title="Cambiar usuario (volver a login)"
        >
          Cambiar usuario
        </Link>

        <Link
          href="/logout"
          className="
            inline-flex items-center
            rounded-xl
            border border-white/10
            bg-white/5
            px-3 py-2
            text-xs text-slate-100
            hover:bg-white/10
          "
          title="Cerrar sesión"
        >
          Salir
        </Link>
      </div>
    </div>
  );
}
