//app/(app)/actions/realtime.ts
"use server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import jwt from "jsonwebtoken";

function requireUser(user?: SessionUser) {
  if (!user?.id) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function getRealtimeToken() {
  const session = await getAppSession();
  const user = requireUser((session as any)?.user);

  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) throw new Error("MISSING_REALTIME_JWT_SECRET");

  // JWT estándar: sub = userId
  const token = jwt.sign(
    { sub: user.id, username: (user as any)?.username ?? null },
    secret,
    { expiresIn: "2h" },
  );

  return { ok: true as const, token };
}
