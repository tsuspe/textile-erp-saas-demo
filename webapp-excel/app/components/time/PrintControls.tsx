//app/components/time/PrintControls.tsx
"use client";

export default function PrintControls() {
  return (
    <div className="noprint p-4">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
      >
        Imprimir
      </button>
    </div>
  );
}
