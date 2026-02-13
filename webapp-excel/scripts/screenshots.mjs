import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "docs/images");

const DEFAULT_EMPRESA = process.env.DEMO_TOUR_EMPRESA || "northwind-demo";
const DEMO_USER = process.env.DEMO_USER || "demo_admin";
const DEMO_PASS = process.env.DEMO_PASS || "demo1234";
const MAX_SOFT_FAILURES = 2;

function out(name) {
  return path.join(OUT_DIR, name);
}

function pathnameFrom(page) {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "";
  }
}

async function waitStable(page) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function shot(page, name) {
  const file = out(name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${name}`);
}

async function goto(page, urlPath, opts = {}) {
  const target = urlPath.startsWith("http") ? urlPath : `${BASE_URL}${urlPath}`;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await waitStable(page);
  if (opts.tenant) await ensureTenant(page, opts.tenant);
}

async function safeClick(page, selectors, opts = {}) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    try {
      if ((await loc.count()) > 0 && (await loc.first().isVisible())) {
        await loc.first().scrollIntoViewIfNeeded().catch(() => {});
        await loc.first().click({ timeout: opts.timeout ?? 3_500 });
        await waitStable(page);
        return true;
      }
    } catch {}
  }
  return false;
}

async function clickFirstCardOrRow(page, selectors) {
  return safeClick(page, selectors, { timeout: 4_000 });
}

async function clickFirstLinkBy(page, predicate, maxScan = 250) {
  const links = page.locator("a[href]");
  const count = Math.min(await links.count(), maxScan);
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    try {
      const href = (await link.getAttribute("href")) || "";
      const text = ((await link.textContent()) || "").trim();
      if (!predicate({ href, text })) continue;
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ timeout: 4_000 });
      await waitStable(page);
      return true;
    } catch {}
  }
  return false;
}

async function waitAnyVisible(page, selectors, timeoutPerSelector = 2_000) {
  for (const sel of selectors) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout: timeoutPerSelector });
      return true;
    } catch {}
  }
  return false;
}

async function ensureTenant(page, empresa) {
  const p = pathnameFrom(page);
  if (p.startsWith(`/${empresa}`)) return;
  if (p.startsWith("/account") || p.startsWith("/tools")) return;
  console.warn(`[warn] fuera de tenant (${p || "unknown"}), regreso a /${empresa}`);
  await goto(page, `/${empresa}`);
}

async function login(page) {
  await goto(page, "/login");

  const userSelectors = [
    'input[name="username"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="username"]',
  ];
  const passSelectors = [
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
  ];

  let userFilled = false;
  for (const sel of userSelectors) {
    const loc = page.locator(sel);
    try {
      if (await loc.first().isVisible()) {
        await loc.first().fill(DEMO_USER);
        userFilled = true;
        break;
      }
    } catch {}
  }
  if (!userFilled) throw new Error("No encontré input de usuario/email en /login");

  let passFilled = false;
  for (const sel of passSelectors) {
    const loc = page.locator(sel);
    try {
      if (await loc.first().isVisible()) {
        await loc.first().fill(DEMO_PASS);
        passFilled = true;
        break;
      }
    } catch {}
  }
  if (!passFilled) throw new Error("No encontré input de password en /login");

  const clicked = await safeClick(page, [
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Login")',
    'button:has-text("Acceder")',
  ]);
  if (!clicked) throw new Error("No encontré botón de submit en /login");

  await waitStable(page);
}

async function openFirstEscandalloDetail(page, empresa) {
  await goto(page, `/${empresa}/fichas?soloConEscandallo=1`, { tenant: empresa });
  await waitAnyVisible(page, ['h1:has-text("Fichas técnicas")', "main"]);

  const clienteOk = await clickFirstCardOrRow(page, [
    'a:has-text("Ver temporadas")',
    'a[href^="/"][href*="/fichas/"]',
  ]);
  if (!clienteOk) throw new Error("No encontre cliente para abrir fichas");

  if (/\/fichas\/\d+$/.test(pathnameFrom(page))) {
    await safeClick(page, ['a[href*="soloConEscandallo=1"]']);
  }

  const temporadaOk = await clickFirstCardOrRow(page, [
    'a:has-text("Ver escandallos")',
    'a[href*="/temporadas/"]',
  ]);
  if (!temporadaOk) throw new Error("No encontre temporada para abrir escandallos");

  if (/\/temporadas\/\d+$/.test(pathnameFrom(page))) {
    await goto(page, `${pathnameFrom(page)}/escandallos`, { tenant: empresa });
  }

  const escandalloClicked = await clickFirstLinkBy(
    page,
    ({ href, text }) => {
      const h = href || "";
      const t = (text || "").toLowerCase();
      const looksEsc = /\/escandallos\/\d+(\/pedido|\/produccion\/pedido)?$/.test(h);
      const looksAction = /ver|ficha|pedido/.test(t);
      return looksEsc && looksAction;
    },
    350,
  );
  if (!escandalloClicked) {
    const fallbackOk = await clickFirstCardOrRow(page, [
      'a[href*="/escandallos/"]',
      'a:has-text("Ver ficha")',
      'a:has-text("Ver")',
    ]);
    if (!fallbackOk) throw new Error("No encontre escandallo para abrir detalle");
  }

  let current = pathnameFrom(page);
  const escBaseMatch = current.match(/(\/[^?#]*\/escandallos\/\d+)/);
  if (!escBaseMatch?.[1]) throw new Error(`Ruta de escandallo no valida: ${current}`);

  const escBase = escBaseMatch[1];
  if (!/\/escandallos\/\d+$/.test(current)) {
    const tabEscOk = await safeClick(page, [
      'a:has-text("Escandallo")',
      'a[href$="/escandallo"]',
    ]);
    if (!tabEscOk) {
      await goto(page, escBase, { tenant: empresa });
    }
    current = pathnameFrom(page);
  }

  if (!/\/escandallos\/\d+$/.test(current)) {
    await goto(page, escBase, { tenant: empresa });
    current = pathnameFrom(page);
  }

  if (!/\/escandallos\/\d+$/.test(current)) {
    throw new Error(`No pude fijar vista detalle de escandallo (${current})`);
  }

  await waitAnyVisible(page, ['h1:has-text("Escandallo")', "main"]);
  return current;
}

async function capture(page, failures, fileName, action) {
  try {
    await action();
    await shot(page, fileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ fileName, message });
    console.warn(`[warn] ${fileName} skipped: ${message}`);
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log(`[screenshots] BASE_URL=${BASE_URL}`);
  console.log(`[screenshots] empresa=${DEFAULT_EMPRESA}`);
  console.log(`[screenshots] user=${DEMO_USER}`);

  const failures = [];

  await login(page);

  await capture(page, failures, "01-dashboard.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Panel de empresa")', "main"]);
  });

  await capture(page, failures, "02-maestros.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}`, { tenant: DEFAULT_EMPRESA });
    const usedNav = await safeClick(page, ['header a:has-text("Maestros")']);
    if (!usedNav) await goto(page, `/${DEFAULT_EMPRESA}/maestros`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Maestros")', "main"]);
  });

  await capture(page, failures, "03-clientes.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}/maestros`, { tenant: DEFAULT_EMPRESA });
    const clicked = await safeClick(page, [
      'a:has-text("Clientes")',
      `a[href="/${DEFAULT_EMPRESA}/maestros/clientes"]`,
    ]);
    if (!clicked) await goto(page, `/${DEFAULT_EMPRESA}/maestros/clientes`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Clientes")', "main"]);
  });

  await capture(page, failures, "04-fichas.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}`, { tenant: DEFAULT_EMPRESA });
    const usedNav = await safeClick(page, ['header a:has-text("Fichas")']);
    if (!usedNav) await goto(page, `/${DEFAULT_EMPRESA}/fichas`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Fichas")', 'h1:has-text("Fichas técnicas")', "main"]);
  });

  await capture(page, failures, "05-rrhh-control-horario.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}/rrhh/control-horario`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Control horario")', "main"]);
  });

  await capture(page, failures, "06-demo-tour.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}/demo-tour`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Demo Tour")', "main"]);
  });

  let escandalloDetailPath = null;
  await capture(page, failures, "07-escandallo-detalle.png", async () => {
    escandalloDetailPath = await openFirstEscandalloDetail(page, DEFAULT_EMPRESA);
    await waitAnyVisible(page, ['h1:has-text("Escandallo")', "main"]);
  });

  await capture(page, failures, "08-almacen-stock.png", async () => {
    const detail = escandalloDetailPath || (await openFirstEscandalloDetail(page, DEFAULT_EMPRESA));
    await goto(page, `${detail}/almacen`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Ficha almacén")', 'h1:has-text("Ficha almac")', "main"]);
  });

  await capture(page, failures, "09-rrhh-control-horario.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}/rrhh`, { tenant: DEFAULT_EMPRESA });
    const clicked = await safeClick(page, ['a:has-text("Control horario")']);
    if (!clicked) await goto(page, `/${DEFAULT_EMPRESA}/rrhh/control-horario`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Control horario")', "main"]);
  });

  await capture(page, failures, "10-rrhh-vacaciones.png", async () => {
    await goto(page, `/${DEFAULT_EMPRESA}/rrhh`, { tenant: DEFAULT_EMPRESA });
    const clicked = await safeClick(page, ['a:has-text("Vacaciones")']);
    if (!clicked) await goto(page, `/${DEFAULT_EMPRESA}/rrhh/vacaciones`, { tenant: DEFAULT_EMPRESA });
    await waitAnyVisible(page, ['h1:has-text("Vacaciones")', "main"]);
  });

  await capture(page, failures, "11-chat.png", async () => {
    await goto(page, "/account");
    const clicked = await safeClick(page, ['a:has-text("Chat")', 'a[href="/account/chat"]']);
    if (!clicked) await goto(page, "/account/chat");
    await waitAnyVisible(page, ['h1:has-text("Chat")', 'div:has-text("Cuenta"):has-text("Chat")', "main"]);
  });

  await capture(page, failures, "12-notificaciones.png", async () => {
    await goto(page, "/account");
    const clicked = await safeClick(page, ['a:has-text("Notificaciones")', 'a[href="/account/notifications"]']);
    if (!clicked) await goto(page, "/account/notifications");
    await waitAnyVisible(page, ['h1:has-text("Notificaciones")', "main"]);
  });

  await capture(page, failures, "13-tools-almacen.png", async () => {
    await goto(page, "/");
    const clicked = await clickFirstLinkBy(page, ({ href }) => (href || "").startsWith("/tools/almacen"));
    if (!clicked) await goto(page, "/tools/almacen");
    await waitAnyVisible(page, ['h1:has-text("Herramientas · Almacén")', "main"]);
  });

  await capture(page, failures, "14-ediwin-parser.png", async () => {
    await goto(page, "/tools/almacen");
    const clicked = await clickFirstLinkBy(page, ({ href }) => href === "/tools/almacen/ediwin-parse");
    if (!clicked) await goto(page, "/tools/almacen/ediwin-parse");
    await waitAnyVisible(page, ['h1:has-text("EDIWIN Parser")', 'div:has-text("Paso 1 — Cargar PDF + previsualizar")', "main"]);
  });

  await capture(page, failures, "15-globalia-uniformes.png", async () => {
    await goto(page, "/tools/almacen");
    const clicked = await clickFirstLinkBy(page, ({ href }) => href === "/tools/almacen/globalia-stock");
    if (!clicked) await goto(page, "/tools/almacen/globalia-stock");
    await waitAnyVisible(page, ['h1:has-text("Globalia Stock")', 'div:has-text("Preview Stock")', "main"], 3_000);
    await waitStable(page);
  });

  await browser.close();

  if (failures.length) {
    console.warn("\n[screenshots] warning summary:");
    for (const f of failures) console.warn(`- ${f.fileName}: ${f.message}`);
  }

  console.log(`\nListo. PNGs en ${OUT_DIR}`);
  console.log(`[screenshots] done=${15 - failures.length} failed=${failures.length}`);

  if (failures.length > MAX_SOFT_FAILURES) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ screenshots falló:", err);
  process.exit(1);
});
