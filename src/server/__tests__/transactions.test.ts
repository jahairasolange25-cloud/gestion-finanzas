import { beforeEach, describe, expect, it } from "vitest";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { transactions, categories } from "../db/schema";
import { transactionsRouter } from "../routers/transactions";
import { createTestDb, seedCategory, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";

type Caller = ReturnType<typeof transactionsRouter.createCaller>;

describe("transactionsRouter", () => {
  let db: Db;
  let caller: Caller;
  let catId: string;

  beforeEach(async () => {
    db = await createTestDb();
    const cat = await seedCategory(db, { name: "Alimentación" });
    catId = cat.id;
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    caller = transactionsRouter.createCaller(makeCtx(db, { cookie: token }));
  });

  describe("create", () => {
    it("crea una transacción con campos de fecha derivados", async () => {
      const ts = new Date(2026, 7, 15, 21, 30).getTime();
      const row = await caller.create({
        type: "expense",
        amountCents: 1250,
        categoryId: catId,
        concept: "Mercado",
        ts,
      });
      expect(row.id).toBeTruthy();
      expect(row.date).toBe("2026-08-15");
      expect(row.month).toBe(8);
      expect(row.hour).toBe(21);
      expect(row.clientId).toBeNull();
    });

    it("deriva las fechas del ts del cliente (no del servidor)", async () => {
      // 23:30 en Perú (UTC-5) = 04:30 UTC del día siguiente.
      const local = new Date(2026, 7, 14, 23, 30);
      const row = await caller.create({
        type: "expense",
        amountCents: 500,
        ts: local.getTime(),
      });
      expect(row.date).toBe("2026-08-14");
      expect(row.day).toBe(14);
    });

    it("es idempotente por clientId", async () => {
      const input = {
        type: "expense" as const,
        amountCents: 1500,
        clientId: "client-abc",
      };
      const first = await caller.create(input);
      const second = await caller.create(input);
      expect(first.id).toBe("client-abc");
      expect(second.id).toBe("client-abc");
      const n = await db
        .select({ n: count() })
        .from(transactions)
        .where(eq(transactions.clientId, "client-abc"))
        .get();
      expect(n?.n).toBe(1);
    });

    it("rechaza fechas de calendario inválidas", async () => {
      await expect(
        caller.create({ type: "expense", amountCents: 100, date: "2026-02-31" }),
      ).rejects.toThrow();
    });

    it("rechaza montos <= 0 y desbordados", async () => {
      await expect(
        caller.create({ type: "expense", amountCents: 0 }),
      ).rejects.toThrow();
      await expect(
        caller.create({ type: "expense", amountCents: 10 ** 12 }),
      ).rejects.toThrow();
    });

    it("rechaza categoría inexistente", async () => {
      await expect(
        caller.create({ type: "expense", amountCents: 100, categoryId: "nope" }),
      ).rejects.toThrow(TRPCError);
    });

    it("rechaza categoría de tipo distinto", async () => {
      await seedCategory(db, { name: "Sueldo", type: "income" });
      const rows = await db.select().from(categories).where(eq(categories.type, "income")).all();
      const incomeCat = rows[0].id;
      await expect(
        caller.create({ type: "expense", amountCents: 100, categoryId: incomeCat }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("list / paginación keyset", () => {
    it("pagina sin solapamientos y con totales correctos", async () => {
      const base = new Date(2026, 7, 1).getTime();
      for (let i = 0; i < 25; i++) {
        await caller.create({
          type: "expense",
          amountCents: 100 + i,
          ts: base + i * 60_000,
        });
      }
      const page1 = await caller.list({ limit: 10 });
      expect(page1.rows).toHaveLength(10);
      expect(page1.nextCursor).toBeTruthy();
      expect(page1.totals.count).toBe(25);

      const page2 = await caller.list({ limit: 10, cursor: page1.nextCursor! });
      const ids1 = new Set(page1.rows.map((r) => r.id));
      const ids2 = new Set(page2.rows.map((r) => r.id));
      expect(page2.rows).toHaveLength(10);
      for (const id of ids2) expect(ids1.has(id)).toBe(false);

      const page3 = await caller.list({ limit: 10, cursor: page2.nextCursor! });
      expect(page3.rows).toHaveLength(5);
      expect(page3.nextCursor).toBeNull();
    });

    it("los totales respetan los filtros", async () => {
      for (let i = 0; i < 5; i++) {
        await caller.create({ type: "expense", amountCents: 100, ts: Date.now() });
      }
      await caller.create({ type: "income", amountCents: 1000, ts: Date.now() });
      const res = await caller.list({ limit: 2, type: "expense" });
      expect(res.totals.count).toBe(5);
      expect(res.totals.expense).toBe(500);
      expect(res.totals.income).toBe(0);
    });

    it("la búsqueda trata % y _ como literales", async () => {
      await caller.create({ type: "expense", amountCents: 100, concept: "100% real" });
      await caller.create({ type: "expense", amountCents: 100, concept: "normal" });
      const res = await caller.list({ search: "%" });
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].concept).toBe("100% real");
    });
  });

  describe("update / delete", () => {
    it("actualiza montos y deriva fechas al cambiar ts", async () => {
      const row = await caller.create({
        type: "expense",
        amountCents: 100,
        ts: new Date(2026, 7, 1).getTime(),
      });
      const updated = await caller.update({
        id: row.id,
        amountCents: 250,
        ts: new Date(2026, 7, 20).getTime(),
      });
      expect(updated.amountCents).toBe(250);
      expect(updated.date).toBe("2026-08-20");
    });

    it("404 para transacciones inexistentes", async () => {
      await expect(caller.update({ id: "missing" })).rejects.toThrow(TRPCError);
      await expect(caller.delete({ id: "missing" })).resolves.toEqual({ ok: true });
    });

    it("elimina", async () => {
      const row = await caller.create({ type: "expense", amountCents: 100 });
      await caller.delete({ id: row.id });
      const res = await caller.list({});
      expect(res.totals.count).toBe(0);
    });
  });
});
