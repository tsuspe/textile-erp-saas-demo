/**
 * Importa maestros a Postgres manteniendo IDs.
 * Orden importante por FK: Empresa -> Temporada/Subfamilia -> Cliente
 *
 * Uso:
 *   node scripts/import-postgres-maestros.cjs
 *
 * Requisitos:
 *   DATABASE_URL apuntando a Postgres
 *   prisma generate hecho
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const IN_FILE = path.join(process.cwd(), "prisma", "_export", "maestros.json");

async function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`❌ No existe: ${IN_FILE}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
  const { empresa, temporada, subfamilia, cliente } = raw.data;

  await prisma.$transaction(async (tx) => {
    // 1) Empresa (slug unique)
    for (const row of empresa) {
      await tx.empresa.upsert({
        where: { id: row.id },
        update: { slug: row.slug, nombre: row.nombre },
        create: { ...row },
      });
    }

    // 2) Temporada (codigo unique)
    for (const row of temporada) {
      await tx.temporada.upsert({
        where: { id: row.id },
        update: { codigo: row.codigo, descripcion: row.descripcion },
        create: { ...row },
      });
    }

    // 3) Subfamilia (codigo unique)
    for (const row of subfamilia) {
      await tx.subfamilia.upsert({
        where: { id: row.id },
        update: { codigo: row.codigo, descripcion: row.descripcion },
        create: { ...row },
      });
    }

    // 4) Cliente (unique [empresaId, codigo], y FK a Empresa)
    for (const row of cliente) {
      await tx.cliente.upsert({
        where: { id: row.id },
        update: { codigo: row.codigo, nombre: row.nombre, empresaId: row.empresaId },
        create: { ...row },
      });
    }
  });

  // Ajustar secuencias (para que el siguiente autoincrement no choque)
  // OJO: aquí uso nombres de tabla por defecto (Prisma en Postgres suele crear "Empresa", "Cliente"...)
  // Si te falla por nombre de tabla, pegamos el error y lo ajusto.
  await prisma.$executeRawUnsafe(`
    SELECT setval(pg_get_serial_sequence('"Empresa"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Empresa"));
  `);
  await prisma.$executeRawUnsafe(`
    SELECT setval(pg_get_serial_sequence('"Temporada"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Temporada"));
  `);
  await prisma.$executeRawUnsafe(`
    SELECT setval(pg_get_serial_sequence('"Subfamilia"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Subfamilia"));
  `);
  await prisma.$executeRawUnsafe(`
    SELECT setval(pg_get_serial_sequence('"Cliente"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Cliente"));
  `);

  console.log("✅ Import OK + sequences OK");
}

main()
  .catch((e) => {
    console.error("❌ Import error:", e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
