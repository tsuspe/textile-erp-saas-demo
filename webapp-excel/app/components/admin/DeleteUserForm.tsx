// webapp-excel/app/components/admin/DeleteUserForm.tsx
"use client";

import { useState } from "react";

export default function DeleteUserForm({
  empresaSlug,
  userId,
  username,
  action,
  className,
  label = "Eliminar",
}: {
  empresaSlug: string;
  userId: string;
  username: string;
  // Server Action (se puede pasar como prop)
  action: (formData: FormData) => Promise<void>;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        // Confirm antes de mandar al server
        const ok = confirm(`Eliminar usuario @${username}?`);
        if (!ok) return;

        setBusy(true);
        try {
          await action(fd);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="empresaSlug" value={empresaSlug} />
      <input type="hidden" name="userId" value={userId} />

      <button
        type="submit"
        disabled={busy}
        className={
          className ??
          "rounded-lg border border-rose-900/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-200 hover:bg-rose-950/35 disabled:opacity-60"
        }
        title="Eliminar usuario"
      >
        {busy ? "Eliminando..." : label}
      </button>
    </form>
  );
}
