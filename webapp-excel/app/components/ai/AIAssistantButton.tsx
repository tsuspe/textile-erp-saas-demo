// components/ai/AIAssistantButton.tsx
"use client";

export default function AIAssistantButton({
  onClick,
  open,
  rightShiftPx = 0,
}: {
  onClick: () => void;
  open: boolean;
  rightShiftPx?: number;
}) {
  const BASE_RIGHT = 24;

  // Debe coincidir con el drawer: w-[380px]
  const ASSISTANT_DRAWER_WIDTH = 380;
  const GAP = 24;

  // Si el asistente está abierto, empujamos el botón a la izquierda
  // para que no quede debajo del propio drawer.
  const selfShift = open ? ASSISTANT_DRAWER_WIDTH + GAP : 0;

  const rightPx = BASE_RIGHT + (rightShiftPx ?? 0) + selfShift;

  return (
    <button
      onClick={onClick}
      style={{ right: rightPx }}
      className="fixed bottom-6 z-50 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg w-14 h-14 flex items-center justify-center text-xl font-bold transition-[right] duration-200"
      title="Asistente IA"
    >
      IA
    </button>
  );
}
