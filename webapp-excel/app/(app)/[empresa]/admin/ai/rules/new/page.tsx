// app/(app)/[empresa]/admin/ai/rules/new/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ fromLog?: string }>;
};

export default async function NewAIRulePage({ params, searchParams }: PageProps) {
  const { empresa } = await params;
  const { fromLog } = await searchParams;

  // 1) Resolver empresaId por slug (multi-empresa)
  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true },
  });
  if (!empresaRow) notFound();

  // 2) Parse seguro de fromLog
  const logId = fromLog ? Number(fromLog) : null;

  // 3) ✅ Importante: evitar mezclar empresas
  const log =
    logId && Number.isFinite(logId)
      ? await prisma.aIInteraction.findFirst({
          where: { id: logId, empresaId: empresaRow.id },
          select: { id: true, question: true, answer: true },
        })
      : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Crear regla IA</h1>

      {/* Si viene fromLog pero no encontramos log válido o no pertenece a la empresa */}
      {fromLog && !log && (
        <p className="text-sm text-orange-400">
          No se encontró el log (o no pertenece a esta empresa).
        </p>
      )}

      {log ? (
        <div className="rounded border border-slate-800 p-4 bg-slate-900">
          <p className="text-sm text-slate-400">Pregunta original</p>
          <p className="mt-1">{log.question}</p>

          <p className="text-sm text-slate-400 mt-4">Respuesta actual</p>
          <p className="mt-1">{log.answer}</p>
        </div>
      ) : (
        <p className="text-slate-400">
          Crea una regla manualmente o accede desde un log fallido.
        </p>
      )}

      <p className="text-sm text-slate-500">
        (Aquí conectaremos esta pantalla con el motor de reglas del asistente)
      </p>
    </div>
  );
}
