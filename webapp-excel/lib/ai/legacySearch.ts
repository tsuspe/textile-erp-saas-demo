// lib/ai/legacySearch.ts
// Búsqueda ligera de archivos dentro de LEGACY_ROOT.
// - No usa Prisma (esto es FS puro)
// - Tiene límites de tiempo/escaneo para no bloquear el servidor
// - Devuelve rutas relativas para abrirlas en /legacy

import fs from "fs/promises";
import path from "path";

export type LegacyHit = {
  name: string;
  relPath: string; // ruta relativa dentro de LEGACY_ROOT (con "/")
  ext: string;
  size: number;
  mtime: Date;
};

export type LegacySearchResult =
  | {
      ok: true;
      query: string;
      hits: LegacyHit[];
      truncated: boolean;
      scanned: number;
    }
  | { ok: false; error: string };

function getLegacyRootOrThrow() {
  const root = process.env.LEGACY_ROOT?.trim();
  if (!root) throw new Error("LEGACY_ROOT no configurado");
  return root;
}

function normalizeText(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureInsideRoot(root: string, full: string) {
  const rootResolved = path.resolve(root);
  const fullResolved = path.resolve(full);
  const rel = path.relative(rootResolved, fullResolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Fuera de root");
  return fullResolved;
}

function toRelUnix(root: string, full: string) {
  const rel = path.relative(path.resolve(root), path.resolve(full));
  // normalizamos a "/" porque legacy/page.tsx ya trabaja así
  return rel.split(path.sep).join("/");
}

function extOk(ext: string) {
  const e = (ext ?? "").toLowerCase();
  return [".xlsx", ".xls", ".csv", ".pdf"].includes(e);
}

type SearchOpts = {
  query: string;
  startRelPath?: string; // opcional: buscar desde subcarpeta
  limit?: number; // resultados
  maxDepth?: number;
  maxScanned?: number; // máximo ficheros/dirents procesados
  timeBudgetMs?: number;
};

/**
 * Busca archivos por nombre (y opcionalmente por extensión).
 * Devuelve hits ordenados por "mejor match" (heurística simple).
 */
export async function searchLegacyFiles(opts: SearchOpts): Promise<LegacySearchResult> {
  try {
    const root = getLegacyRootOrThrow();

    const qRaw = (opts.query ?? "").trim();
    const q = normalizeText(qRaw);
    if (!q) return { ok: false, error: "Query vacía" };

    const limit = Math.min(Math.max(opts.limit ?? 12, 1), 50);
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 6, 1), 12);
    const maxScanned = Math.min(Math.max(opts.maxScanned ?? 5000, 200), 20000);
    const timeBudgetMs = Math.min(Math.max(opts.timeBudgetMs ?? 1200, 200), 8000);

    const startRel = (opts.startRelPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (startRel.includes("..")) return { ok: false, error: "Ruta inválida" };

    const startFull = ensureInsideRoot(root, path.join(root, startRel));

    const startTime = Date.now();
    let scanned = 0;
    let truncated = false;

    // BFS por carpetas para encontrar primero cosas "cerca"
    const queue: Array<{ dir: string; depth: number }> = [{ dir: startFull, depth: 0 }];
    const hits: Array<LegacyHit & { score: number }> = [];

    const qTokens = q.split(" ").filter(Boolean);

    while (queue.length) {
      if (Date.now() - startTime > timeBudgetMs) {
        truncated = true;
        break;
      }
      if (scanned >= maxScanned) {
        truncated = true;
        break;
      }

      const { dir, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      let dirents: any[] = [];
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const de of dirents) {
        scanned++;
        if (scanned >= maxScanned) {
          truncated = true;
          break;
        }
        if (Date.now() - startTime > timeBudgetMs) {
          truncated = true;
          break;
        }

        const full = path.join(dir, de.name);

        if (de.isDirectory()) {
          // ignoramos carpetas típicas “basura”
          const low = String(de.name).toLowerCase();
          if ([".git", "node_modules", "$recycle.bin", "system volume information"].includes(low)) continue;
          queue.push({ dir: full, depth: depth + 1 });
          continue;
        }

        if (!de.isFile()) continue;

        const ext = path.extname(de.name).toLowerCase();
        if (!extOk(ext)) continue;

        const nameNorm = normalizeText(de.name);
        const rel = toRelUnix(root, full);

        // Heurística de scoring:
        // - match exacto del nombre -> +100
        // - empieza por -> +70
        // - incluye -> +40
        // - tokens -> +10 por token
        let score = 0;
        if (nameNorm === q) score += 100;
        if (nameNorm.startsWith(q)) score += 70;
        if (nameNorm.includes(q)) score += 40;

        for (const t of qTokens) {
          if (t.length < 2) continue;
          if (nameNorm.includes(t)) score += 10;
        }

        // pequeño plus si el query contiene extensión y coincide
        if (/\.(xlsx|xls|csv|pdf)\b/i.test(qRaw)) {
          if (qRaw.toLowerCase().includes(ext)) score += 15;
        }

        if (score <= 0) continue;

        let st: any = null;
        try {
          st = await fs.stat(full);
        } catch {
          // si no podemos stat, lo metemos igual con size 0
        }

        hits.push({
          name: de.name,
          relPath: rel,
          ext,
          size: st?.size ?? 0,
          mtime: st?.mtime ?? new Date(0),
          score,
        });

        // “early stop” si ya tenemos muchos candidatos
        if (hits.length > limit * 6) {
          // seguimos un poquito, pero no infinito
        }
      }

      if (truncated) break;
    }

    hits.sort((a, b) => b.score - a.score || Number(b.mtime) - Number(a.mtime));

    const finalHits: LegacyHit[] = hits.slice(0, limit).map(({ score, ...h }) => h);

    return { ok: true, query: qRaw, hits: finalHits, truncated, scanned };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error buscando en legacy" };
  }
}
