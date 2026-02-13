// lib/tools/registry.ts
// Registro central de herramientas por grupos.
// Esto nos permite escalar: mañana metemos RRHH, Producción, etc. sin reventar la Home.

export type ToolGroupKey = "ALMACEN" | "RRHH" | "ADMIN" | "PRODUCCION" | "CONTABILIDAD";

export type AppTool = {
  key: string;
  title: string;
  description: string;
  href: string;
  groupKeys: ToolGroupKey[]; // quién puede verla
  status?: "READY" | "WIP";
};

export const TOOLS: AppTool[] = [
  {
    key: "ediwin-parse",
    title: "EDIWIN Parser",
    description: "PDF EDIWIN (Eurofiel/ECI) → Excel/CSV + carpetas por modelo.",
    href: "/tools/almacen/ediwin-parse",
    groupKeys: ["ALMACEN", "ADMIN"],
    status: "WIP",
  },
  {
    key: "globalia-stock",
    title: "Control Stock Globalia",
    description: "Integración del control de stock (siguiente módulo).",
    href: "/tools/almacen/globalia-stock",
    groupKeys: ["ALMACEN", "ADMIN"],
    status: "WIP",
  },
  {
    key: "modelos-report",
    title: "Consultas Modelos",
    description: "Consultas a BD + preview + export Excel imprimible.",
    href: "/tools/almacen/modelos-report",
    groupKeys: ["ALMACEN", "PRODUCCION", "CONTABILIDAD", "ADMIN"],
    status: "WIP",
  },
];

export function userHasAnyGroup(userGroups: string[] | undefined, needed: ToolGroupKey[]) {
  const g = (userGroups ?? []).map((x) => String(x).toUpperCase());
  return needed.some((k) => g.includes(k));
}

export function getToolsForUser(userGroups: string[] | undefined) {
  return TOOLS.filter((t) => userHasAnyGroup(userGroups, t.groupKeys));
}

export function getAlmacenToolsForUser(userGroups: string[] | undefined) {
  return TOOLS.filter((t) => t.href.startsWith("/tools/almacen") && userHasAnyGroup(userGroups, t.groupKeys));
}
