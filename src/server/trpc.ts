import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { getSession } from "./session";
import { clientIp, rateLimit } from "./rate-limit";
import { log } from "./logger";

const t = initTRPC.context<Context>().create();

/** Anti-CSRF: el Origin (si existe) debe coincidir con el host; si no hay
 *  Origin, se aceptan peticiones same-origin/sin señal (SameSite=Lax ya
 *  bloquea cookies en POST cross-site, esto es defensa en profundidad). */
function isSameOrigin(req: Request | undefined): boolean {
  if (!req) return true;
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const sfs = req.headers.get("sec-fetch-site");
  return sfs === null || sfs === "same-origin" || sfs === "none";
}

const originCheck = t.middleware(({ ctx, next, type }) => {
  if (type === "mutation" && !isSameOrigin(ctx.req)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Origen no válido" });
  }
  return next();
});

const rateLimiter = t.middleware(({ ctx, next, type }) => {
  const limit = type === "mutation" ? 120 : 600;
  const rl = rateLimit(`ip:${clientIp(ctx.req)}:${type}`, limit, 60_000);
  if (!rl.ok) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  }
  return next();
});

const sessionGuard = t.middleware(async ({ ctx, next }) => {
  const auth = await getSession(ctx.db, ctx.req);
  if (!auth) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesión requerida" });
  }
  return next({ ctx: { ...ctx, ...auth } });
});

/** Log estructurado: errores siempre, lentitudes >1s, auth con requestId. */
const logging = t.middleware(async ({ ctx, next, path, type }) => {
  const start = performance.now();
  const result = await next();
  const ms = Math.round(performance.now() - start);
  const base = { requestId: ctx.requestId, ip: clientIp(ctx.req), path, type };
  if (!result.ok) {
    log("error", "trpc error", {
      ...base,
      code: result.error.code,
      message: result.error.message,
    });
  } else if (ms >= 1000) {
    log("warn", "trpc lento", { ...base, ms });
  } else if (path.startsWith("auth.")) {
    log("info", "trpc auth", { ...base, ms });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure
  .use(originCheck)
  .use(rateLimiter)
  .use(logging);
export const protectedProcedure = t.procedure
  .use(originCheck)
  .use(rateLimiter)
  .use(sessionGuard)
  .use(logging);
