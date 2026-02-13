// app/(app)/[empresa]/admin/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminBackupsCard from "@/app/components/admin/AdminBackupsCard";

type PageProps = {
  params: Promise<{ empresa: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHome({ params }: PageProps) {
  const { empresa } = await params;

  const empresaRow = await prisma.empresa.findUnique({
    where: { slug: empresa },
    select: { id: true, nombre: true, slug: true },
  });

  if (!empresaRow) notFound();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Panel Admin</div>
            <h1 className="text-xl font-semibold">Administración</h1>
            <p className="text-sm text-white/70">
              Usuarios, permisos y herramientas internas.
              <br />
              <span className="text-white/50">
                Empresa: {empresaRow.nombre}
              </span>
            </p>
          </div>

          {/* ✅ Volver / Cambiar empresa */}
          <Link
            href="/admin"
            className="shrink-0 rounded-lg border border-white/10 bg-white/5
                       px-3 py-2 text-xs text-white/80 hover:bg-white/10"
            title="Cambiar empresa"
          >
            ← Cambiar empresa
          </Link>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href={`/${empresa}/admin/users`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="font-semibold">Usuarios</div>
          <div className="text-sm text-white/70">
            Activar cuentas, asignar grupos (ADMIN / RRHH / ALMACÉN…) y empresas.
          </div>
        </Link>

        <Link
          href={`/${empresa}/rrhh`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="font-semibold">RRHH</div>
          <div className="text-sm text-white/70">
            Calendario, cierres de empresa, textos legales y control laboral.
          </div>
        </Link>

        <Link
          href={`/${empresa}/admin/ai/dashboard`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="font-semibold">IA · Dashboard</div>
          <div className="text-sm text-white/70">
            Estado, métricas y salud del asistente.
          </div>
        </Link>

        <Link
          href={`/${empresa}/admin/ai/logs`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="font-semibold">IA · Logs</div>
          <div className="text-sm text-white/70">
            Histórico de preguntas, acciones y auditoría.
          </div>
        </Link>
      </div>

      <AdminBackupsCard />
    </div>
  );
}
