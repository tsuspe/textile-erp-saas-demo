export type DemoTourStep = {
  id: number;
  title: string;
  description: string;
  href: string;
  links?: Array<{
    label: string;
    href: string;
  }>;
};

export function getDemoTourSteps(empresa: string): DemoTourStep[] {
  const tenant = (empresa ?? "").trim();
  if (!tenant) return [];
  const base = `/${tenant}`;

  return [
    {
      id: 1,
      title: "Panel de empresa",
      description: "Vista general del tenant activo con accesos a modulos principales.",
      href: `${base}`,
    },
    {
      id: 2,
      title: "Maestros",
      description: "Entrada a gestion de clientes, articulos, temporadas y subfamilias.",
      href: `${base}/maestros`,
    },
    {
      id: 3,
      title: "Clientes (maestros)",
      description: "Listado y mantenimiento de clientes por empresa.",
      href: `${base}/maestros/clientes`,
    },
    {
      id: 4,
      title: "Fichas",
      description: "Navegacion de clientes/temporadas/escandallos y flujo de produccion.",
      href: `${base}/fichas`,
    },
    {
      id: 5,
      title: "RRHH · Control horario",
      description: "Control de fichajes y seguimiento operativo de jornada.",
      href: `${base}/rrhh/control-horario`,
    },
    {
      id: 6,
      title: "Legacy",
      description: "Consulta historica en modo lectura para comparar documentacion antigua.",
      href: `${base}/legacy`,
    },
    {
      id: 7,
      title: "Herramientas de almacen",
      description:
        "Acceso directo al panel de herramientas de almacen para utilidades operativas y reportes.",
      href: "/tools/almacen",
      links: [
        { label: "Abrir herramientas", href: "/tools/almacen" },
      ],
    },
    {
      id: 8,
      title: "Chat, notificaciones e IA",
      description:
        "Canales de comunicacion interna y acceso al panel IA para soporte operativo y seguimiento.",
      href: "/account/chat",
      links: [
        { label: "Chat", href: "/account/chat" },
        { label: "Notificaciones", href: "/account/notifications" },
        { label: "IA Dashboard", href: `${base}/admin/ai/dashboard` },
      ],
    },
  ];
}
