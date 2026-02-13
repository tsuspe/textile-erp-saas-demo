// app/components/AuthProvider.tsx
"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Proveedor global de sesión (NextAuth).
 * Permite usar useSession() en cualquier componente client (AppTopBar, etc.)
 */
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
