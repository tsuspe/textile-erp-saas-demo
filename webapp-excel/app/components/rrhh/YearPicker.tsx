// app/components/rrhh/YearPicker.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function YearPicker({
  basePath,
  years,
  defaultYear,
}: {
  basePath: string;      // ej: "/jbp/rrhh/calendario"
  years: number[];
  defaultYear: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const current = useMemo(() => {
    const y = Number(sp.get("year"));
    return Number.isFinite(y) && y >= 2020 && y <= 2100 ? y : defaultYear;
  }, [sp, defaultYear]);

  return (
    <select
      className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
      value={current}
      onChange={(e) => {
        const y = Number(e.target.value);
        router.replace(`${basePath}?year=${y}`);
      }}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
