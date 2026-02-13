// app/(app)/[empresa]/rrhh/layout.tsx
import type { ReactNode } from "react";

export default function RRHHLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {children}
    </div>
  );
}
