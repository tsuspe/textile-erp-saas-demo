// app/(app)/[empresa]/maestros/clientes/[id]/page.tsx
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

export default async function EditClientePage({ params, searchParams }: PageProps) {
  const { empresa, id: idStr } = await params;
  const base = `/${empresa}`;

  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const error = spGet(sp, "error");

  const clienteId = Number(idStr);
  if (!Number.isFinite(clienteId)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">ID de cliente no válido.</p>
          <Link href={`${base}/maestros/clientes`} className="underline">
            Volver a clientes
          </Link>
        </div>
      </main>
    );
  }

  // ✅ resolver empresaId desde slug (multi-empresa)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, nombre: true, slug: true },
  });

  if (!empresaRow) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">Empresa no encontrada.</p>
          <Link href={`/${empresa}/maestros`} className="underline">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  // ✅ buscar cliente dentro de esa empresa (evita mezcla)
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId: empresaRow.id },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      empresaId: true,
      updatedAt: true, // ✅ optimistic locking
      _count: { select: { articulos: true, escandallos: true } },
    },
  });

  if (!cliente) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">
            No se ha encontrado el cliente (o no pertenece a esta empresa).
          </p>
          <Link href={`${base}/maestros/clientes`} className="underline">
            Volver a clientes
          </Link>
        </div>
      </main>
    );
  }

  const puedeEliminar =
    cliente._count.articulos === 0 && cliente._count.escandallos === 0;

  const showConflict = error === "conflict";
  const showOk = ok === "1";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/maestros/clientes`}
                className="hover:text-emerald-400"
              >
                Clientes
              </Link>{" "}
              / Editar
            </p>
            <h1 className="text-2xl font-bold">Editar cliente / familia</h1>
          </div>

          <Link href={`${base}/maestros/clientes`} className="text-sm underline">
            Volver a clientes
          </Link>
        </header>

        {/* Flash messages */}
        {showConflict ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">Conflicto de edición</p>
            <p className="text-xs text-amber-100/90 mt-1">
              Este cliente ha sido modificado mientras lo estabas editando.
              Refresca la página para cargar los cambios y vuelve a intentar guardar.
            </p>
          </section>
        ) : null}

        {showOk ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Cambios guardados</p>
          </section>
        ) : null}

        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <form
            action={`${base}/api/clientes/${cliente.id}`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* ✅ optimistic locking token */}
            <input type="hidden" name="updatedAt" value={cliente.updatedAt.toISOString()} />

            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                required
                defaultValue={cliente.codigo}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Nombre</label>
              <input
                type="text"
                name="nombre"
                required
                defaultValue={cliente.nombre}
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
                href={`${base}/maestros/clientes`}
                className="inline-flex items-center rounded-md border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </section>

        {/* ZONA PELIGROSA */}
        <section className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-red-300">Zona peligrosa</h2>

          <p className="text-xs text-slate-300">
            Artículos asociados:{" "}
            <span className="font-semibold">{cliente._count.articulos}</span> ·
            Escandallos asociados:{" "}
            <span className="font-semibold">{cliente._count.escandallos}</span>
          </p>

          {!puedeEliminar ? (
            <p className="text-[11px] text-slate-500">
              Eliminación bloqueada: primero elimina o reasigna los datos asociados.
            </p>
          ) : (
            <form action={`${base}/api/clientes/${cliente.id}/delete`} method="POST">
              <DeleteButton
                label="Eliminar cliente"
                confirmText={`Eliminar "${cliente.nombre}". Esta acción no se puede deshacer. ¿Continuar?`}
              />
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
