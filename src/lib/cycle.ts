import { MONTH_NAMES, todayStr } from "./date-fields";

const pad = (n: number) => String(n).padStart(2, "0");

/** Día de pago: el ciclo va del 25 de un mes al 24 del mes siguiente. */
export const CYCLE_START_DAY = 25;

/** Clave "YYYY-MM" del ciclo al que pertenece una fecha "YYYY-MM-DD" (mes en que inicia). */
export function cycleKeyOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (d >= CYCLE_START_DAY) return `${y}-${pad(m)}`;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${pad(pm)}`;
}

export function todayCycleKey(): string {
  return cycleKeyOf(todayStr());
}

/** Límites del ciclo: del 25 (inicio) al 24 del mes siguiente (fin). */
export function cycleBounds(key: string): { start: string; end: string } {
  const [y, m] = key.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: `${y}-${pad(m)}-25`, end: `${ny}-${pad(nm)}-24` };
}

export function nextCycleKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

export function prevCycleKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

const monthShort = (m: number) => MONTH_NAMES[m - 1].slice(0, 3).toLowerCase();

/** "25 sep – 24 oct" para una clave de ciclo. */
export function cycleLabel(key: string): string {
  const [, m] = key.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  return `25 ${monthShort(m)} – 24 ${monthShort(nm)}`;
}

/** "Ciclo 25 sep – 24 oct 2026". */
export function cycleFullLabel(key: string): string {
  const [y] = key.split("-").map(Number);
  return `Ciclo ${cycleLabel(key)} ${y}`;
}

/** Días calendario que faltan hasta el próximo 25 (próximo pago). */
export function daysUntilNextPayday(from: Date = new Date()): number {
  const y = from.getFullYear();
  const m = from.getMonth();
  const d = from.getDate();
  const target =
    d >= CYCLE_START_DAY
      ? new Date(y, m + 1, CYCLE_START_DAY)
      : new Date(y, m, CYCLE_START_DAY);
  const today = new Date(y, m, d);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Fecha "YYYY-MM-DD" del próximo 25. */
export function nextPaydayStr(from: Date = new Date()): string {
  const y = from.getFullYear();
  const m = from.getMonth();
  const d = from.getDate();
  const target =
    d >= CYCLE_START_DAY
      ? new Date(y, m + 1, CYCLE_START_DAY)
      : new Date(y, m, CYCLE_START_DAY);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

/** Cantidad de días del ciclo. */
export function cycleDays(key: string): number {
  const { start, end } = cycleBounds(key);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = new Date(sy, sm - 1, sd);
  const b = new Date(ey, em - 1, ed);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/**
 * Reparte un monto en céntimos según porcentajes.
 * El residuo por redondeo se asigna a los que tengan mayor fracción.
 */
export function splitByPct(
  amountCents: number,
  items: ReadonlyArray<{ id: string; pct: number }>,
): Array<{ id: string; amountCents: number }> {
  const positive = items.filter((i) => i.pct > 0);
  const totalPct = positive.reduce((s, i) => s + i.pct, 0);
  if (totalPct <= 0 || amountCents <= 0) return [];

  const parts = positive.map((it) => {
    const exact = (amountCents * it.pct) / totalPct;
    const floor = Math.floor(exact);
    return { id: it.id, amountCents: floor, frac: exact - floor };
  });

  let remainder = amountCents - parts.reduce((s, p) => s + p.amountCents, 0);
  const order = [...parts].sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (remainder > 0) {
    order[idx % order.length].amountCents += 1;
    remainder -= 1;
    idx += 1;
  }

  return parts.map((p) => ({ id: p.id, amountCents: p.amountCents }));
}
