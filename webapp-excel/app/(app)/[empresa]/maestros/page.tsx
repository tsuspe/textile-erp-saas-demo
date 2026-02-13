import Link from "next/link";

type PageProps = {
  params: Promise<{
    empresa: string;
  }>;
};

const items = [
  { slug: "clientes", label: "Clientes" },
  { slug: "temporadas", label: "Temporadas" },
  { slug: "articulos", label: "Artículos" },
  { slug: "subfamilias", label: "Subfamilias" },
];

export default async function MaestrosPage({ params }: PageProps) {
  const { empresa } = await params;

  const base = `/${empresa}`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Maestros</h1>
          <p className="text-sm text-slate-400">
            Gestión de datos base del sistema
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((i) => (
            <Link
              key={i.slug}
              href={`${base}/maestros/${i.slug}`}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 hover:border-emerald-500 hover:bg-slate-900 transition"
            >
              <p className="text-lg font-semibold">{i.label}</p>
              <p className="text-xs text-slate-500 mt-1">
                Gestionar {i.label.toLowerCase()}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
