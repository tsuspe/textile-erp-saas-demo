/**
 * Exporta maestros usando PrismaClient (da igual cómo se llamen las tablas en SQLite).
 * Exporta: Empresa, Temporada, Subfamilia, Cliente
 *
 * Uso:
 *   node scripts/export-prisma-maestros.cjs
 *
 * Requisitos:
 *   DATABASE_URL apuntando a tu SQLite actual (la misma que usa la app)
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const OUT_DIR = path.join(process.cwd(), "prisma", "_export");
const OUT_FILE = path.join(OUT_DIR, "maestros.json");

function safeMkdir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function main() {
  safeMkdir(OUT_DIR);

  // Exporta con orden estable
  const empresa = await prisma.empresa.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, nombre: true, createdAt: true, updatedAt: true },
  });

  const temporada = await prisma.temporada.findMany({
    orderBy: { id: "asc" },
    select: { id: true, codigo: true, descripcion: true, createdAt: true, updatedAt: true },
  });

  const subfamilia = await prisma.subfamilia.findMany({
    orderBy: { id: "asc" },
    select: { id: true, codigo: true, descripcion: true, createdAt: true, updatedAt: true },
  });

  const cliente = await prisma.cliente.findMany({
    orderBy: [{ empresaId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      codigo: true,
      nombre: true,
      empresaId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL ? "[set]" : "[missing]",
    counts: {
      empresa: empresa.length,
      temporada: temporada.length,
      subfamilia: subfamilia.length,
      cliente: cliente.length,
    },
    data: { empresa, temporada, subfamilia, cliente },
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ Export OK -> ${OUT_FILE}`);
  console.log("Counts:", payload.counts);
}

main()
  .catch((e) => {
    console.error("❌ Export error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
