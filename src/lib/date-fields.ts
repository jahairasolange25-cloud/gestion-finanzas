const pad = (n: number) => String(n).padStart(2, "0");

/** ISO week number (1-53) para SQLite sin extensiones de fecha. */
export function getIsoWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

export interface DateFields {
  date: string;
  ts: number;
  year: number;
  month: number;
  quarter: number;
  semester: number;
  weekIso: number;
  day: number;
  dayOfWeek: number;
  hour: number;
}

/** Precalcula todos los campos de fecha para escrituras rápidas y agregaciones por índice. */
export function toDateFields(d: Date = new Date()): DateFields {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return {
    date: `${year}-${pad(month)}-${pad(d.getDate())}`,
    ts: d.getTime(),
    year,
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    semester: month <= 6 ? 1 : 2,
    weekIso: getIsoWeek(d),
    day: d.getDate(),
    dayOfWeek: d.getDay(),
    hour: d.getHours(),
  };
}

/** Parse "YYYY-MM-DD" a Date local (medianoche). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Fecha local "YYYY-MM-DD" de hoy. */
export function todayStr(): string {
  return toDateFields().date;
}

/** Inicio del mes actual "YYYY-MM-DD". */
export function monthStart(offset = 0, base = new Date()): string {
  return toDateFields(new Date(base.getFullYear(), base.getMonth() + offset, 1))
    .date;
}

export const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function formatDateShort(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

export function formatDayMonth(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}
