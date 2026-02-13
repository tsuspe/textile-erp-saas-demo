/**
 * Exporta maestros desde SQLite a JSON para migrarlos a Postgres.
 * Exporta: empresa, cliente, temporada, subfamilia
 *
 * Requisitos:
 *   npm i better-sqlite3
 *
 * Uso:
 *   node scripts/export-sqlite-maestros.cjs
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), "prisma", "dev.db");
const OUT_DIR = path.join(process.cwd(), "prisma", "_export");
const OUT_FILE = path.join(OUT_DIR, "maestros.json");

function safeMkdir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ No existe la SQLite en: ${DB_PATH}`);
    process.exit(1);
  }

  safeMkdir(OUT_DIR);

  const db = new Database(DB_PATH, { readonly: true });

  // Ajusta nombres de tabla si en tu schema tienen otro nombre.
  // Por defecto Prisma usa el modelo como tabla con el mismo nombre (a veces pluralizado según @@map).
  const empresa = db.prepare(`SELECT * FROM Empresa ORDER BY id`).all();
  const cliente = db.prepare(`SELECT * FROM Cliente ORDER BY id`).all();
  const temporada = db.prepare(`SELECT * FROM Temporada ORDER BY id`).all();
  const subfamilia = db.prepare(`SELECT * FROM Subfamilia ORDER BY id`).all();

  const payload = {
    exportedAt: new Date().toISOString(),
    sqlitePath: DB_PATH,
    counts: { empresa: empresa.length, cliente: cliente.length, temporada: temporada.length, subfamilia: subfamilia.length },
    data: { empresa, cliente, temporada, subfamilia },
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ Export OK -> ${OUT_FILE}`);
}

main();
