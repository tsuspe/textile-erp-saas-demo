// app/(app)/[empresa]/admin/users/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import DeleteUserForm from "@/app/components/admin/DeleteUserForm";
import { prisma } from "@/lib/prisma";
import { createUserAction, deleteUserAction } from "./actions";


export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function msgFromQuery(ok?: string | null, err?: string | null) {
  if (ok === "deleted") return { type: "ok" as const, text: "Usuario eliminado." };

  if (err === "user_exists") return { type: "err" as const, text: "Ese usuario ya existe." };
  if (err === "weak_password") return { type: "err" as const, text: "Contraseña demasiado corta (mín. 6)." };
  if (err === "invalid_username") return { type: "err" as const, text: "Usuario inválido (mín. 3 caracteres)." };
  if (err === "cannot_delete_self") return { type: "err" as const, text: "No puedes eliminar tu propio usuario." };

  return null;
}

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const { empresa } = await params;
  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const err = spGet(sp, "err");
  const flash = msgFromQuery(ok, err);

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresaRow) notFound();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      groups: {
        select: { group: { select: { key: true, name: true } } },
      },
      empresas: {
        select: { empresa: { select: { id: true, slug: true, nombre: true } } },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Admin / Usuarios</div>
            <h1 className="text-xl font-semibold">Usuarios</h1>
            <p className="text-sm text-white/70">
              Activa cuentas y asigna grupos. (De momento, permisos iguales para todas las empresas.)
            </p>
          </div>

          <Link
            href={`/${empresa}/admin`}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Volver
          </Link>
        </div>
      </div>

      {flash ? (
        <div
          className={[
            "rounded-xl border px-3 py-2 text-sm",
            flash.type === "ok"
              ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200"
              : "border-rose-900/40 bg-rose-950/30 text-rose-200",
          ].join(" ")}
        >
          {flash.text}
        </div>
      ) : null}

      {/* ✅ Crear usuario desde admin */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/60 mb-3">Crear usuario</div>

        <form action={createUserAction} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input type="hidden" name="empresaSlug" value={empresa} />

          <label className="space-y-1">
            <div className="text-xs text-white/60">Nombre</div>
            <input
              name="name"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
              placeholder="Ej: José"
              required
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-white/60">Usuario (username)</div>
            <input
              name="username"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
              placeholder="ej: jose"
              required
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-white/60">Contraseña temporal</div>
            <input
              name="password"
              type="password"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
              placeholder="mínimo 6"
              required
            />
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="w-full rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            >
              Crear
            </button>
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4" />
              Activo
            </label>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" name="mustChangePassword" defaultChecked className="h-4 w-4" />
              Forzar cambio de contraseña
            </label>

            <div className="text-xs text-white/50">
              Consejo: crea con contraseña temporal y “Forzar cambio” activado.
            </div>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/60 mb-3">Listado</div>

        <div className="space-y-2">
          {users.map((u) => {
            const groupKeys = u.groups.map((g) => g.group.key).join(", ") || "—";
            const empresasTxt = u.empresas.map((e) => e.empresa.slug).join(", ") || "—";

            return (
              <div
                key={u.id}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    {u.name}{" "}
                    <span className="text-white/60 font-normal">(@{u.username})</span>
                  </div>
                  <div className="text-sm text-white/70">
                    {u.email ?? "sin email"} · Grupos: {groupKeys} · Empresas: {empresasTxt}
                  </div>
                  <div className="text-xs text-white/50">
                    {u.isActive ? "Activo" : "Pendiente"}{" "}
                    {u.mustChangePassword ? "· Debe cambiar password" : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/${empresa}/admin/users/${u.id}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  >
                    Editar
                  </Link>

                  {/* Borrar */}
                  <DeleteUserForm
                    empresaSlug={empresa}
                    userId={u.id}
                    username={u.username}
                    action={deleteUserAction}
                  />

                </div>
              </div>
            );
          })}

          {users.length === 0 ? (
            <div className="text-sm text-white/70">No hay usuarios.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
