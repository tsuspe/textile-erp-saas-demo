// app/components/AccountTopBar.tsx
"use client";

import { CommsBellButton } from "@/app/components/comms/CommsBellButton";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function AccountTopBar({ rightShiftPx = 0 }: { rightShiftPx?: number }) {
  const { data: session, status } = useSession();

  const userLabel =
    status === "authenticated"
      ? `${(session as any)?.user?.name ?? "—"} · @${(session as any)?.user?.username ?? "—"}`
      : status === "loading"
      ? "Cargando…"
      : "Sin sesión";

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div
        className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4 text-sm transition-[padding-right] duration-200"
        style={{ paddingRight: rightShiftPx }}
      >
        <Link href="/" className="text-slate-200 hover:text-emerald-400">
          HOME / Empresas
        </Link>

        <Link href="/account" className="text-slate-200 hover:text-emerald-400">
          Account
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs px-2 py-1 rounded-full border border-slate-700 text-slate-300">
            Usuario:&nbsp;<b className="text-slate-100">{userLabel}</b>
          </span>

          <CommsBellButton />

          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-200 underline"
            title="Cambiar usuario (cerrar sesión y volver a login)"
          >
            Cambiar usuario
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-200"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
