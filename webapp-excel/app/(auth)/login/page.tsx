//webapp-excel/app/(auth)/login/page.tsx
"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import AuthShell from "../_components/AuthShell";

function normalizeError(err?: string | null) {
  if (!err) return null;
  if (err === "CredentialsSignin") return "Usuario o contraseña incorrectos.";
  if (err === "UserPending")
    return "Tu usuario está pendiente de activación por Administración.";
  if (err === "AccessDenied") return "Acceso denegado.";
  if (err === "Configuration")
    return "Configuración de login incompleta (revisa NEXTAUTH_SECRET).";
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

function LoginInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const isDemoMode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true";

  const next = sp.get("next") || "/";
  const error = useMemo(() => normalizeError(sp.get("error")), [sp]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);

    const res = await signIn("credentials", {
      redirect: false,
      username: username.trim().toLowerCase(),
      password,
      callbackUrl: next,
    });

    setBusy(false);

    if (!res) {
      setLocalError("Respuesta inesperada del servidor.");
      return;
    }

    if (res.error) {
      if (res.error.includes("UserPending")) {
        setLocalError(
          "Tu usuario está pendiente de activación por Administración."
        );
        return;
      }
      setLocalError("Usuario o contraseña incorrectos.");
      return;
    }

    router.replace(res.url ?? next);
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Accede con tu usuario personal. Si no tienes cuenta, créala y pide permisos."
    >
      {isDemoMode ? (
        <div className="mb-4 rounded-xl border border-cyan-900/40 bg-cyan-950/25 px-3 py-3 text-sm text-cyan-100">
          <p className="font-semibold text-cyan-200">Modo Demo activo</p>
          <p className="mt-1 text-cyan-100/90">Puedes usar estas credenciales:</p>
          <ul className="mt-2 space-y-1 text-xs font-mono text-cyan-100">
            <li>demo_admin / demo1234</li>
            <li>demo_rrhh / demo1234</li>
            <li>demo_almacen / demo1234</li>
          </ul>
        </div>
      ) : null}

      {(error || localError) && (
        <div className="mb-4 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {localError ?? error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Usuario</label>
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="ej: demo_admin"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">Contraseña</label>
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        <button
          disabled={busy}
          className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>

        <div className="pt-2 text-xs text-slate-500">
          ¿No tienes cuenta? Ve a{" "}
          <Link className="text-slate-200 hover:text-white" href="/register">Crear usuario</Link> y luego pide
          activación.
        </div>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
