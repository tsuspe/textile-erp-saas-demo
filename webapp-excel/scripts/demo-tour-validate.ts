import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDemoTourSteps } from "../app/(app)/[empresa]/demo-tour/_steps";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const empresa = "northwind-demo";
const base = `/${empresa}`;
const appEmpresaRoot = path.resolve(__dirname, "..", "app", "(app)", "[empresa]");
const appRoot = path.resolve(__dirname, "..", "app", "(app)");

function hrefToPagePath(href: string) {
  const cleanHref = href.split("?")[0]?.split("#")[0] ?? href;
  if (!cleanHref.startsWith("/")) return null;

  if (cleanHref.startsWith(base)) {
    const relativeRoute = cleanHref.slice(base.length).replace(/\/+$/, "");
    if (!relativeRoute) return path.join(appEmpresaRoot, "page.tsx");
    return path.join(appEmpresaRoot, relativeRoute.replace(/^\//, ""), "page.tsx");
  }

  const globalRoute = cleanHref.replace(/\/+$/, "");
  if (!globalRoute) return null;
  return path.join(appRoot, globalRoute.replace(/^\//, ""), "page.tsx");
}

const steps = getDemoTourSteps(empresa);
const missing: { id: number; href: string; expectedPath: string }[] = [];

for (const step of steps) {
  const hrefs = [step.href, ...(step.links?.map((l) => l.href) ?? [])];

  for (const href of hrefs) {
    const expectedPath = hrefToPagePath(href);
    if (!expectedPath || !fs.existsSync(expectedPath)) {
      missing.push({
        id: step.id,
        href,
        expectedPath: expectedPath ?? "(invalid href format)",
      });
    }
  }
}

if (missing.length) {
  console.error("Demo Tour route validation failed:");
  for (const item of missing) {
    console.error(`- Step ${item.id}: ${item.href} -> ${item.expectedPath}`);
  }
  process.exit(1);
}

console.log(`Demo Tour routes OK (${steps.length} steps validated)`);
