// app/(app)/[empresa]/maestros/subfamilias/[id]/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";


type PageProps = {
  params: Promise<{ empresa: string; id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EditSubfamiliaPage({ params, searchParams }: PageProps) {
  const { empresa, id: idStr } = await params;
  const base = `/${empresa}`;

  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const error = spGet(sp, "error");

  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 font-semibold">ID de subfamilia no válido.</p>
          <Link
            href={`${base}/maestros/subfamilias`}
            className="underline text-sm hover:text-emerald-400"
          >
            Volver a subfamilias
          </Link>
        </div>
      </main>
    );
  }

  const subfamilia = await prisma.subfamilia.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      descripcion: true,
      updatedAt: true, // ✅ necesario para optimistic locking
      _count: { select: { articulos: true } },
    },
  });

  if (!subfamilia) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 font-semibold">Subfamilia no encontrada.</p>
          <Link
            href={`${base}/maestros/subfamilias`}
            className="underline text-sm hover:text-emerald-400"
          >
            Volver a subfamilias
          </Link>
        </div>
      </main>
    );
  }

  const puedeEliminar = subfamilia._count.articulos === 0;

  const showConflict = error === "conflict";
  const showOk = ok === "1";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/maestros/subfamilias`}
                className="hover:text-emerald-400"
              >
                Subfamilias
              </Link>
            </p>

            <h1 className="text-2xl font-bold mt-1">
              Editar subfamilia{" "}
              <span className="text-emerald-400">{subfamilia.codigo}</span>
            </h1>
          </div>

          <Link
            href={`${base}/maestros/subfamilias`}
            className="text-sm underline text-slate-200 hover:text-emerald-400"
          >
            Volver
          </Link>
        </header>

        {/* Flash messages */}
        {showConflict ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">Conflicto de edición</p>
            <p className="text-xs text-amber-100/90 mt-1">
              Esta subfamilia ha sido modificada mientras la estabas editando.
              Refresca la página para cargar los cambios y vuelve a intentar guardar.
            </p>
          </section>
        ) : null}

        {showOk ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Cambios guardados</p>
          </section>
        ) : null}

        {/* Edit form */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <form
            action={`${base}/api/subfamilias/${subfamilia.id}`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* ✅ optimistic locking token */}
            <input
              type="hidden"
              name="updatedAt"
              value={subfamilia.updatedAt.toISOString()}
            />

            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                defaultValue={subfamilia.codigo}
                required
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm">Descripción</label>
              <input
                type="text"
                name="descripcion"
                defaultValue={subfamilia.descripcion}
                required
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <Link
                href={`${base}/maestros/subfamilias`}
                className="px-4 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-800"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </section>

        {/* Zona peligrosa */}
        <section className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-red-300">Zona peligrosa</h2>

          <p className="text-xs text-slate-300">
            Solo se podrá eliminar si esta subfamilia no tiene artículos asociados.
          </p>

          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400">
              Artículos asociados:{" "}
              <span className="font-semibold">{subfamilia._count.articulos}</span>
            </span>

            {puedeEliminar ? (
              <form
                action={`${base}/api/subfamilias/${subfamilia.id}/delete`}
                method="POST"
              >
                <DeleteButton
                  label="Eliminar subfamilia"
                  confirmText={`Eliminar "${subfamilia.codigo} - ${subfamilia.descripcion}". Esta acción no se puede deshacer. ¿Continuar?`}
                />
              </form>
            ) : (
              <span className="text-[11px] text-slate-500">Bloqueado</span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
