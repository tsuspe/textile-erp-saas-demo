// app/(app)/[empresa]/admin/users/[userId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import DeleteUserForm from "@/app/components/admin/DeleteUserForm";
import { prisma } from "@/lib/prisma";
import { deleteUserAction, updateUserAction } from "../actions";


export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ empresa: string; userId: string }>;
};

export default async function AdminUserEditPage({ params }: PageProps) {
  const { empresa, userId } = await params;

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresaRow) notFound();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      nif: true,
      numeroSS: true,
      isActive: true,
      mustChangePassword: true,
      groups: { select: { group: { select: { key: true, id: true, name: true } } } },
      empresas: { select: { empresaId: true } },
    },
  });
  if (!user) notFound();

  const allGroups = await prisma.group.findMany({
    orderBy: { key: "asc" },
    select: { id: true, key: true, name: true },
  });

  const allEmpresas = await prisma.empresa.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, slug: true, nombre: true },
  });

  const selectedGroupKeys = new Set(user.groups.map((g) => g.group.key));
  const selectedEmpresaIds = new Set(user.empresas.map((e) => e.empresaId));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Admin / Usuarios</div>
            <h1 className="text-xl font-semibold">Editar usuario</h1>
            <p className="text-sm text-white/70">
              {user.name} <span className="text-white/50">(@{user.username})</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${empresa}/admin/users`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              Volver
            </Link>

            {/* ✅ Eliminar desde edición */}
            <DeleteUserForm
              empresaSlug={empresa}
              userId={user.id}
              username={user.username}
              action={deleteUserAction}
            />

          </div>
        </div>
      </div>

      <form
        action={updateUserAction}
        className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4"
      >
        {/* hidden */}
        <input type="hidden" name="empresaSlug" value={empresa} />
        <input type="hidden" name="userId" value={user.id} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm text-white/70">Nombre</div>
            <input
              name="name"
              defaultValue={user.name}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-white/70">Usuario (username)</div>
            <input
              name="username"
              defaultValue={user.username}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
            />
          </label>

          {/* RRHH: datos para impresión */}
          <label className="space-y-1">
            <div className="text-sm text-white/70">NIF (DNI)</div>
            <input
              name="nif"
              defaultValue={user.nif ?? ""}
              placeholder="Ej: 12345678X"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-white/70">Nº Seguridad Social</div>
            <input
              name="numeroSS"
              defaultValue={user.numeroSS ?? ""}
              placeholder="Ej: 28/12345678/12"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/20"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={user.isActive}
              className="h-4 w-4"
            />
            Activo
          </label>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              name="mustChangePassword"
              defaultChecked={user.mustChangePassword}
              className="h-4 w-4"
            />
            Forzar cambio de contraseña
          </label>

          <div className="text-sm text-white/60">
            Email: <span className="text-white/80">{user.email ?? "sin email"}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="font-semibold">Grupos</div>
            <div className="text-sm text-white/60 mb-2">Permisos tipo Linux.</div>

            <div className="space-y-2">
              {allGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    name="groups"
                    value={g.key}
                    defaultChecked={selectedGroupKeys.has(g.key)}
                    className="h-4 w-4"
                  />
                  <span className="font-mono text-xs text-white/70">{g.key}</span>
                  <span className="text-white/60">—</span>
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="font-semibold">Empresas</div>
            <div className="text-sm text-white/60 mb-2">
              Ahora mismo todos trabajáis con todas, pero lo dejamos listo para futuro.
            </div>

            <div className="space-y-2">
              {allEmpresas.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    name="empresas"
                    value={String(e.id)}
                    defaultChecked={selectedEmpresaIds.has(e.id)}
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">{e.nombre}</span>
                  <span className="text-white/50">({e.slug})</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
