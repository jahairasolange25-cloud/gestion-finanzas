type Level = "info" | "warn" | "error";

/** Log estructurado en una línea JSON (lo que agrupa Vercel nativamente). */
export function log(
  level: Level,
  message: string,
  meta: Record<string, unknown> = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
