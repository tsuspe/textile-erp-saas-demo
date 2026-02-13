// webapp-excel/app/(auth)/change-password/page.tsx
"use client";

import { signOut } from "next-auth/react";
import { Suspense, useState } from "react";
import AuthShell from "../_components/AuthShell";
import { changePassword } from "./actions";

function ChangePasswordInner() {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localOk, setLocalOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    setLocalOk(null);
    setBusy(true);

    const fd = new FormData(e.currentTarget);
    const res = await changePassword(fd);

    setBusy(false);

    if (!res?.ok) {
      setLocalError(res?.error ?? "No se pudo actualizar la contraseña.");
      return;
    }

    setLocalOk("Contraseña actualizada. Volviendo al login…");
    await signOut({ callbackUrl: "/login?ok=password-updated" });
  }

  return (
    <AuthShell
      title="Cambiar contraseña"
      subtitle="Obligatorio si tu cuenta fue creada con contraseña temporal."
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
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Nueva contraseña</label>
          <input
            name="password"
            type="password"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Repite la contraseña</label>
          <input
            name="password2"
            type="password"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            autoComplete="new-password"
            required
          />
        </div>

        <button
          disabled={busy}
          className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <ChangePasswordInner />
    </Suspense>
  );
}
