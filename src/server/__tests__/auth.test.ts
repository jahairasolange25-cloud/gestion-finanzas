import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { authRouter } from "../routers/auth";
import { transactionsRouter } from "../routers/transactions";
import { sessions, users } from "../db/schema";
import { createTestDb, makeCtx, createTestUser, mintSession } from "./helpers";
import type { Db } from "../db";

type AuthCaller = ReturnType<typeof authRouter.createCaller>;

const PASSWORD = "secreto123";

describe("authRouter", () => {
  let db: Db;
  let caller: (ctx?: ReturnType<typeof makeCtx>) => AuthCaller;

  beforeEach(async () => {
    db = await createTestDb();
    caller = (ctx) => authRouter.createCaller(ctx ?? makeCtx(db));
  });

  describe("status", () => {
    it("sin usuarios: needsSetup = true", async () => {
      await expect(caller().status()).resolves.toEqual({
        authenticated: false,
        needsSetup: true,
      });
    });

    it("con usuario y sin sesión: solo login", async () => {
      await createTestUser(db);
      await expect(caller().status()).resolves.toEqual({
        authenticated: false,
        needsSetup: false,
      });
    });

    it("con sesión válida: authenticated con username", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const res = await caller(makeCtx(db, { cookie: token })).status();
      expect(res).toEqual({
        authenticated: true,
        needsSetup: false,
        username: "admin",
      });
    });
  });

  describe("setup", () => {
    it("crea la cuenta y emite cookie de sesión", async () => {
      const ctx = makeCtx(db);
      await expect(
        caller(ctx).setup({ username: "admin", password: PASSWORD }),
      ).resolves.toEqual({ ok: true });

      expect(ctx.cookies).toHaveLength(1);
      expect(ctx.cookies[0]).toMatch(/^mf_session=/);
      expect(ctx.cookies[0]).toContain("HttpOnly");
      expect(ctx.cookies[0]).toContain("SameSite=Lax");
      expect(ctx.cookies[0]).toContain("Path=/");

      const row = await db.select().from(sessions).get();
      expect(row).toBeDefined();
      expect(row!.tokenHash).not.toContain(ctx.cookies[0].split("=")[1]);
    });

    it("rechaza un segundo setup (FORBIDDEN)", async () => {
      await createTestUser(db);
      await expect(
        caller().setup({ username: "otro", password: PASSWORD }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rechaza contraseña corta", async () => {
      await expect(
        caller().setup({ username: "admin", password: "corta" }),
      ).rejects.toThrow();
    });
  });

  describe("login", () => {
    it("login correcto emite cookie y crea sesión", async () => {
      await createTestUser(db);
      const ctx = makeCtx(db);
      const res = await caller(ctx).login({ username: "admin", password: PASSWORD });
      expect(res).toEqual({ ok: true });
      expect(ctx.cookies[0]).toMatch(/^mf_session=/);

      const row = await db.select().from(sessions).get();
      expect(row).toBeDefined();
    });

    it("login con usuario inexistente: UNAUTHORIZED sin cookie", async () => {
      const ctx = makeCtx(db);
      await expect(
        caller(ctx).login({ username: "ghost", password: PASSWORD }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(ctx.cookies).toHaveLength(0);
    });

    it("login con contraseña incorrecta: UNAUTHORIZED", async () => {
      await createTestUser(db);
      await expect(
        caller().login({ username: "admin", password: "incorrecta" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rate limit: 10 intentos fallidos bloquean el 11º", async () => {
      await createTestUser(db);
      for (let i = 0; i < 10; i++) {
        await expect(
          caller().login({ username: "admin", password: "incorrecta" }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
      await expect(
        caller().login({ username: "admin", password: PASSWORD }),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    });
  });

  describe("logout", () => {
    it("elimina la sesión y limpia la cookie", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const ctx = makeCtx(db, { cookie: token });

      await expect(caller(ctx).logout()).resolves.toEqual({ ok: true });
      expect(ctx.cookies[0]).toContain("Max-Age=0");
      const rows = await db.select().from(sessions).all();
      expect(rows).toHaveLength(0);

      await expect(
        caller(makeCtx(db, { cookie: token })).status(),
      ).resolves.toMatchObject({ authenticated: false });
    });
  });

  describe("sesión", () => {
    it("sesión expirada: UNAUTHORIZED y la fila se elimina", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const row = await db.select().from(sessions).get();
      await db
        .update(sessions)
        .set({ expiresAt: Date.now() - 1000 })
        .where(eq(sessions.id, row!.id))
        .run();

      await expect(
        caller(makeCtx(db, { cookie: token })).logout(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      const rows = await db.select().from(sessions).all();
      expect(rows).toHaveLength(0);
    });

    it("token inválido: UNAUTHORIZED", async () => {
      await createTestUser(db);
      await expect(
        caller(makeCtx(db, { cookie: "token-invalido" })).logout(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("la sesión renueva su expiración cerca del vencimiento", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const row = await db.select().from(sessions).get();
      const nearlyExpired = Date.now() + 1000 * 60 * 60;
      await db
        .update(sessions)
        .set({ expiresAt: nearlyExpired })
        .where(eq(sessions.id, row!.id))
        .run();

      await caller(makeCtx(db, { cookie: token })).status();
      const after = await db.select().from(sessions).get();
      expect(after!.expiresAt).toBeGreaterThan(nearlyExpired);
    });
  });

  describe("protección de procedimientos", () => {
    it("sin sesión: UNAUTHORIZED en datos", async () => {
      await expect(
        transactionsRouter.createCaller(makeCtx(db)).list({}),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("con sesión válida: los procedimientos de datos responden", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const res = await transactionsRouter
        .createCaller(makeCtx(db, { cookie: token }))
        .list({});
      expect(res.rows).toEqual([]);
    });

    it("origin cross-site en mutation: FORBIDDEN", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      await expect(
        transactionsRouter
          .createCaller(makeCtx(db, { cookie: token, origin: "https://evil.com" }))
          .create({ type: "expense", amountCents: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("origin same-origin en mutation: permitido", async () => {
      const userId = await createTestUser(db);
      const token = await mintSession(db, userId);
      const res = await transactionsRouter
        .createCaller(makeCtx(db, { cookie: token, origin: "http://localhost" }))
        .create({ type: "expense", amountCents: 100 });
      expect(res.amountCents).toBe(100);
    });
  });

  it("el hash de contraseña nunca se devuelve al cliente", async () => {
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    const res = await caller(makeCtx(db, { cookie: token })).status();
    expect(JSON.stringify(res)).not.toContain("scrypt:");
    const row = await db.select().from(users).get();
    expect(row!.passwordHash).toMatch(/^scrypt:/);
  });

  it("el error de login no revela si el usuario existe", async () => {
    await createTestUser(db);
    const known = await caller().login({ username: "admin", password: "incorrecta" }).catch((e: TRPCError) => e.message);
    const unknown = await caller().login({ username: "ghost", password: "incorrecta" }).catch((e: TRPCError) => e.message);
    expect(known).toBe(unknown);
  });
});
