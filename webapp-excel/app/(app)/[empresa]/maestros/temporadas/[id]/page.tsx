// app/(app)/[empresa]/maestros/temporadas/[id]/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";


type PageProps = {
  // Next 16: params viene como Promise
  params: Promise<{ empresa: string; id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EditTemporadaPage({ params, searchParams }: PageProps) {
  const { empresa, id: idStr } = await params;
  const base = `/${empresa}`;

  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const error = spGet(sp, "error");

  const temporadaId = Number(idStr);

  if (!Number.isFinite(temporadaId)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">ID de temporada no válido.</p>
          <Link href={`${base}/maestros/temporadas`} className="underline">
            Volver a temporadas
          </Link>
        </div>
      </main>
    );
  }

  const temporada = await prisma.temporada.findUnique({
    where: { id: temporadaId },
    select: {
      id: true,
      codigo: true,
      descripcion: true,
      updatedAt: true, // ✅ necesario para optimistic locking
      _count: { select: { articulos: true, escandallos: true } },
    },
  });

  if (!temporada) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">
            No se ha encontrado la temporada.
          </p>
          <Link href={`${base}/maestros/temporadas`} className="underline">
            Volver a temporadas
          </Link>
        </div>
      </main>
    );
  }

  const canDelete =
    temporada._count.articulos === 0 && temporada._count.escandallos === 0;

  const showConflict = error === "conflict";
  const showOk = ok === "1";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Editar temporada</h1>
          <Link href={`${base}/maestros/temporadas`} className="text-sm underline">
            Volver a temporadas
          </Link>
        </header>

        {/* Flash messages */}
        {showConflict ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">
              Conflicto de edición
            </p>
            <p className="text-xs text-amber-100/90 mt-1">
              Esta temporada ha sido modificada mientras la estabas editando.
              Refresca la página para cargar los cambios y vuelve a intentar guardar.
            </p>
          </section>
        ) : null}

        {showOk ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">
              Cambios guardados
            </p>
          </section>
        ) : null}

        {/* Edit form */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <form
            action={`${base}/api/temporadas/${temporada.id}`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* ✅ optimistic locking token */}
            <input
              type="hidden"
              name="updatedAt"
              value={temporada.updatedAt.toISOString()}
            />

            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                required
                defaultValue={temporada.codigo}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Descripción</label>
              <input
                type="text"
                name="descripcion"
                required
                defaultValue={temporada.descripcion}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-start gap-3">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Guardar cambios
              </button>

              <Link
                href={`${base}/maestros/temporadas`}
                className="inline-flex items-center rounded-md border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </section>

        {/* Danger zone */}
        <section className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-red-300">Zona peligrosa</h2>

          <p className="text-xs text-slate-300">
            Solo se podrá eliminar si esta temporada no tiene artículos ni
            escandallos asociados.
          </p>

          <p className="text-xs text-slate-400">
            Dependencias:{" "}
            <span className="font-semibold text-slate-200">
              {temporada._count.articulos}
            </span>{" "}
            artículos ·{" "}
            <span className="font-semibold text-slate-200">
              {temporada._count.escandallos}
            </span>{" "}
            escandallos
          </p>

          {canDelete ? (
            <form
              action={`${base}/api/temporadas/${temporada.id}/delete`}
              method="POST"
            >
              <DeleteButton
                label="Eliminar temporada"
                confirmText={`Eliminar "${temporada.descripcion}" (${temporada.codigo}). Esta acción no se puede deshacer. ¿Continuar?`}
              />
            </form>
          ) : (
            <div className="text-[11px] text-slate-500">
              Eliminación bloqueada por dependencias.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
