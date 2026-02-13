// lib/almacen/pedidoColorTotals.ts
// Helpers para totales desde PedidoColor.distribucion (formato actual y legacy).

export type PedidoColorLike = { distribucion: any | null };

function safeNumber(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function sumArray(input: unknown): number {
  if (!Array.isArray(input)) return 0;
  return input.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function getDistribucion(raw: any): any | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function sumBy(colors: PedidoColorLike[] | null | undefined, pick: (dist: any) => number) {
  if (!colors?.length) return 0;
  return colors.reduce((acc, c) => acc + pick(getDistribucion(c.distribucion)), 0);
}

export function sumPedido(colors: PedidoColorLike[] | null | undefined) {
  return sumBy(colors, (dist) => {
    const direct = safeNumber(dist?.total);
    if (direct != null) return direct;
    return sumArray(dist?.unidades);
  });
}

export function sumCorte(colors: PedidoColorLike[] | null | undefined) {
  return sumBy(colors, (dist) => {
    const direct = safeNumber(dist?.corte?.total);
    if (direct != null) return direct;
    return sumArray(dist?.corte?.unidades);
  });
}

export function sumEntregas(colors: PedidoColorLike[] | null | undefined) {
  return sumBy(colors, (dist) => {
    const direct = safeNumber(dist?.entregas?.total);
    if (direct != null) return direct;
    return sumArray(dist?.entregas?.unidades);
  });
}

// Self-check (manual):
// const dist = {
//   tallas: ["S", "M"],
//   unidades: [10, 20],
//   total: 30,
//   corte: { unidades: [5, 10], total: 15 },
//   entregas: { unidades: [2, 3], total: 5 },
// };
// sumPedido([{ distribucion: dist }]) === 30
// sumCorte([{ distribucion: dist }]) === 15
// sumEntregas([{ distribucion: dist }]) === 5
