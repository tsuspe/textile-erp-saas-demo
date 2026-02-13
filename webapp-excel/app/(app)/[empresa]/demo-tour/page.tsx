import Link from "next/link";
import { getDemoTourSteps } from "./_steps";

type PageProps = {
  params: Promise<{ empresa: string }>;
};

export default async function DemoTourPage({ params }: PageProps) {
  const { empresa } = await params;
  if (!empresa) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <div className="max-w-3xl mx-auto rounded-2xl border border-rose-900/40 bg-rose-950/20 p-6">
          <h1 className="text-xl font-semibold text-rose-200">Demo Tour no disponible</h1>
          <p className="mt-2 text-sm text-rose-100/90">
            No se ha podido resolver el tenant (`empresa`) en la URL.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }
  const base = `/${empresa}`;
  const steps = getDemoTourSteps(empresa);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-wider text-slate-400">Demo</p>
          <h1 className="mt-1 text-3xl font-bold">Demo Tour</h1>
          <p className="mt-2 text-sm text-slate-400">
            Recorrido guiado para la empresa <span className="font-semibold text-slate-200">{empresa}</span>.
            Todos los enlaces apuntan a rutas reales del proyecto.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={base}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
            >
              Volver a Home
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {steps.map((step) => (
            <article
              key={step.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col gap-4"
            >
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Paso {step.id}</p>
                <h2 className="text-lg font-semibold text-slate-100">{step.title}</h2>
                <p className="text-sm text-slate-400">{step.description}</p>
              </div>

              <p className="text-xs font-mono text-slate-500">Ruta: {step.href}</p>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={step.href}
                  className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                >
                  Abrir
                </Link>
                {step.links?.map((link) => (
                  <Link
                    key={`${step.id}-${link.href}-${link.label}`}
                    href={link.href}
                    className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-300"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
