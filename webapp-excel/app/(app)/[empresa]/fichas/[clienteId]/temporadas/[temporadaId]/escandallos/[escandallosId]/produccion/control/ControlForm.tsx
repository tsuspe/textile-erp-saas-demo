// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/produccion/control/ControlForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type PedidoColorDistribucion = {
  id: number;
  color: string;
  tipoTalla: string;
  distribucion: any; // { tallas: string[], ... }
};

type MedidaFila = {
  id: string;
  nombre: string;
  valores: string[];
};

type ColorControl = {
  pedidoColorId: number;
  color: string;
  tipoTalla: string;
  tallas: string[];
  medidas: MedidaFila[];
};

type ControlCalidadState = {
  pedidoId: number;
  colores: ColorControl[];
  observaciones: string;
};

type ControlFormProps = {
  empresa: string;
  cliente: { id: number; nombre: string };
  temporada: { id: number; codigo: string };
  escandallo: {
    id: number;
    modeloInterno: string | null;
    modeloCliente: string | null;
    patron?: string | null;
    imagenUrl?: string | null;
  };
  pedido: any; // ideal: tipar PedidoDTO
  redirectUrl: string;
};

function createEmptyMedida(tallas: string[]): MedidaFila {
  return {
    id: crypto.randomUUID(),
    nombre: "",
    valores: tallas.map(() => ""),
  };
}

function toIso(value: any): string {
  // Acepta Date, string ISO, o null
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const t = d instanceof Date ? d.getTime() : NaN;
  return Number.isFinite(t) ? new Date(d).toISOString() : "";
}

export default function ControlForm({
  empresa,
  cliente,
  temporada,
  escandallo,
  pedido,
  redirectUrl,
}: ControlFormProps) {
  const router = useRouter();

  // ✅ base del optimistic locking: updatedAt con el que abriste el form
  const initialUpdatedAt = useMemo(() => toIso(pedido.updatedAt), [pedido.updatedAt]);
  const [ifUnmodifiedSince, setIfUnmodifiedSince] = useState<string>(initialUpdatedAt);

  // Hidratar desde JSON existente (si lo hay)
  const initialState: ControlCalidadState = (() => {
    const existing = (pedido.controlCalidad || null) as any;

    if (existing && Array.isArray(existing.colores)) {
      return {
        pedidoId: pedido.id,
        colores: pedido.colores.map((c: PedidoColorDistribucion) => {
          const dist = c.distribucion || {};
          const tallas: string[] = dist.tallas ?? [];

          const match =
            existing.colores.find((ec: any) => ec.pedidoColorId === c.id) || null;

          const medidas: MedidaFila[] =
            match && Array.isArray(match.medidas)
              ? match.medidas.map((m: any) => ({
                  id: m.id || crypto.randomUUID(),
                  nombre: m.nombre || "",
                  valores: (() => {
                    const base = (m.valores || []).map((v: any) =>
                      v == null ? "" : String(v),
                    );
                    return tallas.map((_, i) => base[i] ?? "");
                  })(),
                }))
              : [createEmptyMedida(tallas)];

          return {
            pedidoColorId: c.id,
            color: c.color || "—",
            tipoTalla: c.tipoTalla,
            tallas,
            medidas,
          };
        }),
        observaciones: existing.observaciones || "",
      };
    }

    return {
      pedidoId: pedido.id,
      colores: pedido.colores.map((c: PedidoColorDistribucion) => {
        const dist = c.distribucion || {};
        const tallas: string[] = dist.tallas ?? [];
        return {
          pedidoColorId: c.id,
          color: c.color || "—",
          tipoTalla: c.tipoTalla,
          tallas,
          medidas: [createEmptyMedida(tallas)],
        };
      }),
      observaciones: "",
    };
  })();

  const [state, setState] = useState<ControlCalidadState>(initialState);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Para conflictos: te guardo el updatedAt actual del server por si quieres mostrarlo
  const [conflictInfo, setConflictInfo] = useState<{ currentUpdatedAt: string | null } | null>(
    null,
  );

  const handleNombreChange = (colorIndex: number, medidaId: string, value: string) => {
    setState((prev) => {
      const colores = [...prev.colores];
      const color = { ...colores[colorIndex] };
      const medidas = color.medidas.map((m) => (m.id === medidaId ? { ...m, nombre: value } : m));
      color.medidas = medidas;
      colores[colorIndex] = color;
      return { ...prev, colores };
    });
  };

  const handleValorChange = (
    colorIndex: number,
    medidaId: string,
    tallaIndex: number,
    value: string,
  ) => {
    setState((prev) => {
      const colores = [...prev.colores];
      const color = { ...colores[colorIndex] };
      const medidas = color.medidas.map((m) => {
        if (m.id !== medidaId) return m;
        const valores = [...m.valores];
        valores[tallaIndex] = value;
        return { ...m, valores };
      });
      color.medidas = medidas;
      colores[colorIndex] = color;
      return { ...prev, colores };
    });
  };

  const handleAddMedida = (colorIndex: number) => {
    setState((prev) => {
      const colores = [...prev.colores];
      const color = { ...colores[colorIndex] };
      const nueva = createEmptyMedida(color.tallas);
      color.medidas = [...color.medidas, nueva];
      colores[colorIndex] = color;
      return { ...prev, colores };
    });
  };

  const handleRemoveMedida = (colorIndex: number, medidaId: string) => {
    setState((prev) => {
      const colores = [...prev.colores];
      const color = { ...colores[colorIndex] };
      const medidas =
        color.medidas.length <= 1 ? color.medidas : color.medidas.filter((m) => m.id !== medidaId);
      color.medidas = medidas;
      colores[colorIndex] = color;
      return { ...prev, colores };
    });
  };

  const handleReload = () => {
    // Recarga datos del server (si otro guardó)
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setConflictInfo(null);

    try {
      const base = `/${empresa}`;

      if (!ifUnmodifiedSince) {
        throw new Error(
          "No puedo guardar: falta updatedAt del pedido (optimistic locking).",
        );
      }

      const res = await fetch(`${base}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: state.pedidoId,
          ifUnmodifiedSince,
          controlCalidad: {
            colores: state.colores,
            observaciones: state.observaciones,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setConflictInfo({ currentUpdatedAt: data?.currentUpdatedAt ?? null });
        setErrorMsg(
          data?.message ||
            "Conflicto: alguien guardó antes. Recarga para ver los cambios.",
        );
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Error guardando control de calidad");
      }

      // ✅ actualizar el token de concurrencia para poder seguir guardando
      if (data.updatedAt) setIfUnmodifiedSince(String(data.updatedAt));

      setSuccessMsg("Control de calidad guardado correctamente.");
      router.push(redirectUrl);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error guardando control de calidad");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMsg && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 space-y-2">
          <p>{errorMsg}</p>
          {conflictInfo && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleReload}
                className="inline-flex items-center rounded-md border border-red-800 px-2 py-1 text-[11px] text-red-200 hover:bg-red-900/40"
              >
                Recargar para traer cambios
              </button>
              {conflictInfo.currentUpdatedAt && (
                <span className="text-[11px] text-red-200/70">
                  (Último guardado: {conflictInfo.currentUpdatedAt})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {successMsg && (
        <p className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
          {successMsg}
        </p>
      )}

      {/* INFO CABECERA */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3 text-xs">
          <h2 className="text-lg font-semibold mb-1">Datos del pedido</h2>
          <p className="text-slate-400 mb-2">
            Cliente <span className="text-emerald-400">{cliente.nombre}</span> · Temporada{" "}
            <span className="text-emerald-400">{temporada.codigo}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-slate-400">Nº pedido</p>
              <p className="font-medium">{pedido.numeroPedido || "—"}</p>
            </div>
            <div>
              <p className="text-slate-400">Fecha pedido</p>
              <p className="font-medium">
                {pedido.fechaPedido ? new Date(pedido.fechaPedido).toISOString().slice(0, 10) : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Fecha entrega</p>
              <p className="font-medium">
                {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toISOString().slice(0, 10) : "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-slate-400">Modelo interno</p>
              <p className="font-medium">{pedido.modeloInterno || escandallo.modeloInterno || "—"}</p>
            </div>
            <div>
              <p className="text-slate-400">Modelo / ref. cliente</p>
              <p className="font-medium">{pedido.modeloCliente || escandallo.modeloCliente || "—"}</p>
            </div>
            <div>
              <p className="text-slate-400">Patrón</p>
              <p className="font-medium">{pedido.patron || escandallo.patron || "—"}</p>
            </div>
          </div>
        </div>

        {/* FOTO */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between gap-3">
          <div className="w-full aspect-[3/4] rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden">
            {pedido.imagenUrl || escandallo.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(pedido.imagenUrl || escandallo.imagenUrl) as string}
                alt="Imagen modelo"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-slate-500">Sin imagen asociada</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            Imagen modelo / referencia visual para control de calidad.
          </p>
        </div>
      </section>

      {/* COLORES + MEDIDAS */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-5 text-xs">
        <h2 className="text-lg font-semibold">Medidas importantes</h2>
        <p className="text-slate-400 mb-2">
          Para cada color, define las medidas clave por talla (pecho, cintura, largo total, etc.).
        </p>

        {state.colores.map((color, colorIndex) => (
          <div key={color.pedidoColorId} className="border border-slate-800 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-slate-400 text-xs">Color</p>
              <p className="font-medium text-sm">{color.color}</p>
              <p className="text-[11px] text-slate-500">Tipo talla: {color.tipoTalla}</p>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border border-slate-800 rounded-md">
                <thead className="bg-slate-900/60">
                  <tr>
                    <th className="px-2 py-1 text-left">Medida</th>
                    {color.tallas.map((t) => (
                      <th key={t} className="px-2 py-1 text-center font-normal">
                        {t}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-normal">{/* vacío */}</th>
                  </tr>
                </thead>
                <tbody>
                  {color.medidas.map((m) => (
                    <tr key={m.id} className="border-t border-slate-800/60">
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          className="w-full rounded-md bg-slate-950 border border-slate-800 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="Ej: Largo total, Pecho, Cintura..."
                          value={m.nombre}
                          onChange={(e) => handleNombreChange(colorIndex, m.id, e.target.value)}
                        />
                      </td>

                      {color.tallas.map((_, tallaIndex) => (
                        <td key={tallaIndex} className="px-1 py-1 text-center">
                          <input
                            type="text"
                            className="w-full rounded-md bg-slate-950 border border-slate-800 px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="-"
                            value={m.valores[tallaIndex] || ""}
                            onChange={(e) =>
                              handleValorChange(colorIndex, m.id, tallaIndex, e.target.value)
                            }
                          />
                        </td>
                      ))}

                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-red-400"
                          onClick={() => handleRemoveMedida(colorIndex, m.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => handleAddMedida(colorIndex)}
              className="inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              + Añadir medida
            </button>
          </div>
        ))}
      </section>

      {/* OBSERVACIONES */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3 text-xs">
        <h2 className="text-lg font-semibold">Observaciones</h2>
        <p className="text-slate-400">
          Notas generales de control de calidad (incidencias, ajustes de patrón, comentarios de taller, etc.).
        </p>
        <textarea
          className="mt-2 w-full min-h-[120px] rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={state.observaciones}
          onChange={(e) => setState((prev) => ({ ...prev, observaciones: e.target.value }))}
          placeholder="Ej: Revisar largo en talla XS, diferencias de plancha, etc."
        />
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar control de calidad"}
        </button>
      </div>
    </form>
  );
}
