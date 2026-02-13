// app/(app)/[empresa]/fichas/.../escandallos/[escandallosId]/produccion/PedidosTabs.tsx
import Link from "next/link";

type ActiveTab =
  | "escandallo"
  | "pedido"
  | "almacen"
  | "control"
  | "observaciones";

type PedidosTabsProps = {
  /** Base de PRODUCCIÓN: /empresa/fichas/.../escandallos/.../produccion */
  baseHref: string;
  /** Vista del escandallo: /empresa/fichas/.../escandallos/... */
  escandalloHref: string;
  active: ActiveTab;

  /** Vistas (si no se pasan, se derivan del baseHref) */
  pedidoHref?: string;
  almacenHref?: string;
  controlHref?: string;
  observacionesHref?: string;
};

export default function PedidosTabs({
  baseHref,
  escandalloHref,
  active,
  pedidoHref,
  almacenHref,
  controlHref,
  observacionesHref,
}: PedidosTabsProps) {
  const tabs: {
    key: ActiveTab;
    label: string;
    href: string;
  }[] = [
    {
      key: "escandallo",
      label: "Escandallo",
      href: escandalloHref,
    },
    {
      key: "pedido",
      label: "Pedido",
      href: pedidoHref ?? `${baseHref}/pedido`,
    },
    {
      key: "almacen",
      label: "Almacén",
      href: almacenHref ?? `${baseHref}/almacen`,
    },
    {
      key: "control",
      label: "Control calidad",
      href: controlHref ?? `${baseHref}/control`,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      href: observacionesHref ?? `${baseHref}/observaciones`,
    },
  ];

  const baseClass =
    "inline-flex items-center px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors";

  return (
    <nav className="border-b border-slate-800 mb-4">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const isActive = tab.key === active;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={
                baseClass +
                " " +
                (isActive
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
