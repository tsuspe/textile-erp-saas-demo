// app/components/time/SignDayButton.tsx
"use client";

import { useState } from "react";

export default function SignDayButton({
  empresaSlug,
  ym,
  dateISO,
  action,
  disabled,
}: {
  empresaSlug: string;
  ym: string;
  dateISO: string; // YYYY-MM-DD
  action: (fd: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        const pwd = prompt("Confirma con tu contraseña para firmar el día:");
        if (!pwd) return;

        fd.set("password", pwd);

        setBusy(true);
        try {
          await action(fd);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="empresaSlug" value={empresaSlug} />
      <input type="hidden" name="ym" value={ym} />
      <input type="hidden" name="date" value={dateISO} />

      <button
        type="submit"
        disabled={disabled || busy}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-60"
        title="Firmar y bloquear el día"
      >
        {busy ? "Firmando..." : "Firmar"}
      </button>
    </form>
  );
}
