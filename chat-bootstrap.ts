// lib/chat-bootstrap.ts
import { prisma } from "@/lib/prisma";
import { ChatThreadType, GroupKey } from "@prisma/client";

/**
 * Bootstrap de canales:
 * - 1 GLOBAL ("General")
 * - 1 por cada GroupKey (type=GROUP + groupKey)
 *
 * Lo llamaremos desde páginas server-side (account/chat) para auto-curación.
 * Si alguien borra un canal por error, vuelve a aparecer.
 */
export async function ensureDefaultChatThreads() {
  // GLOBAL
  await prisma.chatThread.upsert({
    where: {
      // No tenemos unique para GLOBAL, así que usamos un "truco" con findFirst + create
      // (upsert no sirve sin unique). Lo resolvemos con transacción más abajo.
      id: "__unused__", // placeholder
    },
    update: {},
    create: {
      type: ChatThreadType.GLOBAL,
      name: "General",
    },
  }).catch(async () => {
    // fallback: si falla por el where fake, hacemos el enfoque real:
    const existing = await prisma.chatThread.findFirst({
      where: { type: ChatThreadType.GLOBAL },
      select: { id: true },
    });
    if (!existing) {
      await prisma.chatThread.create({
        data: { type: ChatThreadType.GLOBAL, name: "General" },
      });
    }
  });

  // GROUPS (aquí sí hay unique [type, groupKey])
  const allKeys = Object.values(GroupKey);

  for (const key of allKeys) {
    await prisma.chatThread.upsert({
      where: {
        type_groupKey: { type: ChatThreadType.GROUP, groupKey: key },
      },
      update: {
        name: keyToChannelName(key),
      },
      create: {
        type: ChatThreadType.GROUP,
        groupKey: key,
        name: keyToChannelName(key),
      },
    });
  }
}

function keyToChannelName(key: GroupKey): string {
  // nombres “humanos”
  switch (key) {
    case GroupKey.ADMIN:
      return "Admin";
    case GroupKey.RRHH:
      return "RRHH";
    case GroupKey.ALMACEN:
      return "Almacén";
    case GroupKey.PRODUCCION:
      return "Producción";
    case GroupKey.PATRONAJE:
      return "Patronaje";
    case GroupKey.CONTABILIDAD:
      return "Contabilidad";
    default:
      return String(key);
  }
}
