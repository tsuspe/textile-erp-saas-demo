// webapp-excel/app/(auth)/_components/AuthShell.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "3.0.0";

function normalizeOk(ok?: string | null) {
  if (!ok) return null;

  // Añade aquí todos los "ok=" que quieras estandarizar
  if (ok === "password-updated") {
    return "Contraseña actualizada. Inicia sesión con la nueva.";
  }

  if (ok === "registered") {
    return "Usuario creado. Pide a Administración que lo active.";
  }

  return "Operación realizada correctamente.";
}

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const okMsg = useMemo(() => normalizeOk(sp.get("ok")), [sp]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Fondo sutil, mismo rollo que la home */}
      <div className="pointer-events-none fixed inset-0 opacity-25 [background:radial-gradient(60%_60%_at_50%_20%,rgba(255,255,255,0.10),transparent_60%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <header className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            {/* Marca simple estilo “app”, sin Elvasco vibes */}
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-slate-800 bg-slate-900">
              <span className="text-sm font-black tracking-wide text-emerald-400">
                JBP
              </span>
            </div>

            <div className="leading-tight">
              <div className="text-sm text-slate-400">Plataforma interna</div>
              <div className="text-base font-semibold">
                Fichas · Maestros · Producción
              </div>
            </div>

            <div className="ml-auto">
              <span className="rounded-full border border-slate-800 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-300">
                v{APP_VERSION}
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          ) : null}
        </header>

        <main className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          {/* ✅ Flash OK global para todo el auth */}
          {okMsg ? (
            <div className="mb-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
              {okMsg}
            </div>
          ) : null}

          {children}
        </main>

        <footer className="mt-6 text-center text-xs text-slate-500">
          <div className="flex items-center justify-center gap-3">
            <Link className="hover:text-slate-300" href="/login">
              Login
            </Link>
            <span className="text-slate-700">·</span>
            <Link className="hover:text-slate-300" href="/register">
              Crear usuario
            </Link>
          </div>
          <div className="mt-2">Demo Textile Platform · Acceso</div>
        </footer>
      </div>
    </div>
  );
}
