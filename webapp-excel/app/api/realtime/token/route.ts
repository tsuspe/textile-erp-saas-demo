// app/api/realtime/token/route.ts
import { getAppSession, type SessionUser } from "@/lib/auth-server";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  const user = (session as any)?.user as SessionUser | undefined;
  if (!user?.id) return NextResponse.json({ ok: false }, { status: 401 });

  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 });

  const token = jwt.sign(
    {
      sub: user.id,
      name: (user as any)?.name ?? "",
      username: (user as any)?.username ?? "",
      // Opcional: groups si luego quieres permisos en realtime
      // groups: (user as any)?.groups ?? [],
    },
    secret,
    { expiresIn: "2h" }
  );

  return NextResponse.json({ ok: true, token });
}
