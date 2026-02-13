// app/(app)/[empresa]/fichas/[clienteId]/temporadas/[temporadaId]/escandallos/nuevo/NuevoEscandalloForm.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ArticuloOption = {
  id: number;
  codigo: string;
  descripcion: string;
};

type Muestra = {
  fecha: string;
  consumo: string;
};

type Tejido = {
  proveedor: string;
  serie: string;
  color: string;
  anchoReal: string;
  anchoUtil: string;
  consumoProduccion: string;
  precio: string;
  muestras: Muestra[];
};

type Forro = {
  proveedor: string;
  serie: string;
  color: string;
  anchoReal: string;
  anchoUtil: string;
  consumoProduccion: string;
  precio: string;
  muestras: Muestra[];
};

type Accesorio = {
  nombre: string;
  medida: string;
  unidad: string;
  proveedor: string;
  referencia: string;
  color: string;
  cantidad: string;
  precioUnidad: string;
};

type Gasto = {
  tipo: string;
  descripcion: string;
  importe: string;
};

type EscandalloInitialValues = {
  id: number;
  updatedAt: string; // ✅ ISO string
  porcentajeExtra?: string; // 👈 nuevo (en editar vendrá como "10" por ejemplo)
  articuloId?: number | null;
  modeloInterno: string;
  modeloCliente: string;
  patron: string;
  talla: string;
  patronista: string;
  fecha: string;
  observaciones: string;
  imagenUrl?: string | null;
  tejidos: Tejido[];
  forros: Forro[];
  accesorios: Accesorio[];
  gastos: Gasto[];
  estado?: "ESCANDALLO" | "PRODUCCION";
};

type Props = {
  empresa: string;
  mode?: "nuevo" | "editar";
  clienteId: number;
  temporadaId: number;
  articulos: ArticuloOption[];
  initialValues?: EscandalloInitialValues;
};

/**
 * ⚠️ No uses objetos "empty" compartidos con arrays dentro.
 * Si no, varias filas pueden compartir referencias y aparecer bugs raros.
 */
function makeEmptyTejido(): Tejido {
  return {
    proveedor: "",
    serie: "",
    color: "",
    anchoReal: "",
    anchoUtil: "",
    consumoProduccion: "",
    precio: "",
    muestras: [{ fecha: "", consumo: "" }],
  };
}

function makeEmptyForro(): Forro {
  return {
    proveedor: "",
    serie: "",
    color: "",
    anchoReal: "",
    anchoUtil: "",
    consumoProduccion: "",
    precio: "",
    muestras: [{ fecha: "", consumo: "" }],
  };
}

function makeEmptyAccesorio(): Accesorio {
  return {
    nombre: "",
    medida: "",
    unidad: "UNIDADES",
    proveedor: "",
    referencia: "",
    color: "",
    cantidad: "",
    precioUnidad: "",
  };
}

function makeEmptyGasto(): Gasto {
  return {
    tipo: "",
    descripcion: "",
    importe: "",
  };
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export default function NuevoEscandalloForm({
  empresa,
  mode = "nuevo",
  clienteId,
  temporadaId,
  articulos,
  initialValues,
}: Props) {
  const isEdit = mode === "editar";
  const base = `/${empresa}`;

  // CABECERA
  const [articuloId, setArticuloId] = useState<number | "">("");
  const [articuloBloqueado, setArticuloBloqueado] = useState<boolean>(
    mode === "editar" ? false : true,
  );

  useEffect(() => {
    if (mode === "editar") setArticuloBloqueado(false);
  }, [mode]);

  const [modeloInterno, setModeloInterno] = useState(initialValues?.modeloInterno ?? "");
  const [modeloCliente, setModeloCliente] = useState(initialValues?.modeloCliente ?? "");
  const [patron, setPatron] = useState(initialValues?.patron ?? "");
  const [talla, setTalla] = useState(initialValues?.talla ?? "");
  const [patronista, setPatronista] = useState(initialValues?.patronista ?? "");
  const [fecha, setFecha] = useState(initialValues?.fecha ?? "");
  const [observaciones, setObservaciones] = useState(initialValues?.observaciones ?? "");
  const [estado, setEstado] = useState<"ESCANDALLO" | "PRODUCCION">(
    initialValues?.estado === "PRODUCCION" ? "PRODUCCION" : "ESCANDALLO",
  );
  // % extra sobre el coste total (margen/overhead/merma)
  const [porcentajeExtra, setPorcentajeExtra] = useState(
    initialValues?.porcentajeExtra ?? "0",
  );


  // DETALLES
  const [tejidos, setTejidos] = useState<Tejido[]>(
    initialValues?.tejidos && initialValues.tejidos.length > 0 ? initialValues.tejidos : [makeEmptyTejido()],
  );
  const [forros, setForros] = useState<Forro[]>(
    initialValues?.forros && initialValues.forros.length > 0 ? initialValues.forros : [makeEmptyForro()],
  );
  const [accesorios, setAccesorios] = useState<Accesorio[]>(
    initialValues?.accesorios && initialValues.accesorios.length > 0
      ? initialValues.accesorios
      : [makeEmptyAccesorio()],
  );
  const [gastos, setGastos] = useState<Gasto[]>(
    initialValues?.gastos && initialValues.gastos.length > 0 ? initialValues.gastos : [makeEmptyGasto()],
  );

  useEffect(() => {
    if (!isEdit) return;

    const initId = initialValues?.articuloId ?? "";
    setArticuloId(initId === null ? "" : initId);

    // En editar: nunca bloquees el form por defecto
    setArticuloBloqueado(false);

    // Si hay artículo, asegúrate de que modeloInterno cuadra
    if (typeof initId === "number") {
      const art = articulos.find((x) => x.id === initId);
      if (art && !modeloInterno) setModeloInterno(art.codigo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initialValues?.articuloId]);

  const totalCoste = useMemo(() => {
    let total = 0;

    for (const t of tejidos) {
      const consumo = parseNumber(t.consumoProduccion);
      const precio = parseNumber(t.precio);
      if (consumo != null && precio != null) total += consumo * precio;
    }

    for (const f of forros) {
      const consumo = parseNumber(f.consumoProduccion);
      const precio = parseNumber(f.precio);
      if (consumo != null && precio != null) total += consumo * precio;
    }

    for (const a of accesorios) {
      const cantidad = parseNumber(a.cantidad);
      const precioUnidad = parseNumber(a.precioUnidad);
      if (cantidad != null && precioUnidad != null) total += cantidad * precioUnidad;
    }

    for (const g of gastos) {
      const importe = parseNumber(g.importe);
      if (importe != null) total += importe;
    }

    return total;
  }, [tejidos, forros, accesorios, gastos]);


  const porcentajeExtraNum = useMemo(
    () => parseNumber(porcentajeExtra) ?? 0,
    [porcentajeExtra]
  );

  const importePorcentaje = useMemo(
    () => (totalCoste * porcentajeExtraNum) / 100,
    [totalCoste, porcentajeExtraNum]
  );

  const totalConPorcentaje = useMemo(
    () => totalCoste + importePorcentaje,
    [totalCoste, importePorcentaje]
  );


  // Helpers para listas
  const handleTejidoChange = (index: number, field: keyof Tejido, value: string) => {
    setTejidos((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const handleForroChange = (index: number, field: keyof Forro, value: string) => {
    setForros((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  const handleAccesorioChange = (index: number, field: keyof Accesorio, value: string) => {
    setAccesorios((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const handleGastoChange = (index: number, field: keyof Gasto, value: string) => {
    setGastos((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };

  const handleTejidoMuestraChange = (
    tejidoIndex: number,
    muestraIndex: number,
    field: keyof Muestra,
    value: string,
  ) => {
    setTejidos((prev) => {
      const next = [...prev];
      const tejido = { ...next[tejidoIndex] };
      const muestras = [...tejido.muestras];
      const m = { ...muestras[muestraIndex], [field]: value };
      muestras[muestraIndex] = m;
      tejido.muestras = muestras;
      next[tejidoIndex] = tejido;
      return next;
    });
  };

  const addTejidoMuestra = (tejidoIndex: number) => {
    setTejidos((prev) => {
      const next = [...prev];
      const tejido = { ...next[tejidoIndex] };
      tejido.muestras = [...tejido.muestras, { fecha: "", consumo: "" }];
      next[tejidoIndex] = tejido;
      return next;
    });
  };

  const removeTejidoMuestra = (tejidoIndex: number, muestraIndex: number) => {
    setTejidos((prev) => {
      const next = [...prev];
      const tejido = { ...next[tejidoIndex] };
      tejido.muestras = tejido.muestras.filter((_, i) => i !== muestraIndex);
      next[tejidoIndex] = tejido;
      return next;
    });
  };

  const handleForroMuestraChange = (
    forroIndex: number,
    muestraIndex: number,
    field: keyof Muestra,
    value: string,
  ) => {
    setForros((prev) => {
      const next = [...prev];
      const forro = { ...next[forroIndex] };
      const muestras = [...forro.muestras];
      const m = { ...muestras[muestraIndex], [field]: value };
      muestras[muestraIndex] = m;
      forro.muestras = muestras;
      next[forroIndex] = forro;
      return next;
    });
  };

  const addForroMuestra = (forroIndex: number) => {
    setForros((prev) => {
      const next = [...prev];
      const forro = { ...next[forroIndex] };
      forro.muestras = [...forro.muestras, { fecha: "", consumo: "" }];
      next[forroIndex] = forro;
      return next;
    });
  };

  const removeForroMuestra = (forroIndex: number, muestraIndex: number) => {
    setForros((prev) => {
      const next = [...prev];
      const forro = { ...next[forroIndex] };
      forro.muestras = forro.muestras.filter((_, i) => i !== muestraIndex);
      next[forroIndex] = forro;
      return next;
    });
  };

  const addTejido = () => setTejidos((prev) => [...prev, makeEmptyTejido()]);
  const removeTejido = (index: number) =>
    setTejidos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const addForro = () => setForros((prev) => [...prev, makeEmptyForro()]);
  const removeForro = (index: number) =>
    setForros((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const addAccesorio = () => setAccesorios((prev) => [...prev, makeEmptyAccesorio()]);
  const removeAccesorio = (index: number) =>
    setAccesorios((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const addGasto = () => setGastos((prev) => [...prev, makeEmptyGasto()]);
  const removeGasto = (index: number) =>
    setGastos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  return (
    <form
      action={`${base}/api/escandallos`}
      method="POST"
      encType="multipart/form-data"
      className="space-y-8"
    >
      {/* Hidden básicos */}
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="temporadaId" value={temporadaId} />
      <input type="hidden" name="totalCoste" value={totalCoste.toString()} />
      <input type="hidden" name="porcentajeExtra" value={porcentajeExtra} />


      {/* ✅ Mandar SIEMPRE articuloId, aunque sea vacío.
          (Evita casos raros al limpiar el select en editar) */}
      <input type="hidden" name="articuloId" value={articuloId === "" ? "" : String(articuloId)} />

      {isEdit && initialValues?.id ? (
        <>
          <input type="hidden" name="escandalloId" value={initialValues.id} />
          {/* ✅ optimistic locking token */}
          <input type="hidden" name="updatedAt" value={initialValues.updatedAt} />
          <input type="hidden" name="existingImagenUrl" value={initialValues.imagenUrl ?? ""} />
        </>
      ) : null}

      {/* JSONs con los arrays */}
      <input type="hidden" name="tejidosJson" value={JSON.stringify(tejidos)} />
      <input type="hidden" name="forrosJson" value={JSON.stringify(forros)} />
      <input type="hidden" name="accesoriosJson" value={JSON.stringify(accesorios)} />
      <input type="hidden" name="gastosJson" value={JSON.stringify(gastos)} />

      {/* Selector artículo maestro */}
      <div className="space-y-1">
        <label className="block text-sm">Modelo interno</label>

        <select
          className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-1 text-xs mb-1"
          value={articuloId === "" ? "" : String(articuloId)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              setArticuloId("");
              setArticuloBloqueado(!isEdit); // ✅ solo bloquea en nuevo
              return;
            }
            const id = Number(v);
            setArticuloId(id);

            const art = articulos.find((x) => x.id === id);
            if (art) {
              setModeloInterno(art.codigo);
              setArticuloBloqueado(false);
            }
          }}
        >
          <option value="">Selecciona artículo…</option>
          {articulos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo} — {a.descripcion}
            </option>
          ))}
        </select>

        {articuloBloqueado && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠️ Selecciona un artículo maestro o crea uno nuevo para continuar.
          </p>
        )}

        <p className="text-[11px] text-slate-500">
          <Link href={`${base}/maestros/articulos/nuevo`} className="underline text-emerald-400">
            Crear nuevo artículo
          </Link>
        </p>
      </div>

      <fieldset
        disabled={articuloBloqueado}
        className={articuloBloqueado ? "opacity-40 pointer-events-none" : ""}
      >

      {/* CABECERA */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Cabecera</h2>

          {/* Selector de estado (lo bloquearemos luego con fieldset) */}
        </div>


          {/* Estado */}
          <div className="flex items-center justify-end gap-2">
            <label className="text-[11px] text-slate-400">Estado</label>
            <select
              name="estado"
              value={estado}
              onChange={(e) =>
                setEstado(e.target.value === "PRODUCCION" ? "PRODUCCION" : "ESCANDALLO")
              }
              className="rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
            >
              <option value="ESCANDALLO">Escandallo (en estudio)</option>
              <option value="PRODUCCION">Producción (aprobado)</option>
            </select>
          </div>

          {/* Modelo interno editable (si quieres) */}
          <div className="space-y-1">
            <label className="block text-sm">Modelo interno (editable)</label>
            <input
              name="modeloInterno"
              value={modeloInterno}
              onChange={(e) => setModeloInterno(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              placeholder="Código interno (ej. 1920AB3065)"
            />
          </div>

          {/* Resto de cabecera */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-sm">Modelo / ref. cliente</label>
              <input
                name="modeloCliente"
                value={modeloCliente}
                onChange={(e) => setModeloCliente(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Patrón</label>
              <input
                name="patron"
                value={patron}
                onChange={(e) => setPatron(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Talla</label>
              <input
                name="talla"
                value={talla}
                onChange={(e) => setTalla(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-sm">Patronista</label>
              <input
                name="patronista"
                value={patronista}
                onChange={(e) => setPatronista(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">Fecha</label>
              <input
                type="date"
                name="fecha"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm">Observaciones</label>
              <textarea
                name="observaciones"
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm">
                {isEdit ? "Foto del modelo (opcional)" : "Foto del modelo"}
              </label>
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

          {tejidos.map((t, idx) => (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-4"
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

              {/* Fila 1: proveedor / serie / color / precio */}
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
                <div className="space-y-1">
                  <label className="block text-xs">Color</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.color}
                    onChange={(e) =>
                      handleTejidoChange(idx, "color", e.target.value)
                    }
                    />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Precio €/m</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.precio}
                    onChange={(e) =>
                      handleTejidoChange(idx, "precio", e.target.value)
                    }
                    />
                </div>
              </div>

              {/* Fila 2: anchos + consumo producción */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Ancho real (cm)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.anchoReal}
                    onChange={(e) =>
                      handleTejidoChange(idx, "anchoReal", e.target.value)
                    }
                    />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Ancho útil (cm)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.anchoUtil}
                    onChange={(e) =>
                      handleTejidoChange(idx, "anchoUtil", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Consumo producción (m)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={t.consumoProduccion}
                    onChange={(e) =>
                      handleTejidoChange(idx, "consumoProduccion", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Bloque de muestras */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Muestras (fecha + consumo)
                  </span>
                  <button
                    type="button"
                    onClick={() => addTejidoMuestra(idx)}
                    className="text-[11px] text-emerald-400 underline"
                  >
                    + Añadir muestra
                  </button>
                </div>

                {t.muestras.map((m, mIdx) => (
                  <div
                  key={mIdx}
                    className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs">Fecha muestra</label>
                      <input
                        type="date"
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                        value={m.fecha}
                        onChange={(e) =>
                          handleTejidoMuestraChange(
                            idx,
                            mIdx,
                            "fecha",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs">
                        Consumo muestra (m)
                      </label>
                      <input
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                        value={m.consumo}
                        onChange={(e) =>
                          handleTejidoMuestraChange(
                            idx,
                            mIdx,
                            "consumo",
                            e.target.value,
                          )
                        }
                        />
                    </div>
                    <div className="flex justify-end">
                      {t.muestras.length > 1 && (
                        <button
                        type="button"
                          onClick={() => removeTejidoMuestra(idx, mIdx)}
                          className="text-[11px] text-red-400 underline"
                        >
                          Eliminar muestra
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

          {forros.map((f, idx) => (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-4"
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

              {/* Fila 1: proveedor / serie /color / precio */}
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
                  <label className="block text-xs">Color</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.color}
                    onChange={(e) =>
                      handleForroChange(idx, "color", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Precio €/m</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.precio}
                    onChange={(e) =>
                      handleForroChange(idx, "precio", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Fila 2: anchos + consumo producción */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Ancho real (cm)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.anchoReal}
                    onChange={(e) =>
                      handleForroChange(idx, "anchoReal", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Ancho útil (cm)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.anchoUtil}
                    onChange={(e) =>
                      handleForroChange(idx, "anchoUtil", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Consumo producción (m)</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                    value={f.consumoProduccion}
                    onChange={(e) =>
                      handleForroChange(idx, "consumoProduccion", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Bloque de muestras */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Muestras (fecha + consumo)
                  </span>
                  <button
                    type="button"
                    onClick={() => addForroMuestra(idx)}
                    className="text-[11px] text-emerald-400 underline"
                  >
                    + Añadir muestra
                  </button>
                </div>

                {f.muestras.map((m, mIdx) => (
                  <div
                  key={mIdx}
                    className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs">Fecha muestra</label>
                      <input
                        type="date"
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                        value={m.fecha}
                        onChange={(e) =>
                          handleForroMuestraChange(
                            idx,
                            mIdx,
                            "fecha",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs">
                        Consumo muestra (m)
                      </label>
                      <input
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs"
                        value={m.consumo}
                        onChange={(e) =>
                          handleForroMuestraChange(
                            idx,
                            mIdx,
                            "consumo",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="flex justify-end">
                      {f.muestras.length > 1 && (
                        <button
                        type="button"
                          onClick={() => removeForroMuestra(idx, mIdx)}
                          className="text-[11px] text-red-400 underline"
                        >
                          Eliminar muestra
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ACCESORIOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Fornituras / Accesorios</h2>
            <button
              type="button"
              onClick={addAccesorio}
              className="text-xs underline text-emerald-400"
            >
              + Añadir accesorio
            </button>
          </div>

          {accesorios.map((a, idx) => (
            <div
            key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Accesorio {idx + 1}</p>
                {accesorios.length > 1 && (
                  <button
                  type="button"
                    onClick={() => removeAccesorio(idx)}
                    className="text-xs text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

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
                  <label className="block text-xs">Color</label>
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
                <div className="space-y-1">
                  <label className="block text-xs">Unidades / Metros</label>
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
                  <label className="block text-xs">Cantidad</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.cantidad}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "cantidad", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Precio unidad / metro</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={a.precioUnidad}
                    onChange={(e) =>
                      handleAccesorioChange(idx, "precioUnidad", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* OTROS GASTOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Otros gastos</h2>
            <button
              type="button"
              onClick={addGasto}
              className="text-xs underline text-emerald-400"
            >
              + Añadir gasto
            </button>
          </div>

          {gastos.map((g, idx) => (
            <div
              key={idx}
              className="border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Gasto {idx + 1}</p>
                {gastos.length > 1 && (
                  <button
                  type="button"
                  onClick={() => removeGasto(idx)}
                    className="text-xs text-red-400 underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs">Tipo</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={g.tipo}
                    onChange={(e) =>
                      handleGastoChange(idx, "tipo", e.target.value)
                    }
                    placeholder="CORTE, CONFECCION, PORTES..."
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs">Descripción</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={g.descripcion}
                    onChange={(e) =>
                      handleGastoChange(idx, "descripcion", e.target.value)
                    }
                    />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs">Importe</label>
                  <input
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                    value={g.importe}
                    onChange={(e) =>
                      handleGastoChange(idx, "importe", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* RESUMEN + SUBMIT */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Resumen</h2>
              <p className="text-xs text-slate-400">
                Este total se recalcula según los consumos y precios.
              </p>
            </div>
              <div className="text-right space-y-1">
                <div>
                  <p className="text-xs text-slate-400">Coste base</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {totalCoste.toFixed(2)} €
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <label className="text-[11px] text-slate-400">+ %</label>
                  <input
                    value={porcentajeExtra}
                    onChange={(e) => setPorcentajeExtra(e.target.value)}
                    className="w-20 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] text-right"
                    placeholder="0"
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <p className="text-[11px] text-slate-500">
                    Importe %: {importePorcentaje.toFixed(2)} €
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    Total con %: {totalConPorcentaje.toFixed(2)} €
                  </p>
                </div>
              </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href={`${base}/fichas/${clienteId}/temporadas/${temporadaId}`}
              className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={articuloBloqueado}
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEdit ? "Guardar cambios" : "Guardar escandallo"}
            </button>

          </div>
        </section>
    

      </fieldset>
    </form>
  );
}
