/* E2E smoke: flujo de captura + cola offline + flush.
 * Uso: node scripts/e2e.mjs (requiere `npm run dev` corriendo en :3000)
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;

function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });

// ---- 1. Captura optimista (online) ----
const monto = page.getByRole("textbox", { name: "Monto en soles" });
await monto.fill("7.20");
await page.getByRole("button", { name: "Café", exact: true }).click();
await page.getByRole("textbox", { name: "¿En qué fue? (opcional)" }).fill("Café e2e");
await page.getByRole("button", { name: /Guardar/ }).click();

await page.getByText("Café e2e").first().waitFor({ timeout: 5000 });
check("Captura online: fila aparece en Recientes", true);

// ---- 2. Cola offline ----
// Warm-up: segundo load online para que el SW tome control y cachee chunks/API
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
await ctx.setOffline(true);
page.on("console", (msg) => {
  if (msg.text().includes("pwa-sync")) console.log("PAGE:", msg.text());
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const offlineMode = await page.evaluate(() => navigator.onLine === false);
check("Offline: navigator.onLine se detecta", offlineMode);

const banner = page.locator('[role="status"]').first();
await banner.waitFor({ timeout: 5000 }).catch(() => {});
check("Offline: banner de estado visible", await banner.isVisible().catch(() => false));
if (!(await banner.isVisible().catch(() => false))) {
  const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("DEBUG body:", JSON.stringify(body));
}

await monto.fill("15.80");
await page.getByRole("button", { name: "Alimentación", exact: true }).click();
await page.getByRole("textbox", { name: "¿En qué fue? (opcional)" }).fill("Mercado offline");
await page.getByRole("button", { name: /Guardar/ }).click();

await page.getByText("Mercado offline").first().waitFor({ timeout: 5000 });
check("Offline: gasto se guarda localmente (optimistic)", true);

const pending = await page.getByText(/Pendiente de sincronizar/).count();
check("Offline: fila marcada como pendiente", pending > 0);

const badge = await page.getByText(/1 pendiente/).count();
check("Offline: contador de pendientes visible", badge > 0);

// ---- 3. Reconexión y flush ----
await ctx.setOffline(false);
await page.waitForTimeout(2500);
await page.waitForLoadState("networkidle").catch(() => {});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const pendingAfter = await page.getByText(/Pendiente de sincronizar/).count();
check("Reconexión: pendientes sincronizados", pendingAfter === 0);

const badgeAfter = await page.getByText(/pendiente/).count();
check("Reconexión: contador de pendientes limpiado", badgeAfter === 0);

await page.getByText("Mercado offline").first().waitFor({ timeout: 5000 }).catch(() => {});
const synced = await page.getByText("Mercado offline").count();
check("Reconexión: fila sigue visible tras sync", synced > 0);

// ---- 4. Persistencia en servidor ----
await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
await page.getByRole("combobox", { name: "Mes" }).selectOption({ label: "Agosto 2026" });
await page.getByRole("combobox", { name: "Categoría" }).selectOption({ label: "Café" });
await page.waitForTimeout(800);
const e2eRows = await page.getByText("Café e2e").count();
check("Servidor: fila persistida (búsqueda en historial)", e2eRows > 0);

console.log(failures === 0 ? "\n✅ E2E completo sin fallos" : `\n❌ ${failures} fallo(s)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
