// app/(app)/account/notifications/NewNotificationPanel.tsx
"use client";

import styles from "./NewNotificationPanel.module.css";


import { useEffect, useMemo, useState } from "react";
import {
    createCustomNotificationAction,
    getNotificationComposerOptionsAction,
} from "./actions";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

type Props = {
  empresaSlug?: string; // "" o undefined = global
  defaultOpen?: boolean;
};


type UserOpt = { id: string; username: string; name: string };

export default function NewNotificationPanel({ empresaSlug = "", defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [senderMode, setSenderMode] = useState<"USER" | "GROUP">("USER");

  const [loadingOpts, setLoadingOpts] = useState(false);
  const [optsErr, setOptsErr] = useState<string | null>(null);

  const [myGroupKeys, setMyGroupKeys] = useState<string[]>([]);
  const [allGroupKeys, setAllGroupKeys] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<UserOpt[]>([]);

  const [senderGroupKey, setSenderGroupKey] = useState<string>("");
  const [targetGroupKeys, setTargetGroupKeys] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);

  // (Opcional) filtro para no volverte loco con 200 users
  const [userFilter, setUserFilter] = useState("");

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";
  const labelCls = "text-xs text-white/70";
  const selectCls =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

  const panelCls = useMemo(
    () =>
      cx(
        "overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all",
        open ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0",
      ),
    [open],
  );

  // Cargar opciones solo cuando se abre (y si cambias de empresaSlug)
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoadingOpts(true);
      setOptsErr(null);
      try {
        // OJO: getNotificationComposerOptionsAction espera un string (slug) o "".
        const res: any = await getNotificationComposerOptionsAction(empresaSlug || "");

        if (!alive) return;

        setMyGroupKeys(Array.isArray(res?.myGroupKeys) ? res.myGroupKeys : []);
        setAllGroupKeys(Array.isArray(res?.allGroupKeys) ? res.allGroupKeys : []);
        // Compat: el server action puede devolver "users" o "allUsers".
        const users = Array.isArray(res?.allUsers) ? res.allUsers : Array.isArray(res?.users) ? res.users : [];
        setAllUsers(users);
      } catch (e: any) {
        if (!alive) return;
        setOptsErr("No se pudieron cargar usuarios/grupos.");
      } finally {
        if (!alive) return;
        setLoadingOpts(false);
      }
    }

    if (open) load();
    return () => {
      alive = false;
    };
  }, [open, empresaSlug]);

  // Si cambias a USER, limpiamos senderGroupKey para evitar líos
  useEffect(() => {
    if (senderMode !== "GROUP") setSenderGroupKey("");
  }, [senderMode]);

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      const a = (u.username || "").toLowerCase();
      const b = (u.name || "").toLowerCase();
      return a.includes(q) || b.includes(q) || `${b} ${a}`.includes(q);
    });
  }, [allUsers, userFilter]);

  function selectAllUsers() {
    setTargetUserIds(allUsers.map((u) => u.id));
  }

  function clearUsersSelection() {
    setTargetUserIds([]);
  }


  function readMultiSelectValues(el: HTMLSelectElement) {
    return Array.from(el.selectedOptions).map((o) => o.value);
  }

  return (
   <div className={cx("space-y-2", styles.wrap)}>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cx(
            "rounded-lg border px-3 py-2 text-xs transition-colors",
            open
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
              : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
          )}
          aria-expanded={open}
        >
          {open ? "Cerrar" : "Nueva"}
        </button>
      </div>

      <div className={panelCls}>
        <div className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white/90">Nueva notificación</div>
              <div className="text-xs text-white/60">
                Envía a usuarios concretos o a grupos (se crea 1 notificación por usuario).
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          {optsErr ? (
            <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {optsErr}
            </div>
          ) : null}

          <form action={createCustomNotificationAction} className="space-y-3">
            <input type="hidden" name="empresaSlug" value={empresaSlug} />

            {/* IMPORTANT: lo que espera el server action (CSV) */}
            <input type="hidden" name="senderGroupKey" value={senderGroupKey} />
            <input type="hidden" name="targetUserIds" value={targetUserIds.join(",")} />
            <input type="hidden" name="targetGroupKeys" value={targetGroupKeys.join(",")} />

            <div className="grid gap-2">
              <div className={labelCls}>Remitente</div>

              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="senderMode"
                    value="USER"
                    checked={senderMode === "USER"}
                    onChange={() => setSenderMode("USER")}
                  />
                  Usuario (yo)
                </label>

                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="senderMode"
                    value="GROUP"
                    checked={senderMode === "GROUP"}
                    onChange={() => setSenderMode("GROUP")}
                  />
                  Grupo
                </label>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] text-white/40">Grupo remitente</div>
                    <select
                    className={cx(selectCls, senderMode !== "GROUP" && "opacity-40")}
                    style={{ colorScheme: "dark" }}
                    disabled={senderMode !== "GROUP" || loadingOpts}
                    value={senderGroupKey}
                    onChange={(e) => setSenderGroupKey(e.target.value)}
                    >

                    <option value="">
                      {loadingOpts ? "Cargando..." : "Selecciona un grupo (tuyo)"}
                    </option>
                    {myGroupKeys.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[11px] text-white/40">
                    Solo puedes enviar “como grupo” si perteneces a ese grupo.
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] text-white/50">Tip rápido</div>
                  <div className="text-xs text-white/70">
                    Si envías como <span className="text-white/90">RRHH</span>, el sistema lo firma
                    como grupo y queda más “oficial”.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className={labelCls}>Título</div>
              <input name="title" className={inputCls} placeholder="Ej: Aviso importante" required />
            </div>

            <div className="grid gap-2">
              <div className={labelCls}>Mensaje</div>
              <textarea name="body" className={inputCls} rows={4} placeholder="Texto de la notificación..." />
            </div>

            <div className="grid gap-2">
              <div className={labelCls}>Link opcional (href)</div>
              <input name="href" className={inputCls} placeholder="/mi/ruta o https://..." />
            </div>

            <div className="grid gap-2">
              <div className={labelCls}>Destinatarios</div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] text-white/40">Grupos destino</div>
                    <select
                    multiple
                    className={selectCls}
                    style={{ colorScheme: "dark" }}
                    value={targetGroupKeys}
                    disabled={loadingOpts}
                    onChange={(e) => setTargetGroupKeys(readMultiSelectValues(e.currentTarget))}
                    size={Math.min(8, Math.max(4, allGroupKeys.length || 4))}
                    >

                    {allGroupKeys.length ? (
                      allGroupKeys.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {loadingOpts ? "Cargando..." : "No hay grupos"}
                      </option>
                    )}
                  </select>
                  <div className="mt-1 text-[11px] text-white/40">
                    (Ctrl/Cmd) para seleccionar varios.
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-white/40">Usuarios destino</div>
                    <div className="mb-2 flex gap-2">
                    <input
                        className={cx(inputCls)}
                        placeholder="Filtrar usuarios por nombre o @username…"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        disabled={loadingOpts}
                    />

                    <button
                        type="button"
                        onClick={selectAllUsers}
                        disabled={loadingOpts || !allUsers.length}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                        title="Seleccionar todos los usuarios"
                    >
                        @todos
                    </button>

                    <button
                        type="button"
                        onClick={clearUsersSelection}
                        disabled={loadingOpts || !targetUserIds.length}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
                        title="Limpiar selección"
                    >
                        Limpiar
                    </button>
                    </div>


                    <select
                    multiple
                    className={selectCls}
                    style={{ colorScheme: "dark" }}
                    value={targetUserIds}
                    disabled={loadingOpts}
                    onChange={(e) => setTargetUserIds(readMultiSelectValues(e.currentTarget))}
                    size={8}
                    >

                    {filteredUsers.length ? (
                      filteredUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ? `${u.name} · @${u.username}` : `@${u.username}`} ({u.id})
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {loadingOpts ? "Cargando..." : "No hay usuarios"}
                      </option>
                    )}
                  </select>

                  <div className="mt-1 text-[11px] text-white/40">
                    Se enviará 1 notificación por usuario (sin duplicados aunque lo cojas por grupo + user).
                  </div>
                </div>
              </div>

              {/* Preview rápido (opcional pero útil) */}
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
                Seleccionados:{" "}
                <span className="text-white/80">{targetGroupKeys.length} grupos</span> ·{" "}
                <span className="text-white/80">{targetUserIds.length} usuarios</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                className={cx(
                  "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15",
                  loadingOpts && "opacity-60",
                )}
                disabled={loadingOpts}
              >
                {loadingOpts ? "Cargando..." : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


