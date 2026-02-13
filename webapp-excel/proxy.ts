// webapp-excel/proxy.ts
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignorar API y estáticos
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|css|js|map)$/)
  ) {
    return NextResponse.next();
  }

  // Públicas
  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.next();
  }

  // Token JWT de NextAuth (v4)
  const token = await getToken({ req });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Forzar cambio de password
  if ((token as any).mustChangePassword && !pathname.startsWith("/change-password")) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
