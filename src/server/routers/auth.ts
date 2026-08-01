import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { users, sessions } from "../db/schema";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { hashPassword, sessionCookie, verifyPassword } from "../auth";
import { createSession, getSession } from "../session";
import { clientIp, rateLimit } from "../rate-limit";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Mínimo 3 caracteres")
  .max(40, "Máximo 40 caracteres");
const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres");

export const authRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const auth = await getSession(ctx.db, ctx.req);
    if (auth) {
      return { authenticated: true, needsSetup: false, username: auth.user.username };
    }
    const total = await ctx.db.select({ n: count() }).from(users).get();
    return { authenticated: false, needsSetup: total?.n === 0 };
  }),

  /** Primera vez y única vez: crea la cuenta (single-user). */
  setup: publicProcedure
    .input(z.object({ username: usernameSchema, password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const rl = rateLimit(`setup:${clientIp(ctx.req)}`, 5, 60 * 60 * 1000);
      if (!rl.ok) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const existing = await ctx.db
        .select({ id: users.id })
        .from(users)
        .limit(1)
        .get();
      if (existing) {
        throw new TRPCError({ code: "FORBIDDEN", message: "La cuenta ya existe" });
      }

      const userId = randomUUID();
      const now = Date.now();
      try {
        await ctx.db.insert(users).values({
          id: userId,
          username: input.username,
          passwordHash: await hashPassword(input.password),
          createdAt: now,
          updatedAt: now,
        }).run();
      } catch {
        throw new TRPCError({ code: "FORBIDDEN", message: "La cuenta ya existe" });
      }

      const { token } = await createSession(ctx.db, userId);
      ctx.cookies.push(sessionCookie(token));
      return { ok: true };
    }),

  login: publicProcedure
    .input(z.object({ username: usernameSchema, password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const rl = rateLimit(`login:${clientIp(ctx.req)}:${input.username}`, 10, 15 * 60 * 1000);
      if (!rl.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Demasiados intentos. Intenta de nuevo en un rato.",
        });
      }

      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .get();
      const valid = user
        ? await verifyPassword(input.password, user.passwordHash)
        : false;
      if (!user || !valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Usuario o contraseña incorrectos",
        });
      }

      const { token } = await createSession(ctx.db, user.id);
      ctx.cookies.push(sessionCookie(token));
      return { ok: true };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(sessions).where(eq(sessions.id, ctx.session.id)).run();
    ctx.cookies.push(sessionCookie("", { clear: true }));
    return { ok: true };
  }),
});
