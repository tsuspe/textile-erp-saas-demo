// webapp-excel/app/(auth)/logout/page.tsx
"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";

export default function LogoutPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  useEffect(() => {
    const next = searchParams?.next ?? "/login";
    // Cierra sesión y manda a "next"
    signOut({ callbackUrl: next });
  }, [searchParams?.next]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="text-sm text-slate-300">Cerrando sesión…</div>
    </div>
  );
}
