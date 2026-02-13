// app/(app)/account/time/[empresa]/page.tsx
import { redirect } from "next/navigation";

function isYm(s: string) {
  return /^\d{4}-\d{2}$/.test(s);
}

function ymNowUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function TimeEmpresaRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { empresa } = await params;
  const sp = (await searchParams) ?? {};
  const raw = sp.ym;
  const ym = Array.isArray(raw) ? raw[0] : raw;
  const target = ym && isYm(ym) ? ym : ymNowUTC();
  redirect(`/account/time/${empresa}/${target}`);
}
