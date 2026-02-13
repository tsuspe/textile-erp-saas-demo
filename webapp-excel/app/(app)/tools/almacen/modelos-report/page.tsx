// app/(app)/tools/almacen/modelos-report/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { userHasAnyGroup } from "@/lib/tools/registry";

import ModelosReportClient from "./ModelosReportClient";

const ALLOWED_GROUPS = ["ALMACEN", "PRODUCCION", "CONTABILIDAD", "ADMIN"] as const;

type EmpresaLite = { id: number; slug: string; nombre: string };

export default async function ModelosReportPage() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;

  if (!user) redirect("/login");
  if (!userHasAnyGroup(user.groups, [...ALLOWED_GROUPS])) redirect("/?err=no_permisos");

  let empresas: EmpresaLite[] = [];

  const isAdmin = (user.groups ?? []).includes("ADMIN");
  if (isAdmin) {
    empresas = await prisma.empresa.findMany({
      select: { id: true, slug: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  } else {
    const rows = await prisma.userEmpresa.findMany({
      where: { userId: user.id },
      select: { empresa: { select: { id: true, slug: true, nombre: true } } },
      orderBy: { empresa: { nombre: "asc" } },
    });

    empresas = rows.map((r) => r.empresa);
  }

  if (empresas.length === 0) redirect("/?err=no_empresa_access");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 sm:px-6 lg:px-8 py-10 print:bg-white print:text-slate-900">
      <div className="mx-auto w-full max-w-screen-2xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Herramientas · Almacén</div>
            <h1 className="text-3xl font-bold">Consultas Modelos</h1>
            <p className="mt-2 text-slate-400">
              Consultas a BD de modelos/pedidos con previsualización y export Excel imprimible.
            </p>
          </div>

          <Link
            href="/tools/almacen"
            className="print-hide rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            ← Volver
          </Link>
        </div>

        <ModelosReportClient empresas={empresas} />
      </div>
    </main>
  );
}
