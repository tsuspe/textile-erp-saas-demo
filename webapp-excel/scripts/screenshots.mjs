import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "docs/images");

const DEFAULT_EMPRESA = process.env.DEMO_TOUR_EMPRESA || "northwind-demo";
const DEMO_USER = process.env.DEMO_USER || "demo_admin";
const DEMO_PASS = process.env.DEMO_PASS || "demo1234";

function out(name) {
  return path.join(OUT_DIR, name);
}

async function safeClick(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    try {
      if (await loc.first().isVisible()) {
        await loc.first().click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

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

  await page.waitForLoadState("networkidle").catch(() => {});
}

async function gotoAndShot(page, urlPath, fileName) {
  await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(350);

  await page.screenshot({ path: out(fileName), fullPage: true });
  console.log(`✓ ${fileName}  <-  ${urlPath}`);
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

  await login(page);

  await gotoAndShot(page, `/${DEFAULT_EMPRESA}`, "01-dashboard.png");
  await gotoAndShot(page, `/${DEFAULT_EMPRESA}/maestros`, "02-maestros.png");
  await gotoAndShot(page, `/${DEFAULT_EMPRESA}/maestros/clientes`, "03-clientes.png");
  await gotoAndShot(page, `/${DEFAULT_EMPRESA}/fichas`, "04-fichas.png");
  await gotoAndShot(page, `/${DEFAULT_EMPRESA}/rrhh/control-horario`, "05-rrhh-control-horario.png");
  await gotoAndShot(page, `/${DEFAULT_EMPRESA}/demo-tour`, "06-demo-tour.png");

  await browser.close();
  console.log(`\nListo. PNGs en ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("❌ screenshots falló:", err);
  process.exit(1);
});
