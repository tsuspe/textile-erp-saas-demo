//app/(app)/account/chat/actions.ts

"use server";

import { getAppSession, type SessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { ChatThreadType } from "@prisma/client";

function normalizePair(a: string, b: string) {
  return a < b ? [a, b] as const : [b, a] as const;
}

export async function getOrCreateDmThreadByUsername(usernameRaw: string) {
  const session = await getAppSession();
  const me = (session as any)?.user as SessionUser | undefined;
  if (!me?.id) throw new Error("UNAUTHORIZED");

  const username = usernameRaw.trim().replace(/^@/, "");
  if (!username) throw new Error("BAD_USERNAME");

  const other = await prisma.user.findUnique({
    where: { username },
    select: { id: true, name: true, username: true, isActive: true },
  });

  if (!other?.id || other.isActive === false) throw new Error("USER_NOT_FOUND");
  if (other.id === me.id) throw new Error("CANNOT_DM_SELF");

  const [a, b] = normalizePair(me.id, other.id);

  // busca DM existente por pareja (ordenada)
  const existing = await prisma.chatThread.findFirst({
    where: {
      type: ChatThreadType.DM,
      OR: [
        { dmAId: a, dmBId: b },
        { dmAId: b, dmBId: a },
      ],
    },
    select: { id: true },
  });

  if (existing?.id) return { threadId: existing.id };

  const created = await prisma.chatThread.create({
    data: {
      type: ChatThreadType.DM,
      dmAId: a,
      dmBId: b,
      name: null,
    },
    select: { id: true },
  });

  return { threadId: created.id };
}
