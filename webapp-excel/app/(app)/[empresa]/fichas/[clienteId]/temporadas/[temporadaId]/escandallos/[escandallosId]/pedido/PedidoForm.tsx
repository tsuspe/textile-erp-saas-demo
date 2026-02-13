//app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/pedido/PedidoForm.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const PACK_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
const PACK_NUMEROS = ["34", "36", "38", "40", "42", "44", "46", "48"];

type PedidoTejidoForm = {
  proveedor: string;
  serie: string;
  color: string;
  colorPedido?: string;
  consumoProduccion: string;
  composicion: string;
  metrosPedidos: string;
  fechaPedido: string;
};

type PedidoForroForm = {
  proveedor: string;
  serie: string;
  color: string;
  colorPedido?: string;
  consumoProduccion: string;
  composicion: string;
  metrosPedidos: string;
  fechaPedido: string;
};

type PedidoAccesorioForm = {
  nombre: string;
  proveedor: string;
  referencia: string;
  color: string;
  colorPedido?: string;
  medida: string;
  unidad: string;
  consumoEsc: string;
  cantidadPed: string;
  fechaPedido: string;
};

type PedidoColorForm = {
  color: string;
  tipoTalla: "LETRAS" | "NUMEROS" | "PERSONALIZADO";
  tallas: string; // CSV "XS,S,M,L"
  unidades: string; // CSV "10,20,30,40"
};

type PedidoInitialValues = {
  id?: number;
  updatedAt?: string; // 👈 NUEVO (ISO)
  numeroPedido: string;
  fechaPedido: string;
  fechaEntrega: string;
  modeloInterno: string;
  modeloCliente: string;
  patron: string;
  descripcionEscandallo?: string;
  descripcionPedido: string;
  costeEscandallo: number | null;
  precioVenta: string;
  pvp: string;
  observaciones: string;
  imagenUrl?: string | null;

  tejidos: PedidoTejidoForm[];
  forros: PedidoForroForm[];
  accesorios: PedidoAccesorioForm[];
  colores: PedidoColorForm[];
};

type Props = {
  empresa: string; // 👈 AÑADIR
  clienteId: number;
  temporadaId: number;
  escandalloId: number;
  escandalloCodigo: string;
  initialValues: PedidoInitialValues;
};


function parseNumber(value: string): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export default function PedidoForm({
  empresa,
  clienteId,
  temporadaId,
  escandalloId,
  escandalloCodigo,
  initialValues,
}: Props) {
  const base = `/${empresa}`;
  const [numeroPedido, setNumeroPedido] = useState(
    initialValues.numeroPedido ?? "",
  );
  const [fechaPedido, setFechaPedido] = useState(
    initialValues.fechaPedido ?? "",
  );
  const [fechaEntrega, setFechaEntrega] = useState(
    initialValues.fechaEntrega ?? "",
  );

  const [modeloInterno, setModeloInterno] = useState(
    initialValues.modeloInterno ?? "",
  );
  const [modeloCliente, setModeloCliente] = useState(
    initialValues.modeloCliente ?? "",
  );
  const [patron, setPatron] = useState(initialValues.patron ?? "");
  const [descripcionPedido, setDescripcionPedido] = useState(
    initialValues.descripcionPedido ?? "",
  );

  const [precioVenta, setPrecioVenta] = useState(initialValues.precioVenta ?? "");
  const [pvp, setPvp] = useState(initialValues.pvp ?? "");
  const [observaciones, setObservaciones] = useState(
    initialValues.observaciones ?? "",
  );

  const [tejidos, setTejidos] = useState<PedidoTejidoForm[]>(
    initialValues.tejidos.length > 0
      ? initialValues.tejidos
      : [
          {
            proveedor: "",
            serie: "",
            color: "",
            colorPedido: "",
            consumoProduccion: "",
            composicion: "",
            metrosPedidos: "",
            fechaPedido: "",
          },
        ],
  );


  const [forros, setForros] = useState<PedidoForroForm[]>(
    initialValues.forros.length > 0
      ? initialValues.forros
      : [
          {
            proveedor: "",
            serie: "",
            color: "",
            colorPedido: "",
            consumoProduccion: "",
            composicion: "",
            metrosPedidos: "",
            fechaPedido: "",
          },
        ],
  );


  const [accesorios, setAccesorios] = useState<PedidoAccesorioForm[]>(
    initialValues.accesorios.length > 0
      ? initialValues.accesorios
      : [
          {
            nombre: "",
            proveedor: "",
            referencia: "",
            color: "",
            colorPedido: "",
            medida: "",
            unidad: "UNIDADES",
            consumoEsc: "",
            cantidadPed: "",
            fechaPedido: "",
          },
        ],
  );


  const [colores, setColores] = useState<PedidoColorForm[]>(
    initialValues.colores.length > 0
      ? initialValues.colores
      : [
          {
            color: "",
            tipoTalla: "LETRAS",
            tallas: PACK_LETRAS.join(","),                // 👈 ya metemos XXS…XXL
            unidades: PACK_LETRAS.map(() => "").join(","), // 👈 mismas posiciones
          },
        ],
  );


  // Total unidades por color (solo para mostrar)
  const totalesPorColor = useMemo(() => {
    return colores.map((c) => {
      const unidadesArr = c.unidades
        .split(",")
        .map((u) => parseNumber(u.trim()))
        .filter((x): x is number => x != null);
      return unidadesArr.reduce((acc, n) => acc + n, 0);
    });
  }, [colores]);

  // 🔹 Unidades totales por color (clave = nombre color)
  const unidadesPorColor = useMemo(() => {
    const map: Record<string, number> = {};

    colores.forEach((c, idx) => {
      const nombreColor = c.color.trim();
      if (!nombreColor) return;

      const total = totalesPorColor[idx] ?? 0;
      map[nombreColor] = (map[nombreColor] ?? 0) + total;
    });

    return map;
  }, [colores, totalesPorColor]);

  // 🔹 Lista de nombres de color disponibles en el pedido
  const coloresDisponibles = useMemo(
    () => colores.map((c) => c.color.trim()).filter(Boolean),
    [colores],
  );


  // Handlers básicos de arrays
  const handleTejidoChange = (
    index: number,
    field: keyof PedidoTejidoForm,
    value: string,
  ) => {
    setTejidos((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  };

  const handleForroChange = (
    index: number,
    field: keyof PedidoForroForm,
    value: string,
  ) => {
    setForros((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
    );
  };

  const handleAccesorioChange = (
    index: number,
    field: keyof PedidoAccesorioForm,
    value: string,
  ) => {
    setAccesorios((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
  };

  const handleColorChange = (
    index: number,
    field: keyof PedidoColorForm,
    value: string,
  ) => {
    setColores((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;

        // 👇 Si el usuario edita las tallas manualmente, re-alineamos unidades
        if (field === "tallas") {
          const tallasArr = value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          const unidadesArr = c.unidades.split(",").map((u) => u.trim());
          const normalized: string[] = [];

          for (let k = 0; k < tallasArr.length; k++) {
            normalized[k] = unidadesArr[k] ?? "";
          }

          return { ...c, tallas: value, unidades: normalized.join(",") };
        }

        return { ...c, [field]: value };
      }),
    );
  };


  const handleTipoTallaChange = (
  index: number,
  tipo: PedidoColorForm["tipoTalla"],
) => {
  setColores((prev) =>
    prev.map((c, i) => {
      if (i !== index) return c;

      // Si es personalizado, solo cambiamos el tipo y dejamos que el usuario
      // defina las tallas a mano.
      if (tipo === "PERSONALIZADO") {
        const tallasArr = c.tallas
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const unidadesArr = c.unidades.split(",").map((u) => u.trim());
        const normalized: string[] = [];

        for (let k = 0; k < tallasArr.length; k++) {
          normalized[k] = unidadesArr[k] ?? "";
        }

        return { ...c, tipoTalla: tipo, unidades: normalized.join(",") };
      }


      const pack = tipo === "LETRAS" ? PACK_LETRAS : PACK_NUMEROS;

      return {
        ...c,
        tipoTalla: tipo,
        tallas: pack.join(","),                   // guardamos CSV interno
        unidades: pack.map(() => "").join(","),   // reseteamos unidades
      };
    }),
  );
};

const handleUnidadCellChange = (
  colorIndex: number,
  tallaIndex: number,
  value: string,
) => {
  setColores((prev) =>
    prev.map((c, i) => {
      if (i !== colorIndex) return c;

      const tallasArr = c.tallas
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const unidadesArr = c.unidades
        .split(",")
        .map((u) => u.trim());

      const normalized = [...unidadesArr];

      // Aseguramos longitud suficiente
      while (normalized.length < tallasArr.length) {
        normalized.push("");
      }

      normalized[tallaIndex] = value;

      return {
        ...c,
        unidades: normalized.slice(0, tallasArr.length).join(","), // volvemos a CSV
      };
    }),
  );
};


  const addTejido = () =>
    setTejidos((prev) => [
      ...prev,
      {
        proveedor: "",
        serie: "",
        color: "",
        colorPedido: "",
        consumoProduccion: "",
        composicion: "",
        metrosPedidos: "",
        fechaPedido: "",
      },
    ]);

  const removeTejido = (index: number) =>
    setTejidos((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );

  const addForro = () =>
    setForros((prev) => [
      ...prev,
      {
        proveedor: "",
        serie: "",
        color: "",
        colorPedido: "",
        consumoProduccion: "",
        composicion: "",
        metrosPedidos: "",
        fechaPedido: "",
      },
    ]);

  const removeForro = (index: number) =>
    setForros((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );

  const addAccesorio = () =>
    setAccesorios((prev) => [
      ...prev,
      {
        nombre: "",
        proveedor: "",
        referencia: "",
        color: "",
        colorPedido: "",
        medida: "",
        unidad: "UNIDADES",
        consumoEsc: "",
        cantidadPed: "",
        fechaPedido: "",
      },
    ]);


  const removeAccesorio = (index: number) =>
    setAccesorios((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );

  const addColor = () =>
    setColores((prev) => [
      ...prev,
      {
        color: "",
        tipoTalla: "LETRAS",
        tallas: PACK_LETRAS.join(","),                // letras por defecto
        unidades: PACK_LETRAS.map(() => "").join(","), // celdas vacías alineadas
      },
    ]);


  const removeColor = (index: number) =>
    setColores((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );

  // Preparamos JSON para la API
  const tejidosJson = JSON.stringify(tejidos);
  const forrosJson = JSON.stringify(forros);
  const accesoriosJson = JSON.stringify(accesorios);

  const coloresJson = JSON.stringify(
    colores.map((c) => {
      const tallasArr = c.tallas
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const unidadesRaw = c.unidades.split(",");

      // 👇 Mantener misma longitud que tallas, sin hacer filter(Boolean)
      const unidadesArr = tallasArr.map((_, i) =>
        parseNumber((unidadesRaw[i] ?? "").trim()) ?? 0
      );

      const total = unidadesArr.reduce((acc, n) => acc + n, 0);

      return {
        color: c.color,
        tipoTalla: c.tipoTalla,
        distribucion: {
          tallas: tallasArr,
          unidades: unidadesArr,
          total,
        },
      };
    }),
  );


  const costeEscandallo = initialValues.costeEscandallo ?? 0;

  return (
    <form
      action={`${base}/api/pedidos`}
      method="POST"
      encType="multipart/form-data"
      className="space-y-8"
    >
      {/* Hidden básicos */}
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="temporadaId" value={temporadaId} />
      <input type="hidden" name="escandalloId" value={escandalloId} />
      <input
        type="hidden"
        name="redirectUrl"
        value={`${base}/fichas/${clienteId}/temporadas/${temporadaId}/escandallos/${escandalloId}/pedido`}
      />


      {initialValues.id && (
        <>
          <input type="hidden" name="pedidoId" value={initialValues.id} />
          <input type="hidden" name="updatedAt" value={initialValues.updatedAt ?? ""} />
          <input
            type="hidden"
            name="existingImagenUrl"
            value={initialValues.imagenUrl ?? ""}
          />
        </>
      )}

      <input type="hidden" name="costeEscandallo" value={costeEscandallo} />

      {/* JSONs */}
      <input type="hidden" name="tejidosJson" value={tejidosJson} />
      <input type="hidden" name="forrosJson" value={forrosJson} />
      <input type="hidden" name="accesoriosJson" value={accesoriosJson} />
      <input type="hidden" name="coloresJson" value={coloresJson} />

      {/* CABECERA */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Datos del pedido</h2>
            <p className="text-xs text-slate-400">
              Basado en el escandallo <span className="text-emerald-400">{escandalloCodigo}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="block text-sm">Nº pedido</label>
            <input
              name="numeroPedido"
              value={numeroPedido}
              onChange={(e) => setNumeroPedido(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Fecha pedido</label>
            <input
              type="date"
              name="fechaPedido"
              value={fechaPedido}
              onChange={(e) => setFechaPedido(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Fecha entrega</label>
            <input
              type="date"
              name="fechaEntrega"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="block text-sm">Modelo interno</label>
            <input
              name="modeloInterno"
              value={modeloInterno}
              onChange={(e) => setModeloInterno(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Modelo / cod. alternativo 1</label>
            <input
              name="modeloCliente"
              value={modeloCliente}
              onChange={(e) => setModeloCliente(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Patrón / cod. alternativo 2</label>
            <input
              name="patron"
              value={patron}
              onChange={(e) => setPatron(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm">Descripción artículo pedido</label>
          <input
            name="descripcionPedido"
            value={descripcionPedido}
            onChange={(e) => setDescripcionPedido(e.target.value)}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        {/* Descripción del escandallo (solo lectura) */}
        <div className="space-y-1">
          <label className="block text-sm">Descripción escandallo</label>
          <textarea
            disabled
            value={initialValues.descripcionEscandallo ?? ""}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-300"
          />
        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label className="block text-sm">Coste (escandallo)</label>
            <input
              disabled
              value={
                costeEscandallo != null
                  ? `${costeEscandallo.toFixed(2)} €`
                  : "-"
              }
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">Precio venta (pedido)</label>
            <input
              name="precioVenta"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm">PVP (etiqueta)</label>
            <input
              name="pvp"
              value={pvp}
              onChange={(e) => setPvp(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Hueco para mantener la alineación, la imagen queda a la derecha */}
          <div className="md:col-span-2" />
          <div className="space-y-1">
            <label className="block text-sm">Imagen modelo (opcional)</label>
            <input
              id="imagen"
              name="imagen"
              type="file"
              accept="image/*"
              className="block w-full text-xs text-slate-300
                         file:mr-3 file:rounded-md file:border-0
                         file:bg-emerald-500 file:px-3 file:py-1.5
                         file:text-xs file:font-semibold file:text-slate-950
                         hover:file:bg-emerald-400"
            />
          </div>
        </div>

      </section>

      {/* COLORES + TALLAS */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Colores y tallas</h2>
          <button
            type="button"
            onClick={addColor}
            className="text-xs text-emerald-400 underline"
          >
            + Añadir color
          </button>
        </div>

        {colores.map((c, idx) => {
          const tallasArr = c.tallas
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          const unidadesCells = c.unidades
            .split(",")
            .map((u) => u.trim());

          const totalColor = totalesPorColor[idx] ?? 0;

          return (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Color {idx + 1}</span>
                {colores.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeColor(idx)}
                    className="text-[11px] text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              {/* Cabecera: color + selector pack tallas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <label className="block text-xs">Color</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={c.color}
                    onChange={(e) =>
                      handleColorChange(idx, "color", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Pack de tallas</label>
                  <select
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={c.tipoTalla}
                    onChange={(e) =>
                      handleTipoTallaChange(
                        idx,
                        e.target.value as PedidoColorForm["tipoTalla"],
                      )
                    }
                  >
                    <option value="LETRAS">Letras (XXS–XXL)</option>
                    <option value="NUMEROS">Números (34–48)</option>
                    <option value="PERSONALIZADO">Personalizado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Total unidades</label>
                  <input
                    disabled
                    value={totalColor}
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                  />
                </div>
              </div>

              {/* Si es personalizado, dejamos definir las tallas a mano (CSV) */}
              {c.tipoTalla === "PERSONALIZADO" && (
                <div className="space-y-1">
                  <label className="block text-xs">
                    Tallas personalizadas (separadas por coma)
                  </label>
                  <input
                    placeholder="T1,T2,T3..."
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={c.tallas}
                    onChange={(e) =>
                      handleColorChange(idx, "tallas", e.target.value)
                    }
                  />
                  <p className="text-[11px] text-slate-400">
                    Al cambiar las tallas se actualizará la fila de unidades
                    inferior.
                  </p>
                </div>
              )}

              {/* Cuadrícula de tallas / unidades */}
              {tallasArr.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border border-slate-800 rounded-md">
                    <thead className="bg-slate-900/60">
                      <tr>
                        {tallasArr.map((talla) => (
                          <th
                            key={talla}
                            className="px-2 py-1 border-b border-slate-800 text-center font-normal"
                          >
                            {talla}
                          </th>
                        ))}
                        <th className="px-2 py-1 border-b border-slate-800 text-right font-normal">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {tallasArr.map((talla, tallaIdx) => (
                          <td key={talla} className="px-1 py-1">
                            <input
                              className="w-full rounded-md bg-slate-950 border border-slate-700 px-1 py-1 text-[11px] text-center"
                              value={unidadesCells[tallaIdx] ?? ""}
                              onChange={(e) =>
                                handleUnidadCellChange(
                                  idx,
                                  tallaIdx,
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right text-slate-300">
                          {totalColor}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1">
                  Elige un pack de tallas o define tallas personalizadas para
                  este color.
                </p>
              )}
            </div>
          );
        })}
      </section>


      {/* TEJIDOS */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tejidos</h2>
          <button
            type="button"
            onClick={addTejido}
            className="text-xs text-emerald-400 underline"
          >
            + Añadir tejido
          </button>
        </div>

        {tejidos.map((t, idx) => {
          const hayUnSoloColor = coloresDisponibles.length === 1;
          const colorDefecto = hayUnSoloColor ? coloresDisponibles[0] : "";

          // Color del pedido que usamos para el cálculo
          const colorAsignado = (t.colorPedido || colorDefecto).trim();
          const consumo = parseNumber(t.consumoProduccion);
          const unidadesColor = unidadesPorColor[colorAsignado] ?? 0;

          const metrosNecesarios =
            consumo != null && unidadesColor > 0
              ? consumo * unidadesColor
              : null;

          return (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Tejido {idx + 1}</span>
                {tejidos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTejido(idx)}
                    className="text-[11px] text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              {/* Selector de COLOR DEL PEDIDO arriba del todo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Color del pedido asignado</label>
                  {hayUnSoloColor ? (
                    <input
                      disabled
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                      value={colorAsignado}
                    />
                  ) : (
                    <select
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                      value={t.colorPedido ?? ""}
                      onChange={(e) =>
                        handleTejidoChange(idx, "colorPedido", e.target.value)
                      }
                    >
                      <option value="">– Sin asignar –</option>
                      {coloresDisponibles.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Fila 1: proveedor / serie / color tejido / composición */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Proveedor</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.proveedor}
                    onChange={(e) =>
                      handleTejidoChange(idx, "proveedor", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Serie</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.serie}
                    onChange={(e) =>
                      handleTejidoChange(idx, "serie", e.target.value)
                    }
                  />
                </div>

                {/* Color del TEJIDO (escandallo) como antes */}
                <div className="space-y-1">
                  <label className="block text-xs">Color tejido (escandallo)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.color}
                    onChange={(e) =>
                      handleTejidoChange(idx, "color", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">Composición</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.composicion}
                    onChange={(e) =>
                      handleTejidoChange(idx, "composicion", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Fila 2: consumo / metros necesarios / metros pedidos / fecha */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Consumo producción (m)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.consumoProduccion}
                    onChange={(e) =>
                      handleTejidoChange(
                        idx,
                        "consumoProduccion",
                        e.target.value,
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">
                    Metros necesarios (según color)
                  </label>
                  <input
                    disabled
                    value={
                      metrosNecesarios != null
                        ? metrosNecesarios.toFixed(2)
                        : ""
                    }
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">Metros pedidos</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.metrosPedidos}
                    onChange={(e) =>
                      handleTejidoChange(idx, "metrosPedidos", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Fecha pedido tejido</label>
                  <input
                    type="date"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.fechaPedido}
                    onChange={(e) =>
                      handleTejidoChange(idx, "fechaPedido", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}


      </section>

      {/* FORROS */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Forros</h2>
          <button
            type="button"
            onClick={addForro}
            className="text-xs text-emerald-400 underline"
          >
            + Añadir forro
          </button>
        </div>

        {forros.map((f, idx) => {
          const hayUnSoloColor = coloresDisponibles.length === 1;
          const colorDefecto = hayUnSoloColor ? coloresDisponibles[0] : "";

          const colorAsignado = (f.colorPedido || colorDefecto).trim();
          const consumo = parseNumber(f.consumoProduccion);
          const unidadesColor = unidadesPorColor[colorAsignado] ?? 0;

          const metrosNecesarios =
            consumo != null && unidadesColor > 0
              ? consumo * unidadesColor
              : null;

          return (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Forro {idx + 1}</span>
                {forros.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeForro(idx)}
                    className="text-[11px] text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              {/* Selector de COLOR DEL PEDIDO arriba */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Color del pedido asignado</label>
                  {hayUnSoloColor ? (
                    <input
                      disabled
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                      value={colorAsignado}
                    />
                  ) : (
                    <select
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                      value={f.colorPedido ?? ""}
                      onChange={(e) =>
                        handleForroChange(idx, "colorPedido", e.target.value)
                      }
                    >
                      <option value="">– Sin asignar –</option>
                      {coloresDisponibles.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Fila 1: proveedor / serie / color forro / composición */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Proveedor</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.proveedor}
                    onChange={(e) =>
                      handleForroChange(idx, "proveedor", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Serie</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.serie}
                    onChange={(e) =>
                      handleForroChange(idx, "serie", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">Color forro (escandallo)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.color}
                    onChange={(e) =>
                      handleForroChange(idx, "color", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">Composición</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.composicion}
                    onChange={(e) =>
                      handleForroChange(idx, "composicion", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Fila 2: consumo / metros necesarios / metros pedidos / fecha */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Consumo producción (m)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.consumoProduccion}
                    onChange={(e) =>
                      handleForroChange(
                        idx,
                        "consumoProduccion",
                        e.target.value,
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">
                    Metros necesarios (según color)
                  </label>
                  <input
                    disabled
                    value={
                      metrosNecesarios != null
                        ? metrosNecesarios.toFixed(2)
                        : ""
                    }
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs">Metros pedidos</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.metrosPedidos}
                    onChange={(e) =>
                      handleForroChange(idx, "metrosPedidos", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Fecha pedido forro</label>
                  <input
                    type="date"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.fechaPedido}
                    onChange={(e) =>
                      handleForroChange(idx, "fechaPedido", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}


      </section>

      {/* FORNITURAS / ACCESORIOS */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fornituras / Accesorios</h2>
          <button
            type="button"
            onClick={addAccesorio}
            className="text-xs text-emerald-400 underline"
          >
            + Añadir accesorio
          </button>
        </div>

        {accesorios.map((a, idx) => {
          const hayUnSoloColor = coloresDisponibles.length === 1;
          const colorDefecto = hayUnSoloColor ? coloresDisponibles[0] : "";

          // Color del pedido que usamos para el cálculo
          const colorAsignado = (a.colorPedido || colorDefecto).trim();
          const consumo = parseNumber(a.consumoEsc);
          const unidadesColor = unidadesPorColor[colorAsignado] ?? 0;

          const necesarios =
            consumo != null && unidadesColor > 0
              ? consumo * unidadesColor
              : null;

          const labelNecesarios =
            a.unidad === "METROS"
              ? "Metros necesarios (según color)"
              : "Unidades necesarias (según color)";

          return (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Accesorio {idx + 1}
                </span>
                {accesorios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccesorio(idx)}
                    className="text-[11px] text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              {/* Selector COLOR DEL PEDIDO */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Color del pedido asignado</label>
                  {hayUnSoloColor ? (
                    <input
                      disabled
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-400"
                      value={colorAsignado}
                    />
                  ) : (
                    <select
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                      value={a.colorPedido ?? ""}
                      onChange={(e) =>
                        handleAccesorioChange(idx, "colorPedido", e.target.value)
                      }
                    >
                      <option value="">– Sin asignar –</option>
                      {coloresDisponibles.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Fila 1: datos básicos del accesorio */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Nombre</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.nombre}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "nombre", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Proveedor</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.proveedor}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "proveedor", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Referencia</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.referencia}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "referencia", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Color accesorio (escandallo)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.color}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "color", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Medida</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.medida}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "medida", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Fila 2: unidad / consumos / necesarios / pedidos / fecha */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Unidad</label>
                  <select
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.unidad}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "unidad", e.target.value)
                    }
                  >
                    <option value="UNIDADES">Unidades</option>
                    <option value="METROS">Metros</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">
                    Consumo escandallo (por prenda)
                  </label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.consumoEsc}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "consumoEsc", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">{labelNecesarios}</label>
                  <input
                    disabled
                    value={
                      necesarios != null ? necesarios.toFixed(2) : ""
                    }
                    className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">
                    Cantidad / metros pedidos
                  </label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.cantidadPed}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "cantidadPed", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Fecha pedido</label>
                  <input
                    type="date"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.fechaPedido}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "fechaPedido", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}

      </section>


      {/* OBSERVACIONES DEL PEDIDO (al final) */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold">Observaciones del pedido</h2>
        <div className="space-y-1">
          <label className="block text-sm">Observaciones pedido</label>
          <textarea
            name="observaciones"
            rows={4}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
          />
        </div>
      </section>


      {/* BOTONES */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 mt-4">
        <div className="flex justify-between items-center">
          <Link
            href={`${base}/fichas/${clienteId}/temporadas/${temporadaId}/escandallos/${escandalloId}`}
            className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            Volver a escandallo
          </Link>
          <div className="flex gap-3">
            <Link
              href={`${base}/fichas/${clienteId}/temporadas/${temporadaId}`}
              className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Volver a temporada
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Guardar pedido
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
