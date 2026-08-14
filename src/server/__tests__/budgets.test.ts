import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { budgets } from "../db/schema";
import { budgetsRouter, budgetStatus } from "../routers/budgets";
import { createTestDb, seedCategory, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";
import { transactionsRouter } from "../routers/transactions";

type Caller = ReturnType<typeof budgetsRouter.createCaller>;
type TxCaller = ReturnType<typeof transactionsRouter.createCaller>;

describe("budgetsRouter", () => {
  let db: Db;
  let caller: Caller;
  let tx: TxCaller;
  let catAlim: string;

  beforeEach(async () => {
    db = await createTestDb();
    catAlim = (await seedCategory(db, { name: "Alimentación" })).id;
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    const ctx = makeCtx(db, { cookie: token });
    caller = budgetsRouter.createCaller(ctx);
    tx = transactionsRouter.createCaller(ctx);
  });

  describe("upsert", () => {
    it("crea un presupuesto nuevo por categoría", async () => {
      const b = await caller.upsert({ categoryId: catAlim, amountCents: 50_000 });
      expect(b.amountCents).toBe(50_000);
      expect(b.isActive).toBe(true);
      expect(b.period).toBe("monthly");
    });

    it("actualiza el monto si la categoría ya tiene presupuesto (no duplica)", async () => {
      await caller.upsert({ categoryId: catAlim, amountCents: 50_000 });
      const b = await caller.upsert({ categoryId: catAlim, amountCents: 80_000 });
      expect(b.amountCents).toBe(80_000);
      const rows = await db.select().from(budgets).where(eq(budgets.categoryId, catAlim)).all();
      expect(rows).toHaveLength(1);
    });

    it("rechaza categoría inexistente", async () => {
      await expect(
        caller.upsert({ categoryId: "nope", amountCents: 1000 }),
      ).rejects.toThrow(TRPCError);
    });

    it("rechaza categoría de ingreso", async () => {
      const income = (await seedCategory(db, { name: "Sueldo", type: "income" })).id;
      await expect(
        caller.upsert({ categoryId: income, amountCents: 1000 }),
      ).rejects.toThrow(TRPCError);
    });

    it("rechaza montos no positivos", async () => {
      await expect(
        caller.upsert({ categoryId: catAlim, amountCents: 0 }),
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("calcula lo gastado del mes por categoría y el estado", async () => {
      await caller.upsert({ categoryId: catAlim, amountCents: 100_000 });

      // Gastos de agosto 2026 (expense) y un ingreso que no debe contar.
      await tx.create({ type: "expense", amountCents: 20_000, categoryId: catAlim, ts: new Date(2026, 7, 5).getTime() });
      await tx.create({ type: "expense", amountCents: 70_000, categoryId: catAlim, ts: new Date(2026, 7, 20).getTime() });
      await tx.create({ type: "expense", amountCents: 99_999, categoryId: catAlim, ts: new Date(2026, 6, 5).getTime() });
      await tx.create({ type: "income", amountCents: 500_000, ts: new Date(2026, 7, 5).getTime() });

      const res = await caller.list({ year: 2026, month: 8 });
      expect(res.rows).toHaveLength(1);
      const row = res.rows[0];
      expect(row.spentCents).toBe(90_000);
      expect(row.pct).toBe(90);
      expect(row.status).toBe("near");
    });

    it("marca over cuando supera el límite", async () => {
      await caller.upsert({ categoryId: catAlim, amountCents: 10_000 });
      await tx.create({ type: "expense", amountCents: 15_000, categoryId: catAlim, ts: new Date(2026, 7, 5).getTime() });
      const res = await caller.list({ year: 2026, month: 8 });
      expect(res.rows[0].status).toBe("over");
    });

    it("por defecto usa el mes actual", async () => {
      await caller.upsert({ categoryId: catAlim, amountCents: 10_000 });
      const res = await caller.list({});
      const now = new Date();
      expect(res.year).toBe(now.getFullYear());
      expect(res.month).toBe(now.getMonth() + 1);
    });
  });

  describe("setActive / remove", () => {
    it("desactiva y reactiva", async () => {
      const b = await caller.upsert({ categoryId: catAlim, amountCents: 1000 });
      const off = await caller.setActive({ id: b.id, isActive: false });
      expect(off.isActive).toBe(false);
      const on = await caller.setActive({ id: b.id, isActive: true });
      expect(on.isActive).toBe(true);
    });

    it("elimina el presupuesto", async () => {
      const b = await caller.upsert({ categoryId: catAlim, amountCents: 1000 });
      await caller.remove({ id: b.id });
      const res = await caller.list({});
      expect(res.rows).toHaveLength(0);
    });

    it("not found al operar sobre ids inexistentes", async () => {
      await expect(caller.setActive({ id: "nope", isActive: false })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ id: "nope" })).rejects.toThrow(TRPCError);
    });
  });

  describe("budgetStatus", () => {
    it("clasifica ok / near / over", () => {
      expect(budgetStatus(10_000, 100_000)).toBe("ok");
      expect(budgetStatus(80_000, 100_000)).toBe("near");
      expect(budgetStatus(100_000, 100_000)).toBe("over");
      expect(budgetStatus(150_000, 100_000)).toBe("over");
    });
  });
});
