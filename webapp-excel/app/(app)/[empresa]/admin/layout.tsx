// app/(app)/[empresa]/admin/layout.tsx
import { requireAdmin } from "@/lib/auth-server";
import type { ReactNode } from "react";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ empresa: string }>;
}) {
  const { empresa } = await params;

  // ✅ Todo /admin requiere grupo ADMIN
  await requireAdmin(empresa);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {children}
    </div>
  );
}
