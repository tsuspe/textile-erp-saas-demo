const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

async function main() {
  const a = await p.chatThread.count();
  const b = await p.chatThreadMember.count();

  console.log("chatThread:", a);
  console.log("chatThreadMember:", b);

  const sample = await p.chatThread.findMany({
    take: 30,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
      groupKey: true,
      empresaId: true,
      name: true,
      _count: {
        select: { members: true, messages: true },
      },
    },
  });

  console.log(sample);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
