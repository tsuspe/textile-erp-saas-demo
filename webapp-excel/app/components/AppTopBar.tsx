// app/components/AppTopBar.tsx
"use client";

import { CommsBellButton } from "@/app/components/comms/CommsBellButton";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AppTopBar({ empresaSlug }: { empresaSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const base = `/${empresaSlug}`;
  const label = empresaSlug?.toUpperCase?.() ?? "—";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const navLink = (href: string, text: string) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={[
          "transition hover:text-emerald-400",
          active ? "text-emerald-400" : "text-slate-200",
        ].join(" ")}
      >
        {text}
      </Link>
    );
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(base);
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const userLabel =
    status === "authenticated"
      ? `${(session as any)?.user?.name ?? "—"} · @${(session as any)?.user?.username ?? "—"}`
      : status === "loading"
      ? "Cargando…"
      : "Sin sesión";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4 text-sm">
        {navLink(base, "Inicio")}
        {navLink(`${base}/fichas`, "Fichas")}
        {navLink(`${base}/maestros`, "Maestros")}

        <span className="ml-2 text-xs px-2 py-1 rounded-full border border-slate-700 text-slate-300">
          Empresa:&nbsp;<b className="text-slate-100">{label}</b>
        </span>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs px-2 py-1 rounded-full border border-slate-700 text-slate-300">
            Usuario:&nbsp;<b className="text-slate-100">{userLabel}</b>
          </span>

          <Link
            href="/"
            className="text-slate-400 hover:text-slate-200 underline"
            title="Cambiar empresa"
          >
            HOME / Cambio de Empresa
          </Link>

          <div className="flex items-center gap-2">
            <CommsBellButton />
            {/* aquí luego metes otros iconos si quieres */}
          </div>

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
            onClick={handleBack}
            className="text-slate-400 hover:text-slate-200"
            title="Volver"
          >
            ← Volver
          </button>
        </div>
      </div>
    </header>
  );
}
