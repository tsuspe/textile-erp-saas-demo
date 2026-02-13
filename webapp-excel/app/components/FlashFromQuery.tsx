// app/components/FlashFromQuery.tsx
"use client";

import FlashMessage from "@/app/components/FlashMessage";
import { useSearchParams } from "next/navigation";

const OK_MAP: Record<string, { title: string; message: string }> = {
  created: { title: "Guardado", message: "Registro creado correctamente." },
  updated: { title: "Actualizado", message: "Cambios guardados." },
  deleted: { title: "Eliminado", message: "Registro eliminado correctamente." },
};

type ErrorMeta = { title: string; message: string; type?: "error" | "warning" };

const ERROR_MAP: Record<string, ErrorMeta> = {
  // ✅ conflicto (optimistic locking)
  conflict: {
    title: "Conflicto de edición",
    message:
      "Alguien guardó este registro antes que tú. Recarga para ver la última versión y vuelve a guardar tus cambios.",
    type: "warning",
  },

  campos: { title: "Faltan datos", message: "Revisa los campos obligatorios." },
  server: { title: "Error", message: "Ha ocurrido un error en el servidor." },
  id_invalido: { title: "Ruta inválida", message: "El identificador no es válido." },
  no_existe: { title: "No encontrado", message: "El registro no existe." },
  no_permisos: {
    title: "Sin permisos",
    message: "No tienes permisos para acceder a esa sección.",
    type: "error",
  },

  tiene_datos_asociados: {
    title: "Bloqueado",
    message: "No se puede eliminar: tiene datos asociados.",
  },
  codigo_duplicado: {
    title: "Código duplicado",
    message: "Ya existe un registro con ese código.",
  },
};

export default function FlashFromQuery() {
  const sp = useSearchParams();

  const ok = sp.get("ok");
  const error = sp.get("error");
  const err = sp.get("err");
  const code = error ?? err;

  // Opcionales para detalles
  const art = sp.get("art");
  const esc = sp.get("esc");
  const codigo = sp.get("codigo");

  if (ok) {
    const meta = OK_MAP[ok] ?? { title: "OK", message: "Acción realizada." };
    return (
      <FlashMessage type="success" title={meta.title} message={meta.message} />
    );
  }

  if (code) {
    const meta =
      ERROR_MAP[code] ?? { title: "Error", message: "Algo no ha ido bien.", type: "error" };

    const details: string[] = [];
    if (codigo) details.push(`Código: ${codigo}`);
    if (art) details.push(`Artículos asociados: ${art}`);
    if (esc) details.push(`Escandallos asociados: ${esc}`);

    return (
      <FlashMessage
        type={meta.type ?? "error"}   // ✅ aquí cambia la vida
        title={meta.title}
        message={meta.message}
        details={details.length ? details : undefined}
      />
    );
  }

  return null;
}
