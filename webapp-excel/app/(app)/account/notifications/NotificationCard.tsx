//app/(app)/account/notifications/NotificationCard.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

type Props = {
  href: string | null;
  children: ReactNode;
  actions?: ReactNode;
};

export default function NotificationCard({ href, children, actions }: Props) {
  const router = useRouter();

  return (
    <div
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : -1}
      className="block rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 cursor-pointer"
      onClick={() => {
        if (href) router.push(href);
      }}
      onKeyDown={(e) => {
        if (!href) return;
        if (e.key === "Enter" || e.key === " ") router.push(href);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>

        {/* Acciones: NO deben disparar navegación */}
        {actions ? (
          <div
            className="flex flex-col items-end gap-2"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
