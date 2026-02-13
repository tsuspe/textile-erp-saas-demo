// app/(app)/[empresa]/admin/ai/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string }>;
};

export default async function AIDashboardPage({ params }: PageProps) {
  const { empresa } = await params;

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, nombre: true },
  });
  if (!empresaRow) notFound();

  const total = await prisma.aIInteraction.count({
    where: { empresaId: empresaRow.id },
  });

  const ok = await prisma.aIInteraction.count({
    where: { empresaId: empresaRow.id, success: true },
  });

  const fail = total - ok;
  const successRate = total ? Math.round((ok / total) * 100) : 0;

  // ✅ Prisma groupBy (funciona en SQLite y Postgres)
  const grouped = await prisma.aIInteraction.groupBy({
    by: ["question"],
    where: { empresaId: empresaRow.id },
    // ✅ Conteo por campo (compatible con tu Prisma): cuenta filas contando ids
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const topQuestions = grouped.map((g) => ({
    question: g.question,
    count: g._count.id,
  }));


  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-xl font-semibold">
          Dashboard IA — {empresaRow.nombre}
        </h1>
        <p className="text-sm text-slate-400">Estado real del asistente</p>
      </header>

      <div className="grid grid-cols-4 gap-4">
        <Metric label="Total consultas" value={total} />
        <Metric label="Resueltas" value={ok} />
        <Metric label="Fallidas" value={fail} />
        <Metric label="Éxito IA" value={`${successRate}%`} />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Top 10 preguntas</h2>
        <ul className="space-y-1 text-sm">
          {topQuestions.map((q, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{q.question}</span>
              <span className="text-slate-400 tabular-nums">{q.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border border-slate-800 p-4 bg-slate-900">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
