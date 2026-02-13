// app/(app)/[empresa]/maestros/articulos/nuevo/NuevoArticuloForm.tsx
"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Temporada = {
  id: number;
  codigo: string;
  descripcion: string;
};

type Cliente = {
  id: number;
  codigo: string;
  nombre: string;
};

type Subfamilia = {
  id: number;
  codigo: string;
  descripcion: string;
};

type ArticuloInicial = {
  id: number;
  codigo: string;
  descripcion: string;
  temporadaId: number;
  clienteId: number;
  subfamiliaId: number;
  updatedAt?: string; // ✅ optimistic locking
};

type Props = {
  basePath: string;
  temporadas: Temporada[];
  clientes: Cliente[];
  subfamilias: Subfamilia[];
  articuloInicial?: ArticuloInicial;
  modo?: "nuevo" | "editar";
};

function pad2(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).padStart(2, "0");
}

function pad4(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).padStart(4, "0");
}

function is4Digits(v: string) {
  return /^\d{4}$/.test(v);
}

export default function NuevoArticuloForm({
  basePath,
  temporadas,
  clientes,
  subfamilias,
  articuloInicial,
  modo = "nuevo",
}: Props) {
  const modeloInicial = useMemo(() => {
    if (!articuloInicial?.codigo) return "";
    const match = articuloInicial.codigo.match(/^(\d{2})(\d{2})([A-Z]{2})(\d{4})$/);
    return match ? match[4] : "";
  }, [articuloInicial?.codigo]);

  const [temporadaId, setTemporadaId] = useState<number | null>(
    articuloInicial?.temporadaId ?? null,
  );
  const [clienteId, setClienteId] = useState<number | null>(
    articuloInicial?.clienteId ?? null,
  );
  const [subfamiliaId, setSubfamiliaId] = useState<number | null>(
    articuloInicial?.subfamiliaId ?? null,
  );
  const [codigoModelo, setCodigoModelo] = useState<string>(modeloInicial);
  const [descripcion, setDescripcion] = useState<string>(
    articuloInicial?.descripcion ?? "",
  );

  const temporadaSeleccionada = temporadas.find((t) => t.id === temporadaId);
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const subfamiliaSeleccionada = subfamilias.find((s) => s.id === subfamiliaId);

  const codigoTemp = temporadaSeleccionada ? pad2(temporadaSeleccionada.codigo) : "";
  const codigoCliente = clienteSeleccionado ? pad2(clienteSeleccionado.codigo) : "";
  const codigoSubfamilia = subfamiliaSeleccionada ? subfamiliaSeleccionada.codigo : "";
  const codigoModeloFinal = is4Digits(codigoModelo) ? pad4(codigoModelo) : "";

  const codigoArticuloPreview =
    codigoTemp && codigoCliente && codigoSubfamilia && codigoModeloFinal
      ? codigoTemp + codigoCliente + codigoSubfamilia + codigoModeloFinal
      : "";

  const isEditar = modo === "editar" && !!articuloInicial;

  const handleTemporadaChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setTemporadaId(value ? Number(value) : null);
  };

  const handleClienteChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setClienteId(value ? Number(value) : null);
  };

  const handleSubfamiliaChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSubfamiliaId(value ? Number(value) : null);
  };

  const handleCodigoModeloChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCodigoModelo(raw);
  };

  return (
    <form
      action={
        isEditar
          ? `${basePath}/api/articulos/${articuloInicial!.id}`
          : `${basePath}/api/articulos`
      }
      method="POST"
      className="space-y-8"
    >
      {/* ✅ Solo enviamos codigo si está completo y válido */}
      {codigoArticuloPreview ? (
        <input type="hidden" name="codigo" value={codigoArticuloPreview} />
      ) : null}

      {/* ✅ optimistic locking solo en editar */}
      {isEditar ? (
        <input
          type="hidden"
          name="updatedAt"
          value={articuloInicial?.updatedAt ?? ""}
        />
      ) : null}

      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-2">Datos principales</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="block text-sm">Temporada</label>
            <select
              name="temporadaId"
              required
              onChange={handleTemporadaChange}
              defaultValue={temporadaId ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Selecciona temporada</option>
              {temporadas.map((t) => (
                <option key={t.id} value={t.id}>
                  {pad2(t.codigo)} – {t.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm">Cliente / Familia</label>
            <select
              name="clienteId"
              required
              onChange={handleClienteChange}
              defaultValue={clienteId ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {pad2(c.codigo)} – {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm">Subfamilia</label>
            <select
              name="subfamiliaId"
              required
              onChange={handleSubfamiliaChange}
              defaultValue={subfamiliaId ?? ""}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Selecciona subfamilia</option>
              {subfamilias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} – {s.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm">Código modelo</label>
            <input
              type="text"
              name="codigoModelo"
              inputMode="numeric"
              maxLength={4}
              value={codigoModelo}
              onChange={handleCodigoModeloChange}
              placeholder="3065"
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-slate-400">4 dígitos.</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-xl font-semibold mb-2">Código y descripción</h2>

        <div className="space-y-1">
          <label className="block text-sm">Código artículo</label>
          <div className="rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm font-mono tracking-widest">
            {codigoArticuloPreview || "—"}
          </div>
          <p className="text-xs text-slate-400">
            Hasta que no completes todo, no se puede guardar.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm">Descripción</label>
          <input
            type="text"
            name="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="ABRIGO ESPIGA TAMARA"
            required
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!codigoArticuloPreview}
          className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {isEditar ? "Guardar cambios" : "Guardar artículo"}
        </button>
      </div>
    </form>
  );
}
