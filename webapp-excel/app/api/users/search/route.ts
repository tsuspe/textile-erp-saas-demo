//app/api/users/search/route.ts

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getAppSession();
  const me = (session as any)?.user as SessionUser | undefined;
  if (!me?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: me.id },
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 8,
    select: { id: true, username: true, name: true },
    orderBy: { username: "asc" },
  });

  return NextResponse.json({ users });
}
