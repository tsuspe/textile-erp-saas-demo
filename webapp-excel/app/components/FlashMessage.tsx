// app/components/FlashMessage.tsx
"use client";

type FlashMessageProps = {
  type: "success" | "error" | "warning";
  title?: string;
  message: string;
  details?: string[];
};

export default function FlashMessage({
  type,
  title,
  message,
  details,
}: FlashMessageProps) {
  const styles: Record<FlashMessageProps["type"], string> = {
    success: "border-emerald-600/40 bg-emerald-900/20 text-emerald-300",
    error: "border-red-600/40 bg-red-900/20 text-red-300",
    warning: "border-yellow-600/40 bg-yellow-900/20 text-yellow-300",
  };

  return (
    <div className={`rounded-md border px-4 py-2 text-sm ${styles[type]}`}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <p>{message}</p>

      {details?.length ? (
        <ul className="mt-1 ml-4 list-disc text-[12px] text-slate-300">
          {details.map((d, i) => (
            <li key={`${i}-${d}`}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
