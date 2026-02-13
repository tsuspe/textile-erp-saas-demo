// app/components/AppBreadcrumbs.tsx
"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";

const LABELS: Record<string, string> = {
  fichas: "Fichas",
  maestros: "Maestros",
  admin: "Admin",
  users: "Usuarios",
  ai: "IA",
  clientes: "Clientes",
  temporadas: "Temporadas",
  articulos: "Artículos",
  subfamilias: "Subfamilias",
  escandallos: "Escandallos",
  produccion: "Producción",
  pedido: "Pedido",
};

function pretty(seg: string) {
  if (/^\d+$/.test(seg)) return `#${seg}`;
  return (
    LABELS[seg] ??
    seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export default function AppBreadcrumbs({ empresaSlug }: { empresaSlug: string }) {
  const segments = useSelectedLayoutSegments();
  if (!segments.length) return null;

  const base = `/${empresaSlug}`;

  const crumbs = segments.map((seg, idx) => {
    const href = `${base}/` + segments.slice(0, idx + 1).join("/");
    return { href, label: pretty(seg) };
  });

  return (
    <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
      <ol className="flex items-center gap-2 flex-wrap">
        <li>
          <Link href={base} className="hover:text-slate-200">
            Home
          </Link>
        </li>

        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-2">
            <span className="text-slate-600">/</span>
            {i === crumbs.length - 1 ? (
              <span className="text-slate-200">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-slate-200">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
