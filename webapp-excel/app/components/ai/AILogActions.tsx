// components/ai/AILogActions.tsx
"use client";

type Props = {
  id: number;
  question: string;
  needsReview: boolean;
};

export default function AILogActions({ id, question, needsReview }: Props) {
  return (
    <div className="flex gap-2">
      {/* Copiar pregunta */}
      <button
        onClick={() => navigator.clipboard.writeText(question)}
        className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
        title="Copiar pregunta"
      >
        📋
      </button>

      {/* Marcar revisión */}
      <button
        onClick={async () => {
          await fetch("/api/ai/logs/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          location.reload();
        }}
        className={`text-xs px-2 py-1 rounded ${
          needsReview
            ? "bg-orange-700"
            : "bg-orange-500 hover:bg-orange-400"
        }`}
        title="Marcar para revisión"
      >
        🛠
      </button>
    </div>
  );
}
