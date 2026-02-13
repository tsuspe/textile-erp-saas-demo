// app/components/DeleteButton.tsx
"use client";

import { useCallback, useState } from "react";

type DeleteButtonProps = {
  label?: string;
  confirmText?: string;
  className?: string;
};

export function DeleteButton({
  label = "Eliminar",
  confirmText = "¿Seguro que quieres eliminarlo?",
  className = "",
}: DeleteButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();

      if (loading) return;
      if (!confirm(confirmText)) return;

      setLoading(true);

      const form = e.currentTarget.form;
      if (form) {
        // 🔑 submit nativo → respeta 303 + redirect del server
        form.submit();
      }
    },
    [confirmText, loading],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      aria-disabled={loading}
      title={label}
      className={[
        "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-semibold transition",
        "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
        "disabled:opacity-60 disabled:pointer-events-none",
        className,
      ].join(" ")}
    >
      {loading ? "Eliminando…" : label}
    </button>
  );
}
