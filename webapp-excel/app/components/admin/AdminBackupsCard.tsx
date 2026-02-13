"use client";

import { useEffect, useMemo, useState } from "react";

type BackupManifest = {
  backupId?: string;
  createdAt?: string;
  createdBy?: string;
  appVersion?: string | null;
  includesEnv?: boolean;
  sizes?: {
    dbDumpBytes?: number;
    globaliaBytes?: number;
    uploadsBytes?: number;
  };
  result?: {
    ok?: boolean;
    errors?: string[];
  };
};

type BackupItem = {
  backupId: string;
  manifest?: BackupManifest | null;
};

type ApiListResponse = {
  ok: boolean;
  root?: string;
  items?: BackupItem[];
  error?: string;
};

type ActionState = {
  type: "idle" | "loading" | "ok" | "err";
  message?: string;
  logs?: any;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminBackupsCard() {
  const [items, setItems] = useState<BackupItem[]>([]);
  const [root, setRoot] = useState<string>("");
  const [includeEnv, setIncludeEnv] = useState(false);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<ActionState>({ type: "idle" });
  const [confirmMap, setConfirmMap] = useState<Record<string, string>>({});
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const canRestore = useMemo(() => {
    if (!restoreId) return true;
    return action.type !== "loading";
  }, [action.type, restoreId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups", { cache: "no-store" });
      const data = (await res.json()) as ApiListResponse;
      if (!data.ok) {
        setAction({ type: "err", message: data.error || "No se pudo cargar" });
        return;
      }
      setRoot(data.root || "");
      setItems(data.items || []);
      setAction({ type: "idle" });
    } catch {
      setAction({ type: "err", message: "Error cargando backups" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBackup() {
    setAction({ type: "loading", message: "Creando backup..." });
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeEnv }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAction({ type: "err", message: data.error || "Error al crear", logs: data });
      } else {
        setAction({ type: "ok", message: "Backup creado", logs: data });
        await load();
      }
    } catch {
      setAction({ type: "err", message: "Error creando backup" });
    }
  }

  async function restoreBackup(backupId: string) {
    if (!canRestore) return;
    setRestoreId(backupId);
    setAction({ type: "loading", message: `Restaurando ${backupId}...` });
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId, confirmText: confirmMap[backupId] || "" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAction({ type: "err", message: data.error || "Error al restaurar", logs: data });
      } else {
        setAction({ type: "ok", message: "Backup restaurado", logs: data });
        setConfirmMap((m) => ({ ...m, [backupId]: "" }));
      }
    } catch {
      setAction({ type: "err", message: "Error restaurando" });
    } finally {
      setRestoreId(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-white/60">Admin / Backups</div>
          <h2 className="text-lg font-semibold">Backups</h2>
          <p className="text-sm text-white/70">
            Copia completa de BD y filesystem. Root: {root || "—"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={includeEnv}
              onChange={(e) => setIncludeEnv(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir .env
          </label>

          <button
            type="button"
            onClick={createBackup}
            disabled={loading || action.type === "loading"}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
          >
            Crear backup
          </button>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Recargar
          </button>
        </div>
      </div>

      {action.type !== "idle" ? (
        <div
          className={[
            "rounded-lg border px-3 py-2 text-sm",
            action.type === "ok"
              ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200"
              : action.type === "err"
              ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
              : "border-white/10 bg-white/5 text-white/70",
          ].join(" ")}
        >
          <div className="font-medium">{action.message}</div>
          {action.logs ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-white/70">
              {JSON.stringify(action.logs, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-white/60">No hay backups.</div>
        ) : (
          items.map((item) => {
            const m: BackupManifest = item.manifest ?? {};
            const confirmValue = confirmMap[item.backupId] || "";
            const confirmNeeded = `RESTORE ${item.backupId}`;
            const confirmOk = confirmValue === confirmNeeded;

            return (
              <div
                key={item.backupId}
                className="rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold">{item.backupId}</div>
                    <div className="text-xs text-white/60">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : "sin manifest"}
                      {m.createdBy ? ` · ${m.createdBy}` : ""}
                      {m.appVersion ? ` · v${m.appVersion}` : ""}
                    </div>
                    <div className="text-xs text-white/50">
                      DB {formatBytes(m.sizes?.dbDumpBytes)} · Globalia {formatBytes(m.sizes?.globaliaBytes)} · Uploads {formatBytes(m.sizes?.uploadsBytes)}
                      {m.includesEnv ? " · .env" : ""}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:items-end">
                    <input
                      value={confirmValue}
                      onChange={(e) =>
                        setConfirmMap((prev) => ({ ...prev, [item.backupId]: e.target.value }))
                      }
                      placeholder={confirmNeeded}
                      className="w-full md:w-72 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none focus:border-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => restoreBackup(item.backupId)}
                      disabled={!confirmOk || action.type === "loading"}
                      className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900/50 disabled:opacity-50"
                    >
                      Restaurar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
