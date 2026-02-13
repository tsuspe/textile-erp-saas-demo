// app/(app)/[empresa]/rrhh/page.tsx
import { requireRRHH } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RRHHHubPage({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: empresaSlug } = await params;

  await requireRRHH(empresaSlug);

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) notFound();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">RRHH</div>
            <h1 className="text-xl font-semibold">Panel RRHH · {empresa.nombre}</h1>
            <p className="text-sm text-white/70">
              Calendario (festivos + cierre), datos de impresión y accesos.
            </p>
          </div>

          <Link
            href={`/${empresaSlug}`}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Volver
          </Link>
        </div>
      </div>

           <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href={`/${empresaSlug}/rrhh/calendario`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="text-sm text-white/60">Anual</div>
          <div className="text-lg font-semibold">Calendario</div>
          <div className="text-sm text-white/70">
            Festivos + vacaciones colectivas (cierre de empresa).
          </div>
        </Link>

        <Link
          href={`/${empresaSlug}/admin/users`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="text-sm text-white/60">Usuarios</div>
          <div className="text-lg font-semibold">Datos trabajadores</div>
          <div className="text-sm text-white/70">
            NIF y Nº SS por usuario (y permisos).
          </div>
        </Link>

        <Link
          href={`/${empresaSlug}/rrhh/vacaciones`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="text-sm text-white/60">Workflow</div>
          <div className="text-lg font-semibold">Vacaciones</div>
          <div className="text-sm text-white/70">
            Saldos (acumulables) + solicitudes + vista anual por trabajador.
          </div>
        </Link>

        <Link
          href={`/${empresaSlug}/rrhh/control-horario`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="text-sm text-white/60">Rectificación</div>
          <div className="text-lg font-semibold">Control horario</div>
          <div className="text-sm text-white/70">
            Desbloquear firmas, cambiar tipo de día (WORK/VACATION) y excepciones de cierre.
          </div>
        </Link>
      </div>
    </div>
  );
}
