const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ROOT = __dirname;
const TEMPORADAS_CSV = path.join(ROOT, "demo-data", "temporadas.csv");
const CLIENTES_CSV = path.join(ROOT, "demo-data", "clientes.csv");
const SUBFAMILIAS_CSV = path.join(ROOT, "demo-data", "subfamilias.csv");

function loadCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];
  const sep = lines[0].includes(";") ? ";" : ",";

  return lines.slice(1).map((line) => line.split(sep).map((col) => col.trim()));
}

async function importTemporadas() {
  const rows = loadCsv(TEMPORADAS_CSV);
  for (const [codigo, descripcion] of rows) {
    if (!codigo || !descripcion) continue;
    await prisma.temporada.upsert({
      where: { codigo: String(codigo) },
      update: { descripcion: String(descripcion) },
      create: { codigo: String(codigo), descripcion: String(descripcion) },
    });
  }
  console.log(`Temporadas importadas: ${rows.length}`);
}

async function importSubfamilias() {
  const rows = loadCsv(SUBFAMILIAS_CSV);
  for (const [codigo, descripcion] of rows) {
    if (!codigo || !descripcion) continue;
    await prisma.subfamilia.upsert({
      where: { codigo: String(codigo) },
      update: { descripcion: String(descripcion) },
      create: { codigo: String(codigo), descripcion: String(descripcion) },
    });
  }
  console.log(`Subfamilias importadas: ${rows.length}`);
}

async function importClientes() {
  const empresa = await prisma.empresa.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!empresa) {
    console.log("No hay empresas. Ejecuta primero el seed demo.");
    return;
  }

  const rows = loadCsv(CLIENTES_CSV);
  for (const [codigo, nombre] of rows) {
    if (!codigo || !nombre) continue;
    await prisma.cliente.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: String(codigo) } },
      update: { nombre: String(nombre) },
      create: { empresaId: empresa.id, codigo: String(codigo), nombre: String(nombre) },
    });
  }
  console.log(`Clientes importados: ${rows.length}`);
}

async function main() {
  await importTemporadas();
  await importSubfamilias();
  await importClientes();
}

main()
  .catch((e) => {
    console.error("Error importando maestros demo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
