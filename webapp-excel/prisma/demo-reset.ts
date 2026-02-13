import { PrismaClient } from "@prisma/client";
import { runDemoSeed } from "./seed";

const prisma = new PrismaClient();

async function clearDemoData() {
  await prisma.notification.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatThreadMember.deleteMany();
  await prisma.chatThread.deleteMany();

  await prisma.timeDay.deleteMany();
  await prisma.timeVacationRequest.deleteMany();
  await prisma.timeVacationBalance.deleteMany();
  await prisma.timeCompanyVacation.deleteMany();
  await prisma.timeHoliday.deleteMany();

  await prisma.pedidoComentario.deleteMany();
  await prisma.pedidoColor.deleteMany();
  await prisma.pedidoAccesorio.deleteMany();
  await prisma.pedidoForro.deleteMany();
  await prisma.pedidoTejido.deleteMany();
  await prisma.pedido.deleteMany();

  await prisma.escandalloAccesorio.deleteMany();
  await prisma.escandalloForro.deleteMany();
  await prisma.escandalloTejido.deleteMany();
  await prisma.escandalloGasto.deleteMany();
  await prisma.escandallo.deleteMany();

  await prisma.aIInteraction.deleteMany();

  await prisma.articulo.deleteMany();
  await prisma.cliente.deleteMany();

  await prisma.userGroup.deleteMany();
  await prisma.userEmpresa.deleteMany();
  await prisma.user.deleteMany();
  await prisma.group.deleteMany();

  await prisma.subfamilia.deleteMany();
  await prisma.temporada.deleteMany();
  await prisma.empresa.deleteMany();
}

async function main() {
  console.log("Limpiando datos demo...");
  await clearDemoData();
  console.log("Re-seeding demo...");
  await runDemoSeed();
  console.log("demo-reset completado.");
}

main()
  .catch((e) => {
    console.error("demo-reset error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
