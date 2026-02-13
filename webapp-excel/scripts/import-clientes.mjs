import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

/**
 * Uso:
 *   node scripts/import-clientes.mjs buspar "/home/aitor/Documentos/Clientes_Buspar.csv"
 */
async function main() {
  const empresaSlug = process.argv[2];
  const csvPathArg = process.argv[3];

  if (!empresaSlug || !csvPathArg) {
    console.error("Uso: node scripts/import-clientes.mjs <empresaSlug> <csvPath>");
    process.exit(1);
  }

  const empresa = await prisma.empresa.findUnique({
    where: { slug: empresaSlug },
    select: { id: true, slug: true, nombre: true },
  });
  if (!empresa) throw new Error(`No existe empresa con slug "${empresaSlug}"`);

  // --- leer CSV ---
  const csvPath = path.resolve(csvPathArg);
  const raw = fs.readFileSync(csvPath, "latin1");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const [header, ...rows] = lines;
  const sep = header.includes(";") ? ";" : ",";

  const headers = header.split(sep).map((h) => h.trim().toLowerCase());

  const idxCodigo = headers.findIndex((h) => h.includes("familia") || h.includes("codigo"));
  const idxNombre = headers.findIndex((h) => h.includes("descrip") || h.includes("nombre"));

  if (idxCodigo === -1 || idxNombre === -1) {
    throw new Error(`No puedo detectar columnas. Cabecera: "${header}"`);
  }

  // --- codigos existentes en esa empresa ---
  const existentes = await prisma.cliente.findMany({
    where: { empresaId: empresa.id },
    select: { codigo: true },
  });
  const setExistentes = new Set(existentes.map((e) => e.codigo));

  const data = [];
  const repetidosCsv = new Set(); // por si el CSV trae duplicados internos

  for (const line of rows) {
    const cols = line.split(sep);

    const codigoRaw = String(cols[idxCodigo] ?? "").trim();
    const nombreRaw = String(cols[idxNombre] ?? "").trim();
    if (!codigoRaw || !nombreRaw) continue;

    const codigo = /^\d+$/.test(codigoRaw) ? codigoRaw.padStart(2, "0") : codigoRaw;

    // si ya existe en BD -> saltar
    if (setExistentes.has(codigo)) continue;

    // si el propio CSV repite -> saltar
    if (repetidosCsv.has(codigo)) continue;
    repetidosCsv.add(codigo);

    data.push({
      empresaId: empresa.id,
      codigo,
      nombre: nombreRaw,
    });
  }

  if (!data.length) {
    console.log(`Nada que importar: todo ya existe o no hay filas válidas.`);
    return;
  }

  // --- crear en bloque (sin skipDuplicates) ---
  // si alguno se cuela por carrera, te saltaría P2002; en ese caso hacemos fallback uno a uno
  try {
    const result = await prisma.cliente.createMany({ data });
    console.log(`Empresa: ${empresa.slug} | ${empresa.nombre}`);
    console.log(`CSV: ${csvPath}`);
    console.log(`Nuevos a crear: ${data.length}`);
    console.log(`Creados: ${result.count}`);
  } catch (e) {
    console.error("createMany falló, hago fallback uno a uno (por si hay duplicados):", e?.code ?? e);

    let creados = 0;
    let duplicados = 0;

    for (const item of data) {
      try {
        await prisma.cliente.create({ data: item });
        creados++;
      } catch (err) {
        if (err?.code === "P2002") duplicados++;
        else console.error("Error creando", item.codigo, err);
      }
    }

    console.log(`Creados (fallback): ${creados}`);
    console.log(`Duplicados (fallback): ${duplicados}`);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
