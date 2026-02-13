// app/(app)/[empresa]/rrhh/calendario/preview/page.tsx
import { getAppSession, requireRRHH, type SessionUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pickYear(sp?: Record<string, string | string[] | undefined>) {
  const raw = sp?.year;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  const now = new Date();
  return Number.isFinite(n) && n >= 2020 && n <= 2100 ? n : now.getUTCFullYear();
}

export default async function RRHHCalendarPreviewRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa: empresaSlug } = await params;
  const sp = (await searchParams) ?? {};
  const year = pickYear(sp);

  await requireRRHH(empresaSlug);

  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user) redirect("/login");

  // Preview rápido: Enero del año seleccionado
  const ym = `${year}-01`;

  // Reutiliza el print actual (usuario actual)
  redirect(`/account/time/${empresaSlug}/${ym}/print?from=rrhh`);
}
