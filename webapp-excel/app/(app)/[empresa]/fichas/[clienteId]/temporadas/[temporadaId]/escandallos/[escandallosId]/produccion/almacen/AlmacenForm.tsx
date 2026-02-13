// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/[escandallosId]/produccion/almacen/AlmacenForm.tsx
"use client";

import { useState } from "react";

type SimpleCliente = { id: number; nombre: string | null };
type SimpleTemporada = { id: number; codigo: string | null };
type SimpleEscandallo = {
  id: number;
  modeloInterno: string | null;
  modeloCliente: string | null;
};

type DistribucionColor = {
  tallas: string[];
  unidades: number[];
  total: number;
  corte?: { unidades: number[]; total: number };
  adelantos?: { unidades: number[]; total: number };
  entregas?: { unidades: number[]; total: number };
};

type PedidoColor = {
  id: number;
  color: string;
  tipoTalla: string;
  distribucion: DistribucionColor | null;
};

type PedidoTejido = {
  id: number;
  proveedor: string | null;
  serie: string | null;
  color: string | null;
  composicion: string | null;
  consumoProduccion: number | null;
  metrosPedidos: number | null;
  fechaPedido: DateLike | null;
  metrosRecibidos: number | null;
  fechaMetrosRecibidos: DateLike | null;
  consumoCorte: number | null;
};
type PedidoForro = PedidoTejido;

type PedidoAccesorio = {
  id: number;
  nombre: string | null;
  proveedor: string | null;
  referencia: string | null;
  color: string | null;
  medida: string | null;
  unidad: string | null;
  consumoEsc: number | null;
  cantidadPed: number | null;
  fechaPedido: DateLike | null;
  unidadesRecibidas: number | null;
  fechaRecibidas: DateLike | null;
  albaranAccesorio: string | null;
};

type PreparacionChecks = {
  etiquetasMarca?: boolean;
  etiquetasMarcaComentario?: string | null;
  etiquetasTalla?: boolean;
  etiquetasTallaComentario?: string | null;
  compos?: boolean;
  composComentario?: string | null;
  alarmas?: boolean;
  alarmasComentario?: string | null;
  etiquetasCarton?: boolean;
  etiquetasCartonComentario?: string | null;
  marchamos?: boolean;
  marchamosComentario?: string | null;
  etiquetasPrecio?: boolean;
  etiquetasPrecioComentario?: string | null;
  pegatinas?: boolean;
  pegatinasComentario?: string | null;
  talladores?: boolean;
  talladoresComentario?: string | null;
};

type PreparacionAlmacen = {
  perchas?: {
    modelo: string | null;
    unidades: number | null;
    fecha: string | null;
  };
  bolsas?: {
    modelo: string | null;
    unidades: number | null;
    fecha: string | null;
  };
  checks?: PreparacionChecks;
};

type PedidoWithLines = {
  id: number;
  updatedAt: DateLike;
  numeroPedido: string | null;
  fechaPedido: DateLike | null;
  fechaEntrega: DateLike | null;
  modeloInterno: string | null;
  modeloCliente: string | null;
  patron: string | null;
  descripcionPedido: string | null;
  imagenUrl: string | null;
  costeEscandallo: number | null;
  precioVenta: number | null;
  pvp: number | null;

  tallerCorte: string | null;
  fechaCorte: DateLike | null;
  albaranCorte: string | null;
  precioCorte: number | null;
  tallerConfeccion: string | null;
  fechaConfeccion: DateLike | null;
  albaranConfeccion: string | null;
  precioConfeccion: number | null;

  preparacionAlmacen: PreparacionAlmacen | null;

  observaciones: string | null;

  colores: PedidoColor[];
  tejidos: PedidoTejido[];
  forros: PedidoForro[];
  accesorios: PedidoAccesorio[];
};

type Props = {
  empresa: string; // 👈 añade esto
  cliente: SimpleCliente;
  temporada: SimpleTemporada;
  escandallo: SimpleEscandallo;
  pedido: PedidoWithLines;
  redirectUrl: string;
};

type DateLike = string | Date;

const formatDateInput = (d: DateLike | null | undefined) => {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};


// helper para parsear números de forma segura
const toNum = (v: string | number | null | undefined): number => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- Tipos de estado para cálculos en vivo ----------

type ColorState = {
  id: number;
  color: string;
  tipoTalla: string;
  tallas: string[];
  unidadesPedido: string[]; // mostramos como texto pero sumamos con toNum
  corte: string[];
  adelantos: string[];
  entregas: string[];
};

type TejidoStateNums = {
  id: number;
  consumoProduccion: string;
  metrosPedidos: string;
  metrosRecibidos: string;
  consumoCorte: string;
};

type AccesorioStateNums = {
  id: number;
  cantidadPed: string;
  unidadesRecibidas: string;
};

export default function AlmacenForm({
  empresa,
  cliente,
  temporada,
  escandallo,
  pedido,
  redirectUrl,
}: Props) {
  // ----- Estado para COLORES / TALLAS -----
  const [coloresState, setColoresState] = useState<ColorState[]>(() =>
    pedido.colores.map((c) => {
      const dist: any = c.distribucion || {};
      const tallas: string[] = dist.tallas ?? [];
      const unidadesPedido: number[] = dist.unidades ?? [];
      const corteUnidades: number[] =
        dist.corte?.unidades ?? Array(tallas.length).fill(0);
      const adelantosUnidades: number[] =
        dist.adelantos?.unidades ?? Array(tallas.length).fill(0);
      const entregasUnidades: number[] =
        dist.entregas?.unidades ?? Array(tallas.length).fill(0);

      return {
        id: c.id,
        color: c.color,
        tipoTalla: c.tipoTalla,
        tallas,
        unidadesPedido: unidadesPedido.map((n) => (n ?? 0).toString()),
        corte: corteUnidades.map((n) => (n ?? 0).toString()),
        adelantos: adelantosUnidades.map((n) => (n ?? 0).toString()),
        entregas: entregasUnidades.map((n) => (n ?? 0).toString()),
      };
    }),
  );

  // ----- Estado para números de TEJIDOS -----
  const [tejidosNums, setTejidosNums] = useState<TejidoStateNums[]>(() =>
    pedido.tejidos.map((t) => ({
      id: t.id,
      consumoProduccion:
        t.consumoProduccion !== null && t.consumoProduccion !== undefined
          ? t.consumoProduccion.toString()
          : "",
      metrosPedidos:
        t.metrosPedidos !== null && t.metrosPedidos !== undefined
          ? t.metrosPedidos.toString()
          : "",
      metrosRecibidos:
        t.metrosRecibidos !== null && t.metrosRecibidos !== undefined
          ? t.metrosRecibidos.toString()
          : "",
      consumoCorte:
        t.consumoCorte !== null && t.consumoCorte !== undefined
          ? t.consumoCorte.toString()
          : "",
    })),
  );

  // ----- Estado para números de FORROS (misma lógica que tejidos) -----
  const [forrosNums, setForrosNums] = useState<TejidoStateNums[]>(() =>
    pedido.forros.map((f) => ({
      id: f.id,
      consumoProduccion:
        f.consumoProduccion !== null && f.consumoProduccion !== undefined
          ? f.consumoProduccion.toString()
          : "",
      metrosPedidos:
        f.metrosPedidos !== null && f.metrosPedidos !== undefined
          ? f.metrosPedidos.toString()
          : "",
      metrosRecibidos:
        f.metrosRecibidos !== null && f.metrosRecibidos !== undefined
          ? f.metrosRecibidos.toString()
          : "",
      consumoCorte:
        f.consumoCorte !== null && f.consumoCorte !== undefined
          ? f.consumoCorte.toString()
          : "",
    })),
  );

  // ----- Estado para números de ACCESORIOS -----
  const [accesoriosNums, setAccesoriosNums] = useState<AccesorioStateNums[]>(
    () =>
      pedido.accesorios.map((a) => ({
        id: a.id,
        cantidadPed:
          a.cantidadPed !== null && a.cantidadPed !== undefined
            ? a.cantidadPed.toString()
            : "",
        unidadesRecibidas:
          a.unidadesRecibidas !== null && a.unidadesRecibidas !== undefined
            ? a.unidadesRecibidas.toString()
            : "",
      })),
  );

  // ➕ Prendas cortadas totales basadas en estado de colores
  const prendasCortadasTotales = coloresState.reduce((accColor, c) => {
    const totalCorteColor = c.corte.reduce(
      (acc, v) => acc + toNum(v),
      0,
    );
    return accColor + totalCorteColor;
  }, 0);

  // Totales de tejidos (en vivo)
  const totalTejidosPedidos = tejidosNums.reduce(
    (acc, t) => acc + toNum(t.metrosPedidos),
    0,
  );
  const totalTejidosRecibidos = tejidosNums.reduce(
    (acc, t) => acc + toNum(t.metrosRecibidos),
    0,
  );

  // Totales de forros (en vivo)
  const totalForrosPedidos = forrosNums.reduce(
    (acc, f) => acc + toNum(f.metrosPedidos),
    0,
  );
  const totalForrosRecibidos = forrosNums.reduce(
    (acc, f) => acc + toNum(f.metrosRecibidos),
    0,
  );

  return (
    <form
      action={`/api/${empresa}/almacen`} 
      method="POST"
      encType="multipart/form-data"
      className="space-y-8"
    >
      {/* Campos ocultos necesarios para el backend */}
      <input type="hidden" name="pedidoId" value={pedido.id} />
      <input type="hidden" name="redirectUrl" value={redirectUrl} />
      <input
        type="hidden"
        name="pedidoUpdatedAt"
        value={
          pedido.updatedAt instanceof Date
            ? pedido.updatedAt.toISOString()
            : new Date(pedido.updatedAt).toISOString()
        }
      />


      {/* DATOS DEL PEDIDO */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Datos del pedido</h2>

        <p className="text-xs text-slate-400">
          Cliente{" "}
          <span className="text-emerald-400">{cliente.nombre}</span> ·
          Temporada{" "}
          <span className="text-emerald-400">{temporada.codigo}</span> ·
          Escandallo{" "}
          <span className="text-emerald-400">
            {escandallo.modeloInterno || `#${escandallo.id}`}
          </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-slate-400 mb-1">Nº pedido</p>
            <input
              name="numeroPedido"
              defaultValue={pedido.numeroPedido ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div>
            <p className="text-slate-400 mb-1">Fecha pedido</p>
            <input
              type="date"
              name="fechaPedido"
              defaultValue={formatDateInput(pedido.fechaPedido)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Fecha entrega</p>
            <input
              type="date"
              name="fechaEntrega"
              defaultValue={formatDateInput(pedido.fechaEntrega)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div>
            <p className="text-slate-400 mb-1">Coste escandallo (€)</p>
            <input
              type="number"
              step="0.01"
              name="costeEscandallo"
              defaultValue={pedido.costeEscandallo ?? undefined}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Precio venta pedido (€)</p>
            <input
              type="number"
              step="0.01"
              name="precioVenta"
              defaultValue={pedido.precioVenta ?? undefined}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">PVP etiqueta (€)</p>
            <input
              type="number"
              step="0.01"
              name="pvp"
              defaultValue={pedido.pvp ?? undefined}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>

          <div>
            <p className="text-slate-400 mb-1">Modelo interno</p>
            <input
              name="modeloInterno"
              defaultValue={pedido.modeloInterno ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Modelo / ref. cliente</p>
            <input
              name="modeloCliente"
              defaultValue={pedido.modeloCliente ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Patrón</p>
            <input
              name="patron"
              defaultValue={pedido.patron ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
        </div>

        <div className="mt-2">
          <p className="text-slate-400 mb-1">Descripción artículo pedido</p>
          <textarea
            name="descripcionPedido"
            defaultValue={pedido.descripcionPedido ?? ""}
            rows={2}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs"
          />
        </div>
      </section>

      {/* CABECERA ALMACÉN */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Datos de almacén</h2>

        <p className="text-xs text-slate-400">
          Basado en el pedido{" "}
          <span className="text-emerald-400">
            {pedido.numeroPedido || escandallo.modeloInterno || `#${pedido.id}`}
          </span>{" "}
          – Cliente {cliente.nombre} – Temporada {temporada.codigo}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-slate-400 mb-1">Taller corte</p>
            <input
              name="tallerCorte"
              defaultValue={pedido.tallerCorte ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Fecha corte</p>
            <input
              type="date"
              name="fechaCorte"
              defaultValue={formatDateInput(pedido.fechaCorte)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Albarán corte</p>
            <input
              name="albaranCorte"
              defaultValue={pedido.albaranCorte ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Precio corte</p>
            <input
              type="number"
              step="0.01"
              name="precioCorte"
              defaultValue={pedido.precioCorte ?? undefined}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>

          <div>
            <p className="text-slate-400 mb-1">Taller confección</p>
            <input
              name="tallerConfeccion"
              defaultValue={pedido.tallerConfeccion ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Fecha confección</p>
            <input
              type="date"
              name="fechaConfeccion"
              defaultValue={formatDateInput(pedido.fechaConfeccion)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Albarán confección</p>
            <input
              name="albaranConfeccion"
              defaultValue={pedido.albaranConfeccion ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Precio confección</p>
            <input
              type="number"
              step="0.01"
              name="precioConfeccion"
              defaultValue={pedido.precioConfeccion ?? undefined}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>
        </div>
      </section>

      {/* RESUMEN ALMACÉN */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
        <h3 className="text-sm font-semibold">Resumen almacén</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <p className="text-slate-300">
            Prendas cortadas totales:{" "}
            <span className="font-semibold text-emerald-400">
              {prendasCortadasTotales}
            </span>
          </p>
          <p className="text-slate-300">
            Tejidos · pedidos/recibidos:{" "}
            <span className="font-semibold">
              {totalTejidosPedidos.toFixed(2)} m
            </span>{" "}
            /{" "}
            <span className="font-semibold text-emerald-400">
              {totalTejidosRecibidos.toFixed(2)} m
            </span>
          </p>
          <p className="text-slate-300">
            Forros · pedidos/recibidos:{" "}
            <span className="font-semibold">
              {totalForrosPedidos.toFixed(2)} m
            </span>{" "}
            /{" "}
            <span className="font-semibold text-emerald-400">
              {totalForrosRecibidos.toFixed(2)} m
            </span>
          </p>
        </div>
      </section>

      {/* COLORES Y TALLAS */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Colores y tallas (almacén)</h2>

        {coloresState.length === 0 && (
          <p className="text-xs text-slate-400">
            Este pedido no tiene colores/tallas definidos.
          </p>
        )}

        {coloresState.map((c, colorIndex) => {
          const { tallas, unidadesPedido, corte, adelantos, entregas } = c;

          const totalPedido = unidadesPedido.reduce(
            (a, v) => a + toNum(v),
            0,
          );
          const totalCorte = corte.reduce((a, v) => a + toNum(v), 0);
          const totalAdelantos = adelantos.reduce(
            (a, v) => a + toNum(v),
            0,
          );
          const totalEntregas = entregas.reduce(
            (a, v) => a + toNum(v),
            0,
          );

          return (
            <div
              key={c.id}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="text-slate-400">Color</p>
                  <p className="font-medium">{c.color}</p>
                </div>
              </div>

              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs border border-slate-800 rounded-md">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="px-2 py-1 text-left">Fila</th>
                      {tallas.map((t) => (
                        <th
                          key={t}
                          className="px-2 py-1 text-center font-normal"
                        >
                          {t}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-right font-normal">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Pedido (solo lectura) */}
                    <tr>
                      <td className="px-2 py-1 font-semibold">Pedido</td>
                      {tallas.map((t, idx) => (
                        <td key={t} className="px-2 py-1 text-center">
                          {unidadesPedido[idx] ?? 0}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">{totalPedido}</td>
                    </tr>

                    {/* Corte */}
                    <tr>
                      <td className="px-2 py-1 font-semibold">Corte</td>
                      {tallas.map((t, idx) => (
                        <td key={t} className="px-1 py-1">
                          <input
                            type="number"
                            name={`color_${c.id}_corte_${idx}`}
                            value={corte[idx] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setColoresState((prev) =>
                                prev.map((col, i) =>
                                  i === colorIndex
                                    ? {
                                        ...col,
                                        corte: col.corte.map((v, j) =>
                                          j === idx ? value : v,
                                        ),
                                      }
                                    : col,
                                ),
                              );
                            }}
                            className="w-full rounded bg-slate-950 border border-slate-700 px-1 py-[2px] text-right"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">{totalCorte}</td>
                    </tr>

                    {/* Adelantos */}
                    <tr>
                      <td className="px-2 py-1 font-semibold">Adelantos</td>
                      {tallas.map((t, idx) => (
                        <td key={t} className="px-1 py-1">
                          <input
                            type="number"
                            name={`color_${c.id}_adelantos_${idx}`}
                            value={adelantos[idx] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setColoresState((prev) =>
                                prev.map((col, i) =>
                                  i === colorIndex
                                    ? {
                                        ...col,
                                        adelantos: col.adelantos.map((v, j) =>
                                          j === idx ? value : v,
                                        ),
                                      }
                                    : col,
                                ),
                              );
                            }}
                            className="w-full rounded bg-slate-950 border border-slate-700 px-1 py-[2px] text-right"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        {totalAdelantos}
                      </td>
                    </tr>

                    {/* Entregadas */}
                    <tr>
                      <td className="px-2 py-1 font-semibold">Entregadas</td>
                      {tallas.map((t, idx) => (
                        <td key={t} className="px-1 py-1">
                          <input
                            type="number"
                            name={`color_${c.id}_entregas_${idx}`}
                            value={entregas[idx] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setColoresState((prev) =>
                                prev.map((col, i) =>
                                  i === colorIndex
                                    ? {
                                        ...col,
                                        entregas: col.entregas.map((v, j) =>
                                          j === idx ? value : v,
                                        ),
                                      }
                                    : col,
                                ),
                              );
                            }}
                            className="w-full rounded bg-slate-950 border border-slate-700 px-1 py-[2px] text-right"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        {totalEntregas}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      {/* TEJIDOS */}
      {pedido.tejidos.length > 0 && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Tejidos (almacén)</h2>
          <p className="text-xs text-slate-400">
            Metros gastados = prendas cortadas totales (
            {prendasCortadasTotales}) × consumo corte.
          </p>

          <div className="space-y-3">
            {pedido.tejidos.map((t, idx) => {
              const nums = tejidosNums[idx];
              const consumoProduccion = toNum(nums?.consumoProduccion);
              const consumoCorteRaw = nums?.consumoCorte || "";
              const consumoCorte = consumoCorteRaw
                ? toNum(consumoCorteRaw)
                : consumoProduccion;

              const metrosPedidos = toNum(nums?.metrosPedidos);
              const metrosRecibidos = toNum(nums?.metrosRecibidos);

              const metrosGastados =
                prendasCortadasTotales * (consumoCorte || 0);
              const metrosQuedan = metrosRecibidos - metrosGastados;
              const metrosNecesarios =
                prendasCortadasTotales * (consumoProduccion || 0);

              return (
                <div
                  key={t.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">Proveedor</p>
                      <input
                        name={`tejido_${t.id}_proveedor`}
                        defaultValue={t.proveedor ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Serie</p>
                      <input
                        name={`tejido_${t.id}_serie`}
                        defaultValue={t.serie ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Color</p>
                      <input
                        name={`tejido_${t.id}_color`}
                        defaultValue={t.color ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-slate-400 mb-1">Composición</p>
                      <input
                        name={`tejido_${t.id}_composicion`}
                        defaultValue={t.composicion ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">
                        Consumo producción (m)
                      </p>
                      <input
                        type="number"
                        step="0.001"
                        name={`tejido_${t.id}_consumoProduccion`}
                        value={nums?.consumoProduccion ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTejidosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, consumoProduccion: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">
                        Metros necesarios (según producción)
                      </p>
                      <p className="text-slate-100">
                        {Number.isFinite(metrosNecesarios)
                          ? metrosNecesarios.toFixed(2)
                          : "-"}{" "}
                        m
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-slate-400 mb-1">Metros pedidos</p>
                      <input
                        type="number"
                        step="0.01"
                        name={`tejido_${t.id}_metrosPedidos`}
                        value={nums?.metrosPedidos ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTejidosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, metrosPedidos: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Metros necesarios:{" "}
                        {Number.isFinite(metrosNecesarios)
                          ? metrosNecesarios.toFixed(2)
                          : "-"}{" "}
                        m
                      </p>
                      <div className="mt-2">
                        <p className="text-slate-400 mb-1">Fecha pedido</p>
                        <input
                          type="date"
                          name={`tejido_${t.id}_fechaPedido`}
                          defaultValue={formatDateInput(t.fechaPedido)}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Metros recibidos</p>
                      <input
                        type="number"
                        step="0.01"
                        name={`tejido_${t.id}_metrosRecibidos`}
                        value={nums?.metrosRecibidos ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTejidosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, metrosRecibidos: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Total recibido (m)
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">
                        Fecha metros recibidos
                      </p>
                      <input
                        type="date"
                        name={`tejido_${t.id}_fechaMetrosRecibidos`}
                        defaultValue={formatDateInput(
                          t.fechaMetrosRecibidos ?? null,
                        )}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Consumo corte (m)</p>
                      <input
                        type="number"
                        step="0.001"
                        name={`tejido_${t.id}_consumoCorte`}
                        value={nums?.consumoCorte ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTejidosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, consumoCorte: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        m / prenda en corte
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Metros calculados</p>
                      <p className="text-slate-100">
                        Gastados:{" "}
                        {Number.isFinite(metrosGastados)
                          ? metrosGastados.toFixed(2)
                          : "-"}
                      </p>
                      <p className="text-slate-100">
                        Quedan:{" "}
                        {Number.isFinite(metrosQuedan)
                          ? metrosQuedan.toFixed(2)
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FORROS */}
      {pedido.forros.length > 0 && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Forros (almacén)</h2>
          <p className="text-xs text-slate-400">
            Metros gastados = prendas cortadas totales (
            {prendasCortadasTotales}) × consumo corte.
          </p>

          <div className="space-y-3">
            {pedido.forros.map((f, idx) => {
              const nums = forrosNums[idx];
              const consumoProduccion = toNum(nums?.consumoProduccion);
              const consumoCorteRaw = nums?.consumoCorte || "";
              const consumoCorte = consumoCorteRaw
                ? toNum(consumoCorteRaw)
                : consumoProduccion;

              const metrosPedidos = toNum(nums?.metrosPedidos);
              const metrosRecibidos = toNum(nums?.metrosRecibidos);

              const metrosGastados =
                prendasCortadasTotales * (consumoCorte || 0);
              const metrosQuedan = metrosRecibidos - metrosGastados;
              const metrosNecesarios =
                prendasCortadasTotales * (consumoProduccion || 0);

              return (
                <div
                  key={f.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">Proveedor</p>
                      <input
                        name={`forro_${f.id}_proveedor`}
                        defaultValue={f.proveedor ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Serie</p>
                      <input
                        name={`forro_${f.id}_serie`}
                        defaultValue={f.serie ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Color</p>
                      <input
                        name={`forro_${f.id}_color`}
                        defaultValue={f.color ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-slate-400 mb-1">Composición</p>
                      <input
                        name={`forro_${f.id}_composicion`}
                        defaultValue={f.composicion ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">
                        Consumo producción (m)
                      </p>
                      <input
                        type="number"
                        step="0.001"
                        name={`forro_${f.id}_consumoProduccion`}
                        value={nums?.consumoProduccion ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForrosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, consumoProduccion: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">
                        Metros necesarios (según producción)
                      </p>
                      <p className="text-slate-100">
                        {Number.isFinite(metrosNecesarios)
                          ? metrosNecesarios.toFixed(2)
                          : "-"}{" "}
                        m
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-slate-400 mb-1">Metros pedidos</p>
                      <input
                        type="number"
                        step="0.01"
                        name={`forro_${f.id}_metrosPedidos`}
                        value={nums?.metrosPedidos ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForrosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, metrosPedidos: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Metros necesarios:{" "}
                        {Number.isFinite(metrosNecesarios)
                          ? metrosNecesarios.toFixed(2)
                          : "-"}{" "}
                        m
                      </p>
                      <div className="mt-2">
                        <p className="text-slate-400 mb-1">Fecha pedido</p>
                        <input
                          type="date"
                          name={`forro_${f.id}_fechaPedido`}
                          defaultValue={formatDateInput(f.fechaPedido)}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Metros recibidos</p>
                      <input
                        type="number"
                        step="0.01"
                        name={`forro_${f.id}_metrosRecibidos`}
                        value={nums?.metrosRecibidos ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForrosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, metrosRecibidos: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Total recibido (m)
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">
                        Fecha metros recibidos
                      </p>
                      <input
                        type="date"
                        name={`forro_${f.id}_fechaMetrosRecibidos`}
                        defaultValue={formatDateInput(
                          f.fechaMetrosRecibidos ?? null,
                        )}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Consumo corte (m)</p>
                      <input
                        type="number"
                        step="0.001"
                        name={`forro_${f.id}_consumoCorte`}
                        value={nums?.consumoCorte ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForrosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, consumoCorte: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        m / prenda en corte
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Metros calculados</p>
                      <p className="text-slate-100">
                        Gastados:{" "}
                        {Number.isFinite(metrosGastados)
                          ? metrosGastados.toFixed(2)
                          : "-"}
                      </p>
                      <p className="text-slate-100">
                        Quedan:{" "}
                        {Number.isFinite(metrosQuedan)
                          ? metrosQuedan.toFixed(2)
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FORNITURAS / ACCESORIOS */}
      {pedido.accesorios.length > 0 && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            Fornituras y accesorios (almacén)
          </h2>
          <p className="text-xs text-slate-400">
            Sobran = unidades/metros recibidos – unidades/metros necesarios del
            pedido.
          </p>

          <div className="space-y-3">
            {pedido.accesorios.map((a, idx) => {
              const nums = accesoriosNums[idx];
              const necesarias = toNum(nums?.cantidadPed);
              const recibidas = toNum(nums?.unidadesRecibidas);
              const sobran = recibidas - necesarias;

              return (
                <div
                  key={a.id}
                  className="border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  {/* Cabecera accesorio (editable) */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">Nombre accesorio</p>
                      <input
                        name={`accesorio_${a.id}_nombre`}
                        defaultValue={a.nombre ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Referencia</p>
                      <input
                        name={`accesorio_${a.id}_referencia`}
                        defaultValue={a.referencia ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Proveedor</p>
                      <input
                        name={`accesorio_${a.id}_proveedor`}
                        defaultValue={a.proveedor ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Color</p>
                      <input
                        name={`accesorio_${a.id}_color`}
                        defaultValue={a.color ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">Medida</p>
                      <input
                        name={`accesorio_${a.id}_medida`}
                        defaultValue={a.medida ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">Unidad</p>
                      <input
                        name={`accesorio_${a.id}_unidad`}
                        defaultValue={a.unidad ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>
                    <div>
                      <p className="text-slate-400 mb-1">
                        Consumo escandallo ({a.unidad?.toLowerCase() || "uds"})
                      </p>
                      <input
                        type="number"
                        step="0.01"
                        name={`accesorio_${a.id}_consumoEsc`}
                        defaultValue={a.consumoEsc ?? undefined}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                    </div>
                  </div>

                  {/* Datos almacén */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-slate-400 mb-1">
                        Necesarios pedido ({a.unidad?.toLowerCase() || "uds"})
                      </p>
                      <input
                        type="number"
                        step="0.01"
                        name={`accesorio_${a.id}_cantidadPed`}
                        value={nums?.cantidadPed ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAccesoriosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, cantidadPed: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                      <div className="mt-2">
                        <p className="text-slate-400 mb-1">Fecha pedido</p>
                        <input
                          type="date"
                          name={`accesorio_${a.id}_fechaPedido`}
                          defaultValue={formatDateInput(a.fechaPedido ?? null)}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">
                        Unidades/metros recibidos
                      </p>
                      <input
                        type="number"
                        step="0.01"
                        name={`accesorio_${a.id}_unidadesRecibidas`}
                        value={nums?.unidadesRecibidas ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAccesoriosNums((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, unidadesRecibidas: value }
                                : item,
                            ),
                          );
                        }}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-right"
                      />
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Fecha recibidos</p>
                      <input
                        type="date"
                        name={`accesorio_${a.id}_fechaRecibidas`}
                        defaultValue={formatDateInput(
                          a.fechaRecibidas ?? null,
                        )}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                      />
                    </div>

                    <div>
                      <p className="text-slate-400 mb-1">Albarán</p>
                      <input
                        name={`accesorio_${a.id}_albaranAccesorio`}
                        defaultValue={a.albaranAccesorio ?? ""}
                        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 mb-1"
                      />
                      <p className="text-[11px] text-slate-500">
                        Sobran:{" "}
                        {Number.isFinite(sobran)
                          ? sobran.toFixed(2)
                          : "-"}{" "}
                        {a.unidad?.toLowerCase() || "uds"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* PREPARACIÓN (PERCHAS, BOLSAS, CHECKS) */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          Preparación (perchas, bolsas...)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="text-slate-400 mb-1">Perchas · Modelo</p>
            <input
              name="perchasModelo"
              defaultValue={pedido.preparacionAlmacen?.perchas?.modelo ?? ""}
              className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Perchas · Unidades</p>
            <input
              type="number"
              name="perchasUnidades"
              defaultValue={
                pedido.preparacionAlmacen?.perchas?.unidades ?? undefined
              }
              className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Perchas · Fecha</p>
              <input
                type="date"
                name="perchasFecha"
                defaultValue={formatDateInput(pedido.preparacionAlmacen?.perchas?.fecha ?? null)}
                className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
              />

          </div>

          <div>
            <p className="text-slate-400 mb-1">Bolsas · Modelo</p>
            <input
              name="bolsasModelo"
              defaultValue={pedido.preparacionAlmacen?.bolsas?.modelo ?? ""}
              className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Bolsas · Unidades</p>
            <input
              type="number"
              name="bolsasUnidades"
              defaultValue={
                pedido.preparacionAlmacen?.bolsas?.unidades ?? undefined
              }
              className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-right"
            />
          </div>
          <div>
            <p className="text-slate-400 mb-1">Bolsas · Fecha</p>
              <input
                type="date"
                name="bolsasFecha"
                defaultValue={formatDateInput(pedido.preparacionAlmacen?.bolsas?.fecha ?? null)}
                className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
              />

          </div>
        </div>

        {/* CHECKS + COMENTARIOS */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="etiquetasMarca"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.etiquetasMarca ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Etiquetas marca
            </span>
            <input
              type="text"
              name="etiquetasMarcaComentario"
              placeholder="Comentario (faltan, no lleva...)"
              defaultValue={
                pedido.preparacionAlmacen?.checks
                  ?.etiquetasMarcaComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="etiquetasTalla"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.etiquetasTalla ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Etiquetas talla
            </span>
            <input
              type="text"
              name="etiquetasTallaComentario"
              placeholder="Ej: falta talla 44"
              defaultValue={
                pedido.preparacionAlmacen?.checks
                  ?.etiquetasTallaComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="compos"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.compos ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">Compos</span>
            <input
              type="text"
              name="composComentario"
              placeholder="Observaciones compos"
              defaultValue={
                pedido.preparacionAlmacen?.checks?.composComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="alarmas"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.alarmas ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">Alarmas</span>
            <input
              type="text"
              name="alarmasComentario"
              placeholder="Dónde van / cuántas..."
              defaultValue={
                pedido.preparacionAlmacen?.checks?.alarmasComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="etiquetasCarton"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.etiquetasCarton ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Etiquetas cartón
            </span>
            <input
              type="text"
              name="etiquetasCartonComentario"
              placeholder="Modelo, cantidad..."
              defaultValue={
                pedido.preparacionAlmacen?.checks
                  ?.etiquetasCartonComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="marchamos"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.marchamos ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Marchamos
            </span>
            <input
              type="text"
              name="marchamosComentario"
              placeholder="Color, tipo, excepciones..."
              defaultValue={
                pedido.preparacionAlmacen?.checks?.marchamosComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="etiquetasPrecio"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.etiquetasPrecio ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Etiquetas precio
            </span>
            <input
              type="text"
              name="etiquetasPrecioComentario"
              placeholder="PVP especial, rebajas..."
              defaultValue={
                pedido.preparacionAlmacen?.checks
                  ?.etiquetasPrecioComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="pegatinas"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.pegatinas ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Pegatinas
            </span>
            <input
              type="text"
              name="pegatinasComentario"
              placeholder="Promo, logo, ubicación..."
              defaultValue={
                pedido.preparacionAlmacen?.checks?.pegatinasComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="talladores"
              defaultChecked={
                pedido.preparacionAlmacen?.checks?.talladores ?? false
              }
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span className="text-slate-300 whitespace-nowrap">
              Talladores
            </span>
            <input
              type="text"
              name="talladoresComentario"
              placeholder="Detalles de tallaje"
              defaultValue={
                pedido.preparacionAlmacen?.checks?.talladoresComentario ?? ""
              }
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
            />
          </div>
        </div>
      </section>

      {/* OBSERVACIONES */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold">Observaciones almacén</h2>
        <textarea
          name="observaciones"
          defaultValue={pedido.observaciones ?? ""}
          rows={4}
          className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
        />
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Guardar almacén
        </button>
      </div>
    </form>
  );
}
