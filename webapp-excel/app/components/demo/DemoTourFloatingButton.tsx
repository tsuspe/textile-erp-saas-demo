"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const LAST_EMPRESA_KEY = "last_empresa_slug";
const RESERVED_SEGMENTS = new Set([
  "account",
  "tools",
  "admin",
  "login",
  "logout",
  "register",
  "change-password",
  "api",
]);

function extractEmpresaFromPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (!first || RESERVED_SEGMENTS.has(first)) return null;
  return first;
}

export default function DemoTourFloatingButton({
  empresaSlug,
  rightShiftPx = 0,
}: {
  empresaSlug?: string;
  rightShiftPx?: number;
}) {
  const pathname = usePathname();

  const computedHref = useMemo(() => {
    const fromProp = (empresaSlug ?? "").trim();
    if (fromProp) {
      return `/${fromProp}/demo-tour`;
    }

    const fromPath = extractEmpresaFromPath(pathname ?? "");
    if (fromPath) {
      return `/${fromPath}/demo-tour`;
    }
    return "/";
  }, [empresaSlug, pathname]);
  const [href, setHref] = useState(computedHref);

  useEffect(() => {
    setHref(computedHref);
    if (computedHref !== "/") {
      try {
        const slug = computedHref.split("/").filter(Boolean)[0] ?? "";
        if (slug) localStorage.setItem(LAST_EMPRESA_KEY, slug);
      } catch {}
      return;
    }

    try {
      const fromStorage = (localStorage.getItem(LAST_EMPRESA_KEY) ?? "").trim();
      if (fromStorage) setHref(`/${fromStorage}/demo-tour`);
    } catch {}
  }, [computedHref]);

  const rightPx = 24 + rightShiftPx;

  return (
    <Link
      href={href}
      style={{ right: rightPx }}
      className="print-hide fixed bottom-24 z-50 inline-flex h-10 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/20 px-4 text-sm font-semibold leading-none text-cyan-200 shadow-lg backdrop-blur transition-[right] duration-200 hover:bg-cyan-500/30"
      title="Volver al Demo Tour"
    >
      Demo Tour
    </Link>
  );
}
