// webapp-excel/app/(auth)/register/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "../_components/AuthShell";
import { registerUser } from "./actions";

function RegisterInner() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localOk, setLocalOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    setLocalOk(null);
    setBusy(true);

    const fd = new FormData(e.currentTarget);
    const res = await registerUser(fd);

    setBusy(false);

    if (!res?.ok) {
      setLocalError(res?.error ?? "No se pudo crear el usuario.");
      return;
    }

    setLocalOk("Usuario creado. Queda pendiente de activación por Administración…");
    router.replace("/login?ok=registered");
  }

  return (
    <AuthShell
      title="Crear usuario"
      subtitle="Te creas tu cuenta y Administración te asigna permisos (grupos)."
    >
      {(localError || localOk) && (
        <div
          className={[
            "mb-4 rounded-xl border px-3 py-2 text-sm",
            localError
              ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
              : "border-emerald-900/40 bg-emerald-950/20 text-emerald-200",
          ].join(" ")}
        >
          {localError ?? localOk}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
          Al crear el usuario, quedará{" "}
          <span className="text-slate-200">pendiente de activación</span>. Luego
          RRHH/Admin te mete en tus grupos (ALMACEN, RRHH, etc.).
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Usuario</label>
          <input
            name="username"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            placeholder="ej: laura"
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Contraseña</label>
          <input
            name="password"
            type="password"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            placeholder="mínimo 6 caracteres"
            autoComplete="new-password"
            required
          />
        </div>

        <button
          disabled={busy}
          className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? "Creando..." : "Crear usuario"}
        </button>

        <div className="pt-2 text-xs text-slate-500">
          Tras crear el usuario:{" "}
          <span className="text-slate-200">contacta con Administración</span>{" "}
          para activación y permisos.
        </div>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <RegisterInner />
    </Suspense>
  );
}

