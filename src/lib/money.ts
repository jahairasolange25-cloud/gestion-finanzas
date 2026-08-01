export const CURRENCY = "PEN";
export const LOCALE = "es-PE";

/** Formatea céntimos como S/ 1,234.56 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(cents / 100);
}

/** Formatea sin símbolo ni decimales cuando no aplican: 1,234.56 */
export function formatNumber(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Parsea input del usuario ("12.50", "12,50", "S/ 12") a céntimos. */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
