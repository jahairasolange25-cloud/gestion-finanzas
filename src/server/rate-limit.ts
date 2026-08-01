/** Rate limiting en memoria (ventana deslizante por clave).
 *  Suficiente para 1 instancia serverless: es una barrera de disuasión,
 *  no un firewall distribuido. Las claves se purgan con un barrido
 *  amortizado al crecer el mapa. */

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, hits] of buckets) {
      const cutoff = Date.now() - windowMs;
      buckets.delete(k);
      if (hits.some((t) => t >= cutoff)) {
        buckets.set(k, hits.filter((t) => t >= cutoff));
      }
    }
  }

  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t >= cutoff);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: hits[0] + windowMs - now };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}

export function clientIp(req: Request | undefined): string {
  if (!req) return "unknown";
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Solo para tests: vacía los buckets entre pruebas. */
export function clearRateLimits(): void {
  buckets.clear();
}
