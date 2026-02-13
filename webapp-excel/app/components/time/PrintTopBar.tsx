// app/components/time/PrintTopBar.tsx
"use client";

import Link from "next/link";

export default function PrintTopBar({
  backHref,
}: {
  backHref: string;
}) {
  return (
    <div className="topbar noprint">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
        <Link href={backHref} className="btn">
          ← Volver
        </Link>

        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
