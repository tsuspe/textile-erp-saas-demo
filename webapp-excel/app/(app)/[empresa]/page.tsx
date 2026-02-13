// app/(app)/[empresa]/page.tsx
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string }>;
};

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0.0";

export default async function EmpresaHome({ params }: PageProps) {
  const { empresa } = await params;
  const base = `/${empresa}`;
  const showDemoTour = isDemoMode() || (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true";

  const isLegacy = empresa === "legacy";
  // ✅ Legacy module cuelga del slug de empresa: /{empresa}/legacy
  const legacyHref = `${base}/legacy`;


  // 👇 Multi-empresa “bien”: resolvemos empresaId por slug y contamos por empresaId
  // En legacy no tiene sentido (modo filesystem / solo lectura)
  let stats:
    | { clientes: number; escandallos: number; pedidos: number }
    | null = null;

  if (!isLegacy) {
    const empresaRow = await prisma.empresa.findUnique({
      where: { slug: empresa },
      select: { id: true },
    });

    if (!empresaRow) notFound();

    const [clientes, escandallos, pedidos] = await Promise.all([
      prisma.cliente.count({ where: { empresaId: empresaRow.id } }),
      prisma.escandallo.count({ where: { empresaId: empresaRow.id } }),
      prisma.pedido.count({ where: { empresaId: empresaRow.id } }),
    ]);

    stats = { clientes, escandallos, pedidos };
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold">Panel de empresa</h1>
              <p className="text-sm text-slate-400">
                Contexto activo:{" "}
                <span className="font-semibold text-slate-200">/{empresa}</span>
                {!isLegacy && <> · fichas, maestros y asistente IA</>}
                {isLegacy && <> · módulo histórico</>}
              </p>

              {/* Contadores (solo si no es legacy) */}
              {!isLegacy && stats && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                    Clientes:{" "}
                    <span className="ml-1 font-semibold text-slate-200">
                      {stats.clientes}
                    </span>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                    Escandallos:{" "}
                    <span className="ml-1 font-semibold text-slate-200">
                      {stats.escandallos}
                    </span>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                    Pedidos:{" "}
                    <span className="ml-1 font-semibold text-slate-200">
                      {stats.pedidos}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {showDemoTour ? (
                <Link
                  href={`${base}/demo-tour`}
                  className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] text-indigo-200 hover:border-indigo-400 hover:text-indigo-100"
                >
                  Ver recorrido
                </Link>
              ) : null}

              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300">
                App v{APP_VERSION}
              </span>

              {isLegacy ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
                  LEGACY · Solo lectura
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                  Operativa + IA
                </span>
              )}
            </div>
          </div>

          {isLegacy && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-xs text-amber-200">
                Modo <span className="font-mono font-semibold">LEGACY</span>:
                consulta de fichas antiguas desde carpeta compartida.{" "}
                <span className="font-semibold">Solo lectura</span>.
              </p>
            </div>
          )}
        </header>

        {/* Menú */}
        {isLegacy ? (
          // ✅ Legacy: SOLO menú legacy
          <section className="grid grid-cols-1 gap-6">
            <Link
              href={legacyHref}
              className="group rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 transition hover:border-amber-400"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-amber-300 group-hover:text-amber-200">
                    Legacy · Fichas antiguas
                  </h2>
                  <span className="text-[11px] text-amber-200/70">
                    Solo lectura
                  </span>
                </div>

                <p className="text-sm text-amber-200/80 leading-relaxed">
                  Acceso directo a la documentación histórica en carpeta compartida
                  (Excel, PDF y otros). Sin escrituras, sin riesgos.
                </p>

                <ul className="text-xs text-amber-200/70 space-y-1">
                  <li>• Exploración por carpetas</li>
                  <li>• Descarga / consulta directa</li>
                  <li>• Pensado para búsqueda rápida</li>
                </ul>

                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                    Empresa: /legacy
                  </span>
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                    Filesystem
                  </span>
                </div>

                <div className="pt-2 text-xs font-semibold text-amber-300">
                  Entrar en legacy →
                </div>
              </div>
            </Link>
          </section>
        ) : (
          // ✅ Empresas normales: Fichas + Maestros + acceso a Legacy
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FICHAS */}
            <Link
              href={`${base}/fichas`}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-emerald-500 hover:bg-slate-900"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold group-hover:text-emerald-400">
                    Fichas
                  </h2>
                  <span className="text-[11px] text-slate-500 group-hover:text-emerald-300">
                    Operativa
                  </span>
                </div>

                <p className="text-sm text-slate-400 leading-relaxed">
                  Trabajo real del producto: escandallos, producción y pedidos.
                  Trazabilidad + apoyo del asistente IA para localizar datos rápido.
                </p>

                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• Escandallos por cliente/temporada</li>
                  <li>• Pedidos y seguimiento</li>
                  <li>• Comentarios e historial</li>
                </ul>

                <div className="pt-2 text-xs font-semibold text-emerald-400">
                  Entrar en fichas →
                </div>
              </div>
            </Link>

            {/* MAESTROS */}
            <Link
              href={`${base}/maestros`}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-indigo-500 hover:bg-slate-900"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold group-hover:text-indigo-400">
                    Maestros
                  </h2>
                  <span className="text-[11px] text-slate-500 group-hover:text-indigo-300">
                    Base de datos
                  </span>
                </div>

                <p className="text-sm text-slate-400 leading-relaxed">
                  Datos base y relaciones (clientes, artículos, temporadas, subfamilias).
                  Aquí se cocina la consistencia del sistema.
                </p>

                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• Estructura multi-empresa</li>
                  <li>• Datos normalizados</li>
                  <li>• Preparado para control de cambios</li>
                </ul>

                <div className="pt-2 text-xs font-semibold text-indigo-400">
                  Entrar en maestros →
                </div>
              </div>
            </Link>

            {/* LEGACY */}
            {showDemoTour ? (
              <Link
                href={`${base}/demo-tour`}
                className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-cyan-500 hover:bg-slate-900 md:col-span-2"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold group-hover:text-cyan-300">
                      Demo Tour
                    </h2>
                    <span className="text-[11px] text-slate-500 group-hover:text-cyan-200">
                      DEMO_MODE
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed">
                    Recorrido guiado por funcionalidades clave: maestros, fichas,
                    RRHH y módulo legacy, usando rutas reales del proyecto.
                  </p>

                  <ul className="text-xs text-slate-400 space-y-1">
                    <li>• 8 pasos guiados</li>
                    <li>• Enlaces verificados</li>
                    <li>• Ideal para presentación pública</li>
                  </ul>

                  <div className="pt-2 text-xs font-semibold text-cyan-300">
                    Ver recorrido →
                  </div>
                </div>
              </Link>
            ) : null}

            {/* LEGACY */}
            <Link
              href={legacyHref}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-amber-500 hover:bg-slate-900 md:col-span-2"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold group-hover:text-amber-300">
                    Legacy · Fichas antiguas
                  </h2>
                  <span className="text-[11px] text-slate-500 group-hover:text-amber-200">
                    Solo lectura
                  </span>
                </div>

                <p className="text-sm text-slate-400 leading-relaxed">
                  Consulta histórica en carpetas compartidas (Excel/PDF). Útil para comparar,
                  rescatar referencias y validar información antigua.
                </p>

                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• Exploración por carpetas</li>
                  <li>• Descarga directa</li>
                  <li>• Sin escrituras (cero riesgos)</li>
                </ul>

                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                    Empresa: /legacy
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                    Filesystem
                  </span>
                </div>

                <div className="pt-2 text-xs font-semibold text-amber-300">
                  Entrar en legacy →
                </div>
              </div>
            </Link>
          </section>
        )}

        <footer className="pt-6 text-xs text-slate-500 border-t border-slate-800">
          App Router · Prisma · Multi-empresa · v{APP_VERSION}
        </footer>
      </div>
    </main>
  );
}
