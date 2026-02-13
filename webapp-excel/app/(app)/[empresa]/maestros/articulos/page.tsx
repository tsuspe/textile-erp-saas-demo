// app/(app)/[empresa]/maestros/articulos/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { DeleteButton } from "@/app/components/DeleteButton";
import { prisma } from "@/lib/prisma";
import type { Articulo, Cliente, Temporada } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ArticuloConDatos = Articulo & {
  temporada: Temporada;
  cliente: Cliente;
  _count: { escandallos: number };
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function buildQueryString(base: Record<string, string>, patch: Record<string, string | null>) {
  const qp = new URLSearchParams(base);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") qp.delete(k);
    else qp.set(k, v);
  }
  const s = qp.toString();
  return s ? `?${s}` : "";
}

export default async function ArticulosPage({ params, searchParams }: PageProps) {
  const { empresa } = await params;
  if (!empresa) redirect("/");

  const base = `/${empresa}`;
  const sp = (await searchParams) ?? {};
  const ok = spGet(sp, "ok");
  const err = spGet(sp, "err");

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresaRow) notFound();

  // -----------------------------
  // Filtros (query params)
  // -----------------------------
  const q = (spGet(sp, "q") ?? "").trim();
  const temporadaId = toInt(spGet(sp, "temporadaId"));
  const clienteId = toInt(spGet(sp, "clienteId"));
  const subfamiliaId = toInt(spGet(sp, "subfamiliaId"));

  const pageSize = 50; // ajusta a 25/50/100 según lo cómodo que te sea
  const pRaw = spGet(sp, "p") ?? "1";
  const page = Math.max(1, Number(pRaw) || 1);

  const where = {
    empresaId: empresaRow.id,
    ...(temporadaId ? { temporadaId } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(subfamiliaId ? { subfamiliaId } : {}),
    ...(q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" as const } },
            { descripcion: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Datos para selects (no rompe nada, solo UI)
  const [temporadasRaw, clientes, subfamilias] = await Promise.all([
    prisma.temporada.findMany({
      select: { id: true, codigo: true, descripcion: true },
      // Aquí el orderBy ya no nos sirve porque "codigo" es string.
      // Lo ordenamos numéricamente después.
    }),
    prisma.cliente.findMany({
      where: { empresaId: empresaRow.id },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: "asc" }, // ✅ menor → mayor (01, 02, 03...)
    }),
    prisma.subfamilia.findMany({
      select: { id: true, codigo: true, descripcion: true },
      orderBy: { codigo: "asc" },
    }),
  ]);

  // ✅ Temporadas orden numérico real (21, 20, 19... 2, 1)
  const temporadas = [...temporadasRaw].sort((a, b) => Number(b.codigo) - Number(a.codigo));



  // Paginación: count + página actual
  const total = await prisma.articulo.count({ where });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;

  const articulos: ArticuloConDatos[] = await prisma.articulo.findMany({
    where,
    include: {
      temporada: true,
      cliente: true,
      _count: { select: { escandallos: true } },
    },
    orderBy: { codigo: "asc" },
    skip,
    take: pageSize,
  });

  // Base query params (para mantener filtros al paginar)
  const baseQP: Record<string, string> = {};
  if (q) baseQP.q = q;
  if (temporadaId) baseQP.temporadaId = String(temporadaId);
  if (clienteId) baseQP.clienteId = String(clienteId);
  if (subfamiliaId) baseQP.subfamiliaId = String(subfamiliaId);

  const prevHref = `${base}/maestros/articulos${buildQueryString(baseQP, {
    p: safePage > 1 ? String(safePage - 1) : null,
  })}`;

  const nextHref = `${base}/maestros/articulos${buildQueryString(baseQP, {
    p: safePage < totalPages ? String(safePage + 1) : null,
  })}`;

  const clearHref = `${base}/maestros/articulos`;

  const showOkCreated = ok === "created";
  const showOkUpdated = ok === "updated";
  const showOkDeleted = ok === "deleted";
  const showErrServer = err === "server";
  const showErrCampos = err === "campos";
  const showErrDup = err === "codigo_duplicado";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href={`${base}/maestros`} className="hover:text-emerald-400">
                Maestros
              </Link>{" "}
              / Artículos
            </p>
            <h1 className="text-3xl font-bold mt-1">Artículos</h1>
            <p className="text-xs text-slate-400 mt-1">
              Empresa: <span className="text-slate-200 font-semibold">{empresaRow.nombre}</span>
            </p>
          </div>

          <nav className="flex flex-wrap gap-3 text-sm">
            <Link href={`${base}/maestros/articulos/nuevo`} className="underline hover:text-emerald-300">
              Nuevo artículo
            </Link>
            <Link href={`${base}/maestros/temporadas`} className="underline hover:text-emerald-300">
              Temporadas
            </Link>
            <Link href={`${base}/maestros/clientes`} className="underline hover:text-emerald-300">
              Clientes
            </Link>
            <Link href={`${base}/maestros/subfamilias`} className="underline hover:text-emerald-300">
              Subfamilias
            </Link>
          </nav>
        </header>

        {/* Flash */}
        {showOkCreated ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Artículo creado</p>
          </section>
        ) : null}
        {showOkUpdated ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Artículo actualizado</p>
          </section>
        ) : null}
        {showOkDeleted ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Artículo eliminado</p>
          </section>
        ) : null}

        {showErrCampos ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">Faltan campos obligatorios</p>
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

        {/* Barra de filtros */}
        <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <form action={`${base}/maestros/articulos`} method="GET" className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Buscar (código o descripción)</label>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder='Ej: "2120PA", "vestido", "K134"...'
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-700/60"
                />
              </div>

              <div className="md:w-56">
                <label className="block text-xs text-slate-400 mb-1">Temporada</label>
                <select
                  name="temporadaId"
                  defaultValue={temporadaId ? String(temporadaId) : ""}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-700/60"
                >
                  <option value="">Todas</option>
                  {temporadas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} — {t.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:w-72">
                <label className="block text-xs text-slate-400 mb-1">Cliente</label>
                <select
                  name="clienteId"
                  defaultValue={clienteId ? String(clienteId) : ""}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-700/60"
                >
                  <option value="">Todos</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <div className="md:w-72">
                <label className="block text-xs text-slate-400 mb-1">Subfamilia</label>
                <select
                  name="subfamiliaId"
                  defaultValue={subfamiliaId ? String(subfamiliaId) : ""}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-700/60"
                >
                  <option value="">Todas</option>
                  {subfamilias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.codigo} — {s.descripcion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <button
                  type="submit"
                  className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/30"
                >
                  Aplicar filtros
                </button>

                <Link href={clearHref} className="text-sm underline text-slate-300 hover:text-emerald-300">
                  Limpiar
                </Link>
              </div>

              <div className="md:ml-auto flex items-end">
                <p className="text-xs text-slate-400">
                  Mostrando{" "}
                  <span className="text-slate-200 font-semibold">
                    {total === 0 ? 0 : skip + 1}-{Math.min(skip + pageSize, total)}
                  </span>{" "}
                  de <span className="text-slate-200 font-semibold">{total}</span>
                </p>
              </div>
            </div>

            {/* reset de página al filtrar */}
            <input type="hidden" name="p" value="1" />
          </form>
        </section>

        {total === 0 ? (
          <p className="text-sm text-slate-400">
            No hay resultados con estos filtros. Prueba a limpiar o buscar por parte del código.
          </p>
        ) : (
          <>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Código</th>
                    <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                    <th className="px-3 py-2 text-left font-semibold">Temporada</th>
                    <th className="px-3 py-2 text-left font-semibold">Cliente</th>
                    <th className="px-3 py-2 text-left font-semibold">Histórico</th>
                    <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 bg-slate-950">
                  {articulos.map((a) => {
                    const bloqueado = a._count.escandallos > 0;

                    return (
                      <tr key={a.id} className="hover:bg-slate-900/40">
                        <td className="px-3 py-2 font-mono">{a.codigo}</td>
                        <td className="px-3 py-2">{a.descripcion}</td>
                        <td className="px-3 py-2">{a.temporada.codigo}</td>
                        <td className="px-3 py-2">{a.cliente.nombre}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-slate-400">{a._count.escandallos} esc.</span>
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`${base}/maestros/articulos/${a.id}`}
                              className="text-xs underline text-emerald-400 hover:text-emerald-300"
                            >
                              Editar
                            </Link>

                            {!bloqueado ? (
                              <form action={`${base}/api/articulos/${a.id}/delete`} method="POST">
                                <DeleteButton
                                  label="Eliminar"
                                  confirmText={`Eliminar "${a.codigo} - ${a.descripcion}". Esta acción no se puede deshacer. ¿Continuar?`}
                                />
                              </form>
                            ) : (
                              <span className="text-[11px] text-slate-500">Bloqueado</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Página <span className="text-slate-200 font-semibold">{safePage}</span> de{" "}
                <span className="text-slate-200 font-semibold">{totalPages}</span>
              </p>

              <div className="flex gap-3">
                {safePage > 1 ? (
                  <Link
                    href={prevHref}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:border-emerald-700/60"
                  >
                    ← Anterior
                  </Link>
                ) : (
                  <span className="rounded-lg border border-slate-900 bg-slate-950 px-3 py-2 text-sm text-slate-600">
                    ← Anterior
                  </span>
                )}

                {safePage < totalPages ? (
                  <Link
                    href={nextHref}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:border-emerald-700/60"
                  >
                    Siguiente →
                  </Link>
                ) : (
                  <span className="rounded-lg border border-slate-900 bg-slate-950 px-3 py-2 text-sm text-slate-600">
                    Siguiente →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
