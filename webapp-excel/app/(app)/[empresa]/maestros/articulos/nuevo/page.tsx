// app/(app)/[empresa]/maestros/articulos/nuevo/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import NuevoArticuloForm from "./NuevoArticuloForm";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function spGet(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function NuevoArticuloPage({ params, searchParams }: PageProps) {
  const { empresa } = await params;
  if (!empresa) redirect("/");

  const sp = (await searchParams) ?? {};
  const err = spGet(sp, "err");
  const ok = spGet(sp, "ok");

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, nombre: true, slug: true },
  });

  if (!empresaRow) notFound();

  const base = `/${empresaRow.slug}`;

  const [temporadasRaw, clientes, subfamilias] = await Promise.all([
    prisma.temporada.findMany({ orderBy: { codigo: "asc" } }),
    prisma.cliente.findMany({
      where: { empresaId: empresaRow.id },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.subfamilia.findMany({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descripcion: true },
    }),
  ]);

  const temporadas = [...temporadasRaw].sort((a, b) => {
    const an = Number(a.codigo);
    const bn = Number(b.codigo);
    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);

    if (aIsNum && bIsNum) return bn - an; // numéricas primero (más recientes arriba)
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return b.codigo.localeCompare(a.codigo, "es", { numeric: true });
  });

  const showOk = ok === "created";
  const showErrCampos = err === "campos";
  const showErrDup = err === "codigo_duplicado";
  const showErrServer = err === "server";
  const showErrCliente = err === "cliente_no_valido";
  const showErrNotFound = err === "notfound";

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
              <Link href={`${base}/maestros/articulos`} className="hover:text-emerald-400">
                Artículos
              </Link>{" "}
              / Nuevo
            </p>
            <h1 className="text-3xl font-bold mt-1">Nuevo artículo</h1>
            <p className="text-xs text-slate-400 mt-1">
              Empresa:{" "}
              <span className="text-slate-200 font-semibold">{empresaRow.nombre}</span>
            </p>
          </div>

          <nav className="flex gap-3 text-sm underline">
            <Link href={`${base}/maestros/articulos`}>Ver artículos</Link>
            <Link href={`${base}/maestros/temporadas`}>Ver temporadas</Link>
            <Link href={`${base}/maestros/clientes`}>Ver clientes</Link>
            <Link href={`${base}/maestros/subfamilias`}>Ver subfamilias</Link>
          </nav>
        </header>

        {/* Flash messages */}
        {showOk ? (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
            <p className="text-sm text-emerald-200 font-semibold">Artículo creado</p>
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

        {showErrCliente ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">
              Cliente no válido para esta empresa
            </p>
          </section>
        ) : null}

        {showErrNotFound ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
            <p className="text-sm text-amber-200 font-semibold">
              Temporada o subfamilia no encontrada
            </p>
          </section>
        ) : null}

        {showErrServer ? (
          <section className="rounded-xl border border-red-700/40 bg-red-900/20 p-4">
            <p className="text-sm text-red-200 font-semibold">Error del servidor</p>
          </section>
        ) : null}

        <NuevoArticuloForm
          basePath={base}
          temporadas={temporadas}
          clientes={clientes}
          subfamilias={subfamilias}
          modo="nuevo"
        />
      </div>
    </main>
  );
}
