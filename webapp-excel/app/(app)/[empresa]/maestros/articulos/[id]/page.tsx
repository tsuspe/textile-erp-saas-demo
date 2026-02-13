// app/(app)/[empresa]/maestros/articulos/[id]/page.tsx
import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import NuevoArticuloForm from "../nuevo/NuevoArticuloForm";

type PageProps = {
  params: Promise<{ empresa: string; id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EditArticuloPage({ params, searchParams }: PageProps) {
  const { empresa, id } = await params;
  if (!empresa) redirect("/");

  const base = `/${empresa}`;
  const articuloId = Number(id);
  if (!Number.isFinite(articuloId)) notFound();

  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const err = spGet(sp, "err");

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, nombre: true, slug: true },
  });
  if (!empresaRow) notFound();

  const [articulo, temporadas, clientes, subfamilias] = await Promise.all([
    prisma.articulo.findFirst({
      where: { id: articuloId, empresaId: empresaRow.id },
      select: {
        id: true,
        codigo: true,
        descripcion: true,
        temporadaId: true,
        clienteId: true,
        subfamiliaId: true,
        updatedAt: true, // ✅ para optimistic locking
        _count: { select: { escandallos: true } },
      },
    }),
    prisma.temporada.findMany({ orderBy: { codigo: "asc" } }),
    prisma.cliente.findMany({
      where: { empresaId: empresaRow.id },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, nombre: true }, // ✅ ajustado a Props del form
    }),
    prisma.subfamilia.findMany({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descripcion: true }, // ✅ ajustado a Props del form
    }),
  ]);

  if (!articulo) notFound();

  const escCount = articulo._count.escandallos ?? 0;
  const puedeEliminar = escCount === 0;

  const showOkUpdated = ok === "updated";
  const showErrCampos = err === "campos";
  const showErrDup = err === "codigo_duplicado";
  const showErrServer = err === "server";
  const showErrConcurrency = err === "concurrency";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              /{" "}
              <Link
                href={`${base}/maestros/articulos`}
                className="hover:text-emerald-400"
              >
                Artículos
              </Link>{" "}
              / Editar
            </p>
            <h1 className="text-3xl font-bold mt-1">Editar artículo</h1>
            <p className="text-xs text-slate-400 mt-1">
              Empresa:{" "}
              <span className="text-slate-200 font-semibold">{empresaRow.nombre}</span>
            </p>
          </div>

          <nav className="flex gap-3 text-sm">
            <Link
              href={`${base}/maestros/articulos`}
              className="underline hover:text-emerald-300"
            >
              Volver
            </Link>
          </nav>
        </header>

        {/* Flash */}
        {showOkUpdated ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Artículo actualizado</p>
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
            <p className="text-sm text-amber-200 font-semibold">Código duplicado</p>
          </section>
        ) : null}

        {showErrServer ? (
          <section className="rounded-xl border border-red-700/40 bg-red-900/20 p-4">
            <p className="text-sm text-red-200 font-semibold">Error del servidor</p>
          </section>
        ) : null}

        {showErrConcurrency ? (
          <section className="rounded-xl border border-red-700/40 bg-red-900/20 p-4 space-y-2">
            <p className="text-sm text-red-200 font-semibold">
              Este artículo cambió mientras lo estabas editando.
            </p>
            <p className="text-xs text-slate-200">
              Alguien guardó una versión más nueva. Recarga la página para ver el último estado
              y vuelve a aplicar tus cambios.
            </p>
            <Link
              href={`${base}/maestros/articulos/${articulo.id}`}
              className="inline-flex text-xs underline text-emerald-300 hover:text-emerald-200"
            >
              Recargar artículo
            </Link>
          </section>
        ) : null}

        <NuevoArticuloForm
          basePath={base}
          temporadas={temporadas}
          clientes={clientes}
          subfamilias={subfamilias}
          articuloInicial={{
            id: articulo.id,
            codigo: articulo.codigo,
            descripcion: articulo.descripcion,
            temporadaId: articulo.temporadaId,
            clienteId: articulo.clienteId,
            subfamiliaId: articulo.subfamiliaId,
            updatedAt: articulo.updatedAt.toISOString(), // ✅ string para hidden input
          }}
          modo="editar"
        />

        <section className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-red-300">Zona peligrosa</h2>

          <p className="text-xs text-slate-300">
            Escandallos asociados:{" "}
            <span className="font-semibold text-slate-200">{escCount}</span>
            <br />
            El artículo solo podrá eliminarse si no tiene escandallos asociados.
          </p>

          {puedeEliminar ? (
            <form
              action={`${base}/api/articulos/${articulo.id}/delete`}
              method="POST"
            >
              <DeleteButton
                label="Eliminar artículo"
                confirmText={`Eliminar el artículo "${articulo.codigo}". Esta acción no se puede deshacer. ¿Continuar?`}
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
