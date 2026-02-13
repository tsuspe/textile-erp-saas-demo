// app/page.tsx
import UserHomeCard from "@/app/components/UserHomeCard";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import Link from "next/link";
import AlmacenToolsHomeCard from "@/app/components/AlmacenToolsHomeCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;


// Pon en tu .env: NEXT_PUBLIC_APP_VERSION=3.0.0
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "3.0.0";

type EmpresaCard = {
  id: number;
  slug: string;
  nombre: string;
  stats: {
    clientes: number;
    escandallos: number;
    pedidos: number;
  };
};

export default async function RootHome() {
  const empresasBase = await prisma.empresa.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, slug: true, nombre: true },
  });

  // Nota: N+1, pero #empresas suele ser bajo. Si crece, lo optimizamos con agregaciones.
  const empresas: EmpresaCard[] = await Promise.all(
    empresasBase.map(async (e) => {
      const [clientes, escandallos, pedidos] = await Promise.all([
        prisma.cliente.count({ where: { empresaId: e.id } }),
        prisma.escandallo.count({ where: { empresaId: e.id } }),
        prisma.pedido.count({ where: { empresaId: e.id } }),
      ]);

      return {
        ...e,
        stats: { clientes, escandallos, pedidos },
      };
    }),
  );

  const legacy = empresas.find((e) => e.slug === "legacy");
  const activas = empresas.filter((e) => e.slug !== "legacy");
  const showDemoTour = isDemoMode() || (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true";
  const demoTourSlug = activas[0]?.slug ?? null;
  const demoTourHref = demoTourSlug ? `/${demoTourSlug}/demo-tour` : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-8 py-12">
      <div className="max-w-6xl mx-auto space-y-14">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Demo Textile Platform</h1>
              <p className="text-slate-400 max-w-2xl">
                Plataforma interna para fichas, producción y maestros. Multi-empresa,
                trazable y con asistente operativo IA para acelerar búsquedas y decisiones
                sin perder control.
              </p>
            </div>

            {/* Chips + User card */}
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300">
                  App v{APP_VERSION}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300">
                  Next · Prisma
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                  Asistente IA
                </span>
              </div>

              {/* ✅ Usuario activo + acciones rápidas */}
              <UserHomeCard />
            </div>
          </div>
        </header>
                {/* Herramientas por rol (ALMACEN, etc.) */}
        <AlmacenToolsHomeCard />


        {/* Empresas activas */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm uppercase tracking-wider text-slate-500">
              Empresas activas
            </h2>

            <span className="text-xs text-slate-500">
              {activas.length} {activas.length === 1 ? "empresa" : "empresas"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activas.map((e) => (
              <Link
                key={e.slug}
                href={`/${e.slug}`}
                className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition
                           hover:border-emerald-500 hover:bg-slate-900"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="text-xl font-semibold group-hover:text-emerald-400">
                      {e.nombre}
                    </h3>
                    <span className="text-[11px] text-slate-500">/{e.slug}</span>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed">
                    Panel operativo con fichas y maestros. Búsqueda asistida por IA,
                    trazabilidad y base de datos unificada por empresa.
                  </p>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                      Clientes:{" "}
                      <span className="ml-1 font-semibold text-slate-200">
                        {e.stats.clientes}
                      </span>
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                      Escandallos:{" "}
                      <span className="ml-1 font-semibold text-slate-200">
                        {e.stats.escandallos}
                      </span>
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-300">
                      Pedidos:{" "}
                      <span className="ml-1 font-semibold text-slate-200">
                        {e.stats.pedidos}
                      </span>
                    </span>
                  </div>

                  <div className="pt-2 text-xs font-semibold text-emerald-400">
                    Entrar →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Demo Tour */}
        {showDemoTour && demoTourHref ? (
          <section className="space-y-4">
            <h2 className="text-sm uppercase tracking-wider text-slate-500">
              Recorrido demo
            </h2>

            <Link
              href={demoTourHref}
              className="block rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6 transition hover:border-cyan-400"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-cyan-200">
                    Demo Tour
                  </h3>
                  <p className="text-sm text-cyan-100/80 max-w-2xl">
                    Acceso directo al recorrido guiado con rutas reales del producto,
                    incluyendo almacén, chat, notificaciones e IA.
                  </p>

                  <ul className="text-xs text-cyan-100/70 space-y-1 pt-1">
                    <li>• Presentación guiada por módulos</li>
                    <li>• Enlaces listos para demo</li>
                    <li>• Tenant activo: /{demoTourSlug}</li>
                  </ul>
                </div>

                <div className="shrink-0 text-xs font-semibold text-cyan-200">
                  Abrir Demo Tour →
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        {/* Legacy */}
        {legacy && (
          <section className="space-y-4">
            <h2 className="text-sm uppercase tracking-wider text-slate-500">
              Base de datos histórica
            </h2>

            <Link
              href={`/${legacy.slug}`}
              className="block rounded-2xl border border-amber-500/30 bg-amber-500/10
                         p-6 transition hover:border-amber-400"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-amber-300">
                    Legacy · Fichas antiguas
                  </h3>
                  <p className="text-sm text-amber-200/80 max-w-2xl">
                    Acceso en solo lectura a documentación histórica (Excel, PDF y carpetas).
                    Ideal para consulta rápida sin tocar datos ni romper nada.
                  </p>

                  <ul className="text-xs text-amber-200/70 space-y-1 pt-1">
                    <li>• Datos no normalizados</li>
                    <li>• Navegación por filesystem</li>
                    <li>• Descarga/consulta directa</li>
                  </ul>
                </div>

                <div className="shrink-0 text-xs font-semibold text-amber-300">
                  Entrar en legacy →
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-10 border-t border-slate-800 text-xs text-slate-500 flex flex-wrap gap-4 justify-between">
          <span>App Router · Prisma · Multi-empresa · Asistente IA</span>
          <span>v{APP_VERSION} · Demo Build</span>
        </footer>
      </div>
    </main>
  );
}
