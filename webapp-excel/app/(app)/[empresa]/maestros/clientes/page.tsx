// app/(app)/[empresa]/maestros/clientes/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

// ✅ En prod evita “listado pegado”
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function ClientesPage({ params, searchParams }: PageProps) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};

  const ok = spGet(sp, "ok");
  const err = spGet(sp, "err");
  const error = spGet(sp, "error"); // compatibilidad si ya lo usabas

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });

  if (!empresa) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <p className="text-red-400 text-lg font-semibold">
            Empresa no encontrada: {empresaSlug}
          </p>
          <Link href="/" className="underline text-sm">
            Volver a selección de empresa
          </Link>
        </div>
      </main>
    );
  }

  const base = `/${empresa.slug}`;

  const clientesRaw = await prisma.cliente.findMany({
    where: { empresaId: empresa.id },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      _count: { select: { articulos: true, escandallos: true } },
    },
    orderBy: { codigo: "asc" },
  });

  // Orden numérico por código (01,02,03...)
  const clientes = [...clientesRaw].sort((a, b) => {
    const an = Number(a.codigo);
    const bn = Number(b.codigo);

    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);

    if (aIsNum && bIsNum) return an - bn;
    if (aIsNum) return -1;
    if (bIsNum) return 1;

    return a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });

  const showOkCreated = ok === "created";
  const showOkDeleted = ok === "deleted";
  const showErrCampos = err === "campos" || error === "campos";
  const showErrDup = err === "codigo_duplicado" || error === "codigo_duplicado";
  const showErrServer = err === "server" || error === "server";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              / Clientes
            </p>
            <h1 className="text-3xl font-bold">Clientes / Familias</h1>
            <p className="text-sm text-slate-400">
              Empresa:{" "}
              <span className="text-slate-200 font-semibold">{empresa.nombre}</span>
            </p>
          </div>

          <nav className="flex gap-3 text-sm underline">
            <Link href={`${base}/maestros/articulos`}>Ver artículos</Link>
            <Link href={`${base}/maestros/temporadas`}>Ver temporadas</Link>
            <Link href={`${base}/maestros/subfamilias`}>Ver subfamilias</Link>
          </nav>
        </header>

        {/* Flash messages */}
        {showOkCreated ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Cliente creado</p>
          </section>
        ) : null}

        {showOkDeleted ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Cliente eliminado</p>
          </section>
        ) : null}

        {showErrCampos ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">
              Faltan campos obligatorios
            </p>
          </section>
        ) : null}

        {showErrDup ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">
              Código duplicado en esta empresa
            </p>
          </section>
        ) : null}

        {showErrServer ? (
          <section className="rounded-xl border border-red-700/40 bg-red-900/20 p-4">
            <p className="text-sm text-red-200 font-semibold">Error del servidor</p>
          </section>
        ) : null}

        {/* Form nuevo cliente */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Nuevo cliente / familia</h2>

          <form
            action={`${base}/api/clientes`}
            method="POST"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-1">
              <label className="block text-sm">Código</label>
              <input
                type="text"
                name="codigo"
                required
                placeholder="01, 02..."
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Nombre</label>
              <input
                type="text"
                name="nombre"
                required
                placeholder="CORTEFIEL WOMAN"
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-start">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Guardar
              </button>
            </div>
          </form>
        </section>

        {/* Listado de clientes */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-2">Listado de clientes</h2>

          {/* ✅ Fix hydration: SIEMPRE el mismo wrapper (<ul>) */}
          <ul className="divide-y divide-slate-800">
            {clientes.length === 0 ? (
              <li className="py-2 text-sm text-slate-400">
                Todavía no hay clientes en esta empresa.
              </li>
            ) : (
              clientes.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex gap-4">
                    <span className="font-mono">{c.codigo}</span>
                    <span className="text-slate-200">{c.nombre}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      {c._count.articulos} art. · {c._count.escandallos} esc.
                    </span>

                    <Link
                      href={`${base}/maestros/clientes/${c.id}`}
                      className="text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      Editar
                    </Link>

                    {c._count.articulos === 0 && c._count.escandallos === 0 ? (
                      <form action={`${base}/api/clientes/${c.id}/delete`} method="POST">
                        <DeleteButton
                          label="Eliminar"
                          confirmText={`Eliminar "${c.nombre}". Esta acción no se puede deshacer. ¿Continuar?`}
                          className="text-xs"
                        />
                      </form>
                    ) : (
                      <span className="text-[11px] text-slate-500">Bloqueado</span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
