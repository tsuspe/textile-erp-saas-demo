import type { NextRequest } from "next/server";

export function absUrl(req: NextRequest, path: string) {
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host");

  const proto =
    req.headers.get("x-forwarded-proto") ?? "http";

  const base = host ? `${proto}://${host}` : req.nextUrl.origin;

  return new URL(path, base);
}
