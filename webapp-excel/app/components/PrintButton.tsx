// App/components/PrintButton.tsx
"use client";

export function PrintButton() {
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="print:hidden inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide hover:bg-slate-100"
    >
      Imprimir
      <span className="text-[9px] text-slate-500">(Ctrl + P)</span>
    </button>
  );
}
